import type { Move } from 'chess.js'
import type { Engine } from '../stockfish/engine'
import { terminalScore } from './buildReview'
import type { PositionAnalysis } from './types'

/** Time cap per position. A full 70-position game then takes about two minutes at most. */
export const MAX_MS_PER_POSITION = 2000

/**
 * No position in a review is left shallower than this (or the depth asked for,
 * if lower): when the time cap stops a search short of it, the search goes on.
 * Below 15 the engine misses enough short tactics to mislabel moves.
 */
export const MIN_REVIEW_DEPTH = 15

/** Runs the engine over the start position and every position after a move. */
export async function analyseGame(
  engine: Pick<Engine, 'analyse' | 'newGame'>,
  moves: Move[],
  depth: number,
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<PositionAnalysis[]> {
  const fens = [moves[0]?.before ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', ...moves.map((m) => m.after)]
  await engine.newGame()
  const out: PositionAnalysis[] = []
  for (const fen of fens) {
    if (signal?.aborted) throw new DOMException('Review cancelled', 'AbortError')
    const over = terminalScore(fen)
    out.push(
      over
        ? { fen, depth, requestedDepth: depth, lines: [{ score: over, pv: [] }] }
        : await engine.analyse(fen, depth, MAX_MS_PER_POSITION, MIN_REVIEW_DEPTH),
    )
    onProgress(out.length, fens.length)
  }
  return out
}

/** Positions searched less deeply than MIN_REVIEW_DEPTH, such as in reviews saved before the floor existed. */
export function shallowPositions(analyses: PositionAnalysis[]): number[] {
  return analyses.flatMap((a, i) => {
    if (a.lines[0]?.score.kind === 'over') return []
    const floor = Math.min(MIN_REVIEW_DEPTH, a.requestedDepth ?? a.depth)
    return a.depth < floor ? [i] : []
  })
}

/**
 * Searches the shallow positions again up to the floor and returns the
 * analyses with them replaced, or null when none were shallow.
 */
export async function topUpAnalyses(
  engine: Pick<Engine, 'analyse' | 'newGame'>,
  analyses: PositionAnalysis[],
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<PositionAnalysis[] | null> {
  const shallow = shallowPositions(analyses)
  if (shallow.length === 0) return null
  await engine.newGame()
  const out = [...analyses]
  for (let k = 0; k < shallow.length; k++) {
    if (signal?.aborted) throw new DOMException('Review cancelled', 'AbortError')
    const i = shallow[k]
    const depth = analyses[i].requestedDepth ?? analyses[i].depth
    const deeper = await engine.analyse(analyses[i].fen, depth, MAX_MS_PER_POSITION, MIN_REVIEW_DEPTH)
    if (deeper.depth > analyses[i].depth) out[i] = deeper
    onProgress(k + 1, shallow.length)
  }
  return out
}
