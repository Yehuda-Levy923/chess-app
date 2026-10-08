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

/**
 * Line chart with a crosshair tooltip. Two series at most, told apart by solid
 * vs dashed. With `zoomable`, dragging across the plot zooms to that span;
 * double-click or "Show all" goes back.
 */
export function LineChart({
  series,
  height = 160,
  yLabel,
  yDomain,
  zoomable = false,
  formatX,
  marks = [],
}: {
  series: LineSeries[]
  height?: number
  yLabel: string
  yDomain?: [number, number]
  zoomable?: boolean
  /** Labels the start and end of the visible span, e.g. as dates */
  formatX?: (x: number) => string
  /** Labelled points worth calling out, e.g. the peak */
  marks?: { x: number; y: number; label: string }[]
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [zoom, setZoom] = useState<[number, number] | null>(null)
  const [drag, setDrag] = useState<[number, number] | null>(null)

  const inView = (x: number) => !zoom || (x >= zoom[0] && x <= zoom[1])
  const visible = series.map((s) => ({ ...s, points: s.points.filter((p) => inView(p.x)) }))
  const all = visible.flatMap((s) => s.points)
  if (series.flatMap((s) => s.points).length < 2) return <p className="dim chart-empty">Not enough games to draw this yet.</p>

  const xs = all.map((p) => p.x)
  const ys = all.map((p) => p.y)
  const [x0, x1] = zoom ?? [Math.min(...xs), Math.max(...xs)]
  const pad = (Math.max(...ys) - Math.min(...ys)) * 0.08 || 1
  const [y0, y1] = yDomain ?? [Math.min(...ys) - pad, Math.max(...ys) + pad]
  const H = height
  const sx = (x: number) => (x1 === x0 ? W / 2 : ((x - x0) / (x1 - x0)) * W)
  const sy = (y: number) => 6 + (1 - (y - y0) / (y1 - y0)) * (H - 12)
  const ticks = [y0, (y0 + y1) / 2, y1]
  /** Plot x (0..W) back to a data x */
  const dx = (px: number) => x0 + (px / W) * (x1 - x0)
  const plotX = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    return Math.min(W, Math.max(0, ((clientX - r.left) / r.width) * W))
  }

  const primary = visible[0].points
  const nearest =
    hover === null || drag || primary.length === 0
      ? null
      : primary.reduce((best, p) => (Math.abs(sx(p.x) - hover) < Math.abs(sx(best.x) - hover) ? p : best), primary[0])

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
        className={`linechart-plot ${zoomable ? 'zoomable' : ''}`}
        ref={ref}
        onPointerDown={(e) => {
          if (!zoomable) return
          e.currentTarget.setPointerCapture(e.pointerId)
          const x = plotX(e.clientX)
          setDrag([x, x])
        }}
        onPointerMove={(e) => {
          const x = plotX(e.clientX)
          setHover(x)
          if (drag) setDrag([drag[0], x])
        }}
        onPointerUp={() => {
          if (drag && Math.abs(drag[1] - drag[0]) > W * 0.02) {
            const [a, b] = [dx(Math.min(...drag)), dx(Math.max(...drag))]
            // Only zoom in on a span that still holds a couple of points.
            if (primary.filter((p) => p.x >= a && p.x <= b).length >= 2) setZoom([a, b])
          }
          setDrag(null)
        }}
        onPointerLeave={() => !drag && setHover(null)}
        onDoubleClick={() => setZoom(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={yLabel} style={{ height: H }}>
          {ticks.map((t, i) => (
            <line key={i} x1={0} x2={W} y1={sy(t)} y2={sy(t)} className="chart-grid" vectorEffect="non-scaling-stroke" />
          ))}
          {visible.map((s) => (
            <polyline
              key={s.id}
              points={s.points.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')}
              className={`chart-line ${s.dashed ? 'dashed' : ''}`}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {drag && <rect x={Math.min(...drag)} width={Math.abs(drag[1] - drag[0])} y={0} height={H} className="chart-brush" />}
          {nearest && <line x1={sx(nearest.x)} x2={sx(nearest.x)} y1={0} y2={H} className="chart-cross" vectorEffect="non-scaling-stroke" />}
        </svg>
        {marks
          .filter((m) => inView(m.x))
          .map((m) => (
            <span key={m.label} className="chart-mark" style={{ left: `${(sx(m.x) / W) * 100}%`, top: `${(sy(m.y) / H) * 100}%` }}>
              <span className="chart-mark-label">{m.label}</span>
            </span>
          ))}
        {nearest && (
          <>
            <span className="chart-dot" style={{ left: `${(sx(nearest.x) / W) * 100}%`, top: `${(sy(nearest.y) / H) * 100}%` }} />
            <div className="chart-tip" style={{ left: `${(sx(nearest.x) / W) * 100}%` }}>
              {nearest.tip}
            </div>
          </>
        )}
      </div>
      {(formatX || zoomable) && (
        <div className="linechart-foot">
          {formatX && <span className="num">{formatX(x0)}</span>}
          {zoomable &&
            (zoom ? (
              <button className="btn btn-quiet chart-reset" onClick={() => setZoom(null)}>
                Show all
              </button>
            ) : (
              <span className="dim">Drag across the chart to zoom</span>
            ))}
          {formatX && <span className="num">{formatX(x1)}</span>}
        </div>
      )}
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

/** Actual result as a filled bar against a tick where the ratings predicted it would be. */
export function PerfBar({ actual, expected }: { actual: number; expected: number }) {
  return (
    <span className="perfbar" role="img" aria-label={`${Math.round(actual * 100)}% scored, ${Math.round(expected * 100)}% expected`}>
      <span className="perfbar-fill" style={{ width: `${actual * 100}%` }} />
      <span className="perfbar-expected" style={{ left: `${expected * 100}%` }} />
    </span>
  )
}

type Signed = { key: string; label: string; value: number; tip: ReactNode }

/**
 * Bars above or below a zero line, e.g. each month's score against what the
 * ratings predicted. Hover for detail; click to see that bar's games.
 */
export function DivergingBars({ bars, height = 120, onPick }: { bars: Signed[]; height?: number; onPick?: (key: string) => void }) {
  const [hover, setHover] = useState<string | null>(null)
  const max = Math.max(...bars.map((b) => Math.abs(b.value)), 0.01)
  const shown = bars.find((b) => b.key === hover)
  const every = Math.max(1, Math.ceil(bars.length / 8))
  return (
    <div className="divbars" style={{ height: height + 20 }}>
      <div className="divbars-plot" style={{ height }} onPointerLeave={() => setHover(null)}>
        <span className="divbars-zero" />
        {bars.map((b) => {
          const h = (Math.abs(b.value) / max) * 50
          return (
            <button
              key={b.key}
              className={`divbars-col ${hover === b.key ? 'on' : ''}`}
              onPointerEnter={() => setHover(b.key)}
              onFocus={() => setHover(b.key)}
              onClick={() => onPick?.(b.key)}
              aria-label={`${b.label}: ${b.value >= 0 ? '+' : ''}${b.value.toFixed(1)}`}
            >
              <span className={`divbars-bar ${b.value < 0 ? 'neg' : 'pos'}`} style={b.value < 0 ? { top: '50%', height: `${h}%` } : { bottom: '50%', height: `${h}%` }} />
            </button>
          )
        })}
      </div>
      <div className="divbars-labels" aria-hidden>
        {bars.map((b, i) => (
          <span key={b.key}>{i % every === 0 ? b.label : ''}</span>
        ))}
      </div>
      {shown && (
        <div className="chart-tip divbars-tip" style={{ left: `${((bars.indexOf(shown) + 0.5) / bars.length) * 100}%` }}>
          {shown.tip}
        </div>
      )}
    </div>
  )
}

/** A one-line trend with no axes, e.g. a rating across recent games. */
export function Sparkline({ values, label, width = 120, height = 28 }: { values: number[]; label: string; width?: number; height?: number }) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const points = values.map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`).join(' ')
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={label}>
      <title>{`${label}: ${min.toLocaleString()} to ${max.toLocaleString()}`}</title>
      <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
