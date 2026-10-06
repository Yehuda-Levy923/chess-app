import { Chess, type Color, type Square } from 'chess.js'
import { formatScore, mateFor, uciToSan } from './format'
import { PIECE_NAME, PIECE_VALUE, mostHanging, see } from './material'
import type { Label, Score } from './types'

export type NoteInput = {
  label: Label
  color: Color
  fenBefore: string
  fenAfter: string
  bestUci: string | null
  scoreBest: Score | null
  scoreAfter: Score
  scoreSecond: Score | null
  /** The opponent's best reply to the move played */
  replyUci: string | null
  opening: string | null
}

const FLAGGED: Label[] = ['inaccuracy', 'mistake', 'miss', 'blunder']

export function coachNote(n: NoteInput): string | null {
  const bestSan = n.bestUci ? uciToSan(n.fenBefore, n.bestUci) : null
  const opponent: Color = n.color === 'w' ? 'b' : 'w'

  switch (n.label) {
    case 'book':
      return n.opening ? `Book move. ${n.opening}.` : 'Book move.'
    case 'brilliant': {
      const offered = mostHanging(n.fenAfter, n.color)
      return offered
        ? `Gives up the ${PIECE_NAME[offered.piece]} on ${offered.square}, and it works.`
        : 'A sacrifice that works.'
    }
    case 'great':
      return n.scoreSecond
        ? `The only good move. The second-best move scores ${formatScore(n.scoreSecond)}.`
        : 'The only good move.'
  }
  if (!FLAGGED.includes(n.label)) return null

  const reasons = [
    allowsMate(n.scoreAfter, opponent),
    missedMate(n.scoreBest, n.scoreAfter, n.color, bestSan),
    hangs(n.fenAfter, n.color),
    allowsFork(n.fenAfter, n.replyUci, n.color),
    missedWin(n.fenBefore, n.bestUci, bestSan),
  ]
  const reason = reasons.find((r) => r !== null)
  const best = bestSan && n.scoreBest ? `Best was ${bestSan} (${formatScore(n.scoreBest)}).` : null
  if (n.label === 'miss' && !reason) return best ? `Misses the chance the opponent gave. ${best}` : null
  return [reason, best].filter(Boolean).join(' ') || null
}

export function allowsMate(scoreAfter: Score, opponent: Color): string | null {
  const n = mateFor(scoreAfter, opponent)
  return n === null ? null : `Allows mate in ${n}.`
}

export function missedMate(scoreBest: Score | null, scoreAfter: Score, color: Color, bestSan: string | null): string | null {
  const n = mateFor(scoreBest, color)
  if (n === null || mateFor(scoreAfter, color) !== null) return null
  return bestSan ? `Missed mate in ${n}, starting with ${bestSan}.` : `Missed mate in ${n}.`
}

export function hangs(fenAfter: string, color: Color): string | null {
  const h = mostHanging(fenAfter, color)
  if (!h || h.gain < 2) return null
  return `Leaves the ${PIECE_NAME[h.piece]} on ${h.square} to be won.`
}

export function allowsFork(fenAfter: string, replyUci: string | null, color: Color): string | null {
  if (!replyUci) return null
  const chess = new Chess(fenAfter)
  let reply
  try {
    reply = chess.move({ from: replyUci.slice(0, 2), to: replyUci.slice(2, 4), promotion: replyUci[4] })
  } catch {
    return null
  }
  const forker = chess.get(reply.to)!
  const targets: string[] = []
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== color) continue
      if (!chess.attackers(cell.square, forker.color).includes(reply.to)) continue
      const undefended = chess.attackers(cell.square, color).length === 0
      if (cell.type === 'k' || PIECE_VALUE[cell.type] > PIECE_VALUE[forker.type] || (undefended && cell.type !== 'p')) {
        targets.push(PIECE_NAME[cell.type])
      }
    }
  }
  if (targets.length < 2) return null
  return `Allows ${reply.san}, a ${PIECE_NAME[forker.type]} fork on the ${listOf(targets)}.`
}

export function missedWin(fenBefore: string, bestUci: string | null, bestSan: string | null): string | null {
  if (!bestUci) return null
  const chess = new Chess(fenBefore)
  let move
  try {
    move = chess.move({ from: bestUci.slice(0, 2), to: bestUci.slice(2, 4), promotion: bestUci[4] })
  } catch {
    return null
  }
  if (!move.captured) return null
  const net = PIECE_VALUE[move.captured] - see(chess, move.to as Square)
  if (net < 2) return null
  return `Missed ${bestSan ?? move.san}, which wins the ${PIECE_NAME[move.captured]}.`
}

function listOf(items: string[]): string {
  if (items.length <= 2) return items.join(' and ')
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}
