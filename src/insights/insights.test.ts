import { describe, expect, it } from 'vitest'
import type { ChessComGame } from '../chesscom/api'
import { buildBook } from '../openings/book'
import { buildReview, movesFromPgn, terminalScore } from '../review/buildReview'
import type { PositionAnalysis, Score } from '../review/types'
import { tactics, moveQuality, accuracyByMove } from './engineStats'
import { factsOf, phaseOfFinalPosition, withPreGameRatings, type GameFacts } from './facts'
import { byRatingGap, castling, clockUse, howGamesEnd, openings, overall, pieceShare, score } from './stats'
import { branches, buildTree, nodeAt } from './tree'

const book = buildBook(["eco\tname\tpgn\nB13\tCaro-Kann Defense: Exchange Variation\t1. e4 c6 2. d4 d5 3. exd5 cxd5\nC20\tKing's Pawn Game\t1. e4 e5"])

function game(over: Partial<ChessComGame> & { moves?: string; clocks?: number[] } = {}): ChessComGame {
  const sans = (over.moves ?? 'e4 c6 d4 d5 exd5 cxd5 Nf3 Nc6 Bb5 e6 O-O Bd6').split(' ')
  const clk = over.clocks ?? sans.map((_, i) => 180 - (i + 1) * 3)
  const fmt = (s: number) => `0:${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`
  const text = sans.map((s, i) => `${i % 2 === 0 ? `${i / 2 + 1}. ` : ''}${s} {[%clk ${fmt(clk[i])}]}`).join(' ')
  return {
    uuid: 'g',
    url: 'u',
    pgn: `[CurrentPosition "r1bqk2r/pp3ppp/2nbpn2/1B1p4/3P4/5N2/PPP2PPP/RNBQ1RK1 b kq - 0 6"]\n\n${text} 1-0`,
    timeClass: 'blitz',
    timeControl: '180',
    rated: true,
    rules: 'chess',
    endTime: 1_700_000_000,
    white: { username: 'Me', rating: 1500, result: 'win' },
    black: { username: 'them', rating: 1650, result: 'resigned' },
    accuracies: null,
    ...over,
  }
}

describe('factsOf', () => {
  const f = factsOf(game(), 'me', book)

  it('takes the player side case-insensitively and reads the result', () => {
    expect(f.side).toBe('white')
    expect(f.outcome).toBe('won')
    expect(f.how).toBe('resigned')
    expect(f.oppRating - f.myRating).toBe(150)
  })

  it('names the opening from the book and splits off the family', () => {
    expect(f.opening).toBe('Caro-Kann Defense: Exchange Variation')
    expect(f.family).toBe('Caro-Kann Defense')
    expect(f.bookPlies).toBe(6)
  })

  it('records castling and piece use for the player only', () => {
    expect(f.castled).toEqual({ side: 'short', move: 6 })
    expect(f.pieceMoves).toEqual({ p: 3, n: 1, b: 1, r: 0, q: 0, k: 1 })
  })

  it('works out time spent per move from the clock', () => {
    expect(f.clock?.spent).toEqual([3, 6, 6, 6, 6, 6])
    expect(f.clock?.left).toBe(180 - 11 * 3)
  })

  it('reads the losing side when the player lost on time', () => {
    const lost = factsOf(game({ white: { username: 'them', rating: 1500, result: 'win' }, black: { username: 'me', rating: 1500, result: 'timeout' } }), 'me', book)
    expect(lost.side).toBe('black')
    expect(lost.outcome).toBe('lost')
    expect(lost.how).toBe('timeout')
  })
})

describe('withPreGameRatings', () => {
  it("uses the previous game's rating in the same time control, and moves the opponent back by the change", () => {
    const base = factsOf(game(), 'me', book)
    // As factsOf leaves them: "before" starts out equal to the post-game figure.
    const at = (id: string, endTime: number, timeClass: string, mine: number, opp: number) => ({
      ...base,
      id,
      endTime,
      timeClass,
      myRating: mine,
      oppRating: opp,
      myRatingBefore: mine,
      oppRatingBefore: opp,
    })
    const games = [at('a', 1, 'blitz', 1500, 1500), at('other', 2, 'rapid', 1200, 1200), at('b', 3, 'blitz', 1508, 1492)]
    const [a, other, b] = withPreGameRatings(games)
    expect([a.myRatingBefore, a.oppRatingBefore]).toEqual([1500, 1500])
    expect(other.myRatingBefore).toBe(1200)
    expect([b.myRatingBefore, b.oppRatingBefore]).toEqual([1500, 1500])
  })
})

describe('phaseOfFinalPosition', () => {
  it('calls a board with few pieces an endgame', () => {
    expect(phaseOfFinalPosition('8/5pk1/6p1/3R4/5P2/r5P1/6K1/8 w - - 0 45', 90)).toBe('endgame')
  })

  it('splits opening from middlegame by length', () => {
    const full = 'r1bqk2r/pp3ppp/2nbpn2/1B1p4/3P4/5N2/PPP2PPP/RNBQ1RK1 b kq - 0 6'
    expect(phaseOfFinalPosition(full, 20)).toBe('opening')
    expect(phaseOfFinalPosition(full, 60)).toBe('middlegame')
  })
})

