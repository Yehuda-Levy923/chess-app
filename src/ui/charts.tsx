import { useRef, useState, type ReactNode } from 'react'

/**
 * Points per game as a thin bar with a tick at 50%. One series in the accent,
 * so results never lean on win/draw/loss colours.
 */
export function ScoreBar({ score, label }: { score: number; label?: string }) {
  return (
    <span className="scorebar" role="img" aria-label={label ?? `${Math.round(score * 100)}% score`}>
      <span className="scorebar-fill" style={{ width: `${score * 100}%` }} />
      <span className="scorebar-mid" />
    </span>
  )
}

type Point = { x: number; y: number; tip: ReactNode }

type LineSeries = { id: string; name: string; points: Point[]; dashed?: boolean }

const W = 1000

/** Line chart with a crosshair tooltip. Two series at most, told apart by solid vs dashed. */
export function LineChart({ series, height = 160, yLabel, yDomain }: { series: LineSeries[]; height?: number; yLabel: string; yDomain?: [number, number] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const all = series.flatMap((s) => s.points)
  if (all.length < 2) return <p className="dim chart-empty">Not enough games to draw this yet.</p>

  const xs = all.map((p) => p.x)
  const ys = all.map((p) => p.y)
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
  const pad = (Math.max(...ys) - Math.min(...ys)) * 0.08 || 1
  const [y0, y1] = yDomain ?? [Math.min(...ys) - pad, Math.max(...ys) + pad]
  const H = height
  const sx = (x: number) => (x1 === x0 ? W / 2 : ((x - x0) / (x1 - x0)) * W)
  const sy = (y: number) => 6 + (1 - (y - y0) / (y1 - y0)) * (H - 12)
  const ticks = [y0, (y0 + y1) / 2, y1]

  const primary = series[0].points
  const nearest = hover === null ? null : primary.reduce((best, p) => (Math.abs(sx(p.x) - hover) < Math.abs(sx(best.x) - hover) ? p : best), primary[0])

  return (
    <div className="linechart">
      <div className="linechart-axis" aria-hidden>
        {ticks.map((t, i) => (
          <span key={i} className="num" style={{ top: `${(sy(t) / H) * 100}%` }}>
            {Math.round(t)}
          </span>
        ))}
      </div>
      <div
        className="linechart-plot"
        ref={ref}
        onPointerMove={(e) => {
          const r = ref.current!.getBoundingClientRect()
          setHover(((e.clientX - r.left) / r.width) * W)
        }}
        onPointerLeave={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={yLabel} style={{ height: H }}>
          {ticks.map((t, i) => (
            <line key={i} x1={0} x2={W} y1={sy(t)} y2={sy(t)} className="chart-grid" vectorEffect="non-scaling-stroke" />
          ))}
          {series.map((s) => (
            <polyline
              key={s.id}
              points={s.points.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')}
              className={`chart-line ${s.dashed ? 'dashed' : ''}`}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {nearest && <line x1={sx(nearest.x)} x2={sx(nearest.x)} y1={0} y2={H} className="chart-cross" vectorEffect="non-scaling-stroke" />}
        </svg>
        {nearest && (
          <>
            <span className="chart-dot" style={{ left: `${(sx(nearest.x) / W) * 100}%`, top: `${(sy(nearest.y) / H) * 100}%` }} />
            <div className="chart-tip" style={{ left: `${(sx(nearest.x) / W) * 100}%` }}>
              {nearest.tip}
            </div>
          </>
        )}
      </div>
      {series.length > 1 && (
        <p className="chart-legend">
          {series.map((s) => (
            <span key={s.id}>
              <svg width="22" height="8" aria-hidden>
                <line x1="1" x2="21" y1="4" y2="4" className={`chart-line ${s.dashed ? 'dashed' : ''}`} />
              </svg>
              {s.name}
            </span>
          ))}
        </p>
      )}
    </div>
  )
}

type Bar = { key: string; label: string; value: number; tip: ReactNode }

/** Vertical bars for a small ordered set (hours, move bands). Tooltip on hover. */
export function BarChart({ bars, height = 120, format }: { bars: Bar[]; height?: number; format: (v: number) => string }) {
  const [hover, setHover] = useState<string | null>(null)
  const max = Math.max(...bars.map((b) => b.value), 0) || 1
  const shown = bars.find((b) => b.key === hover)
  // A handful of bars get their values printed on top, with room left above the tallest.
  const labelled = bars.length <= 8
  return (
    <div className="barchart" style={{ height: height + 22 + (labelled ? 16 : 0), paddingTop: labelled ? 16 : 0 }}>
      <div className="barchart-bars" style={{ height }} onPointerLeave={() => setHover(null)}>
        {bars.map((b) => (
          <div key={b.key} className={`barchart-col ${hover === b.key ? 'on' : ''}`} onPointerEnter={() => setHover(b.key)}>
            <span className="barchart-bar" style={{ height: `${(b.value / max) * 100}%` }}>
              {labelled && <span className="barchart-value num">{format(b.value)}</span>}
            </span>
          </div>
        ))}
      </div>
      <div className="barchart-labels" aria-hidden>
        {bars.map((b) => (
          <span key={b.key}>{b.label}</span>
        ))}
      </div>
      {shown && (
        <div className="chart-tip barchart-tip" style={{ left: `${((bars.indexOf(shown) + 0.5) / bars.length) * 100}%` }}>
          <strong>{shown.label}</strong> {format(shown.value)}
          <br />
          {shown.tip}
        </div>
      )}
    </div>
  )
}
