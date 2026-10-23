import type { Color } from 'chess.js'
import { estimateRating } from '../review/gameRating'
import { colorAt, labelAt, moveNumberAt, TACTIC, type GameSummary } from '../review/summary'
import type { MoveRef, ReviewedGame } from './engineStats'
import type { Outcome, Phase } from './facts'

// The parts of chess.com's Insights and Advanced Stats that our own data can
// answer honestly: game shapes, castling by phase, accuracy and a played-like
// rating per phase, accuracy by move number, and tactics from both sides.
// Pins and phases only exist in summaries of format 3 and up; the functions
// that need them skip older ones and say how many they used.

const POINTS: Record<Outcome, number> = { won: 1, drawn: 0.5, lost: 0 }
const PHASES: Phase[] = ['opening', 'middlegame', 'endgame']

const colorOf = (g: ReviewedGame): Color => (g.facts.side === 'white' ? 'w' : 'b')
const hasPhases = (s: GameSummary) => (s.format ?? 1) >= 3 && !!s.phases && !!s.phaseAccuracy

// ---------------------------------------------------------------- game shapes

export type Shape = 'control' | 'comeback' | 'seesaw' | 'thrown' | 'outplayed' | 'close'

export const SHAPE_TEXT: Record<Shape, { name: string; means: string }> = {
  control: { name: 'In control', means: 'Won without ever being clearly worse' },
  comeback: { name: 'Comeback', means: 'Were losing, then saved or won it' },
  seesaw: { name: 'Back and forth', means: 'The advantage changed hands three or more times' },
  thrown: { name: 'Let it slip', means: 'Were winning, then drew or lost' },
  outplayed: { name: 'Outplayed', means: 'Lost without ever being clearly better' },
  close: { name: 'Close', means: 'Never far from equal, or a narrow swing either way' },
}

/** Your win percent through the game, from the first move after the opening's first five. */
function myCurve(g: ReviewedGame): number[] {
  const w = g.summary.winPercent ?? []
  const mine = colorOf(g) === 'w' ? w : w.map((x) => 100 - x)
  return mine.slice(Math.min(10, Math.max(0, mine.length - 1)))
}

/**
 * One shape per game, from your win percent over it. The advantage "changes
 * hands" when it goes from 65 or more for one side to 65 or more for the other.
 */
export function shapeOf(g: ReviewedGame): Shape {
  const curve = myCurve(g)
  if (curve.length === 0) return 'close'
  const peak = Math.max(...curve)
  const low = Math.min(...curve)
  let swings = 0
  let holder: 'me' | 'them' | null = null
  for (const x of curve) {
    const now = x >= 65 ? 'me' : x <= 35 ? 'them' : null
    if (now && holder && now !== holder) swings++
    if (now) holder = now
  }
  const outcome = g.facts.outcome
  if (swings >= 3) return 'seesaw'
  if (low <= 25 && outcome !== 'lost') return 'comeback'
  if (peak >= 75 && outcome !== 'won') return 'thrown'
  if (outcome === 'won' && low >= 40) return 'control'
  if (outcome === 'lost' && peak <= 60) return 'outplayed'
  return 'close'
}

export type ShapeRow = { shape: Shape; games: number; share: number; score: number; accuracy: number; gameIds: string[] }

export function gameShapes(games: ReviewedGame[]): ShapeRow[] {
  const by = new Map<Shape, ReviewedGame[]>()
  for (const g of games) {
    const s = shapeOf(g)
    by.set(s, [...(by.get(s) ?? []), g])
  }
  return (Object.keys(SHAPE_TEXT) as Shape[]).flatMap((shape) => {
    const list = by.get(shape) ?? []
    if (!list.length) return []
    return [
      {
        shape,
        games: list.length,
        share: list.length / games.length,
        score: list.reduce((s, g) => s + POINTS[g.facts.outcome], 0) / list.length,
        accuracy: list.reduce((s, g) => s + g.summary.accuracy[colorOf(g)], 0) / list.length,
        gameIds: list.map((g) => g.facts.id),
      },
    ]
  })
}

