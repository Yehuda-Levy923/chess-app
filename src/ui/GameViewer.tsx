import { useMemo, useRef, useState } from 'react'
import type { ChessComGame } from '../chesscom/api'
import { movesFromPgn } from '../review/buildReview'
import { labelAt, type GameSummary } from '../review/summary'
import { GameBoard } from './GameBoard'
import { IconFirst, IconLast, IconNext, IconPrev } from './icons'
import { useBoardKeys } from './keys'
import { playMove } from './sound'
import './GameViewer.css'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

type Props = {
  game: ChessComGame
  orientation: 'white' | 'black'
  /** When the game has been reviewed, each move shows its classification */
  summary?: GameSummary
}

/** A game you can step through with ← and → without opening the full review. Starts on the final position. */
export function GameViewer({ game, orientation, summary }: Props) {
  const moves = useMemo(() => {
    try {
      return movesFromPgn(game.pgn)
    } catch {
      return []
    }
  }, [game.pgn])
  const [ply, setPly] = useState(moves.length)
  const ref = useRef<HTMLDivElement>(null)

  const go = (p: number) => setPly(Math.max(0, Math.min(moves.length, p)))
  const forward = () => {
    if (ply >= moves.length) return
    playMove(moves[ply].san)
    go(ply + 1)
  }
  useBoardKeys(ref, { back: () => go(ply - 1), forward, first: () => go(0), last: () => go(moves.length) })

  const move = ply > 0 ? moves[ply - 1] : null
  const label = move && summary && ply - 1 < summary.labels.length ? labelAt(summary, ply - 1) : null
  const moveText = move ? `${Math.ceil(ply / 2)}.${ply % 2 === 0 ? '..' : ''} ${move.san}` : 'Start'

  return (
    <div className="viewer" ref={ref}>
      <GameBoard
        fen={move?.after ?? START_FEN}
        orientation={orientation}
        lastMove={move ? [move.from, move.to] : null}
        mark={move && label ? { square: move.to, label } : null}
      />
      <div className="viewer-bar">
        <button className="btn nav-step" onClick={() => go(0)} disabled={ply === 0} title="First move (Home)" aria-label="First move">
          <IconFirst size={16} />
        </button>
        <button className="btn nav-step" onClick={() => go(ply - 1)} disabled={ply === 0} title="Previous move (←)" aria-label="Previous move">
          <IconPrev size={16} />
        </button>
        <span className="viewer-move num" aria-live="polite">
          {moveText}
        </span>
        <button className="btn nav-step" onClick={forward} disabled={ply === moves.length} title="Next move (→)" aria-label="Next move">
          <IconNext size={16} />
        </button>
        <button className="btn nav-step" onClick={() => go(moves.length)} disabled={ply === moves.length} title="Last move (End)" aria-label="Last move">
          <IconLast size={16} />
        </button>
      </div>
    </div>
  )
}
