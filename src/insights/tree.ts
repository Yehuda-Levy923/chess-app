import type { GameFacts } from './facts'
import { add, emptyRecord, type Record3 } from './stats'

// The player's own opening tree: every move order they've reached, with results
// from their side. Keyed by move order, like the opening book, so transpositions
// stay on separate branches.

export type TreeNode = { record: Record3; children: Map<string, TreeNode>; lastPlayed: number }

export function buildTree(games: GameFacts[], maxPlies = 30): TreeNode {
  const root: TreeNode = { record: emptyRecord(), children: new Map(), lastPlayed: 0 }
  for (const g of games) {
    let node = root
    add(node.record, g.outcome)
    node.lastPlayed = Math.max(node.lastPlayed, g.endTime)
    for (const san of g.sans.slice(0, maxPlies)) {
      const key = san.replace(/[+#]$/, '')
      let next = node.children.get(key)
      if (!next) {
        next = { record: emptyRecord(), children: new Map(), lastPlayed: 0 }
        node.children.set(key, next)
      }
      node = next
      add(node.record, g.outcome)
      node.lastPlayed = Math.max(node.lastPlayed, g.endTime)
    }
  }
  return root
}

/** The node reached by a path of SAN moves, or null when the player never got there. */
export function nodeAt(root: TreeNode, path: string[]): TreeNode | null {
  let node: TreeNode | undefined = root
  for (const san of path) {
    node = node.children.get(san)
    if (!node) return null
  }
  return node
}

export type Branch = { san: string; node: TreeNode; share: number }

/** A node's continuations, most played first. */
export function branches(node: TreeNode): Branch[] {
  const total = node.record.games
  return [...node.children]
    .map(([san, child]) => ({ san, node: child, share: total ? child.record.games / total : 0 }))
    .sort((a, b) => b.node.record.games - a.node.record.games)
}
