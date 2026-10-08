import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ChessComGame } from '../chesscom/api'
import type { GameFacts } from '../insights/facts'
import { performance } from './findings'
import { Chess } from 'chess.js'
import { MiniBoard } from './MiniBoard'
import { finalFen } from './gameSummary'
import './AppearanceSheet.css'

/**
 * What the drawer lists: games, or (with `moments`) particular moves in them,
 * each opening its review on that move.
 */
export type Drill = { title: string; detail?: ReactNode; games: GameFacts[]; moments?: Moment[] }

export type Moment = { id: string; ply: number }

type Props = Drill & {
  lookup: (id: string) => ChessComGame | undefined
  onOpen: (game: ChessComGame, ply?: number) => void
  onClose: () => void
}

const PAGE = 50
const RESULT = { won: 'Won', drawn: 'Draw', lost: 'Lost' } as const

/** The games behind a number on the Insights screen, newest first. Clicking one opens its review. */
export function GamesDrawer({ title, detail, games, moments, lookup, onOpen, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const [shown, setShown] = useState(PAGE)
  const sorted = [...games].sort((a, b) => b.endTime - a.endTime)
  const perf = performance(games)
  const record = { won: 0, drawn: 0, lost: 0 }
  for (const g of games) record[g.outcome]++

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="sheet-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="sheet games-sheet" role="dialog" aria-modal aria-label={title}>
        <header className="sheet-head">
          <h2>{title}</h2>
          <button ref={closeRef} className="sheet-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <p className="drill-summary">
          {moments && (
            <>
              <span className="num">{moments.length.toLocaleString()}</span> {moments.length === 1 ? 'move' : 'moves'} in{' '}
            </>
          )}
          <span className="num">{games.length.toLocaleString()}</span> games: <span className="num">{record.won.toLocaleString()}</span> won,{' '}
          <span className="num">{record.drawn.toLocaleString()}</span> drawn, <span className="num">{record.lost.toLocaleString()}</span> lost. You scored{' '}
          <span className="num">{pct(perf.actual)}</span> where your ratings predicted <span className="num">{pct(perf.expected)}</span>.
        </p>
        {detail && <p className="drill-detail dim">{detail}</p>}

        {moments ? (
          <MomentList moments={moments} games={games} shown={shown} lookup={lookup} onOpen={onOpen} />
        ) : (
        <ol className="drill-list">
          {sorted.slice(0, shown).map((f) => {
            const g = lookup(f.id)
            const fen = g ? finalFen(g) : null
            return (
              <li key={f.id}>
                <button className="drill-game" onClick={() => g && onOpen(g)} disabled={!g}>
                  {fen ? <MiniBoard fen={fen} orientation={f.side} /> : <span className="miniboard" />}
                  <span className="drill-main">
                    <span className="drill-line">
                      <span className={`drill-result ${f.outcome}`}>{RESULT[f.outcome]}</span>
                      <span className="drill-vs">
                        vs <strong>{f.opponent}</strong> <span className="num dim">{f.oppRatingBefore}</span>
                      </span>
                    </span>
                    <span className="drill-sub">{[f.opening ?? f.family, f.timeClass].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="drill-date num">{formatDay(f.endTime)}</span>
                </button>
              </li>
            )
          })}
        </ol>
        )}
        {(moments?.length ?? sorted.length) > shown && (
          <button className="btn drill-more" onClick={() => setShown(shown + PAGE)}>
            Show {Math.min(PAGE, (moments?.length ?? sorted.length) - shown)} more
          </button>
        )}
      </aside>
    </div>
  )
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`

function formatDay(seconds: number): string {
  const d = new Date(seconds * 1000)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

/** Individual moves, newest game first: the position after the move, the move, and where it was played. */
function MomentList({ moments, games, shown, lookup, onOpen }: { moments: Moment[]; games: GameFacts[]; shown: number } & Pick<Props, 'lookup' | 'onOpen'>) {
  const byId = new Map(games.map((g) => [g.id, g]))
  const sorted = [...moments].sort((a, b) => (byId.get(b.id)?.endTime ?? 0) - (byId.get(a.id)?.endTime ?? 0) || a.ply - b.ply)
  return (
    <ol className="drill-list">
      {sorted.slice(0, shown).map((m) => {
        const f = byId.get(m.id)
        const g = lookup(m.id)
        if (!f) return null
        const fen = positionAfter(f.sans, m.ply)
        const san = f.sans[m.ply - 1]
        return (
          <li key={`${m.id}:${m.ply}`}>
            <button className="drill-game" onClick={() => g && onOpen(g, m.ply)} disabled={!g}>
              {fen ? <MiniBoard fen={fen} orientation={f.side} /> : <span className="miniboard" />}
              <span className="drill-main">
                <span className="drill-line">
                  <strong className="num">
                    {Math.ceil(m.ply / 2)}
                    {m.ply % 2 === 1 ? '.' : '...'} {san}
                  </strong>
                  <span className="drill-vs">
                    vs {f.opponent} <span className="num dim">{f.oppRatingBefore}</span>
                  </span>
                </span>
                <span className="drill-sub">{[RESULT[f.outcome], f.opening ?? f.family, f.timeClass].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="drill-date num">{formatDay(f.endTime)}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function positionAfter(sans: string[], ply: number): string | null {
  const chess = new Chess()
  try {
    for (const san of sans.slice(0, ply)) chess.move(san)
    return chess.fen()
  } catch {
    return null
  }
}
