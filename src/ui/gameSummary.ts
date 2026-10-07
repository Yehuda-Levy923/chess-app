import type { ChessComGame } from '../chesscom/api'

// Cheap per-game facts for the games list, read from chess.com's PGN headers
// so a month of games doesn't have to be replayed move by move.

const header = (pgn: string, name: string): string | null => new RegExp(`\\[${name} "([^"]*)"\\]`).exec(pgn)?.[1] ?? null

/** The final position, from the [CurrentPosition] header. */
export function finalFen(g: Pick<ChessComGame, 'pgn'>): string | null {
  return header(g.pgn, 'CurrentPosition')
}

/** Full moves played, from the final position's move counter. */
export function moveCount(g: Pick<ChessComGame, 'pgn'>): number | null {
  const fen = finalFen(g)
  if (!fen) return null
  const [, turn, , , , full] = fen.split(' ')
  const n = Number(full)
  return Number.isFinite(n) ? (turn === 'w' ? n - 1 : n) : null
}

/**
 * "Ponziani Opening Jaenisch Counterattack" from chess.com's ECOUrl
 * (".../openings/Ponziani-Opening-Jaenisch-Counterattack-4.d4-exd4-5.e5"):
 * the words before the first move.
 */
export function openingName(g: Pick<ChessComGame, 'pgn'>): string | null {
  const url = header(g.pgn, 'ECOUrl')
  if (!url) return null
  const slug = url.split('/openings/')[1]
  if (!slug) return null
  const words: string[] = []
  for (const part of slug.split('-')) {
    if (/^\d+\./.test(part) || /^\d+\.\.\./.test(part)) break
    words.push(part)
  }
  return words.join(' ').replace(/\s+with\s*$/i, '') || null
}

export type RatingNow = { timeClass: string; rating: number; change: number; games: number; series: number[] }

/**
 * The player's latest rating in each time class among `games` (newest first),
 * how far it moved across them, and the rating after each game, oldest first.
 * chess.com stores ratings after each game, so the latest one is current.
 */
export function ratingsNow(games: ChessComGame[], me: string): RatingNow[] {
  const byClass = new Map<string, number[]>()
  for (const g of games) {
    const mine = g.black.username.toLowerCase() === me ? g.black : g.white
    const list = byClass.get(g.timeClass) ?? []
    list.push(mine.rating)
    byClass.set(g.timeClass, list)
  }
  return [...byClass.entries()]
    .map(([timeClass, newestFirst]) => {
      const series = [...newestFirst].reverse()
      return { timeClass, rating: newestFirst[0], change: newestFirst[0] - series[0], games: series.length, series }
    })
    .sort((a, b) => b.games - a.games)
}
