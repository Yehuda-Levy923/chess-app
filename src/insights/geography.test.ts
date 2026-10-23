import { describe, expect, it } from 'vitest'
import type { GameFacts } from './facts'
import { byCountry, codeFromUrl, countryName, mapKey } from './geography'

describe('geography', () => {
  it('reads country codes from chess.com profile URLs', () => {
    expect(codeFromUrl('https://api.chess.com/pub/country/US')).toBe('US')
    expect(codeFromUrl('https://api.chess.com/pub/country/XE')).toBe('XE')
    expect(codeFromUrl(undefined)).toBeNull()
  })

  it('puts chess.com regions on the right map country', () => {
    expect(mapKey('US')).toBe('840')
    expect(mapKey('XE')).toBe('826')
    expect(mapKey('XC')).toBe('724')
    expect(mapKey('XK')).toBe('Kosovo')
    expect(mapKey('XX')).toBeNull()
    expect(countryName('XS')).toBe('Scotland')
  })

  it('counts games and score per country, skipping unknown opponents', () => {
    const g = (id: string, opponent: string, outcome: GameFacts['outcome']) => ({ id, opponent, outcome }) as GameFacts
    const rows = byCountry(
      [g('1', 'Ann', 'won'), g('2', 'ann', 'lost'), g('3', 'Bob', 'drawn'), g('4', 'Who', 'won')],
      new Map([
        ['ann', 'IN'],
        ['bob', 'IN'],
        ['who', null],
      ]),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ code: 'IN', games: 3, opponents: 2, score: 0.5 })
  })
})
