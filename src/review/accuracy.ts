// Ported from Lichess: scalachess eval.scala (WinPercent), lila
// AccuracyPercent.scala and scalalib Maths.scala. Constants are theirs.
import type { Color } from 'chess.js'
import type { Score } from './types'

const CP_CEILING = 1000

/** White-POV win percent, 0..100. Mates count as the centipawn ceiling, as Lichess does. */
export function winPercent(score: Score): number {
  if (score.kind === 'over') {
    if (score.result === '1-0') return 100
    if (score.result === '0-1') return 0
    return 50
  }
  const cp = score.kind === 'mate' ? Math.sign(score.mate) * CP_CEILING : clamp(score.cp, -CP_CEILING, CP_CEILING)
  const chances = clamp(2 / (1 + Math.exp(-0.00368208 * cp)) - 1, -1, 1)
  return 50 + 50 * chances
}

/** Win percent from one side's point of view. */
export function winPercentFor(score: Score, color: Color): number {
  const wp = winPercent(score)
  return color === 'w' ? wp : 100 - wp
}

/** Accuracy of a single move from the mover's win percent before and after it. */
export function moveAccuracy(before: number, after: number): number {
  if (after >= before) return 100
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * (before - after)) - 3.166924740191411
  return clamp(raw + 1, 0, 100)
}

/**
 * Game accuracy per side: the mean of a volatility-weighted mean and a harmonic
 * mean of move accuracies. `whiteWinPercents` starts with the initial position
 * and has one entry per position after each move.
 */
export function gameAccuracy(whiteWinPercents: number[], startColor: Color = 'w'): { w: number; b: number } {
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
    const accuracy = color === 'w' ? moveAccuracy(prev, next) : moveAccuracy(100 - prev, 100 - next)
    bySide[color].push([accuracy, weights[i]])
  }

  const side = (pairs: [number, number][]) => {
    if (pairs.length === 0) return 0
    return (weightedMean(pairs) + harmonicMean(pairs.map(([a]) => a))) / 2
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
