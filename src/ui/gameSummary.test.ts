import { describe, expect, it } from 'vitest'
import type { ChessComGame } from '../chesscom/api'
import { finalFen, moveCount, openingName, ratingsNow } from './gameSummary'

const PGN = `[White "KasparovPeru"]
[Black "yehuda_levy"]
[CurrentPosition "4B3/p1p2pk1/3b2p1/7p/7P/1P4P1/P4PQK/q4r2 w - - 8 37"]
[ECOUrl "https://www.chess.com/openings/Ponziani-Opening-Jaenisch-Counterattack-4.d4-exd4-5.e5"]

1. e4 e5 *`

describe('PGN header facts', () => {
  it('reads the final position and move count', () => {
    expect(finalFen({ pgn: PGN })).toBe('4B3/p1p2pk1/3b2p1/7p/7P/1P4P1/P4PQK/q4r2 w - - 8 37')
    expect(moveCount({ pgn: PGN })).toBe(36)
  })

  it('names the opening without its moves', () => {
    expect(openingName({ pgn: PGN })).toBe('Ponziani Opening Jaenisch Counterattack')
    expect(openingName({ pgn: '[ECOUrl "https://www.chess.com/openings/Sicilian-Defense-2...Nc6"]' })).toBe('Sicilian Defense')
  })

  it('copes with a PGN that has none of them', () => {
    expect(finalFen({ pgn: '1. e4 *' })).toBeNull()
    expect(openingName({ pgn: '1. e4 *' })).toBeNull()
  })
})

describe('ratingsNow', () => {
  const game = (timeClass: string, rating: number, asBlack = false) =>
    ({
      timeClass,
      white: { username: asBlack ? 'opp' : 'me', rating: asBlack ? 1500 : rating, result: 'win' },
      black: { username: asBlack ? 'me' : 'opp', rating: asBlack ? rating : 1500, result: 'win' },
    }) as ChessComGame

  it('takes the newest rating per time class and the change across the list', () => {
    // Newest first, as the API returns them.
    const r = ratingsNow([game('bullet', 1910), game('blitz', 1700, true), game('bullet', 1880, true), game('bullet', 1870)], 'me')
    expect(r[0]).toEqual({ timeClass: 'bullet', rating: 1910, change: 40, games: 3, series: [1870, 1880, 1910] })
    expect(r[1]).toMatchObject({ timeClass: 'blitz', rating: 1700, change: 0, games: 1 })
  })
})
