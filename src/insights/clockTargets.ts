import type { GameFacts } from './facts'

// Time-management targets from the player's own games: how much clock they
// still had at fixed move numbers in games they won, against games they lost
// on time. Needs no engine, so it covers every game with a clock.

export const CHECKPOINTS = [20, 30, 40] as const

export type ClockCheckpoint = {
  move: (typeof CHECKPOINTS)[number]
  /** Median seconds left on the player's clock after their move `move`, in games they won */
  medianLeftWon: number | null
  wonGames: number
  /** ...and in games they lost on time */
  medianLeftFlagged: number | null
  flaggedGames: number
}

export type ClockTargets = {
  timeClass: string
  /** Starting time of the most common time control in the class, in seconds */
  base: number
  increment: number
  /** Games in the class with clock data */
  games: number
  /** Share of losses that were on time */
  flaggedShareOfLosses: number | null
  checkpoints: ClockCheckpoint[]
}

/**
 * One entry per time class, most-played first. Only the class's most common
 * time control counts, since seconds left mean different things at 1+0 and
 * 3+2. A checkpoint only uses games that lasted that many moves.
 */
export function clockTargets(games: GameFacts[]): ClockTargets[] {
  const byClass = new Map<string, GameFacts[]>()
  for (const g of games) {
    if (!g.clock) continue
    const list = byClass.get(g.timeClass)
    if (list) list.push(g)
    else byClass.set(g.timeClass, [g])
  }
  const out: ClockTargets[] = []
  for (const [timeClass, all] of byClass) {
    const tc = mostCommon(all.map((g) => `${g.clock!.base}+${g.clock!.increment}`))
    const gs = all.filter((g) => `${g.clock!.base}+${g.clock!.increment}` === tc)
    const [base, increment] = tc.split('+').map(Number)
    const losses = gs.filter((g) => g.outcome === 'lost')
    const flagged = losses.filter((g) => g.how === 'timeout')
    const won = gs.filter((g) => g.outcome === 'won')
    out.push({
      timeClass,
      base,
      increment,
      games: gs.length,
      flaggedShareOfLosses: losses.length ? flagged.length / losses.length : null,
      checkpoints: CHECKPOINTS.map((move) => {
        const w = won.map((g) => leftAfter(g, move)).filter((x): x is number => x !== null)
        const f = flagged.map((g) => leftAfter(g, move)).filter((x): x is number => x !== null)
        return { move, medianLeftWon: median(w), wonGames: w.length, medianLeftFlagged: median(f), flaggedGames: f.length }
      }),
    })
  }
  return out.sort((a, b) => b.games - a.games)
}

/** Seconds on the player's clock after their move `move`, rebuilt from time spent per move. */
export function leftAfter(g: GameFacts, move: number): number | null {
  const c = g.clock
  if (!c || c.spent.length < move) return null
  let left = c.base
  for (let i = 0; i < move; i++) left += c.increment - c.spent[i]
  return Math.max(0, Math.round(left * 10) / 10)
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function mostCommon(xs: string[]): string {
  const counts = new Map<string, number>()
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1])[0][0]
}
