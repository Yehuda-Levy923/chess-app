import { Chess, type Color, type Move } from 'chess.js'
import { bookDepth, type Book } from '../openings/book'
import { gameAccuracy, moveAccuracy, winPercent, winPercentFor } from './accuracy'
import { classify, expectedPointsLoss } from './classify'
import { uciToSan } from './format'
import { PIECE_VALUE, mostHanging } from './material'
import { coachNote } from './notes'
import type { Label, PositionAnalysis, Review, ReviewedMove, Score } from './types'

export const LABELS: Label[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
]

/** The game's moves with before/after FENs, from a PGN. */
export function movesFromPgn(pgn: string): Move[] {
  const chess = new Chess()
  chess.loadPgn(pgn)
  return chess.history({ verbose: true })
}

/** Score for a position that needs no engine: checkmate or a drawn end. */
export function terminalScore(fen: string): Score | null {
  const chess = new Chess(fen)
  if (chess.isCheckmate()) return { kind: 'over', result: chess.turn() === 'w' ? '0-1' : '1-0' }
  if (chess.isStalemate() || chess.isInsufficientMaterial()) return { kind: 'over', result: '1/2-1/2' }
  return null
}

/**
 * `analyses[0]` is the starting position and `analyses[i]` the position after
 * ply i, so there is one more analysis than there are moves.
 */
export function buildReview(gameId: string, moves: Move[], analyses: PositionAnalysis[], book: Book): Review {
  if (analyses.length !== moves.length + 1) throw new Error(`need ${moves.length + 1} analyses, got ${analyses.length}`)

  const { plies: bookPlies, opening, byPly } = bookDepth(
    book,
    moves.map((m) => m.san),
  )

  const reviewed: ReviewedMove[] = []
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i]
    const color = m.color as Color
    const before = analyses[i]
    const after = analyses[i + 1]
    const best = before.lines[0] ?? null
    const second = before.lines[1] ?? null
    const scoreAfter = after.lines[0]?.score ?? { kind: 'cp', cp: 0 }
    const scoreBest = best?.score ?? null

    const wpAfter = winPercentFor(scoreAfter, color)
    const wpBefore = scoreBest ? Math.max(winPercentFor(scoreBest, color), wpAfter) : wpAfter
    const bestUci = best?.pv[0] ?? null
    const isBest = bestUci === m.lan
    const prev = moves[i - 1]
    const captured = m.captured ? PIECE_VALUE[m.captured] : 0

    const facts = {
      isBest,
      wpBefore,
      wpAfter,
      wpSecond: second ? winPercentFor(second.score, color) : null,
      inBook: i < bookPlies,
      sacrifice: (mostHanging(m.after, color)?.gain ?? 0) - captured,
      isRecapture: !!(prev?.captured && m.captured && prev.to === m.to),
      legalMoves: new Chess(m.before).moves().length,
      opponentLoss: i > 0 ? reviewed[i - 1].loss : null,
    }
    const label = classify(facts)
    const openingName = byPly[i]?.name ?? null

    reviewed.push({
      ply: i + 1,
      color,
      san: m.san,
      uci: m.lan,
      fenBefore: m.before,
      fenAfter: m.after,
      label,
      loss: expectedPointsLoss(facts),
      accuracy: moveAccuracy(wpBefore, wpAfter),
      winPercentAfter: winPercent(scoreAfter),
      scoreAfter,
      bestUci,
      bestSan: bestUci ? uciToSan(m.before, bestUci) : null,
      scoreBest,
      opening: openingName,
      note: coachNote({
        label,
        color,
        fenBefore: m.before,
        fenAfter: m.after,
        bestUci,
        scoreBest,
        scoreAfter,
        scoreSecond: second?.score ?? null,
        replyUci: after.lines[0]?.pv[0] ?? null,
        opening: openingName,
      }),
    })
  }

  const initialScore = analyses[0].lines[0]?.score ?? { kind: 'cp', cp: 0 }
  const series = [winPercent(initialScore), ...reviewed.map((r) => r.winPercentAfter)]
  const startColor = (moves[0]?.color ?? 'w') as Color

  return {
    gameId,
    depth: Math.max(...analyses.map((a) => a.requestedDepth ?? a.depth)),
    minDepth: Math.min(...analyses.filter((a) => a.lines[0]?.score.kind !== 'over').map((a) => a.depth), Infinity) || 0,
    moves: reviewed,
    accuracy: gameAccuracy(series, startColor),
    counts: { w: countLabels(reviewed, 'w'), b: countLabels(reviewed, 'b') },
    opening: opening?.name ?? null,
    initialWinPercent: series[0],
  }
}

function countLabels(moves: ReviewedMove[], color: Color): Record<Label, number> {
  const counts = Object.fromEntries(LABELS.map((l) => [l, 0])) as Record<Label, number>
  for (const m of moves) if (m.color === color) counts[m.label]++
  return counts
}
