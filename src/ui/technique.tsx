import type { ClockTargets } from '../insights/clockTargets'
import { conversion, type ConversionGroup } from '../insights/conversion'
import type { ReviewedGame } from '../insights/engineStats'
import type { GameFacts } from '../insights/facts'
import { derived } from './derived'
import type { Drill } from './GamesDrawer'

// Converting won positions, saving lost ones, and a clock target: the
// "technique" side of results, shared by the Summary, Results and Clock tabs.

export type ClockAdvice = { move: number; won: number; flagged: number; timeClass: string }

/**
 * The checkpoint where wins and time losses differ most in seconds left, if
 * both sides have enough games to trust a median and the gap is worth saying.
 */
export function clockAdvice(t: ClockTargets, minGames = 30): ClockAdvice | null {
  let best: ClockAdvice | null = null
  for (const c of t.checkpoints) {
    if (c.medianLeftWon === null || c.medianLeftFlagged === null || c.wonGames < minGames || c.flaggedGames < minGames) continue
    const gap = c.medianLeftWon - c.medianLeftFlagged
    if (gap >= 2 && (!best || gap > best.won - best.flagged)) best = { move: c.move, won: c.medianLeftWon, flagged: c.medianLeftFlagged, timeClass: t.timeClass }
  }
  return best
}

export const secs = (s: number) => (s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`)
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '–')

/** How often winning positions became wins and losing ones were saved, with the opponents' side for scale. */
export function ConvertDefend({ reviewed, facts, onDrill }: { reviewed: ReviewedGame[]; facts: GameFacts[]; onDrill: (d: Drill) => void }) {
  if (reviewed.length === 0) return <p className="dim">This needs reviewed games; none in this filter yet.</p>
  const c = derived(reviewed, 'conversion', () => conversion(reviewed))
  const byId = new Map(facts.map((f) => [f.id, f]))
  const open = (title: string, g: ConversionGroup) => onDrill({ title, games: g.gameIds.flatMap((id) => byId.get(id) ?? []) })
  const w = c.me.winning
  const l = c.me.losing
  const ow = c.opponents.winning

  const row = (label: string, g: ConversionGroup, rateOf: (g: ConversionGroup) => number, title: string, rateLabel: string) => (
    <tr tabIndex={0} onClick={() => open(title, g)} onKeyDown={(e) => e.key === 'Enter' && open(title, g)}>
      <td className="name">{label}</td>
      <td className="r num">{g.games.toLocaleString()}</td>
      <td className="r num">{g.won.toLocaleString()}</td>
      <td className="r num">{g.drawn.toLocaleString()}</td>
      <td className="r num">
        {g.lost.toLocaleString()}
        {g.lostOnTime > 0 && <span className="dim"> ({g.lostOnTime.toLocaleString()} on time)</span>}
      </td>
      <td className="r num strong" title={rateLabel}>
        {pct(rateOf(g), g.games)}
      </td>
    </tr>
  )

  return (
    <div className="technique">
      <p className="technique-lead">
        You turned <span className="num">{pct(w.won, w.games)}</span> of your winning positions into wins and saved <span className="num">{pct(l.won + l.drawn, l.games)}</span> of
        your losing ones.
        {w.lostOnTime > 0 && (
          <>
            {' '}
            Of the <span className="num">{w.lost.toLocaleString()}</span> you lost from winning, <span className="num">{w.lostOnTime.toLocaleString()}</span> were on time.
          </>
        )}
      </p>
      <table className="itable perf-rows">
        <thead>
          <tr>
            <th />
            <th className="r">Games</th>
            <th className="r">Won</th>
            <th className="r">Drawn</th>
            <th className="r">Lost</th>
            <th className="r">Rate</th>
          </tr>
        </thead>
        <tbody>
          {row('You were winning', w, (g) => g.won, 'Games where you were winning', 'Converted: won')}
          {row('You were losing', l, (g) => g.won + g.drawn, 'Games where you were losing', 'Saved: won or drawn')}
          {row('Your opponent was winning', ow, (g) => g.won, 'Games where your opponent was winning', 'Their conversion: they won')}
        </tbody>
      </table>
      <p className="dim caption">
        Winning means an 80% or better chance to win at some point after move 8, losing 20% or worse. The last row is the same games as "you were losing",
        seen from your opponent's side: how often they finished the job against you, for scale.
      </p>
    </div>
  )
}
