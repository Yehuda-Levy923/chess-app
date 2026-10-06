import { describe, expect, it } from 'vitest'
import { captures, checkedKing, clocksFromPgn, formatClock, timeSpent } from './gameInfo'

const PGN = '1. e4 {[%clk 0:02:59.9]} 1... e5 {[%clk 0:02:58.1]} 2. Nf3 {[%clk 0:02:50.2]} 2... Nc6 {[%clk 0:02:30]} *'

describe('clocks', () => {
  it('reads one clock per ply', () => {
    expect(clocksFromPgn(PGN)).toEqual([179.9, 178.1, 170.2, 150])
  })

  it('adds the increment back when timing a move', () => {
    const clocks = clocksFromPgn(PGN)
    expect(timeSpent(clocks, 1, '180+2')).toBeCloseTo(2.1)
    expect(timeSpent(clocks, 3, '180+2')).toBeCloseTo(11.7)
    expect(timeSpent(clocks, 4, '180')).toBeCloseTo(28.1)
  })

  it('has no timing for daily games', () => {
    expect(timeSpent(clocksFromPgn(PGN), 2, '1/86400')).toBeNull()
  })

  it('formats like a chess clock', () => {
    expect(formatClock(179.9)).toBe('2:59')
    expect(formatClock(9.44)).toBe('0:09.4')
    expect(formatClock(3720)).toBe('1:02:00')
  })
})

describe('captures', () => {
  it('lists taken pieces and the material lead', () => {
    // White has taken a knight, Black a pawn.
    const c = captures('r1bqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PP1/RNBQKBNR w KQkq - 0 4')
    expect(c.byWhite).toEqual(['n'])
    expect(c.byBlack).toEqual(['p'])
    expect(c.lead).toBe(2)
  })

  it('finds the king in check', () => {
    expect(checkedKing('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3')).toBe('e1')
    expect(checkedKing('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBeNull()
  })
})
