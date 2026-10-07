import type { GameFacts, Side } from '../insights/facts'
import { performance, type Performance } from './findings'

// View helpers for the Openings tab: which games went through a line, and
// where an opening family usually starts so the tree can jump there.

/** Games whose moves begin with `path`. */
export function gamesThrough(games: GameFacts[], path: string[]): GameFacts[] {
  return games.filter((g) => path.every((san, i) => g.sans[i] === san))
}

/**
 * The moves most of a family's games share from the start: keep adding the
 * commonest next move while at least `share` of the games still follow it.
 */
export function typicalLine(games: GameFacts[], share = 0.6, maxPlies = 10): string[] {
  const path: string[] = []
  let current = games
  while (path.length < maxPlies && current.length) {
    const counts = new Map<string, number>()
    for (const g of current) {
      const san = g.sans[path.length]
      if (san) counts.set(san, (counts.get(san) ?? 0) + 1)
    }
    const [best, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0]
    if (!best || n < games.length * share) break
    path.push(best)
    current = current.filter((g) => g.sans[path.length - 1] === best)
  }
  return path
}

export type OpeningRow = Performance & { family: string; facts: GameFacts[] }

/** Opening families played as `side`, with each one's result against expectation. */
export function openingRows(games: GameFacts[], side: Side, minGames = 10): OpeningRow[] {
  const groups = new Map<string, GameFacts[]>()
  for (const g of games) {
    if (g.side !== side || !g.family) continue
    const list = groups.get(g.family) ?? []
    list.push(g)
    groups.set(g.family, list)
  }
  return [...groups.entries()].filter(([, list]) => list.length >= minGames).map(([family, list]) => ({ family, facts: list, ...performance(list) }))
}
