import type { Label } from './types'

/** Everything the classifier needs about one move. Win percents are from the mover's side. */
export type MoveFacts = {
  isBest: boolean
  /** Eval of the position before the move, i.e. what the best move keeps */
  wpBefore: number
  /** Eval after the move actually played */
  wpAfter: number
  /** Eval of the engine's second choice, when there was one */
  wpSecond: number | null
  inBook: boolean
  /** Material the opponent can win right after the move, minus what the move captured */
  sacrifice: number
  isRecapture: boolean
  legalMoves: number
  /** Expected points the opponent threw away on the move just before this one */
  opponentLoss: number | null
}

// chess.com's published expected-points cutoffs.
const EXCELLENT = 0.02
const GOOD = 0.05
const INACCURACY = 0.1
const MISTAKE = 0.2

// Ours. Tune against real games.
const ONLY_MOVE_GAP = 10
const ALREADY_WINNING = 90
const BRILLIANT_FLOOR = 40
const MIN_SACRIFICE = 2

export function expectedPointsLoss(f: Pick<MoveFacts, 'wpBefore' | 'wpAfter'>): number {
  return Math.max(0, f.wpBefore - f.wpAfter) / 100
}

export function classify(f: MoveFacts): Label {
  if (f.inBook) return 'book'
  const loss = expectedPointsLoss(f)
  const base = baseLabel(f.isBest, loss)

  if (
    (base === 'best' || base === 'excellent') &&
    f.sacrifice >= MIN_SACRIFICE &&
    f.wpBefore < ALREADY_WINNING &&
    f.wpAfter >= BRILLIANT_FLOOR
  ) {
    return 'brilliant'
  }

  if (
    base === 'best' &&
    f.wpSecond !== null &&
    f.wpBefore - f.wpSecond >= ONLY_MOVE_GAP &&
    f.wpBefore < ALREADY_WINNING + 5 &&
    !f.isRecapture &&
    f.legalMoves > 1
  ) {
    return 'great'
  }

  if (
    (base === 'inaccuracy' || base === 'mistake') &&
    f.opponentLoss !== null &&
    f.opponentLoss >= INACCURACY &&
    loss >= f.opponentLoss / 2
  ) {
    return 'miss'
  }

  return base
}

function baseLabel(isBest: boolean, loss: number): Label {
  if (isBest) return 'best'
  if (loss <= EXCELLENT) return 'excellent'
  if (loss <= GOOD) return 'good'
  if (loss <= INACCURACY) return 'inaccuracy'
  if (loss <= MISTAKE) return 'mistake'
  return 'blunder'
}
