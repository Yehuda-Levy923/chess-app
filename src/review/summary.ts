import { Chess, type Color } from 'chess.js'
import { pieceOf, type PieceType } from '../insights/facts'
import { LABELS } from './buildReview'
import { winPercentFor } from './accuracy'
import { mateFor } from './format'
import { allowsFork, hangs, makesPin } from './notes'
import { phaseGrades, phaseStarts } from './phases'
import type { Label, Review, Score } from './types'

// A review reduced to what the insights read, about 2 KB a game instead of
// 60 KB: per-ply arrays instead of move objects, and the tactical checks
// (which take a few milliseconds a move) worked out once when the review is
// saved, not every time the Insights screen opens.

/** Bump when the summary gains fields. */
export const SUMMARY_FORMAT = 3

/**
 * Summaries older than this are rebuilt from their reviews. Format 2 lacks
 * only what format 3 added (pins and phases), so it stays: rebuilding ten
 * thousand summaries means reading every full review back out of the cache.
 * The review workflow's resummarize run brings them up to date instead, and
 * insights that need the newer fields use only the summaries that have them.
 */
export const MIN_SUMMARY_FORMAT = 2

export type GameSummary = {
  /** Missing on the first format */
  format?: number
  gameId: string
  version: number
  depth: number
  accuracy: { w: number; b: number }
  opening: string | null
  /** Ply number of the first move, normally 1; later for games set up from a position */
  firstPly: number
  firstColor: Color
  /** One letter per ply; read it with labelAt */
  labels: string
  /** One letter per ply: p n b r q k */
  pieces: string
  /** Per-move accuracy, 0..100, one decimal */
  moveAccuracy: number[]
  /** Expected points lost, 0..1, three decimals */
  loss: number[]
  /** Seconds on the mover's clock after the move */
  clock: (number | null)[]
  /** TACTIC bit flags per ply */
  tactics: number[]
  /** White's win percent before the first move, then after each ply, rounded */
  winPercent: number[]
  /** Format 3: where the middlegame and endgame begin, as ply indexes, null when the game never got there */
  phases?: [number | null, number | null]
  /** Format 3: each side's accuracy in the opening, middlegame and endgame, null under two moves */
  phaseAccuracy?: { w: (number | null)[]; b: (number | null)[] }
}

export const TACTIC = {
  /** The best move started a forced mate for the mover */
  mateAvailable: 1,
  /** ...and the move played kept it (or was mate) */
  mateFound: 2,
  /** The best move forked two of the opponent's pieces */
  forkAvailable: 4,
  forkFound: 8,
  /** A bad move that left material to be won */
  hung: 16,
  /** Format 3: the best move pinned a piece and stood clearly above the second-best */
  pinAvailable: 32,
  pinFound: 64,
} as const

const PIN_BITS = TACTIC.pinAvailable | TACTIC.pinFound
/** How far the best move has to stand above the second-best, in win percent, to count as a pin to find. */
const PIN_MARGIN = 10

// One letter per entry of LABELS, in the same order.
const LABEL_CODES = 'BGbegkimMx'
const BAD: Label[] = ['inaccuracy', 'mistake', 'miss', 'blunder']
const GOOD_ENOUGH: Label[] = ['brilliant', 'great', 'best', 'excellent']

export function labelAt(s: GameSummary, i: number): Label {
  return LABELS[LABEL_CODES.indexOf(s.labels[i])]
}

export function colorAt(s: GameSummary, i: number): Color {
  return (i % 2 === 0) === (s.firstColor === 'w') ? 'w' : 'b'
}

export function moveNumberAt(s: GameSummary, i: number): number {
  return Math.ceil((s.firstPly + i) / 2)
}

export function pieceAt(s: GameSummary, i: number): PieceType {
  return s.pieces[i] as PieceType
}

/** The mover's win percent before ply i, 0..100. */
export function moverWinPercentBefore(s: GameSummary, i: number): number {
  const w = s.winPercent[i]
  return colorAt(s, i) === 'w' ? w : 100 - w
}

/**
 * `tactics` passes in flags worked out before, such as by the review workflow,
 * so a summary can be brought up to date without redoing the slow checks.
 */
