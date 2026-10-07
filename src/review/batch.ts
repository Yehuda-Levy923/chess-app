import type { ChessComGame } from '../chesscom/api'
import type { Engine } from '../stockfish/engine'
import { reviewGame, type ReviewSource } from './reviewGame'
import type { Review } from './types'

export type BatchProgress = {
  /** Games finished so far */
  done: number
  total: number
  current: ChessComGame | null
  /** Positions analysed in the current game, when it needs the engine */
  positions: [number, number] | null
  engineRuns: number
}

/**
 * Reviews games one after another on the shared engine, newest first. Games
 * already reviewed come straight from the cache. Stops between positions when
 * the signal aborts; everything finished up to then stays cached.
 */
export async function reviewBatch(
  games: ChessComGame[],
  depth: number,
  engine: Pick<Engine, 'analyse' | 'newGame'>,
  onProgress: (p: BatchProgress) => void,
  signal?: AbortSignal,
): Promise<{ reviews: Review[]; sources: Record<ReviewSource, number> }> {
  const sources: Record<ReviewSource, number> = { cache: 0, rebuilt: 0, calibration: 0, engine: 0 }
  const reviews: Review[] = []
  const queue = [...games].sort((a, b) => b.endTime - a.endTime)
  for (let i = 0; i < queue.length; i++) {
    if (signal?.aborted) break
    const game = queue[i]
    onProgress({ done: i, total: queue.length, current: game, positions: null, engineRuns: sources.engine })
    try {
      const { review, source } = await reviewGame(
        game,
        depth,
        engine,
        (d, t) => onProgress({ done: i, total: queue.length, current: game, positions: [d, t], engineRuns: sources.engine }),
        signal,
      )
      sources[source]++
      reviews.push(review)
    } catch (e) {
      if (signal?.aborted) break
      // A PGN chess.js can't read shouldn't stop the batch.
      console.error(`review of ${game.uuid} failed`, e)
    }
  }
  onProgress({ done: reviews.length, total: queue.length, current: null, positions: null, engineRuns: sources.engine })
  return { reviews, sources }
}
