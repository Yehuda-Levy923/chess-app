// chess.com Published-Data API: read-only, no key. Requests are made one after
// another because parallel requests can be rate limited.

const BASE = 'https://api.chess.com/pub'

export type ChessComPlayer = { username: string; rating: number; result: string }

export type ChessComGame = {
  uuid: string
  url: string
  pgn: string
  timeClass: string
  timeControl: string
  rated: boolean
  rules: string
  endTime: number
  white: ChessComPlayer
  black: ChessComPlayer
  /** chess.com's own Game Review accuracy, present when the game was reviewed there */
  accuracies: { white: number; black: number } | null
}

export class ChessComError extends Error {}

type RawPlayer = { username: string; rating: number; result: string }
type RawGame = {
  uuid: string
  url: string
  pgn?: string
  time_class: string
  time_control: string
  rated: boolean
  rules: string
  end_time: number
  white: RawPlayer
  black: RawPlayer
  accuracies?: { white: number; black: number }
}

async function get<T>(path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`)
  } catch {
    throw new ChessComError("Couldn't reach chess.com. Check your connection.")
  }
  if (res.status === 404) throw new ChessComError('No chess.com player with that username.')
  if (res.status === 429) throw new ChessComError('chess.com is rate limiting requests. Wait a minute and retry.')
  if (!res.ok) throw new ChessComError(`chess.com answered ${res.status}.`)
  return (await res.json()) as T
}

/** Monthly archive URLs, newest first. */
export async function fetchArchives(username: string): Promise<string[]> {
  const { archives } = await get<{ archives: string[] }>(`/player/${encodeURIComponent(username.trim().toLowerCase())}/games/archives`)
  return [...archives].reverse()
}

/** Standard-chess games with a PGN from one monthly archive, newest first. */
export async function fetchMonth(archiveUrl: string): Promise<ChessComGame[]> {
  const path = archiveUrl.replace(BASE, '')
  const { games } = await get<{ games: RawGame[] }>(path)
  return parseGames(games)
}

export function parseGames(games: RawGame[]): ChessComGame[] {
  return games
    .filter((g) => g.rules === 'chess' && g.pgn)
    .map((g) => ({
      uuid: g.uuid,
      url: g.url,
      pgn: g.pgn!,
      timeClass: g.time_class,
      timeControl: g.time_control,
      rated: g.rated,
      rules: g.rules,
      endTime: g.end_time,
      white: { username: g.white.username, rating: g.white.rating, result: g.white.result },
      black: { username: g.black.username, rating: g.black.rating, result: g.black.result },
      accuracies: g.accuracies ?? null,
    }))
    .sort((a, b) => b.endTime - a.endTime)
}

/** "January 2026" from ".../games/2026/01" */
export function archiveLabel(archiveUrl: string): string {
  const [year, month] = archiveUrl.split('/').slice(-2).map(Number)
  return new Date(year, month - 1, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' })
}