export function summarize(review: Review, known: { tactics?: number[] } = {}): GameSummary {
  // Flags from an older summary keep their slow checks; the pin check is quick and always redone.
  const flags =
    known.tactics?.length === review.moves.length ? known.tactics.map((f, i) => (f & ~PIN_BITS) | pinFlags(review, i)) : tacticFlags(review)
  const { middlegame, endgame } = phaseStarts(review)
  const grades = phaseGrades(review)
  const round = (x: number | undefined) => (x === undefined ? null : Math.round(x * 10) / 10)
  const phaseAccuracy = {
    w: [round(grades.w.opening?.accuracy), round(grades.w.middlegame?.accuracy), round(grades.w.endgame?.accuracy)],
    b: [round(grades.b.opening?.accuracy), round(grades.b.middlegame?.accuracy), round(grades.b.endgame?.accuracy)],
  }
  return {
    format: SUMMARY_FORMAT,
    gameId: review.gameId,
    version: review.version ?? 1,
    depth: review.depth,
    accuracy: review.accuracy,
    opening: review.opening,
    firstPly: review.moves[0]?.ply ?? 1,
    firstColor: review.moves[0]?.color ?? 'w',
    labels: review.moves.map((m) => LABEL_CODES[LABELS.indexOf(labelOf(m))]).join(''),
    pieces: review.moves.map((m) => pieceOf(m.san)).join(''),
    moveAccuracy: review.moves.map((m) => Math.round(m.accuracy * 10) / 10),
    loss: review.moves.map((m) => Math.round(m.loss * 1000) / 1000),
    clock: review.moves.map((m) => m.clock ?? null),
    tactics: flags,
    winPercent: [review.initialWinPercent, ...review.moves.map((m) => m.winPercentAfter)].map(Math.round),
    phases: [middlegame, endgame],
    phaseAccuracy,
  }
}

/**
 * The move's label, with one correction for reviews made before version 4:
 * the only legal move isn't brilliant, however much it leaves hanging. Newer
 * reviews never label it so; this lets a summary rebuild fix the older ones
 * without rebuilding their reviews.
 */
function labelOf(m: Review['moves'][number]): Label {
  if (m.label !== 'brilliant') return m.label
  return new Chess(m.fenBefore).moves().length === 1 ? 'best' : 'brilliant'
}

function tacticFlags(review: Review): number[] {
  return review.moves.map((m, i) => {
    const them: Color = m.color === 'w' ? 'b' : 'w'
    const ok = GOOD_ENOUGH.includes(m.label)
    let f = 0
    if (mateFor(m.scoreBest, m.color) !== null) f |= TACTIC.mateAvailable | (ok && stillMating(m.scoreAfter, m.color) ? TACTIC.mateFound : 0)
    if (m.bestUci && allowsFork(m.fenBefore, m.bestUci, them)) f |= TACTIC.forkAvailable | (ok ? TACTIC.forkFound : 0)
    if (BAD.includes(m.label) && hangs(m.fenAfter, m.color)) f |= TACTIC.hung
    return f | pinFlags(review, i)
  })
}

/**
 * A pin to find: the engine's move pins something, it isn't a book move, and
 * the second-best move is clearly worse, so the pin was the point. Reviews
 * without the stored engine lines can't tell, so they get no pin flags.
 */
function pinFlags(review: Review, i: number): number {
  const m = review.moves[i]
  const lines = review.analyses?.[i]?.lines
  if (!m.bestUci || m.label === 'book' || !lines?.[1]) return 0
  if (winPercentFor(lines[0].score, m.color) - winPercentFor(lines[1].score, m.color) < PIN_MARGIN) return 0
  if (!makesPin(m.fenBefore, m.bestUci)) return 0
  return TACTIC.pinAvailable | (GOOD_ENOUGH.includes(m.label) ? TACTIC.pinFound : 0)
}

/** Still on course for mate after the move, or the move itself was mate. */
function stillMating(after: Score, me: Color): boolean {
  if (after.kind === 'over') return after.result === (me === 'w' ? '1-0' : '0-1')
  return mateFor(after, me) !== null
}
