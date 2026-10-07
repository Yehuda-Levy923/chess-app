import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChessComError, type ChessComGame } from '../chesscom/api'
import { reviewBatch, type BatchProgress } from '../review/batch'
import { getEngine } from '../stockfish/shared'
import type { ReviewedGame } from '../insights/engineStats'
import { factsOf, withPreGameRatings, type GameFacts, type Outcome, type Side } from '../insights/facts'
import { loadHistory } from '../insights/history'
import {
  applyFilter,
  byPhase,
  byRatingGap,
  calendar,
  castling,
  clockUse,
  howGamesEnd,
  openings,
  overall,
  pieceShare,
  ratingSeries,
  score,
  type Filter,
  type Record3,
} from '../insights/stats'
import { getBook } from '../openings'
import { allReviews } from '../review/cache'
import type { Review } from '../review/types'
import { BarChart, LineChart, ScoreBar } from './charts'
import { EngineInsights } from './EngineInsights'
import { IconBack } from './icons'
import { OpeningTree } from './OpeningTree'
import './InsightsScreen.css'

type Props = { username: string; onBack: () => void }

type Tab = 'overview' | 'openings' | 'tree' | 'clock' | 'calendar' | 'engine'

const TABS: { id: Tab; name: string }[] = [
  { id: 'overview', name: 'Overview' },
  { id: 'openings', name: 'Openings' },
  { id: 'tree', name: 'Opening tree' },
  { id: 'clock', name: 'Clock' },
  { id: 'calendar', name: 'Calendar' },
  { id: 'engine', name: 'Engine' },
]

const DAY = 86400

/** Batch reviews use the app's default depth, which is also what calibration runs used. */
const BATCH_DEPTH = 16

const PERIODS = [
  { id: 'all', name: 'All time', days: null },
  { id: '365', name: 'Last 12 months', days: 365 },
  { id: '90', name: 'Last 3 months', days: 90 },
  { id: '30', name: 'Last 30 days', days: 30 },
] as const

