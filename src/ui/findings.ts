import { SESSION_GAP_SECONDS } from '../insights/engineStats'
import type { GameFacts, Outcome } from '../insights/facts'

// "What's costing you points": every group of games is judged against what the
// ratings involved predicted, so losing to stronger players doesn't read as a
// weakness. A finding is kept only when the gap is unlikely to be luck.

/** Elo expected score for the player against the opponent. */
export function expectedScore(me: number, opp: number): number {
  return 1 / (1 + 10 ** ((opp - me) / 400))
}

const POINTS: Record<Outcome, number> = { won: 1, drawn: 0.5, lost: 0 }

export type Performance = {
  games: number
  /** Average result, 0..1 */
  actual: number
  /** Average Elo-expected result, 0..1 */
  expected: number
  /** Game points lost against expectation; negative means gained */
  cost: number
  /** How many standard errors the result sits from expectation; negative is worse */
  z: number
}

export function performance(games: GameFacts[]): Performance {
  let actual = 0
  let expected = 0
  let variance = 0
  for (const g of games) {
    const e = expectedScore(g.myRatingBefore, g.oppRatingBefore)
    actual += POINTS[g.outcome]
    expected += e
    variance += e * (1 - e)
  }
  const n = games.length
  return {
    games: n,
    actual: n ? actual / n : 0,
    expected: n ? expected / n : 0,
    cost: expected - actual,
    z: variance > 0 ? (actual - expected) / Math.sqrt(variance) : 0,
  }
}

export type FindingKind = 'opening' | 'session' | 'clock' | 'castling' | 'time' | 'colour' | 'hour' | 'opponent'

export type Finding = Performance & {
  id: string
  kind: FindingKind
  /** Short name of the group, e.g. "French Defense as White" */
  title: string
  ids: Set<string>
}

/**
 * The groups worth checking. Each is a set of game ids, so the screen can list
 * the exact games behind any finding.
 */
export function segments(games: GameFacts[], history: GameFacts[] = games): Omit<Finding, keyof Performance>[] {
  const out: Omit<Finding, keyof Performance>[] = []
  const add = (id: string, kind: FindingKind, title: string, pick: (g: GameFacts) => boolean) =>
    out.push({ id, kind, title, ids: new Set(games.filter(pick).map((g) => g.id)) })

  // Openings, per colour.
  const families = new Set(games.map((g) => g.family).filter((f): f is string => !!f))
  for (const family of families) {
    for (const side of ['white', 'black'] as const) {
      add(`opening:${side}:${family}`, 'opening', `${family} as ${side === 'white' ? 'White' : 'Black'}`, (g) => g.family === family && g.side === side)
    }
  }

  // Sittings: the game straight after a loss, and long sittings.
  // Same sitting: the game started within SESSION_GAP_SECONDS of the previous one
  // ending. Sittings come from the whole history, so a filter on time control
  // doesn't hide the blitz loss just before a bullet game.
  const sorted = [...history].sort((a, b) => a.startTime - b.startTime)
  const afterLoss = new Set<string>()
  const late = new Set<string>()
  let inSession = 0
  sorted.forEach((g, i) => {
    const prev = sorted[i - 1]
    const same = prev && g.startTime - prev.endTime <= SESSION_GAP_SECONDS
    inSession = same ? inSession + 1 : 1
    if (same && prev.outcome === 'lost') afterLoss.add(g.id)
    if (inSession > 10) late.add(g.id)
  })
  add('session:after-loss', 'session', 'The next game after a loss', (g) => afterLoss.has(g.id))
  add('session:long', 'session', 'Game 11 onwards in one sitting', (g) => late.has(g.id))

  // Under 5%, not 10%: in real histories the 5–10% band often scores well and
  // the scramble below 5% badly, and lumping them hides both.
  add('clock:scramble', 'clock', 'Games where your clock fell under 5%', (g) => (g.clock?.lowest ?? 1) < 0.05)

  // Only games that got past move 20: a game lost by move 12 never castled
  // because it ended, not because castling was skipped.
  const long = (g: GameFacts) => g.sans.length >= 40
  add('castling:none', 'castling', "Games past move 20 where you never castled", (g) => long(g) && !g.castled)
  add('castling:long', 'castling', 'Games past move 20 where you castled long', (g) => long(g) && g.castled?.side === 'long')

  const classes = new Set(games.map((g) => g.timeClass))
  if (classes.size > 1) {
    for (const tc of classes) add(`time:${tc}`, 'time', `${tc[0].toUpperCase()}${tc.slice(1)} games`, (g) => g.timeClass === tc)
  }

  add('colour:white', 'colour', 'Games as White', (g) => g.side === 'white')
  add('colour:black', 'colour', 'Games as Black', (g) => g.side === 'black')

  add('hour:night', 'hour', 'Games between midnight and 6am', (g) => new Date(g.endTime * 1000).getHours() < 6)
  add('opponent:stronger', 'opponent', 'Opponents rated 100+ above you', (g) => g.oppRatingBefore - g.myRatingBefore >= 100)
  add('opponent:weaker', 'opponent', 'Opponents rated 100+ below you', (g) => g.myRatingBefore - g.oppRatingBefore >= 100)

  return out
}

