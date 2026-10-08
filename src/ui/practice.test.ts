import { describe, expect, it } from 'vitest'
import type { GameSummary } from '../review/summary'
import { practiceOrder, practicePool } from './practice'

// Label letters: b best, i inaccuracy, m mistake, M miss, x blunder.
const summary = (gameId: string, labels: string, firstColor: 'w' | 'b' = 'w'): GameSummary =>
  ({ gameId, labels, firstColor, firstPly: firstColor === 'w' ? 1 : 2, depth: 16 }) as GameSummary

describe('practicePool', () => {
  const games: Record<string, { side: 'white' | 'black'; endTime: number }> = {
    old: { side: 'white', endTime: 100 },
    new: { side: 'black', endTime: 200 },
  }
  const lookup = (id: string) => games[id] ?? null

  it('keeps only your mistakes, blunders and misses', () => {
    // White's moves are at even indexes: x (blunder), m (mistake), i (inaccuracy), M (miss).
    const pool = practicePool([summary('old', 'xbmbibMb')], lookup)
    expect(pool.map((p) => [p.index, p.label])).toEqual([
      [0, 'blunder'],
      [2, 'mistake'],
      [6, 'miss'],
    ])
    expect(pool[1].moveNumber).toBe(2)
  })

  it('reads your colour from the game, not the first mover', () => {
    const pool = practicePool([summary('new', 'bxbm')], lookup)
    expect(pool.map((p) => p.index)).toEqual([1, 3])
  })

  it('puts the newest game first and skips games outside the history', () => {
    const pool = practicePool([summary('old', 'x'), summary('new', 'bx'), summary('gone', 'x')], lookup)
    expect(pool.map((p) => p.gameId)).toEqual(['new', 'old'])
  })

  it('can be limited to some games', () => {
    const pool = practicePool([summary('old', 'x'), summary('new', 'bx')], lookup, new Set(['old']))
    expect(pool.map((p) => p.gameId)).toEqual(['old'])
  })
})

describe('practiceOrder', () => {
  it('puts unsolved puzzles first', () => {
    const pool = practicePool([summary('old', 'xbxbx')], () => ({ side: 'white', endTime: 1 }))
    const order = practiceOrder(pool, new Set(['old:0']))
    expect(order.map((p) => p.id)).toEqual(['old:2', 'old:4', 'old:0'])
  })
})
