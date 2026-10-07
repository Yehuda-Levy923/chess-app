import type { ChessComGame } from '../chesscom/api'
import { parsePgn, parseTimeControl } from '../insights/pgn'
import { getBook } from '../openings'
import type { Engine } from '../stockfish/engine'
import { analyseGame } from './analyseGame'
import { buildReview, movesFromPgn, REVIEW_VERSION, type ClockInput } from './buildReview'
import { loadReview, saveReview } from './cache'
import type { PositionAnalysis, Review } from './types'

/** Clock readings for each ply from the PGN's [%clk] comments, when the game had a clock. */
export function clockInput(game: Pick<ChessComGame, 'pgn' | 'timeControl'>): ClockInput | undefined {
  const tc = parseTimeControl(game.timeControl)
  if (!tc) return undefined
  const { clocks } = parsePgn(game.pgn)
  if (clocks.every((c) => c === null)) return undefined
  return { clocks, base: tc.base, increment: tc.increment }
}

export type ReviewSource = 'cache' | 'rebuilt' | 'calibration' | 'engine'

/**
 * The one way to get a game's review. Uses the cache when it is current;
 * rebuilds from cached analyses when only the derived fields are stale;
 * otherwise runs Stockfish. In development, analyses saved by
 * scripts/calibrate-analyse.mjs (same engine settings) are reused instead.
 */
export async function reviewGame(
  game: ChessComGame,
  depth: number,
  engine: Pick<Engine, 'analyse' | 'newGame'>,
  onProgress: (done: number, total: number) => void = () => undefined,
  signal?: AbortSignal,
): Promise<{ review: Review; source: ReviewSource }> {
  const cached = await loadReview(game.uuid, depth)
  if (cached && cached.version === REVIEW_VERSION) return { review: cached, source: 'cache' }

  const moves = movesFromPgn(game.pgn)
  const build = (analyses: PositionAnalysis[]) => buildReview(game.uuid, moves, analyses, getBook(), clockInput(game))

  if (cached?.analyses?.length === moves.length + 1) {
    const review = build(cached.analyses)
    await saveReview(review)
    return { review, source: 'rebuilt' }
  }

  const saved = depth === 16 ? await calibrationAnalyses(game.uuid, moves.length + 1) : null
  if (saved) {
    const review = build(saved)
    await saveReview(review)
    return { review, source: 'calibration' }
  }

  const analyses = await analyseGame(engine, moves, depth, onProgress, signal)
  const review = build(analyses)
  await saveReview(review)
  return { review, source: 'engine' }
}

async function calibrationAnalyses(uuid: string, expected: number): Promise<PositionAnalysis[] | null> {
  if (!import.meta.env.DEV) return null
  try {
    const res = await fetch(`/calibration/analyses/${uuid}.json`)
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null
    const { analyses } = (await res.json()) as { analyses: PositionAnalysis[] }
    return analyses.length === expected ? analyses : null
  } catch {
    return null
  }
}
