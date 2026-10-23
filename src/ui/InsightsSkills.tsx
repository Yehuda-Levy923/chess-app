import { phaseSkills, tacticsBothWays, withPhases, type PhaseSkill } from '../insights/chesscomStats'
import type { ReviewedGame } from '../insights/engineStats'
import { useCloud } from './cloud'
import { derived } from './derived'
import type { Drill } from './GamesDrawer'
import { gamesDrill } from './moveDrill'

type Props = {
  games: ReviewedGame[]
  onDrill: (d: Drill) => void
}

const PHASE_NAME = { opening: 'Opening', middlegame: 'Middlegame', endgame: 'Endgame' } as const
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * chess.com's Advanced Stats: a rating per phase of the game, per time control.
 * Theirs compares you with players of your rating; ours says what level your
 * accuracy in each phase matches, from the model behind a review's "Played like".
 */
export function InsightsSkills({ games, onDrill }: Props) {
  const cloud = useCloud()
  const stats = derived(games, 'skills-tab', () => ({ rows: phaseSkills(games), covered: withPhases(games), tactics: tacticsBothWays(games) }))
  if (games.length === 0) return <p className="dim">These come from reviewed games, and none in this filter are reviewed.</p>
  const missing = games.length - stats.covered

  const tacticRate = stats.tactics.rows.map((r) => ({ kind: r.kind, found: r.found.length, missed: r.missed.length }))
  const found = tacticRate.reduce((s, r) => s + r.found, 0)
  const missed = tacticRate.reduce((s, r) => s + r.missed, 0)

  return (
    <div className="skills">
      {missing > games.length * 0.1 && (
        <div className="batch">
          <p>
            <span className="num">{missing.toLocaleString()}</span> of these reviews predate phase data, so they're left out here.
            {cloud?.active ? ' A GitHub run is going; they come in when it finishes.' : ''}
          </p>
          {cloud?.available && !cloud.active && (
            <button className="btn" onClick={() => void cloud.resummarize()}>
              Rebuild them on GitHub
            </button>
          )}
        </div>
      )}

      <h2>Played like, by phase</h2>
      {stats.rows.length === 0 ? (
        <p className="dim">No reviews with phase data in this filter yet.</p>
      ) : (
        <table className="itable skills-table">
          <thead>
            <tr>
              <th />
              {(['opening', 'middlegame', 'endgame'] as const).map((p) => (
                <th key={p} className="r">
                  {PHASE_NAME[p]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.rows.map((row) => (
              <tr key={row.timeClass}>
                <td className="name">
                  {cap(row.timeClass)}
                  <span className="row-sub">
                    <span className="num">{Math.min(row.games, 100)}</span> latest games
                  </span>
                </td>
                {row.phases.map((p) => (
                  <td key={p.phase} className="r">
                    <SkillCell p={p} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="dim note">
        The rating your average accuracy in each phase plays like, over your latest 100 reviewed games, with the change from the 100 before. It measures the level
        of your play, not your rank among players at your rating. Endgames often begin already decided, where few moves change much, so they tend to read high.
      </p>

      <h2>Tactics</h2>
      <p>
        You found <span className="num">{found + missed ? Math.round((found / (found + missed)) * 100) : 0}%</span> of the mates, forks and pins the engine wanted (
        <span className="num">{found.toLocaleString()}</span> of <span className="num">{(found + missed).toLocaleString()}</span>). The Tactics tab breaks this down,
        with the ones you allowed.
      </p>

      <h2>Strongest and weakest phase</h2>
      <table className="itable perf-rows">
        <tbody>
          {stats.rows.map((row) => {
            const ids = games.filter((g) => g.facts.timeClass === row.timeClass).map((g) => g.facts.id)
            const open = () => onDrill(gamesDrill(`${cap(row.timeClass)}, reviewed games`, ids, games))
            const best = row.phases.filter((p) => p.rating !== null).sort((a, b) => b.rating! - a.rating!)
            return (
              <tr key={row.timeClass} tabIndex={0} onClick={open} onKeyDown={(e) => e.key === 'Enter' && open()}>
                <td className="name">{cap(row.timeClass)}</td>
                <td>
                  {best.length >= 2 ? (
                    <>
                      Strongest in the {best[0].phase}, weakest in the {best[best.length - 1].phase} (
                      <span className="num">{(best[0].rating! - best[best.length - 1].rating!).toLocaleString()}</span> apart)
                    </>
                  ) : (
                    <span className="dim">Not enough games yet</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SkillCell({ p }: { p: PhaseSkill }) {
  if (p.rating === null) return <span className="dim">{p.accuracy === null ? '' : p.accuracy.toFixed(1)}</span>
  const change = p.earlierRating === null ? null : p.rating - p.earlierRating
  return (
    <span className="skill" title={`Average accuracy ${p.accuracy!.toFixed(1)} over ${p.games} games`}>
      <span className="skill-rating num">{p.rating.toLocaleString()}</span>
      {change !== null && change !== 0 && (
        <span className="skill-change num">
          {change > 0 ? '+' : '−'}
          {Math.abs(change)}
        </span>
      )}
      <span className="skill-acc num dim">{p.accuracy!.toFixed(1)}</span>
    </span>
  )
}
