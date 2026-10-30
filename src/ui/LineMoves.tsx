import { Chess, type Square } from 'chess.js'
import { useEffect, useRef, useState } from 'react'
import { moveLabel, type Line } from './boardLine'
import { pieceSetById, useAppearance } from './appearance'

/** The moves of a line in numbered pairs, with the one on the board marked. Uses the review's move-list styles. */
export function LineMoves({ line, onPly }: { line: Line; onPly: (ply: number) => void }) {
  const ref = useRef<HTMLOListElement>(null)
  useEffect(() => {
    ref.current?.querySelector('.current')?.scrollIntoView({ block: 'nearest' })
  }, [line.ply])

  const rows: { no: number; w?: number; b?: number }[] = []
  line.moves.forEach((_, i) => {
    const { no, white } = moveLabel(line.start, i)
    if (white || rows.length === 0) rows.push({ no })
    rows[rows.length - 1][white ? 'w' : 'b'] = i
  })

  const cell = (i: number | undefined) =>
    i === undefined ? (
      <span />
    ) : (
      <button className={`move ${i + 1 === line.ply ? 'current' : ''}`} onClick={() => onPly(i + 1)}>
        <span className="move-san">{line.moves[i].san}</span>
      </button>
    )

  return (
    <ol className="moves" ref={ref}>
      {rows.map((r) => (
        <li key={r.no}>
          <span className="move-no num">{r.no}</span>
          {cell(r.w)}
          {cell(r.b)}
        </li>
      ))}
    </ol>
  )
}

/** The four pieces a pawn can become, in the player's piece set, laid over the board. */
export function PromotionPicker({ color, onPick, onCancel }: { color: 'w' | 'b'; onPick: (p: 'q' | 'r' | 'b' | 'n') => void; onCancel: () => void }) {
  const { appearance } = useAppearance()
  const set = pieceSetById(appearance.pieces)
  return (
    <div className="promote" role="dialog" aria-label="Promote to" onClick={onCancel}>
      <div className="promote-row" onClick={(e) => e.stopPropagation()}>
        {(['q', 'r', 'b', 'n'] as const).map((p) => (
          <button key={p} className="promote-piece" onClick={() => onPick(p)} aria-label={{ q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }[p]} autoFocus={p === 'q'}>
            <img src={set.src(`${color}${p.toUpperCase()}` as `w${'Q'}`)} alt="" crossOrigin={set.crossOrigin ? 'anonymous' : undefined} draggable={false} />
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Click a piece, then a square: the other way to move, alongside dragging.
 * Clicking another of your own pieces picks that one up instead; clicking
 * anywhere else puts the piece back. Any change of position drops the pick.
 */
export function useClickMove(fen: string, enabled: boolean, onMove: (from: string, to: string) => void) {
  const [selected, setSelected] = useState<{ fen: string; square: string } | null>(null)
  const active = enabled && selected?.fen === fen ? selected.square : null
  const targets = active ? legalTargets(fen, active) : []

  const onSquareClick = (square: string) => {
    if (!enabled) return
    if (active && targets.includes(square)) {
      setSelected(null)
      onMove(active, square)
      return
    }
    const mine = legalTargets(fen, square).length > 0
    setSelected(mine && square !== active ? { fen, square } : null)
  }

  return { selected: active, targets, onSquareClick }
}

function legalTargets(fen: string, square: string): string[] {
  try {
    return new Chess(fen).moves({ square: square as Square, verbose: true }).map((m) => m.to)
  } catch {
    return []
  }
}

/** The square of the king that is in check, if any. */
export function checkSquare(fen: string, inCheck: boolean): string | null {
  if (!inCheck) return null
  const [board, turn] = fen.split(' ')
  const king = turn === 'w' ? 'K' : 'k'
  const ranks = board.split('/')
  for (let r = 0; r < 8; r++) {
    let f = 0
    for (const ch of ranks[r]) {
      if (/\d/.test(ch)) f += Number(ch)
      else {
        if (ch === king) return 'abcdefgh'[f] + (8 - r)
        f++
      }
    }
  }
  return null
}
