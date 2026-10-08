import type { ReviewedGame } from './engineStats'

// How often a winning position became a win, and a losing one was saved, from
// the engine's win percent after each ply of the reviewed games.

export type ConversionGroup = {
  games: number
  won: number
  drawn: number
  lost: number
  /** Of `lost`, how many were lost on time rather than on the board */
  lostOnTime: number
  gameIds: string[]
}

export type ConversionSides = { winning: ConversionGroup; losing: ConversionGroup }

export type Conversion = {
  me: ConversionSides
  /**
   * The same games from the opponent's side. opponents.winning is the games in
   * me.losing with the result flipped, and the other way round, so it isn't an
   * independent sample: it answers "when your opponents got winning against
   * you, how often did they finish it", next to how often you did.
   */
  opponents: ConversionSides
  byTimeClass: Record<string, { me: ConversionSides; opponents: ConversionSides }>
}

export type ConversionOptions = {
  /** Win percent, from the player's side, that counts as winning */
  winning?: number
  /** ...and as losing */
  losing?: number
  /** Ignore swings before this ply, where book lines and early tactics bounce the evaluation */
  fromPly?: number
}

/**
 * A game counts as winning for the player when, at some ply from `fromPly` on,
 * their win percent reached `winning`; losing when it fell to `losing`. A game
 * with a big swing can be in both. Converted means won; saved means won or
 * drawn. Games whose summary has no win percents are skipped.
 */
export function conversion(games: ReviewedGame[], { winning = 80, losing = 20, fromPly = 16 }: ConversionOptions = {}): Conversion {
  const all = sides()
  const byTimeClass: Conversion['byTimeClass'] = {}
  for (const g of games) {
    const w = g.summary.winPercent
    if (!w) continue
    const mine = g.facts.side === 'white' ? w : w.map((x) => 100 - x)
    // winPercent[k] is the position after ply firstPly - 1 + k (index 0 is the start).
    const later = mine.slice(Math.max(0, fromPly - g.summary.firstPly + 1))
    const wasWinning = later.some((x) => x >= winning)
    const wasLosing = later.some((x) => x <= losing)
    if (!wasWinning && !wasLosing) continue
    const tc = (byTimeClass[g.facts.timeClass] ??= sides())
    for (const s of [all, tc]) {
      if (wasWinning) {
        add(s.me.winning, g, false)
        add(s.opponents.losing, g, true)
      }
      if (wasLosing) {
        add(s.me.losing, g, false)
        add(s.opponents.winning, g, true)
      }
    }
  }
  return { ...all, byTimeClass }
}

function sides(): { me: ConversionSides; opponents: ConversionSides } {
  return { me: { winning: empty(), losing: empty() }, opponents: { winning: empty(), losing: empty() } }
}

function empty(): ConversionGroup {
  return { games: 0, won: 0, drawn: 0, lost: 0, lostOnTime: 0, gameIds: [] }
}

/** `flip` counts the game from the opponent's side. */
function add(group: ConversionGroup, g: ReviewedGame, flip: boolean) {
  const outcome = g.facts.outcome
  const won = flip ? outcome === 'lost' : outcome === 'won'
  const lost = flip ? outcome === 'won' : outcome === 'lost'
  group.games++
  group.gameIds.push(g.facts.id)
  if (won) group.won++
  else if (lost) {
    group.lost++
    // facts.how is the code that decided the game, whoever lost it.
    if (g.facts.how === 'timeout') group.lostOnTime++
  } else group.drawn++
}
