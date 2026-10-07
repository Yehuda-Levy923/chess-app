import type { GameFacts, Outcome, Phase, PieceType, Side } from './facts'

export type Record3 = { games: number; won: number; drawn: number; lost: number }

export const emptyRecord = (): Record3 => ({ games: 0, won: 0, drawn: 0, lost: 0 })

export function add(r: Record3, o: Outcome): Record3 {
  r.games++
  r[o]++
  return r
}

/** Points per game, 0..1: a win is 1, a draw 0.5. */
export function score(r: Record3): number {
  return r.games === 0 ? 0 : (r.won + r.drawn / 2) / r.games
}

export type Filter = { timeClass: string | 'all'; side: Side | 'both'; since: number | null }

export function applyFilter(games: GameFacts[], f: Filter): GameFacts[] {
  return games.filter(
    (g) => (f.timeClass === 'all' || g.timeClass === f.timeClass) && (f.side === 'both' || g.side === f.side) && (f.since === null || g.endTime >= f.since),
  )
}

function tally<K extends string>(games: GameFacts[], key: (g: GameFacts) => K | null): Map<K, Record3> {
  const out = new Map<K, Record3>()
  for (const g of games) {
    const k = key(g)
    if (k === null) continue
    add(out.get(k) ?? out.set(k, emptyRecord()).get(k)!, g.outcome)
  }
  return out
}

export function overall(games: GameFacts[]): Record3 {
  const r = emptyRecord()
  for (const g of games) add(r, g.outcome)
  return r
}

/** Rating after each game, oldest first, for one time class. */
export function ratingSeries(games: GameFacts[], timeClass: string): { t: number; rating: number }[] {
  return games
    .filter((g) => g.timeClass === timeClass && g.rated)
    .map((g) => ({ t: g.endTime, rating: g.myRating }))
    .sort((a, b) => a.t - b.t)
}

// Matchmaking keeps most opponents close: for one bullet-heavy player 90% of
// games were within -36..+78, so wide buckets would put nearly everything in one.
export const RATING_GAP_BUCKETS = [
  { label: '100+ lower', lo: -Infinity, hi: -100 },
  { label: '50–100 lower', lo: -100, hi: -50 },
  { label: '20–50 lower', lo: -50, hi: -20 },
  { label: 'within 20', lo: -20, hi: 20 },
  { label: '20–50 higher', lo: 20, hi: 50 },
  { label: '50–100 higher', lo: 50, hi: 100 },
  { label: '100+ higher', lo: 100, hi: Infinity },
] as const

/** Results grouped by how much stronger the opponent was. */
export function byRatingGap(games: GameFacts[]): { label: string; record: Record3 }[] {
  return RATING_GAP_BUCKETS.map((b) => {
    const r = emptyRecord()
    for (const g of games) {
      const gap = g.oppRatingBefore - g.myRatingBefore
      if (gap >= b.lo && gap < b.hi) add(r, g.outcome)
    }
    return { label: b.label, record: r }
  })
}

/** How the games were decided, separately for wins, draws and losses, most common first. */
export function howGamesEnd(games: GameFacts[]): Record<Outcome, { how: string; count: number }[]> {
  const out: Record<Outcome, Map<string, number>> = { won: new Map(), drawn: new Map(), lost: new Map() }
  for (const g of games) out[g.outcome].set(g.how, (out[g.outcome].get(g.how) ?? 0) + 1)
  const sorted = (m: Map<string, number>) => [...m].map(([how, count]) => ({ how, count })).sort((a, b) => b.count - a.count)
  return { won: sorted(out.won), drawn: sorted(out.drawn), lost: sorted(out.lost) }
}

export function byPhase(games: GameFacts[]): Map<Phase, Record3> {
  return tally(games, (g) => g.endPhase)
}

export type OpeningRow = { family: string; record: Record3; avgBookMoves: number }

