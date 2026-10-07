import { describe, expect, it } from 'vitest'
import { pvToSan } from './liveAnalysis'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('pvToSan', () => {
  it('numbers moves from the side to move', () => {
    expect(pvToSan(START, ['e2e4', 'e7e5', 'g1f3']).map((m) => m.label)).toEqual(['1.e4', 'e5', '2.Nf3'])
  })

  it('starts a black line with the ellipsis form', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
    expect(pvToSan(fen, ['c7c5', 'g1f3']).map((m) => m.label)).toEqual(['1...c5', '2.Nf3'])
  })

  it('stops at an illegal move', () => {
    expect(pvToSan(START, ['e2e4', 'e2e4'])).toHaveLength(1)
  })
})
