import type { Color } from 'chess.js'
import { pieceOf, type PieceType } from '../insights/facts'
import { LABELS } from './buildReview'
import { mateFor } from './format'
import { allowsFork, hangs } from './notes'
import type { Label, Review, Score } from './types'

// A review reduced to what the insights read, about 2 KB a game instead of
// 60 KB: per-ply arrays instead of move objects, and the tactical checks
// (which take a few milliseconds a move) worked out once when the review is
// saved, not every time the Insights screen opens.

/** Bump when the summary gains fields; older summaries are rebuilt from their reviews. */
export const SUMMARY_FORMAT = 2

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
} as const

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
  const flags = known.tactics?.length === review.moves.length ? known.tactics : tacticFlags(review)
  return {
    format: SUMMARY_FORMAT,
    gameId: review.gameId,
    version: review.version ?? 1,
    depth: review.depth,
    accuracy: review.accuracy,
    opening: review.opening,
    firstPly: review.moves[0]?.ply ?? 1,
    firstColor: review.moves[0]?.color ?? 'w',
    labels: review.moves.map((m) => LABEL_CODES[LABELS.indexOf(m.label)]).join(''),
    pieces: review.moves.map((m) => pieceOf(m.san)).join(''),
    moveAccuracy: review.moves.map((m) => Math.round(m.accuracy * 10) / 10),
    loss: review.moves.map((m) => Math.round(m.loss * 1000) / 1000),
    clock: review.moves.map((m) => m.clock ?? null),
    tactics: flags,
    winPercent: [review.initialWinPercent, ...review.moves.map((m) => m.winPercentAfter)].map(Math.round),
  }
}

function tacticFlags(review: Review): number[] {
  return review.moves.map((m) => {
    const them: Color = m.color === 'w' ? 'b' : 'w'
    const ok = GOOD_ENOUGH.includes(m.label)
    let f = 0
    if (mateFor(m.scoreBest, m.color) !== null) f |= TACTIC.mateAvailable | (ok && stillMating(m.scoreAfter, m.color) ? TACTIC.mateFound : 0)
    if (m.bestUci && allowsFork(m.fenBefore, m.bestUci, them)) f |= TACTIC.forkAvailable | (ok ? TACTIC.forkFound : 0)
    if (BAD.includes(m.label) && hangs(m.fenAfter, m.color)) f |= TACTIC.hung
    return f
  })
}

/** Still on course for mate after the move, or the move itself was mate. */
function stillMating(after: Score, me: Color): boolean {
  if (after.kind === 'over') return after.result === (me === 'w' ? '1-0' : '0-1')
  return mateFor(after, me) !== null
}
