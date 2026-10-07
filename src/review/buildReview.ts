import { Chess, type Color, type Move } from 'chess.js'
import { bookDepth, type Book } from '../openings/book'
import { CHESSCOM_ACCURACY, gameAccuracy, moveAccuracy, winPercent, winPercentFor } from './accuracy'
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

/** Bump when ReviewedMove/Review gain derived fields, so cached reviews get rebuilt from their analyses. */
export const REVIEW_VERSION = 3

export type MoveToJudge = {
  color: Color
  /** UCI, e.g. "e2e4", "e7e8q" */
  uci: string
  fenBefore: string
  fenAfter: string
  /** Value of the piece this move captured, 0 if none */
  capturedValue: number
  /** True when this move captures on the square the opponent just captured on */
  isRecapture: boolean
  inBook: boolean
  /** Expected points the opponent lost on the move before, when known */
  opponentLoss: number | null
}

export type Judgement = {
  label: Label
  loss: number
  accuracy: number
  wpBefore: number
  wpAfter: number
  scoreAfter: Score
  scoreBest: Score | null
  scoreSecond: Score | null
  bestUci: string | null
}

/** Classifies one move from the analyses of the positions before and after it. */
export function judgeMove(m: MoveToJudge, before: PositionAnalysis, after: PositionAnalysis): Judgement {
  const best = before.lines[0] ?? null
  const second = before.lines[1] ?? null
  const scoreAfter = after.lines[0]?.score ?? { kind: 'cp', cp: 0 }
  const scoreBest = best?.score ?? null
  const wpAfter = winPercentFor(scoreAfter, m.color)
  const wpBefore = scoreBest ? Math.max(winPercentFor(scoreBest, m.color), wpAfter) : wpAfter
  const bestUci = best?.pv[0] ?? null
  const facts = {
    isBest: bestUci === m.uci,
    wpBefore,
    wpAfter,
    wpSecond: second ? winPercentFor(second.score, m.color) : null,
    inBook: m.inBook,
    sacrifice: (mostHanging(m.fenAfter, m.color)?.gain ?? 0) - m.capturedValue,
    isRecapture: m.isRecapture,
    legalMoves: new Chess(m.fenBefore).moves().length,
    opponentLoss: m.opponentLoss,
  }
  return {
    label: classify(facts),
    loss: expectedPointsLoss(facts),
    accuracy: fittedMoveAccuracy(m.color, scoreBest, scoreAfter),
    wpBefore,
    wpAfter,
    scoreAfter,
    scoreBest,
    scoreSecond: second?.score ?? null,
    bestUci,
  }
}

/** Per-move accuracy on the chess.com-fitted curve; labels keep the Lichess curve. */
function fittedMoveAccuracy(color: Color, scoreBest: Score | null, scoreAfter: Score): number {
  const after = winPercentFor(scoreAfter, color, CHESSCOM_ACCURACY)
  const before = scoreBest ? Math.max(winPercentFor(scoreBest, color, CHESSCOM_ACCURACY), after) : after
  return moveAccuracy(before, after, CHESSCOM_ACCURACY)
}

/**
 * Classifies a move played on the free board. `previous` describes the move
 * before it, when there was one, so "miss" and recaptures work there too.
 */
export function classifyPlayedMove(
  fenBefore: string,
  uci: string,
  before: PositionAnalysis,
  after: PositionAnalysis,
  previous: { loss: number; uci: string; captured: boolean } | null = null,
): Judgement | null {
  const chess = new Chess(fenBefore)
  let move: Move
  try {
    move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
  } catch {
    return null
  }
  return judgeMove(
    {
      color: move.color as Color,
      uci: move.lan,
      fenBefore,
      fenAfter: move.after,
      capturedValue: move.captured ? PIECE_VALUE[move.captured] : 0,
      isRecapture: !!(previous?.captured && move.captured && previous.uci.slice(2, 4) === move.to),
      inBook: false,
      opponentLoss: previous?.loss ?? null,
    },
    before,
    after,
  )
}

