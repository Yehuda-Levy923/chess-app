import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { movesFromPgn } from './buildReview'
import { reviewLocalGame } from './reviewGame'
import type { PositionAnalysis } from './types'

// An engine that scores every position level and suggests its first legal move,
// and records which positions it was asked to search.
function fakeEngine() {
  const searched: string[] = []
  const analyse = async (fen: string, depth: number): Promise<PositionAnalysis> => {
    searched.push(fen)
    const first = new Chess(fen).moves({ verbose: true })[0]
    return { fen, depth, requestedDepth: depth, lines: [{ score: { kind: 'cp', cp: 0 }, pv: first ? [first.lan] : [] }] }
  }
  return { searched, engine: { analyse, newGame: async () => {} } }
}

describe('reviewLocalGame', () => {
  it('searches only the positions not already searched during play', async () => {
    const pgn = '1. e4 e5 2. Nf3 Nc6 *'
    const moves = movesFromPgn(pgn)
    const fens = [moves[0].before, ...moves.map((m) => m.after)]
    const during = fakeEngine()
    const known = new Map<string, PositionAnalysis>()
    for (const fen of fens.slice(0, 3)) known.set(fen, await during.engine.analyse(fen, 16))

    const after = fakeEngine()
    const review = await reviewLocalGame({ uuid: 'computer-1', pgn }, 16, after.engine, known, () => undefined)
    expect(after.searched).toEqual(fens.slice(3))
    expect(review.moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6'])
  })

  it('reviews a game started from a set-up position', async () => {
    const start = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'
    const chess = new Chess(start)
    chess.move('Bb5')
    chess.move('a6')
    const { engine, searched } = fakeEngine()
    const review = await reviewLocalGame({ uuid: 'computer-2', pgn: chess.pgn() }, 16, engine, new Map(), () => undefined)
    expect(searched[0]).toBe(start)
    expect(review.moves.map((m) => m.san)).toEqual(['Bb5', 'a6'])
    expect(review.moves[0].fenBefore).toBe(start)
  })
})
