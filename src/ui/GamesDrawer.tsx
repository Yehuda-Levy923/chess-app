import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ChessComGame } from '../chesscom/api'
import type { GameFacts } from '../insights/facts'
import { performance } from './findings'
import { MiniBoard } from './MiniBoard'
import { finalFen } from './gameSummary'
import './AppearanceSheet.css'

export type Drill = { title: string; detail?: ReactNode; games: GameFacts[] }

type Props = Drill & {
  lookup: (id: string) => ChessComGame | undefined
  onOpen: (game: ChessComGame) => void
  onClose: () => void
}

const PAGE = 50
const RESULT = { won: 'Won', drawn: 'Draw', lost: 'Lost' } as const

/** The games behind a number on the Insights screen, newest first. Clicking one opens its review. */
export function GamesDrawer({ title, detail, games, lookup, onOpen, onClose }: Props) {
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
          <span className="num">{games.length.toLocaleString()}</span> games: <span className="num">{record.won.toLocaleString()}</span> won,{' '}
          <span className="num">{record.drawn.toLocaleString()}</span> drawn, <span className="num">{record.lost.toLocaleString()}</span> lost. You scored{' '}
          <span className="num">{pct(perf.actual)}</span> where your ratings predicted <span className="num">{pct(perf.expected)}</span>.
        </p>
        {detail && <p className="drill-detail dim">{detail}</p>}

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
        {sorted.length > shown && (
          <button className="btn drill-more" onClick={() => setShown(shown + PAGE)}>
            Show {Math.min(PAGE, sorted.length - shown)} more
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