// ------------------------------------------------------------- castling phase

export type CastleWhen = Phase | 'never'

export type CastleRow = { when: CastleWhen; games: number; score: number; gameIds: string[] }

/** Which phase you castled in, by the summary's phase boundaries, with your score each way. */
export function castlingByPhase(games: ReviewedGame[]): { rows: CastleRow[]; used: number } {
  const by = new Map<CastleWhen, ReviewedGame[]>()
  let used = 0
  for (const g of games) {
    const s = g.summary
    if (!hasPhases(s)) continue
    used++
    let when: CastleWhen = 'never'
    const c = g.facts.castled
    if (c) {
      const index = (c.move - 1) * 2 + (g.facts.side === 'black' ? 1 : 0) - (s.firstPly - 1)
      const [mid, end] = s.phases!
      when = end !== null && index >= end ? 'endgame' : mid !== null && index >= mid ? 'middlegame' : 'opening'
    }
    by.set(when, [...(by.get(when) ?? []), g])
  }
  const rows = (['opening', 'middlegame', 'endgame', 'never'] as CastleWhen[]).flatMap((when) => {
    const list = by.get(when) ?? []
    return list.length ? [{ when, games: list.length, score: list.reduce((s, g) => s + POINTS[g.facts.outcome], 0) / list.length, gameIds: list.map((g) => g.facts.id) }] : []
  })
  return { rows, used }
}

// ---------------------------------------------------------- phase skill ratings

export type PhaseSkill = {
  phase: Phase
  /** Mean of your per-game accuracy in this phase */
  accuracy: number | null
  games: number
  /** What that accuracy plays like, from the same model as a review's "Played like" */
  rating: number | null
  /** The same for the 100 games before the latest 100, for the trend */
  earlierRating: number | null
}

export type SkillRow = { timeClass: string; games: number; phases: PhaseSkill[] }

/**
 * Per time control: your accuracy in each phase and the rating it plays like.
 * chess.com rates phases against players of your rating; with no data on other
 * players, this uses the accuracy-to-rating model fitted on chess.com games,
 * so it says what level the accuracy matches, not where you rank.
 */
export function phaseSkills(games: ReviewedGame[], { recent = 100 }: { recent?: number } = {}): SkillRow[] {
  const byClass = new Map<string, ReviewedGame[]>()
  for (const g of games) if (hasPhases(g.summary)) byClass.set(g.facts.timeClass, [...(byClass.get(g.facts.timeClass) ?? []), g])
  return [...byClass.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([timeClass, list]) => {
      const newestFirst = [...list].sort((a, b) => b.facts.endTime - a.facts.endTime)
      const latest = newestFirst.slice(0, recent)
      const earlier = newestFirst.slice(recent, recent * 2)
      const phases = PHASES.map((phase, p) => {
        const acc = mean(latest.flatMap((g) => g.summary.phaseAccuracy![colorOf(g)][p] ?? []))
        const before = earlier.length >= 30 ? mean(earlier.flatMap((g) => g.summary.phaseAccuracy![colorOf(g)][p] ?? [])) : null
        return {
          phase,
          accuracy: acc.mean,
          games: acc.n,
          rating: acc.mean === null || acc.n < 10 ? null : (estimateRating(acc.mean, timeClass, null)?.accuracyOnly ?? null),
          earlierRating: before?.mean == null || before.n < 10 ? null : (estimateRating(before.mean, timeClass, null)?.accuracyOnly ?? null),
        }
      })
      return { timeClass, games: list.length, phases }
    })
}

/** How many of these games have the format-3 fields (pins, phases). */
export function withPhases(games: ReviewedGame[]): number {
  return games.filter((g) => hasPhases(g.summary)).length
}

// ---------------------------------------------------------- accuracy by move no.

