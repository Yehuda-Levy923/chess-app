import type { Move } from 'chess.js'
import type { Engine } from '../stockfish/engine'
import { terminalScore } from './buildReview'
import type { PositionAnalysis } from './types'

/** Time cap per position. A full 70-position game then takes about two minutes at most. */
export const MAX_MS_PER_POSITION = 2000

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
        : await engine.analyse(fen, depth, MAX_MS_PER_POSITION),
    )
    onProgress(out.length, fens.length)
  }
  return out
}
