import { describe, expect, it } from 'vitest'
import type { GameFacts, Outcome } from '../insights/facts'
import { byMonth, comparePeriods, expectedScore, findings, normalQuantile, performance, segments } from './findings'

let n = 0
function game(p: Partial<GameFacts> & { outcome: Outcome }): GameFacts {
  n++
  return {
    id: `g${n}`,
    url: '',
    endTime: 1_700_000_000 + n * 3600,
    startTime: 1_700_000_000 + n * 3600 - 180,
    timeClass: 'blitz',
    rated: true,
    side: 'white',
    how: p.outcome === 'lost' ? 'resigned' : 'win',
    myRating: 1500,
    oppRating: 1500,
    myRatingBefore: 1500,
    oppRatingBefore: 1500,
    opponent: 'opp',
    sans: [],
    opening: null,
    family: null,
    bookPlies: 0,
    castled: null,
    pieceMoves: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    endPhase: 'middlegame',
    clock: null,
    ...p,
  }
}

const many = (count: number, p: Partial<GameFacts> & { outcome: Outcome }) => Array.from({ length: count }, () => game(p))

describe('expectation', () => {
  it('follows the Elo curve', () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5)
    expect(expectedScore(1500, 1900)).toBeCloseTo(0.0909, 3)
  })

  it('judges results against the ratings, not against 50%', () => {
    // Losing every game to someone 400 points stronger costs little.
    const p = performance(many(10, { outcome: 'lost', oppRatingBefore: 1900 }))
    expect(p.actual).toBe(0)
    expect(p.expected).toBeCloseTo(0.0909, 3)
    expect(p.cost).toBeCloseTo(0.909, 2)
  })
})

describe('segments', () => {
  it('marks the game after a loss in the same sitting', () => {
    const lost = game({ outcome: 'lost', startTime: 1_800_000_000, endTime: 1_800_000_000 + 600 })
    const next = game({ outcome: 'won', startTime: 1_800_000_000 + 660, endTime: 1_800_000_000 + 1200 })
    const later = game({ outcome: 'won', startTime: 1_800_000_000 + 7200, endTime: 1_800_000_000 + 7800 })
    const s = segments([lost, next, later]).find((x) => x.id === 'session:after-loss')!
    expect([...s.ids]).toEqual([next.id])
  })
})

describe('findings', () => {
  it('flags a big, real underperformance and ignores noise', () => {
    const french = many(60, { outcome: 'lost', family: 'French Defense' })
    const noise = [...many(10, { outcome: 'won', family: 'Scotch Game' }), ...many(10, { outcome: 'lost', family: 'Scotch Game' })]
    const rest = [...many(100, { outcome: 'won', side: 'black' }), ...many(100, { outcome: 'lost', side: 'black' })]
    const { weaknesses } = findings([...french, ...noise, ...rest])
    expect(weaknesses[0].id).toBe('opening:white:French Defense')
    expect(weaknesses[0].cost).toBeCloseTo(30)
    expect(weaknesses.some((f) => f.title.startsWith('Scotch'))).toBe(false)
  })

  it('corrects the bar for how many groups were tested', () => {
    const { tested, clearZ } = findings([...many(60, { outcome: 'lost', family: 'French Defense' }), ...many(200, { outcome: 'won', side: 'black' })])
    expect(clearZ).toBeCloseTo(normalQuantile(1 - 0.05 / tested / 2))
    expect(normalQuantile(0.975)).toBeCloseTo(1.96, 2)
  })
})

describe('comparePeriods', () => {
  it('splits into the last N days and the N before', () => {
    const now = 2_000_000_000
    const games = [game({ outcome: 'won', endTime: now - 86400 }), game({ outcome: 'lost', endTime: now - 40 * 86400, how: 'timeout' })]
    const { current, previous } = comparePeriods(games, 30, now)
    expect(current.games).toBe(1)
    expect(previous.games).toBe(1)
    expect(previous.lostOnTime).toBe(1)
  })
})

describe('byMonth', () => {
  it('groups by calendar month, oldest first', () => {
    const a = game({ outcome: 'won', endTime: new Date(2026, 8, 30, 12).getTime() / 1000 })
    const b = game({ outcome: 'lost', endTime: new Date(2026, 9, 1, 12).getTime() / 1000 })
    const c = game({ outcome: 'won', endTime: new Date(2026, 9, 5, 12).getTime() / 1000 })
    expect(byMonth([c, a, b]).map((m) => [m.key, m.facts.length])).toEqual([
      ['2026-09', 1],
      ['2026-10', 2],
    ])
  })
})
