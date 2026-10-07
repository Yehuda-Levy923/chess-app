import type { GameFacts } from '../insights/facts'
import { clockUse } from '../insights/stats'
import { BarChart } from './charts'
import type { Drill } from './GamesDrawer'
import { PerfRows } from './PerfRows'

type Props = {
  /** Games of one time control; clocks of different lengths don't average into anything */
  games: GameFacts[]
  timeClass: string
  onDrill: (d: Drill) => void
}

const LOWEST = [
  { key: 'half', label: 'Never under half', lo: 0.5, hi: Infinity },
  { key: '25', label: 'Lowest 25–50%', lo: 0.25, hi: 0.5 },
  { key: '10', label: 'Lowest 10–25%', lo: 0.1, hi: 0.25 },
  { key: '5', label: 'Lowest 5–10%', lo: 0.05, hi: 0.1 },
  { key: '0', label: 'Under 5%', lo: -Infinity, hi: 0.05 },
]

/** How low your clock got and what that did to your results. */
export function InsightsClock({ games, timeClass, onDrill }: Props) {
  const timed = games.filter((g) => g.clock && g.clock.base > 0 && g.clock.lowest !== null)
  if (timed.length === 0) return <p className="dim">These games have no clock data.</p>

  const c = clockUse(timed)
  const flagged = timed.filter((g) => g.outcome === 'lost' && g.how === 'timeout')
  const flaggedThem = timed.filter((g) => g.outcome === 'won' && g.how === 'timeout')
  const cap = timeClass[0].toUpperCase() + timeClass.slice(1)

  return (
    <div className="insights-grid">
      <div className="insights-col">
        <h2>{cap}: your result by how low your clock got</h2>
        <PerfRows
          onDrill={onDrill}
          drillTitle={(g) => `${cap}, clock ${g.label.toLowerCase()}`}
          groups={LOWEST.map((b) => ({
            key: b.key,
            label: b.label,
            facts: timed.filter((g) => g.clock!.lowest! >= b.lo && g.clock!.lowest! < b.hi),
          }))}
        />
        <p className="clock-flags">
          You ran out of time in{' '}
          <button className="link-button" onClick={() => onDrill({ title: `${cap}, lost on time`, games: flagged })}>
            <span className="num">{flagged.length.toLocaleString()}</span> games
          </button>{' '}
          and flagged your opponent in{' '}
          <button className="link-button" onClick={() => onDrill({ title: `${cap}, won on time`, games: flaggedThem })}>
            <span className="num">{flaggedThem.length.toLocaleString()}</span>
          </button>
          .
        </p>
      </div>
      <div className="insights-col">
        <h2>{cap}: time spent per move, as a share of the starting clock</h2>
        <BarChart
          format={(v) => `${(v * 100).toFixed(1)}%`}
          bars={c.spentByMove.map((b) => ({ key: b.label, label: `Moves ${b.label}`, value: b.share ?? 0, tip: <span className="dim">average per move</span> }))}
        />
      </div>
    </div>
  )
}
