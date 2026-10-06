import { describe, expect, it } from 'vitest'
import { parseGames } from './api'

const player = (username: string, result: string) => ({ username, rating: 1500, result })
const raw = (over: Record<string, unknown>) => ({
  uuid: 'u',
  url: 'https://www.chess.com/game/live/1',
  pgn: '1. e4 e5',
  time_class: 'blitz',
  time_control: '180',
  rated: true,
  rules: 'chess',
  end_time: 100,
  white: player('a', 'win'),
  black: player('b', 'resigned'),
  ...over,
})

describe('parseGames', () => {
  it('keeps standard games with a PGN, newest first', () => {
    const games = parseGames([
      raw({ uuid: 'old', end_time: 1 }),
      raw({ uuid: 'variant', rules: 'chess960' }),
      raw({ uuid: 'nopgn', pgn: undefined }),
      raw({ uuid: 'new', end_time: 5, accuracies: { white: 81.2, black: 77 } }),
    ] as never)
    expect(games.map((g) => g.uuid)).toEqual(['new', 'old'])
    expect(games[0].accuracies).toEqual({ white: 81.2, black: 77 })
    expect(games[1].accuracies).toBeNull()
    expect(games[0].timeClass).toBe('blitz')
  })
})
