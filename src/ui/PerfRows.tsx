import type { GameFacts } from '../insights/facts'
import { PerfBar } from './charts'
import { performance } from './findings'
import type { Drill } from './GamesDrawer'

export type PerfGroup = { key: string; label: string; facts: GameFacts[] }

const pct = (x: number) => `${(x * 100).toFixed(1)}%`
const signed = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(1)}`

/**
 * One row per group: how many games, the score, how far above or below the
 * ratings' prediction, and the same as a bar. Rows open their games.
 */
export function PerfRows({ groups, onDrill, drillTitle = (g) => g.label }: { groups: PerfGroup[]; onDrill: (d: Drill) => void; drillTitle?: (g: PerfGroup) => string }) {
  const rows = groups.filter((g) => g.facts.length > 0).map((g) => ({ ...g, perf: performance(g.facts) }))
  if (rows.length === 0) return <p className="dim">No games.</p>
  return (
    <table className="itable perf-rows">
      <thead>
        <tr>
          <th />
          <th className="r">Games</th>
          <th className="r">Score</th>
          <th className="r" title="Points per 100 games above or below what the ratings predicted">
            vs ratings
          </th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const few = r.perf.games < 10
          return (
            <tr
              key={r.key}
              className={few ? 'few' : ''}
              tabIndex={0}
              onClick={() => onDrill({ title: drillTitle(r), games: r.facts })}
              onKeyDown={(e) => e.key === 'Enter' && onDrill({ title: drillTitle(r), games: r.facts })}
            >
              <td className="name">{r.label}</td>
              <td className="r num">{r.perf.games.toLocaleString()}</td>
              <td className="r num">{pct(r.perf.actual)}</td>
              <td className={`r num delta ${r.perf.games >= 25 && Math.abs(r.perf.z) >= 2 ? 'strong' : ''}`}>
                {few ? '' : signed((r.perf.actual - r.perf.expected) * 100)}
              </td>
              <td className="bar-cell">{!few && <PerfBar actual={r.perf.actual} expected={r.perf.expected} />}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
