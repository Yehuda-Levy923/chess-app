// Opening book built from lichess-org/chess-openings (CC0). Matches by move
// order, so a transposition into a named line is not recognised.

export type Opening = { eco: string; name: string }

type Node = { children: Map<string, Node>; opening: Opening | null }

export type Book = Node

export function buildBook(tsvs: string[]): Book {
  const root: Node = { children: new Map(), opening: null }
  for (const tsv of tsvs) {
    for (const line of tsv.split('\n').slice(1)) {
      const [eco, name, pgn] = line.trim().split('\t')
      if (!pgn) continue
      let node = root
      for (const san of sanTokens(pgn)) {
        let next = node.children.get(san)
        if (!next) {
          next = { children: new Map(), opening: null }
          node.children.set(san, next)
        }
        node = next
      }
      node.opening = { eco, name }
    }
  }
  return root
}

/**
 * How many leading moves of `sans` are book moves, the most specific opening
 * named along the way, and which opening (if any) each book ply lands on.
 */
export function bookDepth(book: Book, sans: string[]): { plies: number; opening: Opening | null; byPly: (Opening | null)[] } {
  let node = book
  let opening: Opening | null = null
  const byPly: (Opening | null)[] = []
  for (const san of sans) {
    const next = node.children.get(stripAnnotations(san))
    if (!next) break
    node = next
    byPly.push(node.opening)
    if (node.opening) opening = node.opening
  }
  return { plies: byPly.length, opening, byPly }
}

function sanTokens(pgn: string): string[] {
  return pgn
    .split(/\s+/)
    .filter((t) => t && !/^\d+\.+$/.test(t))
    .map(stripAnnotations)
}

function stripAnnotations(san: string): string {
  return san.replace(/[+#!?]+$/, '')
}