export function InsightsScreen({ username, onBack }: Props) {
  const [games, setGames] = useState<ChessComGame[] | null>(null)
  const [progress, setProgress] = useState<[number, number] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [facts, setFacts] = useState<GameFacts[] | null>(null)
  const [reviewed, setReviewed] = useState<ReviewedGame[]>([])
  const [tab, setTab] = useState<Tab>('overview')
  const [timeClass, setTimeClass] = useState<string>('all')
  const [side, setSide] = useState<Side | 'both'>('both')
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['id']>('all')

  useEffect(() => {
    const abort = new AbortController()
    loadHistory(username, (d, t) => setProgress([d, t]), abort.signal)
      .then((g) => !abort.signal.aborted && setGames(g))
      .catch((e) => !abort.signal.aborted && setError(e instanceof ChessComError ? e.message : String(e)))
    return () => abort.abort()
  }, [username])

  const refreshReviewed = useCallback(async () => {
    if (!games) return
    const byId = new Map(games.map((g) => [g.uuid, g]))
    // A game reviewed at two depths is cached twice; keep the newest version, then the deepest.
    const best = new Map<string, Review>()
    for (const r of await allReviews()) {
      const prev = best.get(r.gameId)
      if (!prev || (r.version ?? 1) > (prev.version ?? 1) || ((r.version ?? 1) === (prev.version ?? 1) && r.depth > prev.depth)) best.set(r.gameId, r)
    }
    setReviewed(
      [...best.values()].flatMap((review) => {
        const g = byId.get(review.gameId)
        if (!g) return []
        const s: Side = g.black.username.toLowerCase() === username.toLowerCase() ? 'black' : 'white'
        return [{ review, side: s, endTime: g.endTime, chessComAccuracy: g.accuracies ? g.accuracies[s] : null }]
      }),
    )
  }, [games, username])

  // Reducing ten thousand PGNs takes about a second; yield first so the progress text paints.
  useEffect(() => {
    if (!games) return
    const t = setTimeout(() => {
      const book = getBook()
      setFacts(withPreGameRatings(games.map((g) => factsOf(g, username, book))))
      refreshReviewed()
    }, 30)
    return () => clearTimeout(t)
  }, [games, username, refreshReviewed])

  const [batch, setBatch] = useState<{ progress: BatchProgress; ctrl: AbortController } | null>(null)
  // Leaving the screen stops the batch; finished games stay cached.
  const batchCtrl = useRef<AbortController | null>(null)
  useEffect(() => () => batchCtrl.current?.abort(), [])

  const startBatch = (candidates: ChessComGame[]) => {
    const ctrl = new AbortController()
    batchCtrl.current = ctrl
    setBatch({ progress: { done: 0, total: candidates.length, current: null, positions: null, engineRuns: 0 }, ctrl })
    reviewBatch(candidates, BATCH_DEPTH, getEngine(), (progress) => setBatch((b) => (b && b.ctrl === ctrl ? { ...b, progress } : b)), ctrl.signal)
      .catch((e) => console.error(e))
      .finally(() => {
        setBatch((b) => (b && b.ctrl === ctrl ? null : b))
        refreshReviewed()
      })
  }

  const timeClasses = useMemo(() => {
    const counts = new Map<string, number>()
    for (const g of facts ?? []) counts.set(g.timeClass, (counts.get(g.timeClass) ?? 0) + 1)
    return [...counts].sort((a, b) => b[1] - a[1])
  }, [facts])

  const filter: Filter = useMemo(() => {
    const days = PERIODS.find((p) => p.id === period)!.days
    return { timeClass, side, since: days === null ? null : Math.floor(Date.now() / 1000) - days * DAY }
  }, [timeClass, side, period])

  const shown = useMemo(() => (facts ? applyFilter(facts, filter) : []), [facts, filter])
  const shownReviewed = useMemo(() => {
    const ids = new Set(shown.map((g) => g.id))
    return reviewed.filter((r) => ids.has(r.review.gameId))
  }, [reviewed, shown])

  /** Games in the current filter with no review yet, newest first. */
  const unreviewed = useMemo(() => {
    if (!games) return []
    const ids = new Set(shown.map((g) => g.id))
    const done = new Set(reviewed.map((r) => r.review.gameId))
    return games.filter((g) => ids.has(g.uuid) && !done.has(g.uuid))
  }, [games, shown, reviewed])

  if (error) {
    return (
      <main className="insights-status">
        <p>{error}</p>
        <button className="btn" onClick={onBack}>
          Back to games
        </button>
      </main>
    )
  }

  if (!facts) {
    return (
      <main className="insights-status">
        <h1>{username}</h1>
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
            'Asking chess.com for the game archive'
          )}
        </p>
        <div className="progress">
          <div style={{ width: progress ? `${(progress[0] / progress[1]) * 100}%` : '0%' }} />
        </div>
        <button className="btn" onClick={onBack}>
          Cancel
        </button>
      </main>
    )
  }

  return (
    <main className="insights">
      <header className="insights-head">
        <button className="btn btn-quiet back" onClick={onBack}>
          <IconBack size={16} /> Games
        </button>
        <h1>{username}</h1>
        <div className="insights-filters">
          <label>
            <span>Time control</span>
            <select value={timeClass} onChange={(e) => setTimeClass(e.target.value)}>
              <option value="all">All</option>
              {timeClasses.map(([tc, n]) => (
                <option key={tc} value={tc}>
                  {capitalise(tc)}, {n.toLocaleString()} games
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Playing</span>
            <select value={side} onChange={(e) => setSide(e.target.value as Side | 'both')}>
              <option value="both">Either colour</option>
              <option value="white">White</option>
              <option value="black">Black</option>
            </select>
          </label>
          <label>
            <span>Period</span>
            <select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)}>
              {PERIODS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <section className="insights-panel">
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
              {t.name}
            </button>
          ))}
        </nav>
        <div className="insights-body">
          {shown.length === 0 ? (
            <p className="dim">No games match these filters.</p>
          ) : tab === 'overview' ? (
            <Overview games={shown} timeClass={timeClass} timeClasses={timeClasses.map(([tc]) => tc)} />
          ) : tab === 'openings' ? (
            <Openings games={shown} side={side} />
          ) : tab === 'tree' ? (
            <OpeningTree games={shown} filterSide={side === 'both' ? null : side} />
          ) : tab === 'clock' ? (
            <Clock games={timeClass === 'all' ? shown.filter((g) => g.timeClass === timeClasses[0][0]) : shown} timeClass={timeClass === 'all' ? timeClasses[0][0] : timeClass} />
          ) : tab === 'calendar' ? (
            <Calendar games={shown} />
          ) : (
            <EngineInsights
              games={shownReviewed}
              totalGames={shown.length}
              unreviewed={unreviewed}
              batch={batch?.progress ?? null}
              onBatch={(n) => startBatch(unreviewed.slice(0, n))}
              onStop={() => batch?.ctrl.abort()}
            />
          )}
        </div>
      </section>
    </main>
  )
}

/* Overview */

