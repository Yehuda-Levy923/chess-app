import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChessComGame } from '../chesscom/api'
import type { GameFacts, Outcome } from '../insights/facts'
import type { GameSummary } from '../review/summary'
import { finalFen, moveCount, openingName } from './gameSummary'
import { HOW, monthLabel, myResult, opponentOf, outcomeText, RESULT_TEXT, shortDate, sideOf } from './gameText'
import { GameViewer } from './GameViewer'
import { useHistory } from './history'
import { notForBoard, onScreen } from './keys'
import { MiniBoard } from './MiniBoard'
import './GamesScreen.css'

type Props = {
  username: string
  onOpen: (game: ChessComGame) => void
}

type Filters = { text: string; result: 'all' | Outcome; time: string; side: 'all' | 'white' | 'black' }

const NO_FILTERS: Filters = { text: '', result: 'all', time: 'all', side: 'all' }

/** Rows render in pages so a 10,000-game history doesn't mount at once. */
const PAGE = 100

/** Every game you've played, searchable, with the one under the cursor on a board you can step through. */
export function GamesScreen({ username, onOpen }: Props) {
  const { games, facts, summaryById, progress, error } = useHistory()
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [shown, setShown] = useState(PAGE)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const rootRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const me = username.toLowerCase()
  const filtering = filters.text.trim() !== '' || filters.result !== 'all' || filters.time !== 'all' || filters.side !== 'all'

  const factsById = useMemo(() => new Map((facts ?? []).map((f) => [f.id, f])), [facts])
  const timeClasses = useMemo(() => [...new Set((facts ?? []).map((f) => f.timeClass))].sort(), [facts])
  const list = useMemo(() => {
    if (!games) return []
    if (!filtering) return games
    return games.filter((g) => {
      const f = factsById.get(g.uuid)
      return f ? matches(f, filters) : false
    })
  }, [games, factsById, filters, filtering])

  const preview = list.find((g) => g.uuid === previewId) ?? list[0] ?? null
  const gap = useMemo(() => calibration(games ?? [], summaryById, me), [games, summaryById, me])

  // / to search, up and down through the list, Enter to open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!onScreen(rootRef.current) || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === '/' && !notForBoard(e)) searchRef.current?.focus()
      else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !(e.target instanceof HTMLSelectElement)) {
        if (!list.length) return
        const at = preview ? list.findIndex((g) => g.uuid === preview.uuid) : -1
        const next = list[Math.max(0, Math.min(list.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))]
        const index = list.indexOf(next)
        if (index >= shown) setShown(index + 1)
        setPreviewId(next.uuid)
        requestAnimationFrame(() => document.querySelector(`[data-game="${next.uuid}"]`)?.scrollIntoView({ block: 'nearest' }))
      } else if (e.key === 'Enter' && preview && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLSelectElement) && !(e.target instanceof HTMLLIElement)) {
        onOpen(preview)
      } else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const setFilter = (f: Partial<Filters>) => {
    setFilters({ ...filters, ...f })
    setShown(PAGE)
  }

  if (error) {
    return (
      <main className="games-page" ref={rootRef}>
        <h1 className="page-title">Games</h1>
        <p className="games-error">{error}</p>
      </main>
    )
  }

  // Rows grouped under month headings, in the order they're shown.
  const rows = list.slice(0, shown)
  const groups: { month: string; games: ChessComGame[] }[] = []
  for (const g of rows) {
    const month = monthLabel(g.endTime)
    if (groups.at(-1)?.month !== month) groups.push({ month, games: [] })
    groups.at(-1)!.games.push(g)
  }

  return (
    <main className="games-page" ref={rootRef}>
      <header className="games-head">
        <h1 className="page-title">Games</h1>
        <p className="games-count dim">
          {!games ? (
            progress ? (
              <>
                Fetching month <span className="num">{progress[0]}</span> of <span className="num">{progress[1]}</span> from chess.com
              </>
            ) : (
              'Asking chess.com for your games'
            )
          ) : filtering ? (
            <>
              <span className="num">{list.length.toLocaleString()}</span> of <span className="num">{games.length.toLocaleString()}</span>
            </>
          ) : (
            <>
              <span className="num">{games.length.toLocaleString()}</span> games
            </>
          )}
        </p>
      </header>

      <div className="games-search" role="search">
        <input
          ref={searchRef}
          className="search-text"
          type="search"
          placeholder="Opponent or opening  ( / )"
          value={filters.text}
          onChange={(e) => setFilter({ text: e.target.value })}
          spellCheck={false}
          aria-label="Search by opponent or opening"
          disabled={!facts}
        />
        <select aria-label="Result" value={filters.result} onChange={(e) => setFilter({ result: e.target.value as Filters['result'] })} disabled={!facts}>
          <option value="all">Any result</option>
          <option value="won">Won</option>
          <option value="drawn">Drawn</option>
          <option value="lost">Lost</option>
        </select>
        <select aria-label="Time control" value={filters.time} onChange={(e) => setFilter({ time: e.target.value })} disabled={!facts}>
          <option value="all">Any time control</option>
          {timeClasses.map((t) => (
            <option key={t} value={t}>
              {t[0].toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
        <select aria-label="Colour" value={filters.side} onChange={(e) => setFilter({ side: e.target.value as Filters['side'] })} disabled={!facts}>
          <option value="all">Either colour</option>
          <option value="white">As White</option>
          <option value="black">As Black</option>
        </select>
        {filtering && (
          <button className="btn btn-quiet" type="button" onClick={() => setFilter(NO_FILTERS)}>
            Clear
          </button>
        )}
      </div>

      <div className="games-body">
        <div className="games-list">
          {!games && (
            <div className="progress">
              <div style={{ width: progress ? `${(progress[0] / progress[1]) * 100}%` : '0%' }} />
            </div>
          )}
          {games && list.length === 0 && <p className="dim games-none">No games match.</p>}
          {rows.length > 0 && (
            <div className="game-head" aria-hidden>
              <span>chess.com</span>
              <span>Ours</span>
            </div>
          )}
          {groups.map((m) => (
            <section key={m.month} className="month">
              <h2>{m.month}</h2>
              <ol className="games">
                {m.games.map((g) => (
                  <GameRow
                    key={g.uuid}
                    game={g}
                    me={me}
                    ours={summaryById.get(g.uuid)}
                    on={preview?.uuid === g.uuid}
                    onPreview={() => setPreviewId(g.uuid)}
                    onOpen={() => onOpen(g)}
                  />
                ))}
              </ol>
            </section>
          ))}
          {list.length > shown && (
            <button className="btn older" onClick={() => setShown(shown + PAGE)}>
              Show {Math.min(PAGE, list.length - shown)} more
            </button>
          )}
          {gap && (
            <p className="dim calibration">
              Across {gap.games.toLocaleString()} reviewed {gap.games === 1 ? 'game' : 'games'}, our accuracy is on average{' '}
              <span className="num">{gap.meanAbs.toFixed(1)}</span> points from chess.com's ({gap.bias >= 0 ? 'higher' : 'lower'} by{' '}
              <span className="num">{Math.abs(gap.bias).toFixed(1)}</span> overall).
            </p>
          )}
        </div>

        <aside className="games-preview">
          {preview ? (
            <>
              <GameViewer key={preview.uuid} game={preview} orientation={sideOf(preview, me)} summary={summaryById.get(preview.uuid)} />
              <div className="preview-text">
                <p className="preview-title">
                  {preview.white.username} <span className="dim">vs</span> {preview.black.username}
                </p>
                <p className="dim">
                  {outcomeText(preview)}
                  {moveCount(preview) ? `, ${moveCount(preview)} moves` : ''}
                </p>
                {openingName(preview) && <p className="dim">{openingName(preview)}</p>}
                <button className="btn btn-primary preview-open" onClick={() => onOpen(preview)}>
                  {summaryById.has(preview.uuid) ? 'Open review' : 'Review this game'} <kbd>Enter</kbd>
                </button>
              </div>
            </>
          ) : (
            <div className="preview-empty" />
          )}
        </aside>
      </div>
    </main>
  )
}

/** One game: the final position, then who and how, then when, then the accuracies. */
function GameRow({ game: g, me, ours, on, onPreview, onOpen }: { game: ChessComGame; me: string; ours?: GameSummary; on: boolean; onPreview: () => void; onOpen: () => void }) {
  const side = sideOf(g, me)
  const opp = opponentOf(g, me)
  const mine = side === 'white' ? g.white : g.black
  const result = myResult(g, me)
  const how = HOW[result === 'won' ? opp.result : mine.result]
  const fen = finalFen(g)
  const moves = moveCount(g)
  const opening = openingName(g)
  return (
    <li
      data-game={g.uuid}
      className={`game ${on ? 'previewed' : ''}`}
      onClick={onOpen}
      onMouseEnter={onPreview}
      onFocus={onPreview}
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
    >
      {fen ? <MiniBoard fen={fen} orientation={side} /> : <span className="miniboard" />}
      <span className="game-main">
        <span className="game-line">
          <span className={`result ${result}`}>{RESULT_TEXT[result]}</span>
          <span className="game-vs">
            vs <span className="game-opp">{opp.username}</span> <span className="num dim">{opp.rating}</span>
          </span>
        </span>
        <span className="game-sub">{[opening, how, moves ? `${moves} moves` : null].filter(Boolean).join(' · ')}</span>
      </span>
      <span className="game-when">
        <span>{g.timeClass}</span>
        <span className="num">{shortDate(g.endTime, true)}</span>
      </span>
      <span className="game-acc num" title="chess.com accuracy">
        {g.accuracies ? g.accuracies[side].toFixed(1) : ''}
      </span>
      <span className="game-acc ours num" title="Our accuracy">
        {ours ? ours.accuracy[side === 'white' ? 'w' : 'b'].toFixed(1) : ''}
      </span>
    </li>
  )
}

function matches(f: GameFacts, filters: Filters): boolean {
  const q = filters.text.trim().toLowerCase()
  return (
    (filters.result === 'all' || f.outcome === filters.result) &&
    (filters.time === 'all' || f.timeClass === filters.time) &&
    (filters.side === 'all' || f.side === filters.side) &&
    (!q || f.opponent.toLowerCase().includes(q) || (f.opening ?? '').toLowerCase().includes(q))
  )
}

function calibration(games: ChessComGame[], reviews: Map<string, GameSummary>, me: string) {
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
