import type { MoveRef, ReviewedGame } from '../insights/engineStats'
import { colorAt, labelAt } from '../review/summary'
import type { Label } from '../review/types'
import type { Drill } from './GamesDrawer'

/** A drawer listing particular moves; each opens its game's review on that move. */
export function movesDrill(title: string, refs: MoveRef[], games: ReviewedGame[]): Drill {
  const byId = new Map(games.map((g) => [g.facts.id, g]))
  const ids = [...new Set(refs.map((r) => r.gameId))]
  return {
    title,
    games: ids.flatMap((id) => byId.get(id)?.facts ?? []),
    moments: refs.flatMap((r) => {
      const g = byId.get(r.gameId)
      return g ? [{ id: r.gameId, ply: g.summary.firstPly + r.index }] : []
    }),
  }
}

/** A drawer listing whole games. */
export function gamesDrill(title: string, ids: string[], games: ReviewedGame[]): Drill {
  const byId = new Map(games.map((g) => [g.facts.id, g.facts]))
  return { title, games: ids.flatMap((id) => byId.get(id) ?? []) }
}

/** Your moves with this label. */
export function labelled(games: ReviewedGame[], label: Label): MoveRef[] {
  return games.flatMap((g) => {
    const mine = g.facts.side === 'white' ? 'w' : 'b'
    const s = g.summary
    const out: MoveRef[] = []
    for (let i = 0; i < s.labels.length; i++) if (colorAt(s, i) === mine && labelAt(s, i) === label) out.push({ gameId: g.facts.id, index: i })
    return out
  })
}