/** Your mean per-move accuracy at each move number, book moves left out. */
export function accuracyByMoveNumber(games: ReviewedGame[], upTo = 60): { move: number; accuracy: number; moves: number }[] {
  const sum = new Array<number>(upTo + 1).fill(0)
  const n = new Array<number>(upTo + 1).fill(0)
  for (const g of games) {
    const s = g.summary
    const me = colorOf(g)
    for (let i = 0; i < s.labels.length; i++) {
      if (colorAt(s, i) !== me || labelAt(s, i) === 'book') continue
      const no = moveNumberAt(s, i)
      if (no > upTo) break
      sum[no] += s.moveAccuracy[i]
      n[no]++
    }
  }
  return sum.flatMap((total, move) => (n[move] >= 20 ? [{ move, accuracy: total / n[move], moves: n[move] }] : []))
}

// ---------------------------------------------------------------------- tactics

export type TacticKind = 'mate' | 'fork' | 'pin'

export type TacticRow = {
  kind: TacticKind
  found: MoveRef[]
  missed: MoveRef[]
  /** Chances your move gave the opponent (index is their move), and the ones they took */
  allowed: MoveRef[]
  allowedTaken: MoveRef[]
}

const BITS: Record<TacticKind, [number, number]> = {
  mate: [TACTIC.mateAvailable, TACTIC.mateFound],
  fork: [TACTIC.forkAvailable, TACTIC.forkFound],
  pin: [TACTIC.pinAvailable, TACTIC.pinFound],
}

/**
 * Mates, forks and pins from both sides of the board. Pins come only from
 * format-3 summaries; `pinGames` says how many games that is.
 *
 * A chance counts once, on the move where it appears: a forced mate stays
 * available on every move of the mating line, and counting each of those
 * would turn one mate in five into five. Found or missed is decided on that
 * first move.
 */
export function tacticsBothWays(games: ReviewedGame[]): { rows: TacticRow[]; pinGames: number; hung: { mine: MoveRef[]; theirs: MoveRef[] } } {
  const rows = (Object.keys(BITS) as TacticKind[]).map((kind) => ({ kind, found: [] as MoveRef[], missed: [] as MoveRef[], allowed: [] as MoveRef[], allowedTaken: [] as MoveRef[] }))
  const hung = { mine: [] as MoveRef[], theirs: [] as MoveRef[] }
  let pinGames = 0
  for (const g of games) {
    const s = g.summary
    const me = colorOf(g)
    const pins = (s.format ?? 1) >= 3
    if (pins) pinGames++
    for (let i = 0; i < s.labels.length; i++) {
      const f = s.tactics[i]
      const at = { gameId: s.gameId, index: i }
      const mine = colorAt(s, i) === me
      if (f & TACTIC.hung) (mine ? hung.mine : hung.theirs).push(at)
      for (const row of rows) {
        if (row.kind === 'pin' && !pins) continue
        const [available, found] = BITS[row.kind]
        // The same side's previous move: if the chance was there already, this is the same one.
        if (!(f & available) || (i >= 2 && s.tactics[i - 2] & available)) continue
        if (mine) (f & found ? row.found : row.missed).push(at)
        else {
          row.allowed.push(at)
          if (f & found) row.allowedTaken.push(at)
        }
      }
    }
  }
  return { rows, pinGames, hung }
}

/** Your brilliant moves, newest game first, with what each one moved. */
export function brilliantMoves(games: ReviewedGame[]): (MoveRef & { piece: string; timeClass: string; endTime: number })[] {
  return [...games]
    .sort((a, b) => b.facts.endTime - a.facts.endTime)
    .flatMap((g) => {
      const s = g.summary
      const me = colorOf(g)
      const out = []
      for (let i = 0; i < s.labels.length; i++) {
        if (colorAt(s, i) === me && labelAt(s, i) === 'brilliant') out.push({ gameId: s.gameId, index: i, piece: s.pieces[i], timeClass: g.facts.timeClass, endTime: g.facts.endTime })
      }
      return out
    })
}

function mean(xs: number[]): { mean: number | null; n: number } {
  return { mean: xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null, n: xs.length }
}
