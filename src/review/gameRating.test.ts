import { describe, expect, it } from 'vitest'
import { estimateRating } from './gameRating'

describe('estimateRating', () => {
  it('keeps the rating when accuracy is typical for it, and moves it symmetrically with the gap', () => {
    const typicalAcc = estimateRating(0, 'bullet', 1800)!.expectedAccuracy!
    expect(estimateRating(typicalAcc, 'bullet', 1800)!.blended).toBe(1800)
    const up = estimateRating(typicalAcc + 10, 'bullet', 1800)!.blended! - 1800
    const down = 1800 - estimateRating(typicalAcc - 10, 'bullet', 1800)!.blended!
    expect(up).toBeGreaterThan(0)
    expect(Math.abs(up - down)).toBeLessThanOrEqual(10)
  })

  it('gives an accuracy-only figure with a range that contains it', () => {
    const e = estimateRating(80, 'blitz', null)!
    expect(e.blended).toBeNull()
    expect(e.low).toBeLessThan(e.accuracyOnly)
    expect(e.high).toBeGreaterThan(e.accuracyOnly)
  })

  it('never goes down as accuracy goes up', () => {
    let prev = 0
    for (let a = 20; a <= 100; a += 2.5) {
      const r = estimateRating(a, 'rapid', null)!.accuracyOnly
      expect(r).toBeGreaterThanOrEqual(prev)
      prev = r
    }
  })

  it('has no model for daily games', () => {
    expect(estimateRating(80, 'daily', 1500)).toBeNull()
  })
})
