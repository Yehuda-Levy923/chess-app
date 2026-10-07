import type { Color } from 'chess.js'
import { CHESSCOM_ACCURACY, gameAccuracy, winPercent } from './accuracy'
import type { Label, Review, Score } from './types'

export type PhaseName = 'opening' | 'middlegame' | 'endgame'

export type PhaseGrade = { accuracy: number; moves: number; label: Label }

export type PhaseGrades = Record<PhaseName, PhaseGrade | null>

/**
 * Where the middlegame and endgame begin, as move indexes into review.moves,
 * following Lichess's divider: the middlegame once at most ten knights,
 * bishops, rooks and queens remain or either back rank has thinned to fewer
 * than four pieces; the endgame once at most six remain. Null when the game
 * never got there.
 */
export function phaseStarts(review: Review): { middlegame: number | null; endgame: number | null } {
  let middlegame: number | null = null
  let endgame: number | null = null
  review.moves.forEach((m, i) => {
    const placement = m.fenBefore.split(' ')[0]
    const pieces = placement.replace(/[^nbrqNBRQ]/g, '').length
    const ranks = placement.split('/')
    const backRank = (rank: string, upper: boolean) => rank.replace(/\d/g, '').split('').filter((c) => (upper ? c === c.toUpperCase() : c === c.toLowerCase())).length
    const sparse = backRank(ranks[7], true) < 4 || backRank(ranks[0], false) < 4
    if (middlegame === null && (pieces <= 10 || sparse)) middlegame = i
    if (endgame === null && pieces <= 6) endgame = i
  })
  if (endgame !== null && (middlegame === null || middlegame > endgame)) middlegame = endgame
  return { middlegame, endgame }
}

// Our thresholds; chess.com doesn't publish how it grades a phase.
export function gradeLabel(accuracy: number): Label {
  if (accuracy >= 95) return 'best'
  if (accuracy >= 85) return 'excellent'
  if (accuracy >= 70) return 'good'
  if (accuracy >= 55) return 'inaccuracy'
  if (accuracy >= 40) return 'mistake'
  return 'blunder'
}

/** Accuracy and a grade per phase for each side. A phase with under two of a side's moves gets null. */
export function phaseGrades(review: Review): Record<Color, PhaseGrades> {
  const n = review.moves.length
  const { middlegame, endgame } = phaseStarts(review)
  const ranges: Record<PhaseName, [number, number]> = {
    opening: [0, middlegame ?? endgame ?? n],
    middlegame: [middlegame ?? n, endgame ?? n],
    endgame: [endgame ?? n, n],
  }
  const out: Record<Color, PhaseGrades> = {
    w: { opening: null, middlegame: null, endgame: null },
    b: { opening: null, middlegame: null, endgame: null },
  }
  for (const phase of Object.keys(ranges) as PhaseName[]) {
    const [s, e] = ranges[phase]
    if (e - s < 1) continue
    const slice = review.moves.slice(s, e)
    // Same chess.com-fitted curve as the game figure, so the phases read on the same scale.
    const start: Score = s === 0 ? (review.initialScore ?? { kind: 'cp', cp: 0 }) : review.moves[s - 1].scoreAfter
    const series = [start, ...slice.map((m) => m.scoreAfter)].map((sc) => winPercent(sc, CHESSCOM_ACCURACY))
    const acc = gameAccuracy(series, slice[0].color, CHESSCOM_ACCURACY)
    for (const color of ['w', 'b'] as Color[]) {
      const moves = slice.filter((m) => m.color === color).length
      if (moves < 2) continue
      out[color][phase] = { accuracy: acc[color], moves, label: gradeLabel(acc[color]) }
    }
  }
  return out
}
