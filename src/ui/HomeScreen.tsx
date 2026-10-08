import { useMemo, useState } from 'react'
import type { ChessComGame } from '../chesscom/api'
import type { GameFacts } from '../insights/facts'
import { PerfBar, Sparkline } from './charts'
import { findings, type RankedFinding } from './findings'
import { finalFen, moveCount, openingName } from './gameSummary'
import { myResult, opponentOf, outcomeText, RESULT_TEXT, shortDate, sideOf } from './gameText'
import { GameViewer } from './GameViewer'
import { GamesDrawer, type Drill } from './GamesDrawer'
import { useHistory } from './history'
import { MiniBoard } from './MiniBoard'
import { loadSolved, practicePool } from './practice'
import type { PracticeFocus } from './PracticeScreen'
import type { View } from './Sidebar'
import './HomeScreen.css'

type Props = {
  username: string
  onUsername: (u: string) => void
  onOpen: (game: ChessComGame, ply?: number) => void
  onView: (v: View) => void
  onPractice: (focus: PracticeFocus | null) => void
}

const DAY = 86400
const pct = (x: number) => `${Math.round(x * 100)}%`
const signed = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x)}`

/** Where you stand today, your latest game, and the one thing most worth working on. */
export function HomeScreen({ username, onUsername, onOpen, onView, onPractice }: Props) {
  const { games, facts, summaries, summariesLoaded, summaryById, byUuid, progress, error } = useHistory()
  const [boardId, setBoardId] = useState<string | null>(null)
  const [drill, setDrill] = useState<Drill | null>(null)
  const me = username.toLowerCase()
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

  const rating = useMemo(() => (facts ? ratingNow(facts) : null), [facts])

  // Findings over the last year, so an old habit you've since dropped doesn't top the page.
  const top = useMemo(() => {
    if (!facts?.length) return null
    const since = facts[0].endTime - 365 * DAY
    const year = facts.filter((f) => f.endTime >= since)
    const { weaknesses } = findings(year, {}, facts)
    const f = weaknesses[0]
    return f ? { f, games: year.filter((g) => f.ids.has(g.id)) } : null
  }, [facts])

  const factsById = useMemo(() => new Map((facts ?? []).map((f) => [f.id, f])), [facts])
  const pool = useMemo(() => practicePool(summaries, (id) => factsById.get(id) ?? null), [summaries, factsById])
  const unsolved = useMemo(() => {
    const solved = loadSolved()
    return pool.filter((p) => !solved.has(p.id)).length
  }, [pool])
  const topPractice = useMemo(() => (top ? pool.filter((p) => top.f.ids.has(p.gameId)).length : 0), [top, pool])

  if (!username) return <Welcome onUsername={onUsername} />

  if (error) {
    return (
      <main className="home">
        <h1 className="page-title">{today}</h1>
        <p className="home-error">{error}</p>
      </main>
    )
  }

  if (!games || !facts) {
    return (
      <main className="home">
        <h1 className="page-title">{today}</h1>
        <div className="home-loading">
          <p className="dim">
            {games ? (
              <>
                Reading <span className="num">{games.length.toLocaleString()}</span> games
              </>
            ) : progress ? (
              <>
                Fetching month <span className="num">{progress[0]}</span> of <span className="num">{progress[1]}</span> from chess.com
              </>
            ) : (
              'Asking chess.com for your games'
            )}
          </p>
          <div className="progress">
            <div style={{ width: progress ? `${(progress[0] / progress[1]) * 100}%` : '0%' }} />
          </div>
        </div>
      </main>
    )
  }

  const board = (boardId && byUuid.get(boardId)) || games[0] || null
  const recent = games.slice(0, 8)
  const form = games.slice(0, 20).reverse()
  const toReview = summariesLoaded ? games.slice(0, 50).filter((g) => !summaryById.has(g.uuid)) : []
  // Losses first: they're where a review finds the most.
  const reviewNext = [...toReview.filter((g) => myResult(g, me) === 'lost'), ...toReview.filter((g) => myResult(g, me) !== 'lost')].slice(0, 3)

  return (
    <main className="home">
      <header className="home-head">
        <h1 className="page-title">{today}</h1>
        {rating && (
          <div className="home-rating">
            <span className="home-rating-class">{cap(rating.timeClass)}</span>
            <span className="home-rating-value num">{rating.now.toLocaleString()}</span>
            {rating.month !== 0 && (
              <span className="home-rating-change num">
                {signed(rating.month)} <span className="dim">this month</span>
              </span>
            )}
            {rating.series.length > 2 && <Sparkline values={rating.series} label={`${rating.timeClass} rating over your last ${rating.series.length} games`} width={140} height={32} />}
          </div>
        )}
      </header>

      <div className="home-grid">
        <section className="home-board">
          {board && (
            <>
              <GameViewer key={board.uuid} game={board} orientation={sideOf(board, me)} summary={summaryById.get(board.uuid)} />
              <div className="home-board-text">
                <div>
                  <p className="home-board-title">
                    {RESULT_TEXT[myResult(board, me)]} against {opponentOf(board, me).username} <span className="num dim">{opponentOf(board, me).rating}</span>
                  </p>
                  <p className="dim">
                    {[board === games[0] ? 'Your latest game' : shortDate(board.endTime, true), outcomeText(board), moveCount(board) ? `${moveCount(board)} moves` : null]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                  {openingName(board) && <p className="dim">{openingName(board)}</p>}
                </div>
                <button className="btn btn-primary home-open" onClick={() => onOpen(board)}>
                  {summaryById.has(board.uuid) ? 'Open review' : 'Review it'}
                </button>
              </div>
            </>
          )}
        </section>

        <div className="home-side">
          {top && (
            <section className="home-block">
              <h2>Most worth working on</h2>
              <FindingLine f={top.f} />
              <div className="home-actions">
                <button className="btn" onClick={() => setDrill({ title: top.f.title, games: top.games })}>
                  The <span className="num">{top.games.length.toLocaleString()}</span> games
                </button>
                {topPractice >= 3 && top.f.kind !== 'clock' && (
                  <button className="btn" onClick={() => onPractice({ title: top.f.title, ids: top.f.ids })}>
                    Practise <span className="num">{topPractice.toLocaleString()}</span> positions from them
                  </button>
                )}
                <button className="btn btn-quiet" onClick={() => onView('insights')}>
                  All findings
                </button>
              </div>
            </section>
          )}

          <section className="home-block">
            <h2>Practice</h2>
            {!summariesLoaded ? (
              <p className="dim">Reading your reviews…</p>
            ) : pool.length ? (
              <>
                <p>
                  <span className="num">{unsolved.toLocaleString()}</span> positions from your own games where you made a mistake or blunder
                  {unsolved < pool.length ? (
                    <>
                      , <span className="num">{(pool.length - unsolved).toLocaleString()}</span> solved
                    </>
                  ) : null}
                  .
                </p>
                <div className="home-actions">
                  <button className="btn btn-primary" onClick={() => onPractice(null)}>
                    Start practising
                  </button>
                </div>
              </>
            ) : (
              <p className="dim">Review a few games and their mistakes turn up here as positions to solve.</p>
            )}
          </section>

          {reviewNext.length > 0 && (
            <section className="home-block">
              <h2>Not reviewed yet</h2>
              <ol className="home-games">
                {reviewNext.map((g) => (
                  <GameLine key={g.uuid} game={g} me={me} on={board?.uuid === g.uuid} onShow={() => setBoardId(g.uuid)} action="Review" onAction={() => onOpen(g)} />
                ))}
              </ol>
            </section>
          )}

          <section className="home-block">
            <h2>
              Recent games
              <button className="btn btn-quiet home-more" onClick={() => onView('games')}>
                All {games.length.toLocaleString()}
              </button>
            </h2>
            <span className="form" aria-label="Last 20 results, newest on the right">
              {form.map((g) => {
                const res = myResult(g, me)
                return (
                  <button
                    key={g.uuid}
                    className={`form-cell ${res}`}
                    title={`${RESULT_TEXT[res]} vs ${opponentOf(g, me).username}, ${shortDate(g.endTime)}`}
                    onClick={() => setBoardId(g.uuid)}
                    aria-label={`${RESULT_TEXT[res]} vs ${opponentOf(g, me).username}`}
                  />
                )
              })}
            </span>
            <ol className="home-games">
              {recent.map((g) => (
                <GameLine
                  key={g.uuid}
                  game={g}
                  me={me}
                  on={board?.uuid === g.uuid}
                  onShow={() => setBoardId(g.uuid)}
                  accuracy={summaryById.get(g.uuid)?.accuracy[sideOf(g, me) === 'white' ? 'w' : 'b'] ?? null}
                />
              ))}
            </ol>
          </section>
        </div>
      </div>

      {drill && <GamesDrawer {...drill} lookup={(id) => byUuid.get(id)} onOpen={onOpen} onClose={() => setDrill(null)} />}
    </main>
  )
}

function FindingLine({ f }: { f: RankedFinding }) {
  return (
    <div className="home-finding">
      <p className="home-finding-title">{f.title}</p>
      <p>
        You score <span className="num">{pct(f.actual)}</span> where your ratings predicted <span className="num">{pct(f.expected)}</span> over{' '}
        <span className="num">{f.games.toLocaleString()}</span> games, about <span className="num">{Math.round(f.cost).toLocaleString()}</span> wins' worth of points
        {f.confidence === 'possible' ? ', though it could still be chance' : ''}.
      </p>
      <PerfBar actual={f.actual} expected={f.expected} />
    </div>
  )
}

type LineProps = {
  game: ChessComGame
  me: string
  on: boolean
  onShow: () => void
  accuracy?: number | null
  action?: string
  onAction?: () => void
}

/** A game in a short list: pressing it puts it on the board. */
function GameLine({ game: g, me, on, onShow, accuracy, action, onAction }: LineProps) {
  const res = myResult(g, me)
  const fen = finalFen(g)
  return (
    <li className={`home-game ${on ? 'on' : ''}`}>
      <button className="home-game-main" onClick={onShow} onDoubleClick={onAction}>
        {fen ? <MiniBoard fen={fen} orientation={sideOf(g, me)} /> : <span className="miniboard" />}
        <span className="home-game-text">
          <span>
            <span className={`result ${res}`}>{RESULT_TEXT[res]}</span> vs {opponentOf(g, me).username}
          </span>
          <span className="dim">
            {g.timeClass}, {shortDate(g.endTime, true)}
          </span>
        </span>
        {accuracy != null && <span className="num home-game-acc" title="Your accuracy">{accuracy.toFixed(1)}</span>}
      </button>
      {action && onAction && (
        <button className="btn home-game-action" onClick={onAction}>
          {action}
        </button>
      )}
    </li>
  )
}

/** The rating in the time control you've played most in the last 90 days, and how it moved this month. */
function ratingNow(facts: GameFacts[]) {
  if (!facts.length) return null
  const since = facts[0].endTime - 90 * DAY
  const counts = new Map<string, number>()
  for (const f of facts) if (f.endTime >= since) counts.set(f.timeClass, (counts.get(f.timeClass) ?? 0) + 1)
  const timeClass = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? facts[0].timeClass
  const mine = facts.filter((f) => f.timeClass === timeClass && f.rated)
  if (!mine.length) return null
  const now = mine[0].myRating
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const thisMonth = mine.filter((f) => f.endTime * 1000 >= monthStart.getTime())
  const month = thisMonth.length ? now - thisMonth[thisMonth.length - 1].myRatingBefore : 0
  return { timeClass, now, month, series: mine.slice(0, 60).map((f) => f.myRating).reverse() }
}

function Welcome({ onUsername }: { onUsername: (u: string) => void }) {
  const [draft, setDraft] = useState('')
  return (
    <main className="home welcome">
      <h1 className="welcome-title">Your chess.com games, reviewed by Stockfish on this computer.</h1>
      <p className="dim welcome-text">A grade for every move, the lines you missed, what's costing you rating points, and positions from your own mistakes to practise. Nothing is uploaded.</p>
      <form
        className="welcome-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (draft.trim()) onUsername(draft.trim())
        }}
      >
        <label>
          <span>chess.com username</span>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} autoFocus />
        </label>
        <button className="btn btn-primary" type="submit" disabled={!draft.trim()}>
          Load my games
        </button>
      </form>
    </main>
  )
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
