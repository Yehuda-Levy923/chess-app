import { useState } from 'react'
import type { GameFacts } from '../insights/facts'
import { performance } from './findings'
import { derived } from './derived'
import type { Drill } from './GamesDrawer'
import { PerfRows } from './PerfRows'

type Props = { games: GameFacts[]; onDrill: (d: Drill) => void }

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

/** When you play: a year of days, the weekdays, and the time of day, each against expectation. */
export function InsightsActivity({ games, onDrill }: Props) {
  const { byWeekday, byHourBand, byDay } = derived(games, 'activity', () => groupByTime(games))
  return (
    <div className="activity">
      <h2>The last twelve months</h2>
      <Calendar byDay={byDay} onDrill={onDrill} />

      <div className="insights-grid">
        <div className="insights-col">
          <h2>By weekday</h2>
          <PerfRows
            onDrill={onDrill}
            drillTitle={(g) => `Games on ${g.label}s`}
            groups={[1, 2, 3, 4, 5, 6, 0].map((d) => ({ key: String(d), label: WEEKDAYS[d], facts: byWeekday[d] }))}
          />
        </div>
        <div className="insights-col">
          <h2>By time of day</h2>
          <PerfRows
            onDrill={onDrill}
            groups={HOUR_BANDS.map((b, i) => ({ key: String(i), label: b, facts: byHourBand[i] }))}
          />
          <p className="dim note">Hours are in this computer's time zone.</p>
        </div>
      </div>
    </div>
  )
}

const HOUR_BANDS = ['Night, 0–6', 'Morning, 6–12', 'Afternoon, 12–18', 'Evening, 18–24']

/** One pass over the games: by weekday, by quarter of the day, and by calendar day. */
function groupByTime(games: GameFacts[]) {
  const byWeekday: GameFacts[][] = Array.from({ length: 7 }, () => [])
  const byHourBand: GameFacts[][] = Array.from({ length: 4 }, () => [])
  const byDay = new Map<string, GameFacts[]>()
  for (const g of games) {
    const d = new Date(g.endTime * 1000)
    byWeekday[d.getDay()].push(g)
    byHourBand[Math.floor(d.getHours() / 6)].push(g)
    const k = dayKey(d)
    const list = byDay.get(k) ?? []
    list.push(g)
    byDay.set(k, list)
  }
  return { byWeekday, byHourBand, byDay }
}

/** A year of days as a grid, darker for more games. Hover for the day, click for its games. */
function Calendar({ byDay, onDrill }: { byDay: Map<string, GameFacts[]>; onDrill: (d: Drill) => void }) {
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null)

  // 53 columns of weeks ending with this one, Sunday at the top.
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(today)
  start.setDate(today.getDate() - (52 * 7 + today.getDay()))
  const days: { date: Date; games: GameFacts[] }[] = []
  // Step by calendar day, not by 24 hours: on the night the clocks go back a
  // day is 25 hours long, and fixed steps would land on the same date twice.
  for (const d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const date = new Date(d)
    days.push({ date, games: byDay.get(dayKey(date)) ?? [] })
  }

  // Shades by quartile of the days that had games, so one marathon day doesn't wash out the rest.
  const counts = days.map((d) => d.games.length).filter((n) => n > 0).sort((a, b) => a - b)
  const q = (p: number) => counts[Math.min(counts.length - 1, Math.floor(p * counts.length))] ?? 1
  const levels = [q(0.25), q(0.5), q(0.75)]
  const level = (n: number) => (n === 0 ? 0 : n <= levels[0] ? 1 : n <= levels[1] ? 2 : n <= levels[2] ? 3 : 4)

  const months: { col: number; label: string }[] = []
  days.forEach((d, i) => {
    if (d.date.getDate() === 1) months.push({ col: Math.floor(i / 7), label: d.date.toLocaleDateString(undefined, { month: 'short' }) })
  })

  const shown = hover ? days.find((d) => dayKey(d.date) === hover.key) : null
  const perf = shown && shown.games.length ? performance(shown.games) : null
  const active = days.filter((d) => d.games.length).length

  return (
    <div className="calendar">
      <div className="calendar-months" aria-hidden>
        {months.map((m) => (
          <span key={m.col} style={{ gridColumn: m.col + 1 }}>
            {m.label}
          </span>
        ))}
      </div>
      <div className="calendar-grid" onPointerLeave={() => setHover(null)}>
        {days.map((d, i) => {
          const n = d.games.length
          const key = dayKey(d.date)
          return (
            <button
              key={key}
              className={`calendar-day l${level(n)}`}
              style={{ gridColumn: Math.floor(i / 7) + 1, gridRow: d.date.getDay() + 1 }}
              disabled={n === 0}
              aria-label={`${d.date.toDateString()}: ${n} games`}
              onPointerEnter={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                const p = e.currentTarget.parentElement!.getBoundingClientRect()
                setHover({ key, x: r.left - p.left + r.width / 2, y: r.top - p.top })
              }}
              onClick={() => onDrill({ title: d.date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), games: d.games })}
            />
          )
        })}
        {shown && hover && (
          <div className="chart-tip calendar-tip" style={{ left: hover.x, top: hover.y }}>
            <strong>{shown.date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</strong>{' '}
            {perf ? (
              <>
                <span className="num">{shown.games.length}</span> games, scored <span className="num">{(perf.actual * 100).toFixed(0)}%</span>
              </>
            ) : (
              <span className="dim">no games</span>
            )}
          </div>
        )}
      </div>
      <p className="calendar-foot dim">
        Played on <span className="num">{active}</span> of the last <span className="num">{days.length}</span> days. The stronger the colour, the more games that day.
      </p>
    </div>
  )
}
