import { describe, expect, it } from 'vitest'
import { buildBook } from '../openings/book'
import { buildReview, movesFromPgn, terminalScore } from './buildReview'
import type { PositionAnalysis, Score } from './types'

const book = buildBook(['eco\tname\tpgn\nC20\tKing\'s Pawn Game\t1. e4 e5'])
const pgn = '1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0'

const cp = (n: number): Score => ({ kind: 'cp', cp: n })
const at = (fen: string, ...lines: [Score, string][]): PositionAnalysis => ({
  fen,
  depth: 16,
  lines: lines.map(([score, uci]) => ({ score, pv: [uci] })),
})

function scholarsMate() {
  const moves = movesFromPgn(pgn)
  const fens = [moves[0].before, ...moves.map((m) => m.after)]
  const analyses = [
    at(fens[0], [cp(30), 'e2e4']),
    at(fens[1], [cp(30), 'e7e5']),
    at(fens[2], [cp(30), 'g1f3']),
    at(fens[3], [cp(20), 'g8f6']),
    at(fens[4], [cp(25), 'g1f3']),
    at(fens[5], [cp(0), 'd8e7'], [cp(10), 'g7g6']),
    at(fens[6], [{ kind: 'mate', mate: 1 }, 'h5f7']),
    { fen: fens[7], depth: 16, lines: [{ score: terminalScore(fens[7])!, pv: [] }] },
  ]
  return buildReview('g1', moves, analyses, book)
}

describe('buildReview', () => {
  const review = scholarsMate()
  const labels = review.moves.map((m) => `${m.san}:${m.label}`)

  it('labels each move', () => {
    expect(labels).toEqual(['e4:book', 'e5:book', 'Bc4:excellent', 'Nc6:excellent', 'Qh5:good', 'Nf6:blunder', 'Qxf7#:best'])
  })

  it('explains the blunder and names the better move', () => {
    expect(review.moves[5].note).toBe('Allows mate in 1. Best was Qe7 (0.0).')
    expect(review.moves[5].bestSan).toBe('Qe7')
  })

  it('names the opening', () => {
    expect(review.opening).toBe("King's Pawn Game")
    expect(review.moves[1].opening).toBe("King's Pawn Game")
  })

  it('rates the blundering side lower', () => {
    expect(review.accuracy.w).toBeGreaterThan(review.accuracy.b)
    expect(review.counts.b.blunder).toBe(1)
    expect(review.counts.w.book).toBe(1)
  })

  it('rejects a mismatched analysis count', () => {
    expect(() => buildReview('x', movesFromPgn(pgn), [], book)).toThrow()
  })
})

describe('terminalScore', () => {
  it('reads checkmate and leaves live positions to the engine', () => {
    const moves = movesFromPgn(pgn)
    expect(terminalScore(moves.at(-1)!.after)).toEqual({ kind: 'over', result: '1-0' })
    expect(terminalScore(moves[0].after)).toBeNull()
  })
})
