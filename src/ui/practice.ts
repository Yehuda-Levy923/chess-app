import type { Side } from '../insights/facts'
import { colorAt, labelAt, moveNumberAt, type GameSummary } from '../review/summary'
import type { Label } from '../review/types'

// Practice positions: every move in a reviewed game where you made a mistake,
// blunder or miss. The summary says where they are; the full review (loaded
// one at a time) holds the position and the engine's move.

export type Puzzle = {
  /** `${gameId}:${index}` */
  id: string
  gameId: string
  /** Index into the review's moves, and into the summary's per-ply arrays */
  index: number
  depth: number
  /** Where to open the review: just after the move */
  ply: number
  label: Label
  moveNumber: number
  side: Side
  endTime: number
}

export const PRACTICE_LABELS: Label[] = ['mistake', 'blunder', 'miss']

/**
 * Newest games first, in move order within a game. `game` says which colour
 * you played in a game, or null for a game that isn't in your history.
 */
export function practicePool(
  summaries: GameSummary[],
  game: (gameId: string) => { side: Side; endTime: number } | null,
  only?: Set<string>,
): Puzzle[] {
  const out: Puzzle[] = []
  for (const s of summaries) {
    if (only && !only.has(s.gameId)) continue
    const g = game(s.gameId)
    if (!g) continue
    const mine = g.side === 'white' ? 'w' : 'b'
    for (let i = 0; i < s.labels.length; i++) {
      if (colorAt(s, i) !== mine) continue
      const label = labelAt(s, i)
      if (!PRACTICE_LABELS.includes(label)) continue
      out.push({ id: `${s.gameId}:${i}`, gameId: s.gameId, index: i, depth: s.depth, ply: s.firstPly + i, label, moveNumber: moveNumberAt(s, i), side: g.side, endTime: g.endTime })
    }
  }
  return out.sort((a, b) => b.endTime - a.endTime || a.index - b.index)
}

/** Puzzles solved before, kept so practice starts with ones you haven't done. */
const SOLVED_KEY = 'practiceSolved'
const SOLVED_MAX = 5000

export function loadSolved(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SOLVED_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

export function saveSolved(solved: Set<string>) {
  try {
    localStorage.setItem(SOLVED_KEY, JSON.stringify([...solved].slice(-SOLVED_MAX)))
  } catch {
    // ignore
  }
}

/** Unsolved first, keeping the pool's order within each group. */
export function practiceOrder(pool: Puzzle[], solved: Set<string>): Puzzle[] {
  return [...pool.filter((p) => !solved.has(p.id)), ...pool.filter((p) => solved.has(p.id))]
}
