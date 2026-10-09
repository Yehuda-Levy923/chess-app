import { useEffect, useRef, useState } from 'react'
import type { ChessComGame } from '../chesscom/api'
import { saveReview } from '../review/cache'
import { deepenReview } from '../review/deepen'
import type { Label, Review } from '../review/types'
import type { Live } from './liveAnalysis'

// While you sit on a move, the live engine keeps searching past the depth the
// review used. When it gets deeper, the review is rebuilt with that search, so
// labels, notes and accuracy follow the better evaluation. Rebuilding takes a
// few hundred milliseconds, so it happens at most once per position every
// THROTTLE_MS, plus once when you leave the move.

const THROTTLE_MS = 1500

export type LabelChange = { ply: number; san: string; from: Label; to: Label }

/** What the last rebuild changed, shown on the position it came from. */
export type Deepening = { ply: number; depth: number; changes: LabelChange[] }

type Args = {
  game: Pick<ChessComGame, 'uuid' | 'pgn' | 'timeControl'>
  review: Review | null
  setReview: (r: Review) => void
  /** The main-line position on the board */
  ply: number
  /** Live analysis of that position, or null in a variation or retry */
  live: Live | null
  /** Called once on leaving the screen if anything was saved, e.g. to refresh summaries */
  onSaved?: () => void
}

export function useDeepen({ game, review, setReview, ply, live, onSaved }: Args): Deepening | null {
  const [note, setNote] = useState<Deepening | null>(null)
  const reviewRef = useRef(review)
  reviewRef.current = review
  const pending = useRef<{ ply: number; live: Live } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastAt = useRef(new Map<number, number>())
  const saving = useRef<Promise<void> | null>(null)
  const latest = useRef({ game, setReview, onSaved })
  latest.current = { game, setReview, onSaved }

  const flush = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const p = pending.current
    pending.current = null
    const before = reviewRef.current
    if (!p || !before || p.live.depth === null) return
    lastAt.current.set(p.ply, Date.now())
    const after = deepenReview(latest.current.game, before, p.ply, { fen: p.live.fen, depth: p.live.depth, lines: p.live.lines })
    if (!after) return
    // The position decides the move into it and the move out of it.
    const changes: LabelChange[] = []
    for (const i of [p.ply - 1, p.ply]) {
      const a = before.moves[i]
      const b = after.moves[i]
      if (a && b && a.label !== b.label) changes.push({ ply: i + 1, san: a.san, from: a.label, to: b.label })
    }
    reviewRef.current = after
    latest.current.setReview(after)
    saving.current = (saving.current ?? Promise.resolve()).then(() => saveReview(after)).catch((e) => console.error(e))
    if (changes.length) setNote({ ply: p.ply, depth: p.live.depth, changes })
  }

  // A deeper result for the position on the board: apply now, or when the throttle allows.
  useEffect(() => {
    const stored = review?.analyses?.[ply]
    if (!live || live.depth === null || !stored || live.depth <= stored.depth) return
    pending.current = { ply, live }
    const wait = THROTTLE_MS - (Date.now() - (lastAt.current.get(ply) ?? 0))
    if (wait <= 0) flush()
    else if (!timer.current) timer.current = setTimeout(flush, wait)
    // flush reads refs only, so it isn't a dependency.
  }, [live, ply, review])

  // Leaving the move (or a variation starting) applies what's waiting.
  useEffect(() => () => flush(), [ply, live === null])

  // Leaving the screen: tell the rest of the app once the saves are done.
  useEffect(
    () => () => {
      flush()
      saving.current?.then(() => latest.current.onSaved?.())
    },
    [],
  )

  return note
}
