import type { ChessComGame } from '../chesscom/api'
import { bookDepth, type Book } from '../openings/book'
import { parsePgn, parseTimeControl } from './pgn'

export type Side = 'white' | 'black'
export type Outcome = 'won' | 'drawn' | 'lost'
export type Phase = 'opening' | 'middlegame' | 'endgame'
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'

/** One game reduced to what the history stats need, from the player's side. */
export type GameFacts = {
  id: string
  url: string
  /** Unix seconds, from the PGN's UTCDate and UTCTime; endTime when they're missing */
  startTime: number
  endTime: number
  timeClass: string
  rated: boolean
  side: Side
  outcome: Outcome
  /** chess.com result code that decided the game: checkmated, resigned, timeout, agreed, ... */
  how: string
  /** chess.com records ratings after the game, so these already include its result */
  myRating: number
  oppRating: number
  /** Ratings going into the game; see withPreGameRatings */
  myRatingBefore: number
  oppRatingBefore: number
  opponent: string
  sans: string[]
  /** Lichess opening name, e.g. "Caro-Kann Defense: Exchange Variation" */
  opening: string | null
  /** The part before the colon, e.g. "Caro-Kann Defense" */
  family: string | null
  /** How many of the game's first moves (both sides, in plies) were book */
  bookPlies: number
  castled: { side: 'short' | 'long'; move: number } | null
  pieceMoves: Record<PieceType, number>
  endPhase: Phase
  clock: ClockFacts | null
}

export type ClockFacts = {
  base: number
  increment: number
  /** Seconds the player spent on each of their moves */
  spent: number[]
  /** Seconds left on the player's clock after their last move */
  left: number | null
  /** Lowest point as a share of the starting time, 0..1 */
  lowest: number | null
}

const DRAW_CODES = ['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']

export function factsOf(game: ChessComGame, me: string, book: Book): GameFacts {
  const side: Side = game.black.username.toLowerCase() === me.toLowerCase() ? 'black' : 'white'
  const mine = side === 'white' ? game.white : game.black
  const theirs = side === 'white' ? game.black : game.white
  const outcome: Outcome = mine.result === 'win' ? 'won' : DRAW_CODES.includes(mine.result) ? 'drawn' : 'lost'
  const how = outcome === 'won' ? theirs.result : mine.result

  const { headers, sans, clocks } = parsePgn(game.pgn)
  const { plies: bookPlies, opening } = bookDepth(book, sans)
  const myIndex = side === 'white' ? 0 : 1
  const myPlies = sans.map((_, i) => i).filter((i) => i % 2 === myIndex)

  const pieceMoves: Record<PieceType, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 }
  let castled: GameFacts['castled'] = null
  for (const i of myPlies) {
    const san = sans[i]
    if (san.startsWith('O-O')) {
      pieceMoves.k++
      castled ??= { side: san.startsWith('O-O-O') ? 'long' : 'short', move: Math.floor(i / 2) + 1 }
    } else {
      pieceMoves[pieceOf(san)]++
    }
  }

  return {
    id: game.uuid,
    url: game.url,
    startTime: startOf(headers) ?? game.endTime,
    endTime: game.endTime,
    timeClass: game.timeClass,
    rated: game.rated,
    side,
    outcome,
    how,
    myRating: mine.rating,
    oppRating: theirs.rating,
    myRatingBefore: mine.rating,
    oppRatingBefore: theirs.rating,
    opponent: theirs.username,
    sans,
    opening: opening?.name ?? null,
    family: opening ? opening.name.split(':')[0] : null,
    bookPlies,
    castled,
    pieceMoves,
    endPhase: phaseOfFinalPosition(headers.CurrentPosition, sans.length),
    clock: clockFacts(game.timeControl, clocks, myPlies),
  }
}

/**
 * Recovers the ratings each game was played at. chess.com's API gives ratings
 * after the game (a win always shows a higher number than the game before), so
 * comparing them directly makes beaten opponents look weaker than they were.
 * The player's rating going in is their rating after their previous rated game
 * in the same time control; the opponent's is their rating after, moved back by
 * the player's change, since the two changes are close to equal and opposite.
 */
export function withPreGameRatings(games: GameFacts[]): GameFacts[] {
  const last = new Map<string, number>()
  const before = new Map<string, number>()
  for (const g of [...games].sort((a, b) => a.endTime - b.endTime)) {
    if (!g.rated) continue
    const prev = last.get(g.timeClass)
    if (prev !== undefined) before.set(g.id, prev)
    last.set(g.timeClass, g.myRating)
  }
  return games.map((g) => {
    const mine = before.get(g.id)
    if (mine === undefined) return g
    return { ...g, myRatingBefore: mine, oppRatingBefore: g.oppRating + (g.myRating - mine) }
  })
}

export function pieceOf(san: string): PieceType {
  const c = san[0]
  if (c === 'N') return 'n'
  if (c === 'B') return 'b'
  if (c === 'R') return 'r'
  if (c === 'Q') return 'q'
  if (c === 'K' || san.startsWith('O-O')) return 'k'
  return 'p'
}

/**
 * Which phase a game ended in, from its final position. Endgame once at most six
 * knights, bishops, rooks and queens are left on the board in total, the rule of
 * thumb Lichess uses; opening when it ended inside the first 12 moves with more
 * than that on the board; middlegame otherwise.
 */
export function phaseOfFinalPosition(fen: string | undefined, plies: number): Phase {
  if (fen) {
    const placement = fen.split(' ')[0]
    const pieces = placement.replace(/[^nbrqNBRQ]/g, '').length
    if (pieces <= 6) return 'endgame'
  }
  return plies <= 24 ? 'opening' : 'middlegame'
}

function startOf(headers: Record<string, string>): number | null {
  const d = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(headers.UTCDate ?? '')
  const t = /^(\d{2}):(\d{2}):(\d{2})$/.exec(headers.UTCTime ?? '')
  if (!d || !t) return null
  return Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2], +t[3]) / 1000
}

function clockFacts(timeControl: string, clocks: (number | null)[], myPlies: number[]): ClockFacts | null {
  const tc = parseTimeControl(timeControl)
  if (!tc) return null
  const mine = myPlies.map((i) => clocks[i])
  if (mine.every((c) => c === null)) return null
  const spent: number[] = []
  let prev = tc.base
  let lowest = tc.base
  for (const c of mine) {
    if (c === null) continue
    spent.push(Math.max(0, prev - c + tc.increment))
    prev = c
    lowest = Math.min(lowest, c)
  }
  const last = [...mine].reverse().find((c) => c !== null) ?? null
  return { base: tc.base, increment: tc.increment, spent, left: last, lowest: tc.base > 0 ? lowest / tc.base : null }
}
