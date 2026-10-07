import { describe, expect, it } from 'vitest'
import { buildBook } from '../openings/book'
import { buildReview, classifyPlayedMove, movesFromPgn, terminalScore } from './buildReview'
import { gradeLabel, phaseGrades, phaseStarts } from './phases'
import { clockInput } from './reviewGame'
import type { PositionAnalysis, Score } from './types'

const book = buildBook(['eco\tname\tpgn\nC20\tKing\'s Pawn Game\t1. e4 e5'])
const cp = (n: number): Score => ({ kind: 'cp', cp: n })
const flat = (fens: string[]): PositionAnalysis[] =>
  fens.map((fen) => {
    const over = terminalScore(fen)
    return { fen, depth: 16, lines: [{ score: over ?? cp(20), pv: over ? [] : ['a2a3', 'a7a6', 'b2b3'] }] }
  })

// Trades down to a rook ending: queens, then minors, come off.
const pgn = `[TimeControl "180+2"]

1. e4 {[%clk 0:03:01]} 1... e5 {[%clk 0:03:00]} 2. Nf3 {[%clk 0:02:59]} 2... Nc6 {[%clk 0:02:58]} 3. d4 exd4 4. Nxd4 Nxd4 5. Qxd4 Qf6 6. Qxf6 Nxf6 7. Bd3 d5 8. exd5 Nxd5 9. Bc4 Be6 10. Bxd5 Bxd5 11. Nc3 Bc6 12. Be3 Bd6 13. Bd4 Bf4 14. Rd1 O-O 15. O-O Rfe8 16. Rfe1 Rxe1+ 17. Rxe1 Re8 18. Rxe8+ Bxe8 19. Nd5 Bd6 20. Nf6+ gxf6 *`

describe('phaseStarts', () => {
  const moves = movesFromPgn(pgn)
  const review = buildReview('g', moves, flat([moves[0].before, ...moves.map((m) => m.after)]), book)

  it('finds the middlegame before the endgame and both inside the game', () => {
    const { middlegame, endgame } = phaseStarts(review)
    expect(middlegame).not.toBeNull()
    expect(endgame).not.toBeNull()
    expect(middlegame!).toBeLessThanOrEqual(endgame!)
    // Endgame: at most six minor and major pieces on the board before the move.
    const placement = review.moves[endgame!].fenBefore.split(' ')[0]
    expect(placement.replace(/[^nbrqNBRQ]/g, '').length).toBeLessThanOrEqual(6)
  })

  it('grades each phase for both sides, perfect play scoring at the top', () => {
    const g = phaseGrades(review)
    expect(g.w.opening?.label).toBe('best')
    expect(g.b.endgame?.moves).toBeGreaterThanOrEqual(2)
  })
})

describe('gradeLabel', () => {
  it('maps phase accuracy to a label', () => {
    expect(gradeLabel(97)).toBe('best')
    expect(gradeLabel(86)).toBe('excellent')
    expect(gradeLabel(72)).toBe('good')
    expect(gradeLabel(30)).toBe('blunder')
  })
})

describe('clocks and best line', () => {
  it('reads remaining time and time spent per move, increment included', () => {
    const moves = movesFromPgn(pgn).slice(0, 4)
    const clock = clockInput({ pgn, timeControl: '180+2' })!
    const review = buildReview('g', moves, flat([moves[0].before, ...moves.map((m) => m.after)]), book, clock)
    expect(review.moves.map((m) => m.clock)).toEqual([181, 180, 179, 178])
    // White: 180 + 2 - 181 = 1 s, then 181 + 2 - 179 = 4 s.
    expect(review.moves.map((m) => m.spent)).toEqual([1, 2, 4, 4])
    expect(review.moves[0].bestLine).toEqual(['a2a3', 'a7a6', 'b2b3'])
  })

  it('gives no clock for daily games', () => {
    expect(clockInput({ pgn, timeControl: '1/86400' })).toBeUndefined()
  })
})

describe('classifyPlayedMove', () => {
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  const after = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
  const at = (fen: string, score: Score, uci: string): PositionAnalysis => ({ fen, depth: 14, lines: [{ score, pv: [uci] }] })

  it('labels the engine move best', () => {
    expect(classifyPlayedMove(start, 'e2e4', at(start, cp(30), 'e2e4'), at(after, cp(30), 'e7e5'))?.label).toBe('best')
  })

  it('reads a large drop as a blunder', () => {
    expect(classifyPlayedMove(start, 'e2e4', at(start, cp(30), 'd2d4'), at(after, cp(-600), 'e7e5'))?.label).toBe('blunder')
  })

  it('returns null for an illegal move', () => {
    expect(classifyPlayedMove(start, 'e2e5', at(start, cp(30), 'e2e4'), at(after, cp(30), 'e7e5'))).toBeNull()
  })
})
