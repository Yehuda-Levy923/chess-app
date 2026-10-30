import { Chess } from 'chess.js'

// A line of moves from a start position, with a cursor. Used by the analysis
// board and by games against the computer. Pure, so the screens stay thin.

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export type LineMove = { san: string; uci: string; fen: string }

export type Line = {
  start: string
  moves: LineMove[]
  /** How many of `moves` are on the board: 0 is the start position */
  ply: number
}

export const emptyLine = (start = START_FEN): Line => ({ start, moves: [], ply: 0 })

export const fenAt = (line: Line, ply = line.ply): string => (ply === 0 ? line.start : line.moves[ply - 1].fen)

/**
 * Plays `move` from the position at the cursor. Playing the move that already
 * comes next just steps forward; any other move replaces what came after.
 * Returns null when the move is illegal.
 */
export function play(line: Line, move: { from: string; to: string; promotion?: string }): Line | null {
  const chess = new Chess(fenAt(line))
  let made
  try {
    made = chess.move(move)
  } catch {
    return null
  }
  const uci = made.from + made.to + (made.promotion ?? '')
  if (line.moves[line.ply]?.uci === uci) return { ...line, ply: line.ply + 1 }
  return { ...line, moves: [...line.moves.slice(0, line.ply), { san: made.san, uci, fen: chess.fen() }], ply: line.ply + 1 }
}

export const playUci = (line: Line, uci: string) => play(line, { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })

/** True when a pawn moving from `from` to `to` in this position would promote. */
export function isPromotion(fen: string, from: string, to: string): boolean {
  const chess = new Chess(fen)
  const piece = chess.get(from as Parameters<Chess['get']>[0])
  if (piece?.type !== 'p') return false
  return (piece.color === 'w' && to[1] === '8') || (piece.color === 'b' && to[1] === '1')
}

/** A pasted FEN or PGN as a line, or the reason it couldn't be read. */
export function parseInput(text: string): { line: Line } | { error: string } {
  const t = text.trim()
  if (!t) return { error: 'Paste a FEN or a PGN.' }
  if (!t.includes('\n') && t.split(/\s+/).length >= 2 && t.includes('/')) {
    try {
      const chess = new Chess(t)
      return { line: emptyLine(chess.fen()) }
    } catch (e) {
      return { error: `That FEN isn't a legal position: ${e instanceof Error ? e.message : String(e)}` }
    }
  }
  const chess = new Chess()
  try {
    chess.loadPgn(t)
  } catch {
    return { error: "That isn't a FEN or a PGN this board can read." }
  }
  const setUp = chess.getHeaders().FEN
  const start = setUp ?? START_FEN
  let line = emptyLine(start)
  for (const m of chess.history({ verbose: true })) {
    const next = play(line, { from: m.from, to: m.to, promotion: m.promotion })
    if (!next) return { error: `Move ${m.san} in that PGN isn't legal.` }
    line = next
  }
  return { line }
}

/** The line as PGN, up to the end of the line rather than the cursor. */
export function toPgn(line: Line, headers: Record<string, string> = {}): string {
  const chess = new Chess(line.start)
  if (line.start !== START_FEN) {
    chess.setHeader('SetUp', '1')
    chess.setHeader('FEN', line.start)
  }
  for (const [k, v] of Object.entries(headers)) chess.setHeader(k, v)
  for (const m of line.moves) chess.move(m.san)
  return chess.pgn()
}

export type Outcome = { winner: 'white' | 'black' | null; reason: string }

/** How the game at the end of `fen` finished, or null while it goes on. */
export function outcome(fen: string, history: string[] = []): Outcome | null {
  const chess = new Chess(fen)
  if (chess.isCheckmate()) return { winner: chess.turn() === 'w' ? 'black' : 'white', reason: 'checkmate' }
  if (chess.isStalemate()) return { winner: null, reason: 'stalemate' }
  if (chess.isInsufficientMaterial()) return { winner: null, reason: 'insufficient material' }
  if (chess.isDrawByFiftyMoves()) return { winner: null, reason: 'the fifty-move rule' }
  // Repetition needs the moves that led here; a bare FEN can't show it.
  if (history.filter((f) => samePosition(f, fen)).length >= 3) return { winner: null, reason: 'repetition' }
  return null
}

/** Same pieces, side to move, castling and en passant: the parts repetition counts. */
const samePosition = (a: string, b: string) => a.split(' ').slice(0, 4).join(' ') === b.split(' ').slice(0, 4).join(' ')

/** "14. Nf6" numbering for a move at index `i` of a line from `start`. */
export function moveLabel(start: string, i: number): { no: number; white: boolean } {
  const [, turn, , , , full] = start.split(' ')
  const offset = turn === 'b' ? 1 : 0
  return { no: Number(full || 1) + Math.floor((i + offset) / 2), white: (i + offset) % 2 === 0 }
}
