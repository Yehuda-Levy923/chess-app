import { useEffect, useMemo, useState } from 'react'
import { ChessComError, archiveLabel, fetchArchives, fetchMonth, type ChessComGame } from '../chesscom/api'
import { getBook } from '../openings'
import { bookDepth } from '../openings/book'
import { movesFromPgn } from '../review/buildReview'
import { allReviews } from '../review/cache'
import type { Review } from '../review/types'
import { useAppearance } from './appearance'
import { GameBoard } from './GameBoard'
import { IconBoard } from './icons'
import './StartScreen.css'

type Props = {
  username: string
  depth: number
  onUsername: (u: string) => void
  onDepth: (d: number) => void
  onOpen: (game: ChessComGame) => void
}

type Month = { url: string; games: ChessComGame[] }

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export function StartScreen({ username, depth, onUsername, onDepth, onOpen }: Props) {
  const { openSettings } = useAppearance()
  const [draft, setDraft] = useState(username)
  const [archives, setArchives] = useState<string[]>([])
  const [months, setMonths] = useState<Month[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reviews, setReviews] = useState<Map<string, Review>>(new Map())
  const [previewId, setPreviewId] = useState<string | null>(null)

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
  const preview = all.find((g) => g.uuid === previewId) ?? all[0] ?? null
  const summary = usePreview(preview)
  const record = tally(all, me)

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
        </form>
        <button className="btn btn-quiet btn-icon start-settings" onClick={openSettings} aria-label="Board and pieces" title="Board and pieces">
          <IconBoard size={18} />
        </button>
      </header>

      <div className="start-body">
        <div className="start-list">
          {error && <p className="start-error">{error}</p>}

          {username && all.length > 0 && (
            <div className="start-intro">
              <h2>{username}</h2>
              <p className="dim">
                <span className="num">{record.won}</span> won, <span className="num">{record.drawn}</span> drawn, <span className="num">{record.lost}</span> lost
                in {months.length === 1 ? archiveLabel(months[0].url) : `the last ${months.length} months`}
              </p>
              {gap && (
                <p className="dim">
                  Across {gap.games} reviewed {gap.games === 1 ? 'game' : 'games'}, our accuracy is on average{' '}
                  <span className="num">{gap.meanAbs.toFixed(1)}</span> points from chess.com's ({gap.bias >= 0 ? 'higher' : 'lower'} by{' '}
                  <span className="num">{Math.abs(gap.bias).toFixed(1)}</span> overall).
                </p>
              )}
            </div>
          )}

          {months.map((m) => (
            <section key={m.url} className="month">
              <h3>{archiveLabel(m.url)}</h3>
              {m.games.length === 0 ? (
                <p className="month-empty">No standard games this month.</p>
              ) : (
                <table className="games">
                  <thead>
                    <tr>
                      <th>Result</th>
                      <th>Opponent</th>
                      <th>Type</th>
                      <th>Date</th>
                      <th className="r">chess.com</th>
                      <th className="r">Ours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.games.map((g) => {
                      const side = sideOf(g, me)
                      const opp = side === 'white' ? g.black : g.white
                      const mine = side === 'white' ? g.white : g.black
                      const ours = reviews.get(g.uuid)
                      const result = resultOf(mine.result)
                      return (
                        <tr
                          key={g.uuid}
                          className={preview?.uuid === g.uuid ? 'previewed' : ''}
                          onClick={() => onOpen(g)}
                          onMouseEnter={() => setPreviewId(g.uuid)}
                          onFocus={() => setPreviewId(g.uuid)}
                          tabIndex={0}
                          onKeyDown={(e) => e.key === 'Enter' && onOpen(g)}
                        >
                          <td className={`result ${result}`}>{RESULT_TEXT[result]}</td>
                          <td>
                            <span className={`side-dot ${side === 'white' ? 'black' : 'white'}`} aria-label={`playing ${side === 'white' ? 'Black' : 'White'}`} />
                            {opp.username} <span className="dim num">{opp.rating}</span>
                          </td>
                          <td className="dim">{g.timeClass}</td>
                          <td className="num dim">{formatDate(g.endTime)}</td>
                          <td className="r num">{g.accuracies ? g.accuracies[side].toFixed(1) : ''}</td>
                          <td className="r num ours">{ours ? ours.accuracy[side === 'white' ? 'w' : 'b'].toFixed(1) : ''}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </section>
          ))}

          {loading && <p className="dim start-loading">Loading from chess.com…</p>}
          {!loading && months.length > 0 && months.length < archives.length && (
            <button className="btn older" onClick={loadOlder}>
              Load {archiveLabel(archives[months.length])}
            </button>
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

function formatDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
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
