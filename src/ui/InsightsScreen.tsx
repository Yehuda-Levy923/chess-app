import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChessComGame } from '../chesscom/api'
import { reviewBatch, type BatchProgress } from '../review/batch'
import { getEngine } from '../stockfish/shared'
import type { ReviewedGame } from '../insights/engineStats'
import type { Side } from '../insights/facts'
import { applyFilter, type Filter } from '../insights/stats'
import { EngineInsights } from './EngineInsights'
import { GamesDrawer, type Drill } from './GamesDrawer'
import { InsightsActivity } from './InsightsActivity'
import { InsightsClock } from './InsightsClock'
import { InsightsOpenings } from './InsightsOpenings'
import { InsightsResults } from './InsightsResults'
import { InsightsSummary } from './InsightsSummary'
import { useHistory } from './history'
import { ImportReviews } from './ImportReviews'
import './InsightsScreen.css'

type Props = { username: string; onOpen: (game: ChessComGame, ply?: number) => void }

type Tab = 'summary' | 'openings' | 'results' | 'clock' | 'activity' | 'engine'

const TABS: { id: Tab; name: string }[] = [
  { id: 'summary', name: 'Summary' },
  { id: 'openings', name: 'Openings' },
  { id: 'results', name: 'Results' },
  { id: 'clock', name: 'Clock' },
  { id: 'activity', name: 'Activity' },
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

export function InsightsScreen({ username, onOpen }: Props) {
  // The history is loaded once for the whole app; this screen only filters and draws it.
  const { games, facts, summaries, progress, error, byUuid, summaryById, refreshSummaries: refreshReviewed } = useHistory()
  // Tab and filters are remembered between visits; a bad stored value just means the defaults.
  const saved = useMemo(() => readSaved(), [])
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.id === saved.tab) ? (saved.tab as Tab) : 'summary')
  const [drill, setDrill] = useState<Drill | null>(null)
  const [openingFocus, setOpeningFocus] = useState<string | null>(null)
  const [timeClass, setTimeClass] = useState<string>(saved.timeClass ?? 'all')
  const [side, setSide] = useState<Side | 'both'>(saved.side ?? 'both')
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['id']>(PERIODS.some((p) => p.id === saved.period) ? (saved.period as (typeof PERIODS)[number]['id']) : 'all')
  useEffect(() => {
    try {
      localStorage.setItem('insights', JSON.stringify({ tab, timeClass, side, period }))
    } catch {
      // ignore
    }
  }, [tab, timeClass, side, period])

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

  const closeDrill = useCallback(() => setDrill(null), [])

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
  /** Reviewed games in the current filter, so engine stats follow the filters too. */
  const shownReviewed: ReviewedGame[] = useMemo(() => {
    const bySummary = new Map(summaries.map((s) => [s.gameId, s]))
    return shown.flatMap((f) => {
      const summary = bySummary.get(f.id)
      return summary ? [{ summary, facts: f, chessComAccuracy: byUuid.get(f.id)?.accuracies?.[f.side] ?? null }] : []
    })
  }, [summaries, shown, byUuid])

  /** Games in the current filter with no review yet, newest first. */
  const unreviewed = useMemo(() => {
    if (!games) return []
    const ids = new Set(shown.map((g) => g.id))
    const done = new Set(summaries.map((r) => r.gameId))
    return games.filter((g) => ids.has(g.uuid) && !done.has(g.uuid))
  }, [games, shown, summaries])

  if (error) {
    return (
      <main className="insights-status">
        <p>{error}</p>
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
      </main>
    )
  }

  return (
    <main className="insights">
      <header className="insights-head">
        <h1 className="page-title">Insights</h1>
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
            <button
              key={t.id}
              className={tab === t.id ? 'on' : ''}
              onClick={() => {
                setOpeningFocus(null)
                setTab(t.id)
              }}
            >
              {t.name}
            </button>
          ))}
        </nav>
        <div className="insights-body">
          {shown.length === 0 ? (
            <p className="dim">No games match these filters.</p>
          ) : tab === 'summary' ? (
            <InsightsSummary
              games={shown}
              history={facts}
              periodDays={PERIODS.find((p) => p.id === period)!.days}
              ratingClass={timeClass === 'all' ? timeClasses[0][0] : timeClass}
              reviewed={shownReviewed}
              onDrill={setDrill}
            />
          ) : tab === 'results' ? (
            <InsightsResults games={shown} reviewed={shownReviewed} onDrill={setDrill} />
          ) : tab === 'openings' ? (
            <InsightsOpenings key={openingFocus ?? ''} games={shown} filterSide={side === 'both' ? null : side} onDrill={setDrill} focus={openingFocus} summaries={summaryById} />
          ) : tab === 'clock' ? (
            <InsightsClock
              games={timeClass === 'all' ? shown.filter((g) => g.timeClass === timeClasses[0][0]) : shown}
              timeClass={timeClass === 'all' ? timeClasses[0][0] : timeClass}
              onDrill={setDrill}
            />
          ) : tab === 'activity' ? (
            <InsightsActivity games={shown} onDrill={setDrill} />
          ) : (
            <>
              <ImportReviews hasReviews={summaries.length > 0} onImported={refreshReviewed} />
              <EngineInsights
                games={shownReviewed}
                totalGames={shown.length}
                unreviewed={unreviewed}
                batch={batch?.progress ?? null}
                onBatch={(n) => startBatch(unreviewed.slice(0, n))}
                onStop={() => batch?.ctrl.abort()}
                history={facts}
                onDrill={setDrill}
                onOpening={(family) => {
                  setOpeningFocus(family)
                  setTab('openings')
                }}
              />
            </>
          )}
        </div>
      </section>
      {drill && <GamesDrawer {...drill} lookup={(id) => byUuid.get(id)} onOpen={onOpen} onClose={closeDrill} />}
    </main>
  )
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function readSaved(): { tab?: string; timeClass?: string; side?: Side | 'both'; period?: string } {
  try {
    return JSON.parse(localStorage.getItem('insights') ?? '{}')
  } catch {
    return {}
  }
}
