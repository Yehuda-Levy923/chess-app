import { describe, expect, it } from 'vitest'
import { bookDepth, buildBook } from './book'

const tsv = [
  'eco\tname\tpgn',
  'C00\tFrench Defense\t1. e4 e6',
  'C01\tFrench Defense: Exchange Variation\t1. e4 e6 2. d4 d5 3. exd5',
  'B01\tScandinavian Defense\t1. e4 d5',
].join('\n')

describe('opening book', () => {
  const book = buildBook([tsv])

  it('follows the game while it stays in book', () => {
    const r = bookDepth(book, ['e4', 'e6', 'd4', 'd5', 'exd5', 'exd5', 'Nf3'])
    expect(r.plies).toBe(5)
    expect(r.opening?.name).toBe('French Defense: Exchange Variation')
  })

  it('reports the opening each book ply lands on', () => {
    const r = bookDepth(book, ['e4', 'e6', 'd4'])
    expect(r.byPly.map((o) => o?.name ?? null)).toEqual([null, 'French Defense', null])
  })

  it('ignores check and annotation marks', () => {
    expect(bookDepth(book, ['e4', 'd5!?']).opening?.name).toBe('Scandinavian Defense')
  })

  it('stops at the first move out of book', () => {
    expect(bookDepth(book, ['d4', 'd5']).plies).toBe(0)
  })
})
