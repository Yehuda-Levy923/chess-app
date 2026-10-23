import { describe, expect, it } from 'vitest'
import { buildBook } from '../openings/book'
import { buildReview, movesFromPgn } from './buildReview'
import { labelAt, summarize, SUMMARY_FORMAT, TACTIC } from './summary'
import type { PositionAnalysis, Score } from './types'

const book = buildBook(['eco\tname\tpgn\nC20\tKing\'s Pawn Game\t1. e4 e5'])
const cp = (n: number): Score => ({ kind: 'cp', cp: n })
const at = (fen: string, ...lines: [Score, string][]): PositionAnalysis => ({ fen, depth: 16, lines: lines.map(([score, uci]) => ({ score, pv: [uci] })) })

// 4.Bb5 pins the knight on c6 to the king (d7 is empty after 2...d6), and the
// engine rates it well above anything else.
function pinGame(second: number) {
  const moves = movesFromPgn('1. e4 e5 2. Nf3 d6 3. d4 Nc6 4. Bb5 a6')
  const fens = [moves[0].before, ...moves.map((m) => m.after)]
  const analyses = [
    at(fens[0], [cp(30), 'e2e4'], [cp(25), 'd2d4']),
    at(fens[1], [cp(30), 'e7e5'], [cp(35), 'c7c5']),
    at(fens[2], [cp(30), 'g1f3'], [cp(25), 'b1c3']),
    at(fens[3], [cp(40), 'd7d6'], [cp(45), 'b8c6']),
    at(fens[4], [cp(40), 'd2d4'], [cp(35), 'f1c4']),
    at(fens[5], [cp(60), 'b8c6'], [cp(70), 'e5d4']),
    at(fens[6], [cp(200), 'f1b5'], [cp(second), 'd4d5']),
    at(fens[7], [cp(200), 'a7a6'], [cp(220), 'c8d7']),
    at(fens[8], [cp(200), 'b5c6'], [cp(150), 'b5a4']),
  ]
  return buildReview('pin', moves, analyses, book)
}

describe('summarize', () => {
  it('marks a pin the engine wanted, and that it was played', () => {
    const s = summarize(pinGame(0))
    expect(s.format).toBe(SUMMARY_FORMAT)
    expect(s.tactics[6] & TACTIC.pinAvailable).toBeTruthy()
    expect(s.tactics[6] & TACTIC.pinFound).toBeTruthy()
    expect(s.tactics.filter((f) => f & TACTIC.pinAvailable)).toHaveLength(1)
  })

  it("doesn't count a pin when other moves are about as good", () => {
    const s = summarize(pinGame(180))
    expect(s.tactics[6] & TACTIC.pinAvailable).toBe(0)
  })

  it('adds pins to tactic flags kept from an older summary', () => {
    const s = summarize(pinGame(0), { tactics: Array(8).fill(TACTIC.hung) })
    expect(s.tactics[6]).toBe(TACTIC.hung | TACTIC.pinAvailable | TACTIC.pinFound)
    expect(s.tactics[0]).toBe(TACTIC.hung)
  })

  it("turns an older review's brilliant only legal move into best, and keeps real ones", () => {
    const review = pinGame(0)
    // White's king on h1 is checked by an unprotected queen on g2: Kxg2 is its only legal move.
    const forced = '7k/8/8/8/8/8/6q1/7K w - - 0 1'
    review.moves[6] = { ...review.moves[6], label: 'brilliant', fenBefore: forced }
    review.moves[4] = { ...review.moves[4], label: 'brilliant' }
    const s = summarize(review)
    expect(labelAt(s, 6)).toBe('best')
    expect(labelAt(s, 4)).toBe('brilliant')
  })

  it("records where the phases begin and each side's accuracy per phase", () => {
    const s = summarize(pinGame(0))
    // An eight-move game never leaves the opening.
    expect(s.phases).toEqual([null, null])
    expect(s.phaseAccuracy!.w[0]).toBeGreaterThan(0)
    expect(s.phaseAccuracy!.w[1]).toBeNull()
    expect(s.phaseAccuracy!.b[2]).toBeNull()
  })
})
