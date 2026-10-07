import { useEffect, useRef } from 'react'
import type { ReviewedMove } from '../review/types'
import { Badge } from './Badge'
import { GLYPH } from './labels'

type Props = { moves: ReviewedMove[]; ply: number; onPly: (ply: number) => void }

export function MoveList({ moves, ply, onPly }: Props) {
  const ref = useRef<HTMLOListElement>(null)

  useEffect(() => {
    ref.current?.querySelector('.current')?.scrollIntoView({ block: 'nearest' })
  }, [ply])

  // A think counts as long when it is several times the player's usual move.
  const long = longThink(moves)

  const rows: [ReviewedMove, ReviewedMove | undefined][] = []
  for (let i = 0; i < moves.length; i += 2) rows.push([moves[i], moves[i + 1]])

  const cell = (m: ReviewedMove | undefined) => {
    if (!m) return <span />
    return (
      <button className={`move ${m.ply === ply ? 'current' : ''}`} onClick={() => onPly(m.ply)}>
        <span className="move-san">{m.san}</span>
        {GLYPH[m.label] && <Badge label={m.label} size={15} />}
        {m.spent != null && <span className={`move-time num ${m.spent >= long ? 'long' : ''}`}>{formatTime(m.spent)}</span>}
      </button>
    )
  }

  return (
    <ol className="moves" ref={ref}>
      {rows.map(([w, b], i) => (
        <li key={i}>
          <span className="move-no num">{i + 1}</span>
          {cell(w)}
          {cell(b)}
        </li>
      ))}
    </ol>
  )
}

function formatTime(s: number): string {
  if (s < 10) return `${s.toFixed(1)}s`
  if (s < 60) return `${Math.round(s)}s`
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
}

function longThink(moves: ReviewedMove[]): number {
  const times = moves.map((m) => m.spent).filter((t): t is number => t != null).sort((a, b) => a - b)
  if (times.length < 6) return Infinity
  return Math.max(10, times[Math.floor(times.length / 2)] * 4)
}
