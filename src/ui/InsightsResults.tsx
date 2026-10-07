import type { GameFacts } from '../insights/facts'
import { RATING_GAP_BUCKETS } from '../insights/stats'
import type { Drill } from './GamesDrawer'
import { PerfRows } from './PerfRows'

type Props = { games: GameFacts[]; onDrill: (d: Drill) => void }

const ENDING: Record<string, string> = {
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

const DECISIVE = ['checkmated', 'resigned', 'timeout', 'abandoned']

/** How games finish, and how you do against stronger players, as each colour and by when the game was decided. */
export function InsightsResults({ games, onDrill }: Props) {
  const decisive = DECISIVE.map((how) => ({
    how,
    won: games.filter((g) => g.outcome === 'won' && g.how === how),
    lost: games.filter((g) => g.outcome === 'lost' && g.how === how),
  })).filter((r) => r.won.length + r.lost.length > 0)
  const draws = Object.keys(ENDING)
    .filter((how) => !DECISIVE.includes(how))
    .map((how) => ({ how, games: games.filter((g) => g.outcome === 'drawn' && g.how === how) }))
    .filter((d) => d.games.length > 0)
    .sort((a, b) => b.games.length - a.games.length)
  const max = Math.max(1, ...decisive.flatMap((r) => [r.won.length, r.lost.length]))

  return (
    <div className="insights-grid">
      <div className="insights-col">
        <h2>How your games end</h2>
        <div className="endings" role="table" aria-label="Wins and losses by how the game ended">
          <div className="endings-head" role="row">
            <span role="columnheader">Lost</span>
            <span />
            <span role="columnheader">Won</span>
          </div>
          {decisive.map((r) => (
            <div key={r.how} className="endings-row" role="row">
              <button
                className="endings-side lost"
                onClick={() => onDrill({ title: `Lost: ${ENDING[r.how].toLowerCase()}`, games: r.lost })}
                aria-label={`${r.lost.length} lost by ${ENDING[r.how]}`}
              >
                <span className="num">{r.lost.length.toLocaleString()}</span>
                <span className="endings-bar" style={{ width: `${(r.lost.length / max) * 100}%` }} />
              </button>
              <span className="endings-label">{ENDING[r.how]}</span>
              <button
                className="endings-side won"
                onClick={() => onDrill({ title: `Won: ${ENDING[r.how].toLowerCase()}`, games: r.won })}
                aria-label={`${r.won.length} won by ${ENDING[r.how]}`}
              >
                <span className="endings-bar" style={{ width: `${(r.won.length / max) * 100}%` }} />
                <span className="num">{r.won.length.toLocaleString()}</span>
              </button>
            </div>
          ))}
        </div>
        {draws.length > 0 && (
          <p className="endings-draws">
            Draws:{' '}
            {draws.map((d, i) => (
              <span key={d.how}>
                {i > 0 && ', '}
                <button className="link-button" onClick={() => onDrill({ title: `Drawn: ${ENDING[d.how].toLowerCase()}`, games: d.games })}>
                  {ENDING[d.how].toLowerCase()} <span className="num">{d.games.length.toLocaleString()}</span>
                </button>
              </span>
            ))}
          </p>
        )}

        <h2>Where the game was decided</h2>
        <PerfRows
          onDrill={onDrill}
          drillTitle={(g) => `Games that ended in the ${g.label.toLowerCase()}`}
          groups={(['opening', 'middlegame', 'endgame'] as const).map((p) => ({
            key: p,
            label: p[0].toUpperCase() + p.slice(1),
            facts: games.filter((g) => g.endPhase === p),
          }))}
        />
      </div>

      <div className="insights-col">
        <h2>Against stronger and weaker opponents</h2>
        <PerfRows
          onDrill={onDrill}
          drillTitle={(g) => `Opponents ${g.label}`}
          groups={RATING_GAP_BUCKETS.map((b) => ({
            key: b.label,
            label: b.label === 'within 20' ? 'Within 20' : `${b.label[0].toUpperCase()}${b.label.slice(1)}`,
            facts: games.filter((g) => {
              const gap = g.oppRatingBefore - g.myRatingBefore
              return gap >= b.lo && gap < b.hi
            }),
          }))}
        />

        <h2>By colour</h2>
        <PerfRows
          onDrill={onDrill}
          drillTitle={(g) => `Games as ${g.label}`}
          groups={[
            { key: 'white', label: 'White', facts: games.filter((g) => g.side === 'white') },
            { key: 'black', label: 'Black', facts: games.filter((g) => g.side === 'black') },
          ]}
        />

        {/* Games that ended before move 20 are left out: they often never castled only because they were over. */}
        <h2>Castling, in games past move 20</h2>
        <PerfRows
          onDrill={onDrill}
          drillTitle={(g) => `${g.label}, games past move 20`}
          groups={[
            { key: 'short', label: 'Castled short', facts: games.filter((g) => g.sans.length >= 40 && g.castled?.side === 'short') },
            { key: 'long', label: 'Castled long', facts: games.filter((g) => g.sans.length >= 40 && g.castled?.side === 'long') },
            { key: 'none', label: 'Never castled', facts: games.filter((g) => g.sans.length >= 40 && !g.castled) },
          ]}
        />
      </div>
    </div>
  )
}
