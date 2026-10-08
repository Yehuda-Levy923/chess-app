import type { ChessComGame } from '../chesscom/api'

// How a game reads in a list: whose side, the result, and how it ended.

export type Result = 'won' | 'drawn' | 'lost'

export const RESULT_TEXT: Record<Result, string> = { won: 'Won', drawn: 'Draw', lost: 'Lost' }

const DRAWS = ['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']

/** A chess.com result code from one player's side. */
export function resultOf(result: string): Result {
  if (result === 'win') return 'won'
  if (DRAWS.includes(result)) return 'drawn'
  return 'lost'
}

export const HOW: Record<string, string> = {
  checkmated: 'by checkmate',
  resigned: 'by resignation',
  timeout: 'on time',
  abandoned: 'by abandonment',
  agreed: 'by agreement',
  repetition: 'by repetition',
  stalemate: 'by stalemate',
  insufficient: 'by insufficient material',
  '50move': 'by the 50-move rule',
  timevsinsufficient: 'on time against insufficient material',
}

export function outcomeText(g: ChessComGame): string {
  if (g.white.result === 'win') return `${g.white.username} won ${HOW[g.black.result] ?? ''}`.trim()
  if (g.black.result === 'win') return `${g.black.username} won ${HOW[g.white.result] ?? ''}`.trim()
  return `Drawn ${HOW[g.white.result] ?? ''}`.trim()
}

/** `me` lower-cased. */
export function sideOf(g: ChessComGame, me: string): 'white' | 'black' {
  return g.black.username.toLowerCase() === me ? 'black' : 'white'
}

export function myResult(g: ChessComGame, me: string): Result {
  return resultOf((sideOf(g, me) === 'white' ? g.white : g.black).result)
}

export function opponentOf(g: ChessComGame, me: string) {
  return sideOf(g, me) === 'white' ? g.black : g.white
}

/** "7 Oct", with the year only when it isn't this year's. */
export function shortDate(seconds: number, withYear = false): string {
  const d = new Date(seconds * 1000)
  const year = withYear && d.getFullYear() !== new Date().getFullYear()
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) })
}

/** "October 2026" for a game's month. */
export function monthLabel(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}
