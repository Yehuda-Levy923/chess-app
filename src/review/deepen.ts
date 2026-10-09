import type { ChessComGame } from '../chesscom/api'
import { getBook } from '../openings'
import { buildReview, movesFromPgn } from './buildReview'
import { clockInput } from './reviewGame'
import type { PositionAnalysis, Review } from './types'

// When the review screen's live engine searches a game position deeper than
// the review did, the review is rebuilt with that search in place of the
// stored one. A position's analysis decides the move into it (how much it
// lost) and the move out of it (the best move, the alternatives), so labels,
// notes, accuracy and the played-like rating can all change.

/**
 * The review rebuilt with `analysis` as position `index` (0 is the start,
 * i the position after move i), or null when it isn't deeper than what the
 * review has or is for a different position. The cache key stays the same:
 * the position keeps the depth that was asked for, only its result changes.
 */
export function deepenReview(game: Pick<ChessComGame, 'uuid' | 'pgn' | 'timeControl'>, review: Review, index: number, analysis: PositionAnalysis): Review | null {
  const stored = review.analyses?.[index]
  if (!review.analyses || !stored || analysis.lines.length === 0) return null
  if (samePosition(stored.fen, analysis.fen) === false || analysis.depth <= stored.depth) return null
  if (stored.lines[0]?.score.kind === 'over') return null
  const moves = movesFromPgn(game.pgn)
  if (review.analyses.length !== moves.length + 1) return null
  const analyses = [...review.analyses]
  // Two lines are what the review uses for a position; the live search may show more.
  analyses[index] = { fen: stored.fen, depth: analysis.depth, requestedDepth: stored.requestedDepth ?? review.depth, lines: analysis.lines.slice(0, Math.max(2, stored.lines.length)) }
  return buildReview(game.uuid, moves, analyses, getBook(), clockInput(game))
}

/** Same board, side to move, castling and en passant; the move counters don't matter. */
function samePosition(a: string, b: string): boolean {
  return a.split(' ').slice(0, 4).join(' ') === b.split(' ').slice(0, 4).join(' ')
}
