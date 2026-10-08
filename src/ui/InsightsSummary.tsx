import type { ReactNode } from 'react'
import { clockTargets } from '../insights/clockTargets'
import { conversion } from '../insights/conversion'
import type { ReviewedGame } from '../insights/engineStats'
import type { GameFacts } from '../insights/facts'
import { ratingSeries } from '../insights/stats'
import { DivergingBars, LineChart, PerfBar } from './charts'
import { byMonth, comparePeriods, findings, type RankedFinding } from './findings'
import { derived } from './derived'
import type { Drill } from './GamesDrawer'
import { clockAdvice, secs } from './technique'

type Props = {
  /** Games in the current filter */
  games: GameFacts[]
  /** Every game, for sittings and the previous-period comparison */
  history: GameFacts[]
  /** The filter's period in days, or null for all time */
  periodDays: number | null
  ratingClass: string
  /** Reviewed games in the filter, for converting and defending */
  reviewed: ReviewedGame[]
  onDrill: (d: Drill) => void
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`
const signed = (x: number, digits = 1) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(digits)}`

export function InsightsSummary({ games, history, periodDays, ratingClass, reviewed, onDrill }: Props) {
  const { weaknesses, strengths, tested } = derived(games, 'findings', () => findings(games, {}, history))
  const clear = weaknesses.filter((f) => f.confidence === 'clear')
  const possible = weaknesses.filter((f) => f.confidence === 'possible')

  // Trend: the filter's period against the one before it; all time compares the last 90 days.
  const days = periodDays ?? 90
  const now = Date.now() / 1000
  const scope = derived(games, 'scope', () => inScope(history, games))
  const { current, previous } = comparePeriods(scope, days, now)
  const inPeriod = scope.filter((g) => g.endTime > now - days * 86400)
  const series = derived(scope, `rating:${ratingClass}`, () => ratingSeries(scope, ratingClass))
  const ratingNow = series.at(-1)?.rating ?? null
  const ratingThen = [...series].reverse().find((p) => p.t <= now - days * 86400)?.rating ?? null

  const drillFinding = (f: RankedFinding) =>
    onDrill({
      title: f.title,
      games: games.filter((g) => f.ids.has(g.id)),
    })

  const months = derived(games, 'months', () => byMonth(games).slice(-18))

  /**
   * For the clock finding, how many of its losses were on time. Engine reviews
   * show moves in time trouble aren't much worse, so the points go mostly to the flag.
   */
  const detailFor = (f: RankedFinding): ReactNode => {
    if (f.kind !== 'clock') return null
    const losses = games.filter((g) => f.ids.has(g.id) && g.outcome === 'lost')
    const onTime = losses.filter((g) => g.how === 'timeout').length
    const target = derived(games, 'clock-target', () => {
      const t = clockTargets(games)[0]
      return t ? clockAdvice(t) : null
    })
    return losses.length ? (
      <>
        <span className="num">{onTime.toLocaleString()}</span> of its <span className="num">{losses.length.toLocaleString()}</span> losses were on time.
        {target && (
          <span className="finding-advice">
            {' '}
            In {target.timeClass}, aim to reach move {target.move} with about {secs(target.won)}: that's what you had in your wins, against {secs(target.flagged)} in
            the games you lost on time.
          </span>
        )}
      </>
    ) : null
  }
  const peak = series.reduce<{ t: number; rating: number } | null>((best, p) => (!best || p.rating > best.rating ? p : best), null)

  return (
    <div className="sum">
      <dl className="kpis">
        <div className="kpi">
          <dt>{cap(ratingClass)} rating</dt>
          <dd>
            <span className="kpi-value num">{ratingNow?.toLocaleString() ?? '–'}</span>
            {ratingNow !== null && ratingThen !== null && <span className="kpi-delta num">{signed(ratingNow - ratingThen, 0)}</span>}
          </dd>
        </div>
        <div className="kpi">
          <dt>Score</dt>
          <dd>
            <button className="kpi-value num" onClick={() => onDrill({ title: `Games in the last ${days} days`, games: inPeriod })}>
              {current.games ? pct(current.actual) : '–'}
            </button>
            {current.games > 0 && previous.games > 0 && <span className="kpi-delta num">{signed((current.actual - previous.actual) * 100)}</span>}
          </dd>
        </div>
        <div className="kpi">
          <dt>Against your ratings</dt>
          <dd>
            <span className="kpi-value num">{current.games ? signed((current.actual - current.expected) * 100) : '–'}</span>
            {current.games > 0 && previous.games > 0 && (
              <span className="kpi-delta num" title="Change from the period before">
                {signed((current.actual - current.expected - (previous.actual - previous.expected)) * 100)}
              </span>
            )}
          </dd>
        </div>
        <div className="kpi">
          <dt>Games</dt>
          <dd>
            <span className="kpi-value num">{current.games.toLocaleString()}</span>
            {previous.games > 0 && <span className="kpi-delta num">{signed(current.games - previous.games, 0)}</span>}
          </dd>
        </div>
        <div className="kpi">
          <dt>Losses on time</dt>
          <dd>
            <button
              className="kpi-value num"
              onClick={() => onDrill({ title: `Lost on time, last ${days} days`, games: inPeriod.filter((g) => g.outcome === 'lost' && g.how === 'timeout') })}
            >
              {current.losses ? pct(current.lostOnTime / current.losses) : '–'}
            </button>
            {current.losses > 0 && previous.losses > 0 && (
              <span className="kpi-delta num">{signed((current.lostOnTime / current.losses - previous.lostOnTime / previous.losses) * 100)}</span>
            )}
          </dd>
        </div>
        <p className="kpis-caption">
          Last {days} days, change against the {days} before. "Against your ratings" is points per 100 games above or below what the ratings predicted.
        </p>
      </dl>

      <div className="sum-grid">
        <section className="sum-main">
          <h2>What's costing you points</h2>
          {clear.length === 0 && possible.length === 0 ? (
            <p className="sum-none">Nothing in these games scores clearly below what your ratings predict.</p>
          ) : (
            <ol className="findings">
              {clear.map((f) => (
                <FindingRow key={f.id} f={f} onDrill={() => drillFinding(f)} extra={detailFor(f)} />
              ))}
            </ol>
          )}
          {possible.length > 0 && (
            <>
              <h3 className="sum-sub">Possible, could be chance</h3>
              <ol className="findings quiet">
                {possible.map((f) => (
                  <FindingRow key={f.id} f={f} onDrill={() => drillFinding(f)} extra={detailFor(f)} />
                ))}
              </ol>
            </>
          )}

          {reviewed.length > 0 && <TechniqueLine reviewed={reviewed} games={games} onDrill={onDrill} />}

          <h2>Doing better than expected</h2>
          {strengths.length === 0 ? (
            <p className="sum-none">Nothing scores clearly above what your ratings predict, either.</p>
          ) : (
            <ol className="findings">
              {strengths.map((f) => (
                <FindingRow key={f.id} f={f} onDrill={() => drillFinding(f)} extra={detailFor(f)} />
              ))}
            </ol>
          )}

          <details className="sum-method">
            <summary>How this is worked out</summary>
            <p>
              Each group of games is compared with the Elo-expected result from your rating and your opponent's going into each game, so losing to stronger players
              doesn't count against you. Points are game points: −10 means ten wins' worth fewer than the ratings predicted. {tested} groups were checked, so a few
              would look unusual by luck alone; "clear" ones hold up after allowing for that.
            </p>
          </details>
        </section>

        <aside className="sum-side">
          <h2>{cap(ratingClass)} rating</h2>
          <LineChart
            zoomable
            yLabel={`${ratingClass} rating over time`}
            formatX={(t) => new Date(t * 1000).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
            marks={peak ? [{ x: peak.t, y: peak.rating, label: `Peak ${peak.rating.toLocaleString()}` }] : []}
            series={[
              {
                id: 'rating',
                name: 'Rating',
                points: thin(series).map((p) => ({
                  x: p.t,
                  y: p.rating,
                  tip: (
                    <>
                      <span className="num">{p.rating}</span> <span className="dim">{formatDay(p.t)}</span>
                    </>
                  ),
                })),
              },
            ]}
          />

          <h2>Month by month, against your ratings</h2>
          {months.length < 2 ? (
            <p className="dim chart-empty">Not enough months yet.</p>
          ) : (
            <DivergingBars
              onPick={(key) => {
                const m = months.find((x) => x.key === key)!
                onDrill({ title: monthName(m.start, true), games: m.facts })
              }}
              bars={months.map((m) => ({
                key: m.key,
                label: monthName(m.start),
                value: (m.actual - m.expected) * 100,
                tip: (
                  <>
                    <strong>{monthName(m.start, true)}</strong> <span className="num">{signed((m.actual - m.expected) * 100)}</span> per 100 games
                    <br />
                    <span className="dim">
                      <span className="num">{m.games}</span> games, scored <span className="num">{pct(m.actual)}</span>, expected <span className="num">{pct(m.expected)}</span>
                    </span>
                  </>
                ),
              }))}
            />
          )}
        </aside>
      </div>
    </div>
  )
}

function FindingRow({ f, onDrill, extra }: { f: RankedFinding; onDrill: () => void; extra?: ReactNode }) {
  return (
    <li className="finding">
      <span className="finding-cost">
        <span className="num">{signed(-f.cost, 0)}</span>
        <span className="finding-unit">points</span>
      </span>
      <span className="finding-body">
        <span className="finding-title">{f.title}</span>
        <span className="finding-text">
          You score <span className="num">{pct(f.actual)}</span> where your ratings predicted <span className="num">{pct(f.expected)}</span>, over <span className="num">{f.games.toLocaleString()}</span> games.
          {extra && <> {extra}</>}
        </span>
        <PerfBar actual={f.actual} expected={f.expected} />
      </span>
      <button className="btn btn-quiet finding-games" onClick={onDrill}>
        Games
      </button>
    </li>
  )
}

/** The filter minus its period: the history's games with the same time controls and colours as `games`. */
function inScope(history: GameFacts[], games: GameFacts[]): GameFacts[] {
  const classes = new Set(games.map((x) => x.timeClass))
  const sides = new Set(games.map((x) => x.side))
  return history.filter((g) => classes.has(g.timeClass) && sides.has(g.side))
}

function thin<T>(points: T[], max = 500): T[] {
  if (points.length <= max) return points
  const step = points.length / max
  return Array.from({ length: max }, (_, i) => points[Math.floor(i * step)]).concat(points[points.length - 1])
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function monthName(start: number, long = false): string {
  return new Date(start * 1000).toLocaleDateString(undefined, long ? { month: 'long', year: 'numeric' } : { month: 'short' })
}

function formatDay(t: number): string {
  return new Date(t * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** One line on converting and defending, each figure opening its games. */
function TechniqueLine({ reviewed, games, onDrill }: { reviewed: ReviewedGame[]; games: GameFacts[]; onDrill: (d: Drill) => void }) {
  const c = derived(reviewed, 'conversion', () => conversion(reviewed))
  const byId = new Map(games.map((g) => [g.id, g]))
  const w = c.me.winning
  const l = c.me.losing
  if (!w.games && !l.games) return null
  const open = (title: string, ids: string[]) => onDrill({ title, games: ids.flatMap((id) => byId.get(id) ?? []) })
  const pctOf = (n: number, of: number) => `${Math.round((n / Math.max(1, of)) * 100)}%`
  return (
    <p className="technique-line">
      From the engine reviews: you converted{' '}
      <button className="link-button num" onClick={() => open('Games where you were winning', w.gameIds)}>
        {pctOf(w.won, w.games)}
      </button>{' '}
      of winning positions and saved{' '}
      <button className="link-button num" onClick={() => open('Games where you were losing', l.gameIds)}>
        {pctOf(l.won + l.drawn, l.games)}
      </button>{' '}
      of losing ones. The Results tab has the detail.
    </p>
  )
}
