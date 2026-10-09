import { describe, expect, it } from 'vitest'
import { getBook } from '../openings'
import { shallowPositions } from './analyseGame'
import { buildReview, movesFromPgn, terminalScore } from './buildReview'
import { deepenReview } from './deepen'
import type { PositionAnalysis, Score } from './types'

const pgn = '1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0'
const game = { uuid: 'g', pgn, timeControl: '180' }
const cp = (n: number): Score => ({ kind: 'cp', cp: n })
const moves = movesFromPgn(pgn)
const fens = [moves[0].before, ...moves.map((m) => m.after)]
const at = (i: number, depth: number, ...lines: [Score, string][]): PositionAnalysis => ({ fen: fens[i], depth, requestedDepth: 16, lines: lines.map(([score, uci]) => ({ score, pv: [uci] })) })
const analyses = [
  at(0, 16, [cp(30), 'e2e4']),
  at(1, 16, [cp(30), 'e7e5']),
  at(2, 16, [cp(30), 'g1f3']),
  at(3, 16, [cp(20), 'g8f6']),
  at(4, 16, [cp(25), 'g1f3']),
  at(5, 16, [cp(-150), 'g7g6'], [cp(-140), 'd8e7']),
  at(6, 16, [{ kind: 'mate', mate: 1 }, 'h5f7']),
  { fen: fens[7], depth: 16, requestedDepth: 16, lines: [{ score: terminalScore(fens[7])!, pv: [] }] },
]
const review = buildReview('g', moves, analyses, getBook())

describe('shallowPositions', () => {
  it('finds positions under the floor, skipping finished ones and low requests', () => {
    const a = [...analyses]
    a[2] = { ...a[2], depth: 13 }
    a[3] = { ...a[3], depth: 11, requestedDepth: 12 }
    a[4] = { ...a[4], depth: 12, requestedDepth: 12 }
    expect(shallowPositions(a)).toEqual([2, 3])
  })
})

describe('deepenReview', () => {
  it('rebuilds with the deeper search and keeps the cache depth', () => {
    // At depth 16, 3.Qh5 looked like it threw away a pawn's worth; deeper, it's fine.
    expect(review.moves[4].label).toBe('mistake')
    const deeper = deepenReview(game, review, 5, { fen: fens[5], depth: 22, lines: [{ score: cp(20), pv: ['d8e7'] }, { score: cp(60), pv: ['g7g6'] }, { score: cp(90), pv: ['b7b6'] }] })!
    expect(deeper.moves[4].label).not.toBe('mistake')
    expect(deeper.analyses![5]).toMatchObject({ depth: 22, requestedDepth: 16 })
    expect(deeper.analyses![5].lines).toHaveLength(2)
    expect(deeper.depth).toBe(16)
    expect(deeper.accuracy.w).toBeGreaterThan(review.accuracy.w)
  })

  it('ignores a search that is no deeper, or of another position', () => {
    expect(deepenReview(game, review, 5, { fen: fens[5], depth: 16, lines: [{ score: cp(0), pv: ['d8e7'] }] })).toBeNull()
    expect(deepenReview(game, review, 5, { fen: fens[4], depth: 22, lines: [{ score: cp(0), pv: ['g1f3'] }] })).toBeNull()
    expect(deepenReview(game, review, 7, { fen: fens[7], depth: 22, lines: [{ score: cp(0), pv: [] }] })).toBeNull()
  })
})
