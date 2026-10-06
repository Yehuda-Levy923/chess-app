import { formatScore } from '../review/format'
import { winPercent } from '../review/accuracy'
import { LIVE_LINES, pvToSan, type Live } from './liveAnalysis'
import './EngineLines.css'

type Props = {
  live: Live | null
  enabled: boolean
  onToggle: (on: boolean) => void
  /** Plays the line up to and including move `upTo` (0-based) */
  onPlayLine: (uciMoves: string[]) => void
}

export function EngineLines({ live, enabled, onToggle, onPlayLine }: Props) {
  const status = !enabled
    ? 'Off'
    : live?.over
      ? live.over.kind === 'over' && live.over.result === '1/2-1/2'
        ? 'Stalemate'
        : 'Checkmate'
      : live?.error
        ? 'Engine stopped'
        : live?.depth
          ? `Depth ${live.depth}`
          : 'Starting'

  return (
    <section className="engine" aria-label="Engine lines">
      <header className="engine-head">
        <label className="switch">
          <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
          <span className="switch-track" aria-hidden />
          Stockfish
        </label>
        <span className="engine-status num">{status}</span>
      </header>
      {enabled && !live?.over && (
        <ol className="engine-lines">
          {Array.from({ length: LIVE_LINES }, (_, i) => {
            const line = live?.lines[i]
            if (!line) return <li key={i} className="engine-line pending" aria-hidden />
            const moves = pvToSan(live!.fen, line.pv)
            const ahead = winPercent(line.score) >= 50 ? 'white' : 'black'
            return (
              <li key={i} className="engine-line">
                <span className={`engine-eval num ${ahead}`}>{formatScore(line.score)}</span>
                <span className="engine-pv">
                  {moves.map((m, j) => (
                    <button
                      key={j}
                      className="pv-move"
                      onClick={() => onPlayLine(moves.slice(0, j + 1).map((x) => x.uci))}
                      title="Play this line to here"
                    >
                      {m.label}
                    </button>
                  ))}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
