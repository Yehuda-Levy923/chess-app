import { Chess } from 'chess.js'
import type { Score } from './types'

/** "+1.8", "-0.4", "#3", "#-2", "1-0" */
export function formatScore(score: Score): string {
  if (score.kind === 'over') return score.result === '1/2-1/2' ? '½-½' : score.result
  if (score.kind === 'mate') return `#${score.mate}`
  const pawns = score.cp / 100
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`
}

export function uciToSan(fen: string, uci: string): string | null {
  try {
    const chess = new Chess(fen)
    return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san
  } catch {
    return null
  }
}

/** Mate distance in moves for `color`, or null when `score` is not a forced mate for them. */
export function mateFor(score: Score | null, color: 'w' | 'b'): number | null {
  if (!score || score.kind !== 'mate') return null
  const mine = color === 'w' ? score.mate > 0 : score.mate < 0
  return mine ? Math.abs(score.mate) : null
}
