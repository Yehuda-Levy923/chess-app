import { useEffect, useMemo, useRef, useState } from 'react'
import { ChessComError, archiveLabel, fetchArchives, fetchMonth, type ChessComGame } from '../chesscom/api'
import { factsOf, type GameFacts, type Outcome } from '../insights/facts'
import { loadHistory } from '../insights/history'
import { getBook } from '../openings'
import { bookDepth } from '../openings/book'
import { movesFromPgn } from '../review/buildReview'
import { allReviews } from '../review/cache'
import type { Review } from '../review/types'
import { useAppearance } from './appearance'
import { GameBoard } from './GameBoard'
import { finalFen, moveCount, openingName, ratingsNow } from './gameSummary'
import { MiniBoard } from './MiniBoard'
import { IconBoard } from './icons'
import './StartScreen.css'

type Props = {
  username: string
  depth: number
  onUsername: (u: string) => void
  onDepth: (d: number) => void
  onOpen: (game: ChessComGame) => void
  onInsights: () => void
}

type Month = { url: string; games: ChessComGame[] }

type Filters = { text: string; result: 'all' | Outcome; time: string; side: 'all' | 'white' | 'black' }

const NO_FILTERS: Filters = { text: '', result: 'all', time: 'all', side: 'all' }

/** Whole-history search results come in pages so a 4,000-game history doesn't render at once. */
const PAGE = 100

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export function StartScreen({ username, depth, onUsername, onDepth, onOpen, onInsights }: Props) {
  const { openSettings } = useAppearance()
  const [draft, setDraft] = useState(username)
  const [archives, setArchives] = useState<string[]>([])
  const [months, setMonths] = useState<Month[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reviews, setReviews] = useState<Map<string, Review>>(new Map())
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [shown, setShown] = useState(PAGE)
  const [history, setHistory] = useState<{ games: ChessComGame[] | null; done: number; total: number; error: string | null } | null>(null)
  // Which username the whole history has been (or is being) loaded for.
  const historyFor = useRef<string | null>(null)
  const searching = filters.text.trim() !== '' || filters.result !== 'all' || filters.time !== 'all' || filters.side !== 'all'

  useEffect(() => {
    allReviews().then((all) => setReviews(new Map(all.map((r) => [r.gameId, r]))))
  }, [])

  useEffect(() => {
    if (!username) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setMonths([])
    fetchArchives(username)
      .then(async (list) => {
        if (cancelled) return
        setArchives(list)
        if (list.length === 0) return
        const games = await fetchMonth(list[0])
        if (!cancelled) setMonths([{ url: list[0], games }])
      })
      .catch((e) => !cancelled && setError(e instanceof ChessComError ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [username])

  // Searching covers every month, not just the loaded ones, so the first
  // search pulls the whole history (past months come from a local cache).
  useEffect(() => {
    if (!searching || !username || historyFor.current === username) return
    historyFor.current = username
    const abort = new AbortController()
    setHistory({ games: null, done: 0, total: 0, error: null })
    loadHistory(username, (done, total) => setHistory((h) => h && { ...h, done, total }), abort.signal)
      .then((games) => setHistory((h) => h && { ...h, games }))
      .catch((e) => {
        if (e instanceof DOMException && e.name === 'AbortError') {
          historyFor.current = null
          setHistory(null)
        } else {
          setHistory((h) => h && { ...h, error: e instanceof Error ? e.message : String(e) })
        }
      })
    return () => abort.abort()
  }, [searching, username])

  useEffect(() => {
    historyFor.current = null
    setHistory(null)
    setFilters(NO_FILTERS)
  }, [username])

  const loadOlder = async () => {
    const next = archives[months.length]
    if (!next) return
    setLoading(true)
    try {
      const games = await fetchMonth(next)
      setMonths((m) => [...m, { url: next, games }])
    } catch (e) {
      setError(e instanceof ChessComError ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const me = username.toLowerCase()
  const all = months.flatMap((m) => m.games)
  const gap = calibration(all, reviews, me)

  const factsById = useMemo(() => {
    if (!history?.games) return null
    const book = getBook()
    return new Map(history.games.map((g) => [g.uuid, factsOf(g, me, book)]))
  }, [history?.games, me])
  const matches = searching && history?.games && factsById ? history.games.filter((g) => matchesFilters(factsById.get(g.uuid)!, filters)) : null
  const timeClasses = factsById ? [...new Set([...factsById.values()].map((f) => f.timeClass))].sort() : ['bullet', 'blitz', 'rapid', 'daily']

  const pool = matches ?? all
  const preview = pool.find((g) => g.uuid === previewId) ?? pool[0] ?? null
  const summary = usePreview(preview)
  const record = tally(all, me)
  const ratings = ratingsNow(all, me)
  const recent = all.slice(0, 20).reverse()

  /** One game: the final position, then who and how, then when, then the accuracies. */
  const gameRow = (g: ChessComGame, withYear = false) => {
    const side = sideOf(g, me)
    const opp = side === 'white' ? g.black : g.white
    const mine = side === 'white' ? g.white : g.black
    const ours = reviews.get(g.uuid)
    const result = resultOf(mine.result)
    const how = HOW[result === 'won' ? opp.result : mine.result]
    const fen = finalFen(g)
    const moves = moveCount(g)
    const opening = openingName(g)
    return (
      <li
        key={g.uuid}
        className={`game ${preview?.uuid === g.uuid ? 'previewed' : ''}`}
        onClick={() => onOpen(g)}
        onMouseEnter={() => setPreviewId(g.uuid)}
        onFocus={() => setPreviewId(g.uuid)}
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onOpen(g)}
      >
        {fen ? <MiniBoard fen={fen} orientation={side} /> : <span className="miniboard" />}
        <span className="game-main">
          <span className="game-line">
            <span className={`result ${result}`}>{RESULT_TEXT[result]}</span>
            <span className="game-vs">
              vs <span className="game-opp">{opp.username}</span> <span className="num dim">{opp.rating}</span>
            </span>
          </span>
          <span className="game-sub">
            {[opening, how, moves ? `${moves} moves` : null].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className="game-when">
          <span>{g.timeClass}</span>
          <span className="num">{formatDate(g.endTime, withYear)}</span>
        </span>
        <span className="game-acc num">{g.accuracies ? g.accuracies[side].toFixed(1) : ''}</span>
        <span className="game-acc ours num">{ours ? ours.accuracy[side === 'white' ? 'w' : 'b'].toFixed(1) : ''}</span>
      </li>
    )
  }

  const listHead = (
    <div className="game-head" aria-hidden>
      <span>chess.com</span>
      <span>Ours</span>
    </div>
  )

  return (
    <main className="start">
      <header className="start-head">
        <h1>Game review</h1>
        <form
          className="start-form"
          onSubmit={(e) => {
            e.preventDefault()
            onUsername(draft.trim())
          }}
        >
          <label>
            <span>chess.com username</span>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} autoFocus={!username} />
          </label>
          <label>
            <span>Engine depth</span>
            <select value={depth} onChange={(e) => onDepth(Number(e.target.value))}>
              <option value={12}>12, quick</option>
              <option value={16}>16</option>
              <option value={20}>20, slow</option>
            </select>
          </label>
          <button className="btn btn-primary" type="submit" disabled={!draft.trim()}>
            Load games
          </button>
          <button className="btn" type="button" onClick={onInsights} disabled={!username || draft.trim() !== username}>
            Insights
          </button>
        </form>
        <button className="btn btn-quiet btn-icon start-settings" onClick={openSettings} aria-label="Board and pieces" title="Board and pieces">
          <IconBoard size={18} />
        </button>
      </header>

      <div className="start-body">
        <div className="start-list">
          {error && <p className="start-error">{error}</p>}

          {!username && (
            <div className="start-empty">
              <h2>Your chess.com games, reviewed by Stockfish on this computer.</h2>
              <p className="dim">Accuracy, a grade for every move, the lines you missed and a rating estimate per game. Nothing is uploaded.</p>
            </div>
          )}

          {username && all.length > 0 && (
            <div className="profile">
              <h2>{username}</h2>
              <div className="ratings">
                {ratings.slice(0, 3).map((r, i) => (
                  <div key={r.timeClass} className={`rating ${i === 0 ? 'main' : ''}`}>
                    <span className="rating-class">{r.timeClass[0].toUpperCase() + r.timeClass.slice(1)}</span>
                    <span className="rating-line">
                      <span className="rating-value num">{r.rating.toLocaleString()}</span>
                      {r.change !== 0 && (
                        <span className="rating-change num" title={`Change over the ${r.games} loaded ${r.timeClass} games`}>
                          {r.change > 0 ? '+' : '−'}
                          {Math.abs(r.change)}
                        </span>
                      )}
                      {i === 0 && r.series.length > 2 && <Sparkline values={r.series} label={`${r.timeClass} rating over the loaded games`} />}
                    </span>
                  </div>
                ))}
              </div>
              <div className="form-row">
                <span className="form" aria-label="Last 20 results, newest on the right">
                  {recent.map((g) => {
                    const res = resultOf((sideOf(g, me) === 'white' ? g.white : g.black).result)
                    const opp = sideOf(g, me) === 'white' ? g.black : g.white
                    return <span key={g.uuid} className={`form-cell ${res}`} title={`${RESULT_TEXT[res]} vs ${opp.username}`} />
                  })}
                </span>
                <span className="dim">
                  <span className="num">{record.won}</span> won, <span className="num">{record.drawn}</span> drawn, <span className="num">{record.lost}</span> lost in{' '}
                  {months.length === 1 ? archiveLabel(months[0].url) : `the last ${months.length} months`}
                </span>
              </div>
              {gap && (
                <p className="dim calibration">
                  Across {gap.games} reviewed {gap.games === 1 ? 'game' : 'games'}, our accuracy is on average{' '}
                  <span className="num">{gap.meanAbs.toFixed(1)}</span> points from chess.com's ({gap.bias >= 0 ? 'higher' : 'lower'} by{' '}
                  <span className="num">{Math.abs(gap.bias).toFixed(1)}</span> overall).
                </p>
              )}
            </div>
          )}

          {username && all.length > 0 && (
            <div className="search" role="search">
              <input
                className="search-text"
                type="search"
                placeholder="Opponent or opening"
                value={filters.text}
                onChange={(e) => {
                  setFilters({ ...filters, text: e.target.value })
                  setShown(PAGE)
                }}
                spellCheck={false}
                aria-label="Search by opponent or opening"
              />
              <select aria-label="Result" value={filters.result} onChange={(e) => setFilters({ ...filters, result: e.target.value as Filters['result'] })}>
                <option value="all">Any result</option>
                <option value="won">Won</option>
                <option value="drawn">Drawn</option>
                <option value="lost">Lost</option>
              </select>
              <select aria-label="Time control" value={filters.time} onChange={(e) => setFilters({ ...filters, time: e.target.value })}>
                <option value="all">Any time control</option>
                {timeClasses.map((t) => (
                  <option key={t} value={t}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
              <select aria-label="Colour" value={filters.side} onChange={(e) => setFilters({ ...filters, side: e.target.value as Filters['side'] })}>
                <option value="all">Either colour</option>
                <option value="white">As White</option>
                <option value="black">As Black</option>
              </select>
              {searching && (
                <button className="btn btn-quiet" type="button" onClick={() => setFilters(NO_FILTERS)}>
                  Clear
                </button>
              )}
            </div>
          )}

          {searching ? (
            <section className="month">
              <h3>
                {history?.error
                  ? history.error
                  : matches
                    ? `${matches.length} ${matches.length === 1 ? 'game' : 'games'} across your whole history`
                    : history?.total
                      ? `Loading your history, month ${history.done} of ${history.total}…`
                      : 'Loading your history…'}
              </h3>
              {matches && matches.length > 0 && (
                <>
                  {listHead}
                  <ol className="games">{matches.slice(0, shown).map((g) => gameRow(g, true))}</ol>
                </>
              )}
              {matches && matches.length > shown && (
                <button className="btn older" onClick={() => setShown(shown + PAGE)}>
                  Show {Math.min(PAGE, matches.length - shown)} more
                </button>
              )}
            </section>
          ) : (
          <>
          {months.map((m) => (
            <section key={m.url} className="month">
              <h3>{archiveLabel(m.url)}</h3>
              {m.games.length === 0 ? (
                <p className="month-empty">No standard games this month.</p>
              ) : (
                <>
                  {listHead}
                  <ol className="games">{m.games.map((g) => gameRow(g))}</ol>
                </>
              )}
            </section>
          ))}

          {loading && <p className="dim start-loading">Loading from chess.com…</p>}
          {!loading && months.length > 0 && months.length < archives.length && (
            <button className="btn older" onClick={loadOlder}>
              Load {archiveLabel(archives[months.length])}
            </button>
          )}
          </>
          )}
        </div>

        <aside className="start-preview">
          <GameBoard fen={summary?.fen ?? START_FEN} orientation={preview ? sideOf(preview, me) : 'white'} lastMove={summary?.lastMove ?? null} />
          {preview && summary ? (
            <div className="preview-text">
              <p className="preview-title">
                {preview.white.username} <span className="dim">vs</span> {preview.black.username}
              </p>
              <p className="dim">
                {summary.outcome}
                {summary.moves ? `, ${summary.moves} moves` : ''}
              </p>
              {summary.opening && <p className="dim">{summary.opening}</p>}
              <button className="btn btn-primary preview-open" onClick={() => onOpen(preview)}>
                {reviews.has(preview.uuid) ? 'Open review' : 'Review this game'}
              </button>
            </div>
          ) : null}
        </aside>
      </div>
    </main>
  )
}

/** Final position, last move, outcome and opening of the previewed game. */
function usePreview(game: ChessComGame | null) {
  return useMemo(() => {
    if (!game) return null
    let moves
    try {
      moves = movesFromPgn(game.pgn)
    } catch {
      return null
    }
    const last = moves[moves.length - 1]
    const opening = bookDepth(
      getBook(),
      moves.map((m) => m.san),
    ).opening
    return {
      fen: last?.after ?? START_FEN,
      lastMove: last ? ([last.from, last.to] as [string, string]) : null,
      moves: Math.ceil(moves.length / 2),
      opening: opening?.name ?? null,
      outcome: outcomeText(game),
    }
  }, [game])
}

type Result = 'won' | 'drawn' | 'lost'

const RESULT_TEXT: Record<Result, string> = { won: 'Won', drawn: 'Draw', lost: 'Lost' }

const DRAWS = ['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']

function resultOf(result: string): Result {
  if (result === 'win') return 'won'
  if (DRAWS.includes(result)) return 'drawn'
  return 'lost'
}

const HOW: Record<string, string> = {
  checkmated: 'by checkmate',
  resigned: 'by resignation',
  timeout: 'on time',
  abandoned: 'by abandonment',
  agreed: 'by agreement',
  repetition: 'by repetition',
  stalemate: 'by stalemate',
  insufficient: 'by insufficient material',
  '50move': 'by the 50-move rule',
  timevsinsufficient: 'on time against insufficient material',
}

function outcomeText(g: ChessComGame): string {
  if (g.white.result === 'win') return `${g.white.username} won ${HOW[g.black.result] ?? ''}`.trim()
  if (g.black.result === 'win') return `${g.black.username} won ${HOW[g.white.result] ?? ''}`.trim()
  return `Drawn ${HOW[g.white.result] ?? ''}`.trim()
}

function tally(games: ChessComGame[], me: string) {
  const t = { won: 0, drawn: 0, lost: 0 }
  for (const g of games) t[resultOf((sideOf(g, me) === 'white' ? g.white : g.black).result)]++
  return t
}

function sideOf(g: ChessComGame, me: string): 'white' | 'black' {
  return g.black.username.toLowerCase() === me ? 'black' : 'white'
}

function formatDate(seconds: number, withYear = false): string {
  const d = new Date(seconds * 1000)
  const year = withYear && d.getFullYear() !== new Date().getFullYear()
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) })
}

function matchesFilters(f: GameFacts, filters: Filters): boolean {
  const q = filters.text.trim().toLowerCase()
  return (
    (filters.result === 'all' || f.outcome === filters.result) &&
    (filters.time === 'all' || f.timeClass === filters.time) &&
    (filters.side === 'all' || f.side === filters.side) &&
    (!q || f.opponent.toLowerCase().includes(q) || (f.opening ?? '').toLowerCase().includes(q))
  )
}

function calibration(games: ChessComGame[], reviews: Map<string, Review>, me: string) {
  const diffs: number[] = []
  for (const g of games) {
    const r = reviews.get(g.uuid)
    if (!r || !g.accuracies) continue
    const side = sideOf(g, me)
    diffs.push(r.accuracy[side === 'white' ? 'w' : 'b'] - g.accuracies[side])
  }
  if (diffs.length === 0) return null
  return {
    games: diffs.length,
    meanAbs: diffs.reduce((s, d) => s + Math.abs(d), 0) / diffs.length,
    bias: diffs.reduce((s, d) => s + d, 0) / diffs.length,
  }
}

/** A one-line trend, for the main time class's rating across the loaded games. */
function Sparkline({ values, label }: { values: number[]; label: string }) {
  const W = 120
  const H = 28
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const points = values.map((v, i) => `${((i / (values.length - 1)) * W).toFixed(1)},${(H - 2 - ((v - min) / span) * (H - 4)).toFixed(1)}`).join(' ')
  return (
    <svg className="sparkline" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label}>
      <title>{`${label}: ${min.toLocaleString()} to ${max.toLocaleString()}`}</title>
      <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
