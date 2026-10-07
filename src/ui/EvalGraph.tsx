import { useRef, useState } from 'react'
import { formatScore } from '../review/format'
import type { Review } from '../review/types'
import { LABEL_TEXT, toneOf } from './labels'

type Props = {
  review: Review
  ply: number
  onPly: (ply: number) => void
  /** Move indexes where the middlegame and endgame start, drawn as dividers */
  phases?: { middlegame: number | null; endgame: number | null }
}

const H = 96
const PAD_Y = 4

/** White's winning chances across the game. The light area is White's share. */
export function EvalGraph({ review, ply, onPly, phases }: Props) {
  const ref = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const dragging = useRef(false)
  const n = review.moves.length
  const W = 1000
  const values = [review.initialWinPercent, ...review.moves.map((m) => m.winPercentAfter)]
  const x = (i: number) => (n === 0 ? 0 : (i / n) * W)
  const y = (wp: number) => PAD_Y + (1 - wp / 100) * (H - 2 * PAD_Y)

  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const area = `${line}L${W},${H}L0,${H}Z`

  const plyAt = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect()
    return Math.round(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * n)
  }

  const shown = hover ?? null
  const move = shown !== null && shown > 0 ? review.moves[shown - 1] : null

  return (
    <div className="graph">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="White's winning chances by move"
        onPointerDown={(e) => {
          // Press and drag scrubs through the game.
          e.currentTarget.setPointerCapture(e.pointerId)
          dragging.current = true
          onPly(plyAt(e.clientX))
        }}
        onPointerMove={(e) => {
          const p = plyAt(e.clientX)
          setHover(p)
          if (dragging.current) onPly(p)
        }}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        onPointerLeave={() => !dragging.current && setHover(null)}
      >
        <rect width={W} height={H} fill="var(--graph-black)" />
        <path d={area} fill="var(--graph-white)" />
        <line x1={0} x2={W} y1={y(50)} y2={y(50)} stroke="var(--graph-mid)" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="3 3" />
        {/* Difference blending keeps the cursor visible over both the light and the dark area. */}
        <line x1={x(ply)} x2={x(ply)} y1={0} y2={H} stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke" style={{ mixBlendMode: 'difference' }} />
        {shown !== null && shown !== ply && (
          <line x1={x(shown)} x2={x(shown)} y1={0} y2={H} stroke="#fff" strokeOpacity={0.5} strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ mixBlendMode: 'difference' }} />
        )}
      </svg>
      {phases && (
        <div className="graph-phases" aria-hidden>
          {(['middlegame', 'endgame'] as const).map((ph) =>
            phases[ph] === null || phases[ph] === 0 ? null : (
              <span key={ph} className="graph-phase" style={{ left: `${(x(phases[ph]!) / W) * 100}%` }}>
                {ph === 'middlegame' ? 'Middlegame' : 'Endgame'}
              </span>
            ),
          )}
        </div>
      )}
      {/* Markers live outside the stretched SVG so they stay round. */}
      <div className="graph-marks" aria-hidden>
        {review.moves.map((m, i) => {
          const tone = toneOf(m.label)
          if (!tone) return null
          return (
            <span
              key={m.ply}
              className={`graph-mark mark-${tone}`}
              style={{ left: `${(x(i + 1) / W) * 100}%`, top: `${(y(m.winPercentAfter) / H) * 100}%` }}
            />
          )
        })}
      </div>
      {move && (
        <div className="graph-tip" style={{ left: `${(x(shown!) / W) * 100}%` }}>
          <span className="num">
            {Math.ceil(move.ply / 2)}
            {move.color === 'w' ? '.' : '...'} {move.san}
          </span>{' '}
          <span className="num">{formatScore(move.scoreAfter)}</span>{' '}
          <span className="dim">{LABEL_TEXT[move.label].name}</span>
        </div>
      )}
    </div>
  )
}