/** Most played opening families for one side, with results and how long the player stayed in book. */
export function openings(games: GameFacts[], side: Side, limit = 10): OpeningRow[] {
  const mine = games.filter((g) => g.side === side && g.family)
  const records = tally(mine, (g) => g.family)
  const book = new Map<string, number>()
  for (const g of mine) book.set(g.family!, (book.get(g.family!) ?? 0) + g.bookPlies)
  return [...records]
    .map(([family, record]) => ({ family, record, avgBookMoves: book.get(family)! / record.games / 2 }))
    .sort((a, b) => b.record.games - a.record.games)
    .slice(0, limit)
}

export function castling(games: GameFacts[]): { short: Record3; long: Record3; none: Record3; avgMove: number | null } {
  const short = emptyRecord()
  const long = emptyRecord()
  const none = emptyRecord()
  let moves = 0
  for (const g of games) {
    if (!g.castled) add(none, g.outcome)
    else {
      add(g.castled.side === 'short' ? short : long, g.outcome)
      moves += g.castled.move
    }
  }
  const castledGames = short.games + long.games
  return { short, long, none, avgMove: castledGames ? moves / castledGames : null }
}

/** Share of the player's moves made with each piece type. */
export function pieceShare(games: GameFacts[]): Record<PieceType, number> {
  const totals: Record<PieceType, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 }
  for (const g of games) for (const p of Object.keys(totals) as PieceType[]) totals[p] += g.pieceMoves[p]
  const all = Object.values(totals).reduce((s, v) => s + v, 0)
  for (const p of Object.keys(totals) as PieceType[]) totals[p] = all ? totals[p] / all : 0
  return totals
}

/** Results by local weekday (0 = Sunday) and by local hour. */
export function calendar(games: GameFacts[]): { weekday: Record3[]; hour: Record3[] } {
  const weekday = Array.from({ length: 7 }, emptyRecord)
  const hour = Array.from({ length: 24 }, emptyRecord)
  for (const g of games) {
    const d = new Date(g.endTime * 1000)
    add(weekday[d.getDay()], g.outcome)
    add(hour[d.getHours()], g.outcome)
  }
  return { weekday, hour }
}

export type ClockSummary = {
  games: number
  /** Losses on time as a share of all losses */
  timeoutShareOfLosses: number
  /** Games where the clock dropped under 10% of the starting time */
  lowTimeGames: number
  lowTimeScore: number
  /** Average share of the starting time used per move, by move number band */
  spentByMove: { label: string; share: number | null }[]
}

const MOVE_BANDS = [
  { label: '1–10', lo: 0, hi: 10 },
  { label: '11–20', lo: 10, hi: 20 },
  { label: '21–30', lo: 20, hi: 30 },
  { label: '31–40', lo: 30, hi: 40 },
  { label: '41+', lo: 40, hi: Infinity },
]

/** Clock use for one time class, so bullet and rapid aren't averaged together. */
export function clockUse(games: GameFacts[]): ClockSummary {
  const timed = games.filter((g) => g.clock && g.clock.base > 0)
  const losses = timed.filter((g) => g.outcome === 'lost')
  const low = timed.filter((g) => (g.clock!.lowest ?? 1) < 0.1)
  const lowRecord = emptyRecord()
  for (const g of low) add(lowRecord, g.outcome)
  return {
    games: timed.length,
    timeoutShareOfLosses: losses.length ? losses.filter((g) => g.how === 'timeout').length / losses.length : 0,
    lowTimeGames: low.length,
    lowTimeScore: score(lowRecord),
    spentByMove: MOVE_BANDS.map((b) => {
      let sum = 0
      let n = 0
      for (const g of timed) {
        g.clock!.spent.slice(b.lo, b.hi).forEach((s) => {
          sum += s / g.clock!.base
          n++
        })
      }
      return { label: b.label, share: n ? sum / n : null }
    }),
  }
}
