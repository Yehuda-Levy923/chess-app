import { describe, expect, it } from 'vitest'
import type { GameFacts } from '../insights/facts'
import { gamesThrough, openingRows, typicalLine } from './openingLines'

const g = (id: string, sans: string[], extra: Partial<GameFacts> = {}) =>
  ({ id, sans, side: 'white', family: 'French Defense', outcome: 'won', myRatingBefore: 1500, oppRatingBefore: 1500, ...extra }) as GameFacts

describe('opening lines', () => {
  const games = [
    g('a', ['e4', 'e6', 'd4', 'd5', 'Nc3']),
    g('b', ['e4', 'e6', 'd4', 'd5', 'e5']),
    g('c', ['e4', 'e6', 'd4', 'd5', 'Nd2']),
    g('d', ['e4', 'e6', 'Nf3', 'd5']),
  ]

  it('follows the moves most games share', () => {
    expect(typicalLine(games)).toEqual(['e4', 'e6', 'd4', 'd5'])
  })

  it('finds the games through a line', () => {
    expect(gamesThrough(games, ['e4', 'e6', 'd4']).map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect(gamesThrough(games, [])).toHaveLength(4)
  })

  it('groups families by colour with a minimum size', () => {
    const rows = openingRows([...games, g('e', ['d4'], { side: 'black', family: 'Dutch Defense' })], 'white', 2)
    expect(rows.map((r) => [r.family, r.games])).toEqual([['French Defense', 4]])
  })
})