function Overview({ games, timeClass, timeClasses }: { games: GameFacts[]; timeClass: string; timeClasses: string[] }) {
  const total = overall(games)
  const ratingClass = timeClass === 'all' ? timeClasses[0] : timeClass
  const series = ratingSeries(games, ratingClass)
  const how = howGamesEnd(games)
  const phases = byPhase(games)
  const castle = castling(games)
  const pieces = pieceShare(games)

  return (
    <div className="insights-grid">
      <div className="insights-col">
        <div className="headline">
          <span className="headline-number num">{Math.round(score(total) * 100)}%</span>
          <span className="dim">
            score over <span className="num">{total.games.toLocaleString()}</span> games
          </span>
        </div>
        <p className="headline-record">
          <span className="num won">{total.won.toLocaleString()}</span> won, <span className="num drawn">{total.drawn.toLocaleString()}</span> drawn,{' '}
          <span className="num lost">{total.lost.toLocaleString()}</span> lost
        </p>

        <h2>Rating, {ratingClass}</h2>
        <LineChart
          yLabel={`${ratingClass} rating over time`}
          series={[
            {
              id: 'rating',
              name: 'Rating',
              points: thin(series).map((p) => ({ x: p.t, y: p.rating, tip: <><span className="num">{p.rating}</span> <span className="dim">{formatDate(p.t)}</span></> })),
            },
          ]}
        />

        <h2>By opponent rating</h2>
        <RecordTable rows={byRatingGap(games).filter((b) => b.record.games > 0).map((b) => ({ key: b.label, name: `Opponent ${b.label}`, record: b.record }))} />
      </div>

      <div className="insights-col">
        <h2>How games ended</h2>
        <table className="itable">
          <thead>
            <tr>
              <th />
              <th className="r">Wins</th>
              <th className="r">Draws</th>
              <th className="r">Losses</th>
            </tr>
          </thead>
          <tbody>
            {endingRows(how).map((r) => (
              <tr key={r.how}>
                <td>{HOW[r.how] ?? r.how}</td>
                <td className="r num won">{r.won || ''}</td>
                <td className="r num drawn">{r.drawn || ''}</td>
                <td className="r num lost">{r.lost || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Phase the game ended in</h2>
        <RecordTable rows={(['opening', 'middlegame', 'endgame'] as const).filter((p) => phases.get(p)).map((p) => ({ key: p, name: capitalise(p), record: phases.get(p)! }))} />

        <h2>Castling</h2>
        <RecordTable
          rows={[
            { key: 'short', name: 'Castled short', record: castle.short },
            { key: 'long', name: 'Castled long', record: castle.long },
            { key: 'none', name: 'Did not castle', record: castle.none },
          ].filter((r) => r.record.games > 0)}
        />
        {castle.avgMove !== null && (
          <p className="dim note">
            Castled on move <span className="num">{castle.avgMove.toFixed(1)}</span> on average.
          </p>
        )}

        <h2>Moves by piece</h2>
        <table className="itable">
          <tbody>
            {PIECES.map(([p, name]) => (
              <tr key={p}>
                <td>{name}</td>
                <td className="r num">{(pieces[p] * 100).toFixed(1)}%</td>
                <td className="bar-cell">
                  <span className="sharebar" style={{ width: `${pieces[p] * 100 * 2.5}%` }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* Openings */

function Openings({ games, side }: { games: GameFacts[]; side: Side | 'both' }) {
  const sides: Side[] = side === 'both' ? ['white', 'black'] : [side]
  return (
    <div className="insights-grid">
      {sides.map((s) => {
        const rows = openings(games, s, 10)
        return (
          <div key={s} className="insights-col">
            <h2>As {capitalise(s)}</h2>
            {rows.length === 0 ? (
              <p className="dim">No games as {s}.</p>
            ) : (
              <RecordTable rows={rows.map((r) => ({ key: r.family, name: r.family, record: r.record, extra: r.avgBookMoves.toFixed(1) }))} extraHead="Book moves" />
            )}
          </div>
        )
      })}
      <p className="dim note wide">
        Book moves is how many moves you stayed in the Lichess opening book on average, the same idea as chess.com's opening mastery. Openings are matched by move
        order, so a transposition counts under the line it started as.
      </p>
    </div>
  )
}

/* Clock */

/** One time control at a time: bullet and rapid clocks don't average into anything. */
function Clock({ games, timeClass }: { games: GameFacts[]; timeClass: string }) {
  const c = clockUse(games)
  if (c.games === 0) return <p className="dim">These games have no clock data.</p>
  return (
    <div className="insights-grid">
      <div className="insights-col">
        <h2>Clock, {timeClass}</h2>
        <table className="itable">
          <tbody>
            <tr>
              <td>Losses that were on time</td>
              <td className="r num">{(c.timeoutShareOfLosses * 100).toFixed(1)}%</td>
            </tr>
            <tr>
              <td>Games where your clock fell under 10%</td>
              <td className="r num">
                {c.lowTimeGames.toLocaleString()} <span className="dim">of {c.games.toLocaleString()}</span>
              </td>
            </tr>
            <tr>
              <td>Your score in those games</td>
              <td className="r num">{(c.lowTimeScore * 100).toFixed(1)}%</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="insights-col">
        <h2>Time per move, as a share of the starting clock</h2>
        <BarChart
          format={(v) => `${(v * 100).toFixed(1)}%`}
          bars={c.spentByMove.map((b) => ({ key: b.label, label: b.label, value: b.share ?? 0, tip: <span className="dim">moves {b.label}</span> }))}
        />
      </div>
    </div>
  )
}

/* Calendar */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function Calendar({ games }: { games: GameFacts[] }) {
  const cal = calendar(games)
  return (
    <div className="insights-grid">
      <div className="insights-col">
        <h2>By weekday</h2>
        <RecordTable rows={[1, 2, 3, 4, 5, 6, 0].map((d) => ({ key: String(d), name: WEEKDAYS[d], record: cal.weekday[d] }))} />
      </div>
      <div className="insights-col">
        <h2>Games by hour of the day</h2>
        <BarChart
          format={(v) => `${v.toLocaleString()} games`}
          bars={cal.hour.map((r, h) => ({
            key: String(h),
            label: h % 3 === 0 ? String(h) : '',
            value: r.games,
            tip: r.games ? <>score {(score(r) * 100).toFixed(0)}%</> : <span className="dim">no games</span>,
          }))}
        />
        <p className="dim note">Hours are in your computer's time zone.</p>
      </div>
    </div>
  )
}

/* Shared pieces */

type Row = { key: string; name: string; record: Record3; extra?: string }

export function RecordTable({ rows, extraHead }: { rows: Row[]; extraHead?: string }) {
  return (
    <table className="itable">
      <thead>
        <tr>
          <th />
          <th className="r">Games</th>
          <th className="r">Won</th>
          <th className="r">Drawn</th>
          <th className="r">Lost</th>
          <th className="r">Score</th>
          <th />
          {extraHead && <th className="r">{extraHead}</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td className="name">{r.name}</td>
            <td className="r num">{r.record.games.toLocaleString()}</td>
            <td className="r num won">{r.record.won.toLocaleString()}</td>
            <td className="r num drawn">{r.record.drawn.toLocaleString()}</td>
            <td className="r num lost">{r.record.lost.toLocaleString()}</td>
            <td className="r num">{Math.round(score(r.record) * 100)}%</td>
            <td className="bar-cell">
              <ScoreBar score={score(r.record)} />
            </td>
            {extraHead && <td className="r num">{r.extra}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const HOW: Record<string, string> = {
  checkmated: 'Checkmate',
  resigned: 'Resignation',
  timeout: 'On time',
  abandoned: 'Abandoned',
  agreed: 'Agreement',
  repetition: 'Repetition',
  stalemate: 'Stalemate',
  insufficient: 'Insufficient material',
  '50move': '50-move rule',
  timevsinsufficient: 'Time vs insufficient material',
}

function endingRows(how: Record<Outcome, { how: string; count: number }[]>) {
  const rows = new Map<string, { how: string; won: number; drawn: number; lost: number }>()
  for (const o of ['won', 'drawn', 'lost'] as Outcome[]) {
    for (const { how: h, count } of how[o]) {
      const row = rows.get(h) ?? { how: h, won: 0, drawn: 0, lost: 0 }
      row[o] += count
      rows.set(h, row)
    }
  }
  return [...rows.values()].sort((a, b) => b.won + b.drawn + b.lost - (a.won + a.drawn + a.lost))
}

const PIECES = [
  ['p', 'Pawn'],
  ['n', 'Knight'],
  ['b', 'Bishop'],
  ['r', 'Rook'],
  ['q', 'Queen'],
  ['k', 'King'],
] as const

/** At most ~400 points: a 9,000-game rating line doesn't need every game to read. */
function thin<T>(points: T[], max = 400): T[] {
  if (points.length <= max) return points
  const step = points.length / max
  return Array.from({ length: max }, (_, i) => points[Math.floor(i * step)]).concat(points[points.length - 1])
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function formatDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
