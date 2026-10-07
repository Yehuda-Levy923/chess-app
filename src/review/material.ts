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
  const target = chess.get(square)
  if (!target || target.color === chess.turn()) return 0
  // attackers() is cheap; full verbose move generation at every step was the
  // bulk of a review's build time. A pinned attacker shows up here but its
  // capture is illegal, so chess.move rejects it and the next one is tried.
  const attackers = chess
    .attackers(square, chess.turn())
    .map((from) => ({ from, value: PIECE_VALUE[chess.get(from)!.type] }))
    .sort((a, b) => a.value - b.value)
  for (const { from } of attackers) {
    let move
    try {
      move = chess.move({ from, to: square, promotion: 'q' })
    } catch {
      continue
    }
    // A capture that promotes also turns a pawn into a queen; without this the
    // queen that gets recaptured counts as a full queen lost.
    const promotion = move.promotion ? PIECE_VALUE[move.promotion] - PIECE_VALUE.p : 0
    const answer = see(chess, square)
    chess.undo()
    return Math.max(0, PIECE_VALUE[target.type] + promotion - answer)
  }
  return 0
}

export type Hanging = { square: Square; piece: PieceSymbol; gain: number }

/**
 * The most material the side to move can win by capturing one of `victim`'s
 * pieces. Returns null when nothing can be won.
 */
export function mostHanging(fen: string, victim: Color): Hanging | null {
  const chess = new Chess(fen)
  if (chess.turn() === victim) return null
  // Only attacked pieces can be lost, so skip the exchange search for the rest.
  const attacker = chess.turn()
  let worst: Hanging | null = null
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== victim || cell.type === 'k' || !chess.isAttacked(cell.square, attacker)) continue
      const gain = see(chess, cell.square)
      if (gain > 0 && (!worst || gain > worst.gain)) worst = { square: cell.square, piece: cell.type, gain }
    }
  }
  return worst
}
