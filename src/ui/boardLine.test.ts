import { describe, expect, it } from 'vitest'
import { emptyLine, fenAt, isPromotion, moveLabel, outcome, parseInput, play, playUci, START_FEN, toPgn } from './boardLine'

const after = (...uci: string[]) => uci.reduce((l, m) => playUci(l, m)!, emptyLine())

describe('play', () => {
  it('replaces what came after the cursor with a different move', () => {
    const line = after('e2e4', 'e7e5', 'g1f3')
    const back = { ...line, ply: 1 }
    const next = play(back, { from: 'c7', to: 'c5' })!
    expect(next.moves.map((m) => m.san)).toEqual(['e4', 'c5'])
    expect(next.ply).toBe(2)
  })

  it('steps forward when the move played is the one already next', () => {
    const line = { ...after('e2e4', 'e7e5'), ply: 1 }
    const next = play(line, { from: 'e7', to: 'e5' })!
    expect(next.moves).toHaveLength(2)
    expect(next.ply).toBe(2)
  })

  it('refuses an illegal move', () => {
    expect(play(emptyLine(), { from: 'e2', to: 'e5' })).toBeNull()
  })
})

describe('parseInput', () => {
  it('reads a FEN as a start position', () => {
    const fen = '8/8/8/4k3/8/8/4P3/4K3 w - - 0 1'
    const r = parseInput(fen)
    expect('line' in r && fenAt(r.line)).toBe(fen)
  })

  it('reads a PGN and keeps every move', () => {
    const r = parseInput('[Event "x"]\n\n1. e4 e5 2. Nf3 Nc6 *')
    expect('line' in r && r.line.moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6'])
  })

  it('says why text it cannot read was refused', () => {
    expect(parseInput('hello there')).toHaveProperty('error')
    expect(parseInput('8/8/8/8 w - - 0 1')).toHaveProperty('error')
  })
})

describe('toPgn', () => {
  it('round-trips through parseInput', () => {
    const line = after('d2d4', 'g8f6', 'c2c4')
    const r = parseInput(toPgn(line))
    expect('line' in r && r.line.moves.map((m) => m.uci)).toEqual(['d2d4', 'g8f6', 'c2c4'])
  })
})

describe('outcome', () => {
  it('names the winner of a checkmate', () => {
    const line = after('f2f3', 'e7e5', 'g2g4', 'd8h4')
    expect(outcome(fenAt(line))).toEqual({ winner: 'black', reason: 'checkmate' })
  })

  it('is null while the game goes on', () => {
    expect(outcome(START_FEN)).toBeNull()
  })

  it('counts a threefold repetition from the positions played', () => {
    const line = after('g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8')
    const history = [line.start, ...line.moves.map((m) => m.fen)]
    expect(outcome(fenAt(line), history)?.reason).toBe('repetition')
  })
})

describe('isPromotion', () => {
  it('spots a pawn reaching the last rank', () => {
    expect(isPromotion('8/4P3/8/8/8/8/8/k6K w - - 0 1', 'e7', 'e8')).toBe(true)
    expect(isPromotion(START_FEN, 'e2', 'e4')).toBe(false)
  })
})

describe('moveLabel', () => {
  it('numbers a line that starts with black to move', () => {
    expect(moveLabel('8/8/8/8/8/8/8/k6K b - - 0 12', 0)).toEqual({ no: 12, white: false })
    expect(moveLabel('8/8/8/8/8/8/8/k6K b - - 0 12', 1)).toEqual({ no: 13, white: true })
  })
})
