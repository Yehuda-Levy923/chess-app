import { describe, expect, it } from 'vitest'
import { gameAccuracy, moveAccuracy, winPercent, winPercentFor } from './accuracy'

describe('winPercent', () => {
  it('is 50 for a level position', () => {
    expect(winPercent({ kind: 'cp', cp: 0 })).toBe(50)
  })

  it('caps centipawns at 1000 and treats mate as the cap', () => {
    const cap = winPercent({ kind: 'cp', cp: 1000 })
    expect(cap).toBeCloseTo(97.54, 1)
    expect(winPercent({ kind: 'cp', cp: 2500 })).toBe(cap)
    expect(winPercent({ kind: 'mate', mate: 3 })).toBe(cap)
    expect(winPercent({ kind: 'mate', mate: -3 })).toBeCloseTo(100 - cap, 10)
  })

  it('reads finished games as certain', () => {
    expect(winPercent({ kind: 'over', result: '1-0' })).toBe(100)
    expect(winPercent({ kind: 'over', result: '0-1' })).toBe(0)
    expect(winPercent({ kind: 'over', result: '1/2-1/2' })).toBe(50)
  })

  it('flips for Black', () => {
    expect(winPercentFor({ kind: 'cp', cp: 200 }, 'b')).toBeCloseTo(100 - winPercent({ kind: 'cp', cp: 200 }), 10)
  })
})

describe('moveAccuracy', () => {
  it('is 100 when the position does not get worse', () => {
    expect(moveAccuracy(50, 50)).toBe(100)
    expect(moveAccuracy(50, 70)).toBe(100)
  })

  it('matches the Lichess curve', () => {
    // 103.1668 * e^(-0.043544 * 10) - 3.1669 + 1
    expect(moveAccuracy(60, 50)).toBeCloseTo(64.58, 0)
  })

  it('never goes below 0', () => {
    expect(moveAccuracy(100, 0)).toBe(0)
  })
})

describe('gameAccuracy', () => {
  it('is 100 for both sides when nothing changes', () => {
    const { w, b } = gameAccuracy(Array(21).fill(50))
    expect(w).toBeCloseTo(100, 6)
    expect(b).toBeCloseTo(100, 6)
  })

  it('punishes the side that blunders', () => {
    // White throws away a winning position on ply 7.
    const series = [50, 52, 51, 55, 54, 60, 59, 20, 21, 20, 22]
    const { w, b } = gameAccuracy(series)
    expect(w).toBeLessThan(b)
    expect(b).toBeGreaterThan(90)
  })

  it('handles games shorter than a window', () => {
    const { w, b } = gameAccuracy([50, 50])
    expect(w).toBeCloseTo(100, 6)
    expect(b).toBe(0)
  })
})
