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

  const rows: [ReviewedMove, ReviewedMove | undefined][] = []
  for (let i = 0; i < moves.length; i += 2) rows.push([moves[i], moves[i + 1]])

  const cell = (m: ReviewedMove | undefined) => {
    if (!m) return <span />
    return (
      <button className={`move ${m.ply === ply ? 'current' : ''}`} onClick={() => onPly(m.ply)}>
        <span className="move-san">{m.san}</span>
        {GLYPH[m.label] && <Badge label={m.label} size={15} />}
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
