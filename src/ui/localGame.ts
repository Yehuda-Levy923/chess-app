import type { ChessComGame } from '../chesscom/api'
import type { PositionAnalysis } from '../review/types'

/**
 * A game from this app rather than chess.com: played against the computer, or
 * set up on the analysis board. Its review starts from the positions in
 * `searched` and is never cached.
 */
export type LocalGame = { game: ChessComGame; me: 'white' | 'black'; searched: ReadonlyMap<string, PositionAnalysis> }

/** The game in the shape the review screen takes. It was never on chess.com, so there is no link, rating or clock. */
export function localReviewGame(pgn: string, white: string, black: string): ChessComGame {
  const player = (username: string) => ({ username, rating: 0, result: '' })
  return {
    uuid: `local-${Date.now()}`,
    url: '',
    pgn,
    timeClass: '',
    timeControl: '-',
    rated: false,
    rules: 'chess',
    endTime: Math.floor(Date.now() / 1000),
    white: player(white),
    black: player(black),
    accuracies: null,
  }
}
