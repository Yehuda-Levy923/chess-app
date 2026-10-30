import { useEffect, useState } from 'react'
import { analysePosition } from '../review/analyseGame'
import type { PositionAnalysis } from '../review/types'
import { getEngine } from '../stockfish/shared'

// A game against the computer is reviewed while it is played. On your move the
// engine would otherwise sit idle, so it searches the game's positions one at a
// time, and the search in hand is stopped the moment the engine is wanted for
// the computer's reply or a hint. The review after the game then only has the
// last few positions left to search.

const NONE: ReadonlyMap<string, PositionAnalysis> = new Map()

/**
 * Searches each of `fens` not searched yet, while `active`, and returns every
 * analysis so far by FEN. They are kept across games, so a rematch reuses its
 * opening, until the review depth changes.
 */
export function useReviewWhilePlaying(fens: string[], depth: number, active: boolean): ReadonlyMap<string, PositionAnalysis> {
  const [searched, setSearched] = useState({ depth, byFen: NONE })
  const byFen = searched.depth === depth ? searched.byFen : NONE
  const next = fens.find((f) => !byFen.has(f))

  // One position per run: each result re-runs this for the next.
  useEffect(() => {
    if (!active || !next) return
    const abort = new AbortController()
    analysePosition(getEngine(), next, depth, abort.signal)
      .then((a) => setSearched((s) => ({ depth, byFen: new Map(s.depth === depth ? s.byFen : NONE).set(next, a) })))
      .catch(() => {
        // Cancelled, or the engine failed. Either way the review after the game
        // searches whatever is missing, and reports a failure there.
      })
    return () => abort.abort()
  }, [next, depth, active])

  return byFen
}