export type ClockInput = { clocks: (number | null)[]; base: number; increment: number }

/**
 * `analyses[0]` is the starting position and `analyses[i]` the position after
 * ply i, so there is one more analysis than there are moves. `clock` adds each
 * mover's remaining time and time spent, read from the PGN's [%clk] comments.
 */
export function buildReview(gameId: string, moves: Move[], analyses: PositionAnalysis[], book: Book, clock?: ClockInput): Review {
  if (analyses.length !== moves.length + 1) throw new Error(`need ${moves.length + 1} analyses, got ${analyses.length}`)

  const { plies: bookPlies, opening, byPly } = bookDepth(
    book,
    moves.map((m) => m.san),
  )

  const reviewed: ReviewedMove[] = []
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i]
    const color = m.color as Color
    const after = analyses[i + 1]
    const prev = moves[i - 1]
    const j = judgeMove(
      {
        color,
        uci: m.lan,
        fenBefore: m.before,
        fenAfter: m.after,
        capturedValue: m.captured ? PIECE_VALUE[m.captured] : 0,
        isRecapture: !!(prev?.captured && m.captured && prev.to === m.to),
        inBook: i < bookPlies,
        opponentLoss: i > 0 ? reviewed[i - 1].loss : null,
      },
      analyses[i],
      after,
    )
    const { label, scoreAfter, scoreBest, bestUci } = j
    const openingName = byPly[i]?.name ?? null
    const left = clock?.clocks[i] ?? null
    // The same player's previous clock reading, two plies back, or the starting time.
    const prevLeft = i >= 2 ? (clock?.clocks[i - 2] ?? null) : (clock?.base ?? null)

    reviewed.push({
      ply: i + 1,
      color,
      san: m.san,
      uci: m.lan,
      fenBefore: m.before,
      fenAfter: m.after,
      label,
      loss: j.loss,
      accuracy: j.accuracy,
      winPercentAfter: winPercent(scoreAfter),
      scoreAfter,
      bestUci,
      bestSan: bestUci ? uciToSan(m.before, bestUci) : null,
      bestLine: analyses[i].lines[0]?.pv.slice(0, 8) ?? [],
      clock: left,
      spent: left !== null && prevLeft !== null && clock ? Math.max(0, prevLeft - left + clock.increment) : null,
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
        scoreSecond: j.scoreSecond,
        replyUci: after.lines[0]?.pv[0] ?? null,
        opening: openingName,
      }),
    })
  }

  const initialScore: Score = analyses[0].lines[0]?.score ?? { kind: 'cp', cp: 0 }
  const series = [winPercent(initialScore), ...reviewed.map((r) => r.winPercentAfter)]
  const fitted = [winPercent(initialScore, CHESSCOM_ACCURACY), ...reviewed.map((r) => winPercent(r.scoreAfter, CHESSCOM_ACCURACY))]
  const startColor = (moves[0]?.color ?? 'w') as Color

  return {
    version: REVIEW_VERSION,
    gameId,
    analyses,
    depth: Math.max(...analyses.map((a) => a.requestedDepth ?? a.depth)),
    minDepth: Math.min(...analyses.filter((a) => a.lines[0]?.score.kind !== 'over').map((a) => a.depth), Infinity) || 0,
    moves: reviewed,
    accuracy: gameAccuracy(fitted, startColor, CHESSCOM_ACCURACY),
    counts: { w: countLabels(reviewed, 'w'), b: countLabels(reviewed, 'b') },
    opening: opening?.name ?? null,
    initialWinPercent: series[0],
    initialScore,
  }
}

function countLabels(moves: ReviewedMove[], color: Color): Record<Label, number> {
  const counts = Object.fromEntries(LABELS.map((l) => [l, 0])) as Record<Label, number>
  for (const m of moves) if (m.color === color) counts[m.label]++
  return counts
}