const facts = (o: Partial<GameFacts>): GameFacts => ({ ...factsOf(game(), 'me', book), ...o })

describe('history stats', () => {
  const games = [
    facts({ outcome: 'won', how: 'checkmated', oppRatingBefore: 1250 }),
    facts({ outcome: 'lost', how: 'timeout', oppRatingBefore: 1700 }),
    facts({ outcome: 'lost', how: 'resigned', oppRatingBefore: 1510 }),
    facts({ outcome: 'drawn', how: 'repetition', castled: null }),
  ]

  it('scores a record', () => {
    expect(score(overall(games))).toBeCloseTo(1.5 / 4)
  })

  it('groups by rating gap', () => {
    const gaps = byRatingGap(games)
    expect(gaps.find((g) => g.label === '100+ lower')!.record.won).toBe(1)
    expect(gaps.find((g) => g.label === '100+ higher')!.record.lost).toBe(1)
    expect(gaps.find((g) => g.label === 'within 20')!.record.games).toBe(1)
  })

  it('lists how games ended, per outcome', () => {
    const how = howGamesEnd(games)
    expect(how.lost).toEqual([
      { how: 'timeout', count: 1 },
      { how: 'resigned', count: 1 },
    ])
  })

  it('reports openings with time in book', () => {
    const rows = openings(games, 'white')
    expect(rows[0]).toMatchObject({ family: 'Caro-Kann Defense', avgBookMoves: 3 })
    expect(rows[0].record.games).toBe(4)
  })

  it('counts castling', () => {
    const c = castling(games)
    expect(c.short.games).toBe(3)
    expect(c.none.drawn).toBe(1)
    expect(c.avgMove).toBe(6)
  })

  it('shares moves out by piece', () => {
    const s = pieceShare(games)
    expect(s.p).toBeCloseTo(0.5)
    expect(Object.values(s).reduce((a, b) => a + b, 0)).toBeCloseTo(1)
  })

  it('summarises clock use', () => {
    const c = clockUse(games)
    expect(c.games).toBe(4)
    expect(c.timeoutShareOfLosses).toBe(0.5)
    expect(c.spentByMove[0].share).toBeCloseTo((3 + 6 * 5) / 6 / 180)
  })
})

describe('opening tree', () => {
  const g = (moves: string, outcome: GameFacts['outcome']) => facts({ sans: moves.split(' '), outcome })
  const tree = buildTree([g('e4 c6 d4 d5', 'won'), g('e4 c6 Nf3', 'lost'), g('e4 e5 Nf3', 'drawn'), g('d4 d5', 'won')])

  it('counts games through each move', () => {
    expect(tree.record.games).toBe(4)
    expect(nodeAt(tree, ['e4'])!.record.games).toBe(3)
    expect(nodeAt(tree, ['e4', 'c6'])!.record).toEqual({ games: 2, won: 1, drawn: 0, lost: 1 })
    expect(nodeAt(tree, ['e4', 'c5'])).toBeNull()
  })

  it('orders continuations by popularity', () => {
    const b = branches(tree)
    expect(b.map((x) => x.san)).toEqual(['e4', 'd4'])
    expect(b[0].share).toBeCloseTo(0.75)
  })

  it('ignores check marks so the same move merges', () => {
    const t = buildTree([g('e4 e5 Qh5 Nc6 Bc4 Nf6 Qxf7#', 'won'), g('e4 e5 Qh5 Nc6 Bc4 Nf6 Qxf7', 'won')])
    expect(nodeAt(t, ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7'])!.record.games).toBe(2)
  })
})

describe('engine stats', () => {
  const pgn = '1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0'
  const cp = (n: number): Score => ({ kind: 'cp', cp: n })
  const moves = movesFromPgn(pgn)
  const fens = [moves[0].before, ...moves.map((m) => m.after)]
  const at = (fen: string, ...lines: [Score, string][]): PositionAnalysis => ({ fen, depth: 16, lines: lines.map(([score, uci]) => ({ score, pv: [uci] })) })
  const analyses = [
    at(fens[0], [cp(30), 'e2e4']),
    at(fens[1], [cp(30), 'e7e5']),
    at(fens[2], [cp(30), 'g1f3']),
    at(fens[3], [cp(20), 'g8f6']),
    at(fens[4], [cp(25), 'g1f3']),
    at(fens[5], [cp(0), 'd8e7']),
    at(fens[6], [{ kind: 'mate', mate: 1 }, 'h5f7']),
    { fen: fens[7], depth: 16, lines: [{ score: terminalScore(fens[7])!, pv: [] }] },
  ]
  const review = buildReview('g', moves, analyses, book)

  it('counts a mate the player found, from White', () => {
    const t = tactics([{ review, side: 'white', endTime: 0, chessComAccuracy: null }])
    expect(t.matesFound).toBe(1)
    expect(t.matesMissed).toBe(0)
  })

  it('splits move quality and accuracy by the player side only', () => {
    const q = moveQuality([{ review, side: 'black', endTime: 0, chessComAccuracy: null }])
    expect(q.get('blunder')).toBeCloseTo(1 / 3)
    const byMove = accuracyByMove([{ review, side: 'black', endTime: 0, chessComAccuracy: null }])
    expect(byMove[0].moves).toBe(3)
  })
})
