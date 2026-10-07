// Ported from Lichess: scalachess eval.scala (WinPercent), lila
// AccuracyPercent.scala and scalalib Maths.scala. The default constants are
// theirs; scripts/calibrate-fit.mjs can search for ones that track chess.com.
import type { Color } from 'chess.js'
import type { Score } from './types'

export type AccuracyParams = {
  /** How fast centipawns turn into winning chances */
  winK: number
  cpCeiling: number
  /** Per-move accuracy = scale * e^(-decay * lost%) + base + offset */
  scale: number
  decay: number
  base: number
  offset: number
  /** Share of the game figure taken from the harmonic mean; the rest is the volatility-weighted mean */
  harmonicWeight: number
}

/** Lichess's constants. Win percent for move labels and the eval graph still uses these. */
export const DEFAULT_ACCURACY: AccuracyParams = {
  winK: 0.00368208,
  cpCeiling: 1000,
  scale: 103.1668100711649,
  decay: 0.04354415386753951,
  base: -3.166924740191411,
  offset: 1,
  harmonicWeight: 0.5,
}

/**
 * Constants fitted to chess.com's accuracy on 80 of one player's games that
 * chess.com reviewed (scripts/calibrate-fit.mjs). In four-fold cross-validation
 * the average gap to chess.com fell from 7.95 points (Lichess constants) to
 * 6.29, and every fold improved. The steady finding was dropping the harmonic
 * mean, which drags a game's figure down hard for a single blunder. Used for
 * accuracy figures only; move labels were not part of the fit.
 */
export const CHESSCOM_ACCURACY: AccuracyParams = {
  ...DEFAULT_ACCURACY,
  winK: 0.0045,
  offset: -3,
  harmonicWeight: 0,
}

/** White-POV win percent, 0..100. Mates count as the centipawn ceiling, as Lichess does. */
export function winPercent(score: Score, p: AccuracyParams = DEFAULT_ACCURACY): number {
  if (score.kind === 'over') {
    if (score.result === '1-0') return 100
    if (score.result === '0-1') return 0
    return 50
  }
  const cp = score.kind === 'mate' ? Math.sign(score.mate) * p.cpCeiling : clamp(score.cp, -p.cpCeiling, p.cpCeiling)
  const chances = clamp(2 / (1 + Math.exp(-p.winK * cp)) - 1, -1, 1)
  return 50 + 50 * chances
}

/** Win percent from one side's point of view. */
export function winPercentFor(score: Score, color: Color, p: AccuracyParams = DEFAULT_ACCURACY): number {
  const wp = winPercent(score, p)
  return color === 'w' ? wp : 100 - wp
}

/** Accuracy of a single move from the mover's win percent before and after it. */
export function moveAccuracy(before: number, after: number, p: AccuracyParams = DEFAULT_ACCURACY): number {
  if (after >= before) return 100
  const raw = p.scale * Math.exp(-p.decay * (before - after)) + p.base
  return clamp(raw + p.offset, 0, 100)
}

/**
 * Game accuracy per side: a blend of a volatility-weighted mean and a harmonic
 * mean of move accuracies. `whiteWinPercents` starts with the initial position
 * and has one entry per position after each move.
 */
export function gameAccuracy(whiteWinPercents: number[], startColor: Color = 'w', p: AccuracyParams = DEFAULT_ACCURACY): { w: number; b: number } {
  const moves = whiteWinPercents.length - 1
  const windowSize = clamp(Math.floor(moves / 10), 2, 8)
  const firstWindow = whiteWinPercents.slice(0, windowSize)
  const windows: number[][] = []
  for (let i = 0; i < Math.min(windowSize, whiteWinPercents.length) - 2; i++) windows.push(firstWindow)
  for (let i = 0; i + windowSize <= whiteWinPercents.length; i++) windows.push(whiteWinPercents.slice(i, i + windowSize))
  if (whiteWinPercents.length < windowSize) windows.push(whiteWinPercents)
  const weights = windows.map((w) => clamp(standardDeviation(w), 0.5, 12))

  const bySide: Record<Color, [number, number][]> = { w: [], b: [] }
  for (let i = 0; i < moves; i++) {
    const color: Color = (i % 2 === 0) === (startColor === 'w') ? 'w' : 'b'
    const prev = whiteWinPercents[i]
    const next = whiteWinPercents[i + 1]
    const accuracy = color === 'w' ? moveAccuracy(prev, next, p) : moveAccuracy(100 - prev, 100 - next, p)
    bySide[color].push([accuracy, weights[i]])
  }

  const side = (pairs: [number, number][]) => {
    if (pairs.length === 0) return 0
    return (1 - p.harmonicWeight) * weightedMean(pairs) + p.harmonicWeight * harmonicMean(pairs.map(([a]) => a))
  }
  return { w: side(bySide.w), b: side(bySide.b) }
}

function standardDeviation(values: number[]): number {
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length)
}

function weightedMean(pairs: [number, number][]): number {
  let total = 0
  let weight = 0
  for (const [v, w] of pairs) {
    total += v * w
    weight += w
  }
  return weight === 0 ? 0 : total / weight
}

function harmonicMean(values: number[]): number {
  return values.length / values.reduce((s, v) => s + 1 / Math.max(1, v), 0)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
