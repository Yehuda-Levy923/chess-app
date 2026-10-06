import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js'

export const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }

export const PIECE_NAME: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
}

/**
 * Static exchange evaluation: material the side to move wins by starting a
 * capture sequence on `square`, each side always recapturing with its cheapest
 * legal piece and free to stop. Uses legal moves, so pins and x-rays are handled.
 */
export function see(chess: Chess, square: Square): number {
  const captures = chess.moves({ verbose: true }).filter((m) => m.to === square && m.captured)
  if (captures.length === 0) return 0
  const cheapest = captures.reduce((a, b) => (PIECE_VALUE[b.piece] < PIECE_VALUE[a.piece] ? b : a))
  const gained = PIECE_VALUE[cheapest.captured!]
  chess.move(cheapest)
  const answer = see(chess, square)
  chess.undo()
  return Math.max(0, gained - answer)
}

export type Hanging = { square: Square; piece: PieceSymbol; gain: number }

/**
 * The most material the side to move can win by capturing one of `victim`'s
 * pieces. Returns null when nothing can be won.
 */
export function mostHanging(fen: string, victim: Color): Hanging | null {
  const chess = new Chess(fen)
  if (chess.turn() === victim) return null
  let worst: Hanging | null = null
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== victim || cell.type === 'k') continue
      const gain = see(chess, cell.square)
      if (gain > 0 && (!worst || gain > worst.gain)) worst = { square: cell.square, piece: cell.type, gain }
    }
  }
  return worst
}
