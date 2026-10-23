import { describe, expect, it } from 'vitest'
import { decodeIds, encodeIds, fitting, MAX_ENCODED, numericId } from './gameIds'

describe('game ids for the review workflow', () => {
  it('reads the numeric id from live and daily game URLs', () => {
    expect(numericId('https://www.chess.com/game/live/145203984411')).toBe(145203984411)
    expect(numericId('https://www.chess.com/game/daily/812345678')).toBe(812345678)
    expect(numericId('https://www.chess.com/game/live/145203984411?tab=review')).toBe(145203984411)
    expect(numericId('https://www.chess.com/home')).toBeNull()
  })

  it('round-trips, sorted and without repeats', () => {
    const ids = [145203984411, 99, 145203984411, 145203990000, 7]
    expect(decodeIds(encodeIds(ids))).toEqual([7, 99, 145203984411, 145203990000])
    expect(decodeIds('')).toEqual([])
  })

  it('fits thousands of games in one workflow input, newest first when there are too many', () => {
    // Live games a couple of million ids apart, newest first.
    const ids = Array.from({ length: 12_000 }, (_, i) => 150_000_000_000 - i * 2_500_000 - (i % 7))
    expect(encodeIds(ids.slice(0, 8_000)).length).toBeLessThan(MAX_ENCODED)
    const sent = fitting(ids)
    expect(sent.length).toBeGreaterThan(8_000)
    expect(sent.length).toBeLessThan(12_000)
    expect(sent[0]).toBe(ids[0])
    expect(encodeIds(sent).length).toBeLessThanOrEqual(MAX_ENCODED)
  })
})
