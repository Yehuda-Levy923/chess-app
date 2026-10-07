import type { Color } from 'chess.js'
import { mateFor } from '../review/format'
import { allowsFork, hangs } from '../review/notes'
import type { Label, Review, Score } from '../review/types'
import { pieceOf, type PieceType, type Side } from './facts'

// Stats that need Stockfish, so they only cover games reviewed in the app.

export type ReviewedGame = { review: Review; side: Side; endTime: number; chessComAccuracy: number | null }

const BAD: Label[] = ['inaccuracy', 'mistake', 'miss', 'blunder']
const GOOD_ENOUGH: Label[] = ['brilliant', 'great', 'best', 'excellent']

export function accuracyOverTime(games: ReviewedGame[]): { t: number; ours: number; chessCom: number | null }[] {
  return games
    .map((g) => ({ t: g.endTime, ours: g.review.accuracy[colorOf(g.side)], chessCom: g.chessComAccuracy }))
    .sort((a, b) => a.t - b.t)
}

const MOVE_BANDS = [
  { label: '1–10', lo: 1, hi: 10 },
  { label: '11–20', lo: 11, hi: 20 },
  { label: '21–30', lo: 21, hi: 30 },
  { label: '31–40', lo: 31, hi: 40 },
  { label: '41+', lo: 41, hi: Infinity },
]

/** Mean per-move accuracy of the player's moves, by move number band. */
export function accuracyByMove(games: ReviewedGame[]): { label: string; accuracy: number | null; moves: number }[] {
  return MOVE_BANDS.map((b) => {
    let sum = 0
    let n = 0
    for (const m of myMoves(games)) {
      const moveNo = Math.ceil(m.ply / 2)
      if (moveNo >= b.lo && moveNo <= b.hi) {
        sum += m.accuracy
        n++
      }
    }
    return { label: b.label, accuracy: n ? sum / n : null, moves: n }
  })
}

/** Share of the player's moves given each label. */
export function moveQuality(games: ReviewedGame[]): Map<Label, number> {
  const counts = new Map<Label, number>()
  let total = 0
  for (const m of myMoves(games)) {
    counts.set(m.label, (counts.get(m.label) ?? 0) + 1)
    total++
  }
  for (const [l, c] of counts) counts.set(l, c / total)
  return counts
}

/** Mean accuracy and move count for each piece the player moved. */
export function accuracyByPiece(games: ReviewedGame[]): Record<PieceType, { accuracy: number | null; moves: number }> {
  const acc: Record<PieceType, { sum: number; n: number }> = { p: { sum: 0, n: 0 }, n: { sum: 0, n: 0 }, b: { sum: 0, n: 0 }, r: { sum: 0, n: 0 }, q: { sum: 0, n: 0 }, k: { sum: 0, n: 0 } }
  for (const m of myMoves(games)) {
    if (m.label === 'book') continue
    const p = acc[pieceOf(m.san)]
    p.sum += m.accuracy
    p.n++
  }
  const out = {} as Record<PieceType, { accuracy: number | null; moves: number }>
  for (const k of Object.keys(acc) as PieceType[]) out[k] = { accuracy: acc[k].n ? acc[k].sum / acc[k].n : null, moves: acc[k].n }
  return out
}

export type Tactics = {
  matesFound: number
  matesMissed: number
  forksFound: number
  forksMissed: number
  /** Times the player left material to be won */
  hungPieces: number
  /** Times the opponent left material to be won, and how often the player took it */
  opponentHung: number
  opponentHungPunished: number
}

/**
 * Tactical moments from the player's side. A fork or mate counts as available
 * when it was the engine's best move; "found" means the player played a move
 * at least as good.
 */
export function tactics(games: ReviewedGame[]): Tactics {
  const t: Tactics = { matesFound: 0, matesMissed: 0, forksFound: 0, forksMissed: 0, hungPieces: 0, opponentHung: 0, opponentHungPunished: 0 }
  for (const g of games) {
    const me = colorOf(g.side)
    const them: Color = me === 'w' ? 'b' : 'w'
    const moves = g.review.moves
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i]
      if (m.color !== me) {
        // The opponent hung something; did the player's reply take advantage?
        const next = moves[i + 1]
        if (next && BAD.includes(m.label) && hangs(m.fenAfter, them)) {
          t.opponentHung++
          if (GOOD_ENOUGH.includes(next.label)) t.opponentHungPunished++
        }
        continue
      }
      const ok = GOOD_ENOUGH.includes(m.label)
      if (mateFor(m.scoreBest, me) !== null) ok && stillMating(m.scoreAfter, me) ? t.matesFound++ : t.matesMissed++
      if (m.bestUci && allowsFork(m.fenBefore, m.bestUci, them)) ok ? t.forksFound++ : t.forksMissed++
      if (BAD.includes(m.label) && hangs(m.fenAfter, me)) t.hungPieces++
    }
  }
  return t
}

function* myMoves(games: ReviewedGame[]) {
  for (const g of games) {
    const me = colorOf(g.side)
    for (const m of g.review.moves) if (m.color === me) yield m
  }
}

/** Still on course for mate after the move, or the move itself was mate. */
function stillMating(after: Score, me: Color): boolean {
  if (after.kind === 'over') return after.result === (me === 'w' ? '1-0' : '0-1')
  return mateFor(after, me) !== null
}

function colorOf(side: Side): Color {
  return side === 'white' ? 'w' : 'b'
}