export type Confidence = 'clear' | 'possible'

export type RankedFinding = Finding & { confidence: Confidence }

export type FindingOptions = { minGames?: number; limit?: number; perKind?: number }

/**
 * Groups whose results differ from expectation. Dozens of groups are tested at
 * once, so a few will look unusual by chance alone: a finding is "clear" only
 * past a cut-off corrected for the number of tests (Bonferroni, 5% overall),
 * and "possible" from z = 2 up to that. Worst first for weaknesses, best first
 * for strengths, and at most `perKind` from one kind so five French sub-lines
 * can't crowd out everything else.
 */
export function findings(
  games: GameFacts[],
  opts: FindingOptions = {},
  history: GameFacts[] = games,
): { weaknesses: RankedFinding[]; strengths: RankedFinding[]; tested: number; clearZ: number } {
  const { minGames = 25, limit = 5, perKind = 2 } = opts
  const byId = new Map(games.map((g) => [g.id, g]))
  const tested: Finding[] = segments(games, history)
    .filter((s) => s.ids.size >= minGames && s.ids.size < games.length)
    .map((s) => ({ ...s, ...performance([...s.ids].map((id) => byId.get(id)!)) }))
  const clearZ = Math.max(2, normalQuantile(1 - 0.05 / Math.max(1, tested.length) / 2))
  const ranked: RankedFinding[] = tested
    .filter((f) => Math.abs(f.z) >= 2)
    .map((f) => ({ ...f, confidence: Math.abs(f.z) >= clearZ ? 'clear' : 'possible' }))

  // Clear ones first, then by size.
  const order = (a: RankedFinding, b: RankedFinding, dir: 1 | -1) =>
    (a.confidence === b.confidence ? 0 : a.confidence === 'clear' ? -1 : 1) || dir * (b.cost - a.cost)

  const pick = (list: RankedFinding[], n: number) => {
    const kinds = new Map<FindingKind, number>()
    const out: RankedFinding[] = []
    for (const f of list) {
      const k = kinds.get(f.kind) ?? 0
      if (k >= perKind) continue
      kinds.set(f.kind, k + 1)
      out.push(f)
      if (out.length === n) break
    }
    return out
  }

  return {
    weaknesses: pick(ranked.filter((f) => f.cost > 0).sort((a, b) => order(a, b, 1)), limit),
    strengths: pick(ranked.filter((f) => f.cost < 0).sort((a, b) => order(a, b, -1)), 3),
    tested: tested.length,
    clearZ,
  }
}

/** Inverse of the standard normal CDF (Acklam's rational approximation, relative error under 1.2e-9). */
export function normalQuantile(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239]
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572]
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416]
  const lo = 0.02425
  if (p <= 0) return -Infinity
  if (p >= 1) return Infinity
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p > 1 - lo) return -normalQuantile(1 - p)
  const q = p - 0.5
  const r = q * q
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
}

export type PeriodStats = Performance & { lostOnTime: number; losses: number }

/** The last `days` days against the `days` before them. */
export function comparePeriods(games: GameFacts[], days: number, now = Date.now() / 1000): { current: PeriodStats; previous: PeriodStats } {
  const span = days * 86400
  const stats = (from: number, to: number): PeriodStats => {
    const g = games.filter((x) => x.endTime > from && x.endTime <= to)
    const losses = g.filter((x) => x.outcome === 'lost')
    return { ...performance(g), losses: losses.length, lostOnTime: losses.filter((x) => x.how === 'timeout').length }
  }
  return { current: stats(now - span, now), previous: stats(now - 2 * span, now - span) }
}

export type Month = { key: string; start: number; facts: GameFacts[] } & Performance

/** Games grouped by calendar month (local time), oldest first, with each month's result against expectation. */
export function byMonth(games: GameFacts[]): Month[] {
  const groups = new Map<string, GameFacts[]>()
  for (const g of games) {
    const d = new Date(g.endTime * 1000)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const list = groups.get(key) ?? []
    list.push(g)
    groups.set(key, list)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, list]) => {
      const [y, m] = key.split('-').map(Number)
      return { key, start: new Date(y, m - 1, 1).getTime() / 1000, facts: list, ...performance(list) }
    })
}
