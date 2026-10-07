import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { mostHanging, see } from './material'

describe('see', () => {
  it('wins an undefended piece outright', () => {
    const chess = new Chess('4k3/8/4p3/3Q4/8/8/8/4K3 b - - 0 1')
    expect(see(chess, 'd5')).toBe(9)
  })

  it('wins nothing from an even pawn trade', () => {
    const chess = new Chess('4k3/8/4p3/3P4/2P5/8/8/4K3 b - - 0 1')
    expect(see(chess, 'd5')).toBe(0)
  })

  it('does not capture a defended piece with a more valuable one', () => {
    // Black queen could take the defended knight, but would lose itself.
    const chess = new Chess('4k3/8/2q5/8/8/2N5/1P6/4K3 b - - 0 1')
    expect(see(chess, 'c3')).toBe(0)
  })

  it('counts a promoting capture as rook won for a pawn, even when the new queen is taken', () => {
    // gxf8=Q wins the rook; Rxf8 or Kxf8 takes the queen back. Net: rook for pawn.
    const chess = new Chess('r4rk1/1p3pP1/3p2q1/3p3Q/8/pP2PN1P/P1P5/2KR4 w - - 1 26')
    expect(see(chess, 'f8')).toBe(4)
  })

  it('handles a recapture that promotes', () => {
    // Rxe1 dxe1=Q+ Qxe1: White wins a rook, gives a rook, and the d-pawn is gone.
    const chess = new Chess('8/p4ppk/7p/8/PP5P/2Q3P1/1KPp1q2/R2Rr3 w - - 1 35')
    expect(see(chess, 'e1')).toBe(1)
  })

  it('does not capture with a pinned piece', () => {
    // The e4 knight is pinned to the king by the e8 rook, so it cannot take d6.
    const chess = new Chess('4r1k1/8/3p4/8/4N3/8/8/4K3 w - - 0 1')
    expect(see(chess, 'd6')).toBe(0)
  })

  it('leaves the position unchanged', () => {
    const fen = '4k3/8/4p3/3Q4/8/8/8/4K3 b - - 0 1'
    const chess = new Chess(fen)
    see(chess, 'd5')
    expect(chess.fen()).toBe(fen)
  })
})

describe('mostHanging', () => {
  it('finds the piece the opponent can win', () => {
    expect(mostHanging('4k3/8/4p3/3Q4/8/8/8/4K3 b - - 0 1', 'w')).toEqual({ square: 'd5', piece: 'q', gain: 9 })
  })

  it('is null when everything is safe', () => {
    expect(mostHanging('4k3/8/4p3/3P4/2P5/8/8/4K3 b - - 0 1', 'w')).toBeNull()
  })

  it('is null when it is the victim to move', () => {
    expect(mostHanging('4k3/8/4p3/3Q4/8/8/8/4K3 w - - 0 1', 'w')).toBeNull()
  })
})
