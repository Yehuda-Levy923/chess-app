import { useEffect, useState } from 'react'
import { Chess } from 'chess.js'
import { terminalScore } from '../review/buildReview'
import type { EngineLine, Score } from '../review/types'
import { getEngine } from '../stockfish/shared'

export const LIVE_LINES = 3

export type Live = {
  fen: string
  /** null until the first depth arrives; the first call also waits for the network to load */
  depth: number | null
  lines: EngineLine[]
  /** Checkmate or stalemate: no search runs */
  over: Score | null
  error: string | null
}

/**
 * Streams Stockfish's top lines for `fen` while `enabled`. Every position change
 * aborts the previous search; the engine answers an abort within milliseconds.
 * Finished analyses are kept in `memo` so stepping back to a position, or
 * judging a move played from it, doesn't need a new search.
 */
export function useLiveAnalysis(fen: string, enabled: boolean, memo: Map<string, Live>): Live | null {
  const [live, setLive] = useState<Live | null>(null)

  useEffect(() => {
    if (!enabled) return
    const over = terminalScore(fen)
    if (over) {
      setLive({ fen, depth: null, lines: [], over, error: null })
      return
    }
    const known = memo.get(fen)
    setLive(known ?? { fen, depth: null, lines: [], over: null, error: null })

    const abort = new AbortController()
    getEngine()
      .analyseLive(fen, {
        multiPv: LIVE_LINES,
        signal: abort.signal,
        onUpdate: (u) => {
          // A deeper result from earlier stays until this search catches up.
          const prev = memo.get(fen)
          if (prev?.depth && prev.depth > u.depth) return
          const next = { fen, depth: u.depth, lines: u.lines, over: null, error: null }
          memo.set(fen, next)
          setLive(next)
        },
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        setLive((l) => ({ ...(l ?? { fen, depth: null, lines: [], over: null }), error: e instanceof Error ? e.message : String(e) }))
      })
    return () => abort.abort()
  }, [fen, enabled, memo])

  return enabled && live?.fen === fen ? live : null
}

/** "14...Nf6 15.Bg5 h6" style SAN for an engine line, stopping at the first illegal move. */
export function pvToSan(fen: string, pv: string[], max = 12): { san: string; uci: string; label: string }[] {
  const chess = new Chess(fen)
  const out: { san: string; uci: string; label: string }[] = []
  for (const uci of pv.slice(0, max)) {
    const moveNo = chess.moveNumber()
    const white = chess.turn() === 'w'
    let san: string
    try {
      san = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san
    } catch {
      break
    }
    const label = white ? `${moveNo}.${san}` : out.length === 0 ? `${moveNo}...${san}` : san
    out.push({ san, uci, label })
  }
  return out
}
