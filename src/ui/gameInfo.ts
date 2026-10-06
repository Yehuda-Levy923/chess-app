import { Chess, type PieceSymbol } from 'chess.js'
import { PIECE_VALUE } from '../review/material'

/** Clock after each ply in seconds, from chess.com's `[%clk 0:02:59.9]` comments. Index 0 is ply 1. */
export function clocksFromPgn(pgn: string): number[] {
  const out: number[] = []
  for (const m of pgn.matchAll(/\[%clk (\d+):(\d+):(\d+(?:\.\d+)?)\]/g)) {
    out.push(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]))
  }
  return out
}

/** "180+2" -> { base: 180, increment: 2 }. Daily games ("1/86400") have no clock. */
export function parseTimeControl(tc: string): { base: number; increment: number } | null {
  const m = /^(\d+)(?:\+(\d+))?$/.exec(tc)
  return m ? { base: Number(m[1]), increment: Number(m[2] ?? 0) } : null
}

/** Seconds the mover spent on `ply` (1-based), or null when the PGN carries no clocks. */
export function timeSpent(clocks: number[], ply: number, tc: string): number | null {
  const control = parseTimeControl(tc)
  const after = clocks[ply - 1]
  if (!control || after === undefined) return null
  const before = ply > 2 ? clocks[ply - 3] : control.base
  if (before === undefined) return null
  return Math.max(0, before - after + control.increment)
}

/** "2:59", "0:09.4" under ten seconds, "1:02:00" past an hour. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, seconds)
  if (s < 10) return `0:0${s.toFixed(1)}`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  const mm = h ? String(m).padStart(2, '0') : String(m)
  return `${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`
}

const START: Record<Exclude<PieceSymbol, 'k'>, number> = { q: 1, r: 2, b: 2, n: 2, p: 8 }
const ORDER: Exclude<PieceSymbol, 'k'>[] = ['q', 'r', 'b', 'n', 'p']

/**
 * Pieces each side has taken, biggest first, and White's material lead.
 * Promotions can leave a side with more of a piece than it started with;
 * those simply count as nothing captured.
 */
export function captures(fen: string): { byWhite: PieceSymbol[]; byBlack: PieceSymbol[]; lead: number } {
  const left = { w: { q: 0, r: 0, b: 0, n: 0, p: 0 }, b: { q: 0, r: 0, b: 0, n: 0, p: 0 } }
  let lead = 0
  for (const row of new Chess(fen).board()) {
    for (const cell of row) {
      if (!cell || cell.type === 'k') continue
      left[cell.color][cell.type]++
      lead += cell.color === 'w' ? PIECE_VALUE[cell.type] : -PIECE_VALUE[cell.type]
    }
  }
  const taken = (victim: 'w' | 'b') => ORDER.flatMap((t) => Array<PieceSymbol>(Math.max(0, START[t] - left[victim][t])).fill(t))
  return { byWhite: taken('b'), byBlack: taken('w'), lead }
}

/** Square of the king in check, if the side to move is in check. */
export function checkedKing(fen: string): string | null {
  const chess = new Chess(fen)
  if (!chess.inCheck()) return null
  for (const row of chess.board()) {
    for (const cell of row) if (cell?.type === 'k' && cell.color === chess.turn()) return cell.square
  }
  return null
}
