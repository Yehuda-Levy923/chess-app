import { useEffect, useRef, useState } from 'react'
import { BOARDS, boardById, PIECE_SETS, THEMES, useAppearance, type Appearance, type BoardDef } from './appearance'
import { GameBoard } from './GameBoard'
import './AppearanceSheet.css'

// A position with every piece type on show, so a set can be judged at a glance.
const PREVIEW_FEN = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQ1RK1 b kq - 1 5'

function BoardSwatch({ board }: { board: BoardDef }) {
  if (board.image) {
    return <img src={board.image} alt="" crossOrigin={board.crossOrigin ? 'anonymous' : undefined} draggable={false} />
  }
  return (
    <svg viewBox="0 0 4 4" preserveAspectRatio="none" aria-hidden>
      <rect width="4" height="4" fill={board.light} />
      <path d="M1 0h1v1H1zM3 0h1v1H3zM0 1h1v1H0zM2 1h1v1H2zM1 2h1v1H1zM3 2h1v1H3zM0 3h1v1H0zM2 3h1v1H2z" fill={board.dark} />
    </svg>
  )
}

type Account = {
  username: string
  depth: number
  onUsername: (u: string) => void
  onDepth: (d: number) => void
}

export function AppearanceSheet({ onClose, account }: { onClose: () => void; account?: Account }) {
  const { appearance, setAppearance } = useAppearance()
  const closeRef = useRef<HTMLButtonElement>(null)
  const set = (patch: Partial<Appearance>) => setAppearance({ ...appearance, ...patch })
  // Piece swatches sit on the chosen board's light square, so black sets stay visible on dark themes.
  const currentBoard = boardById(appearance.board)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="sheet-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="sheet" role="dialog" aria-modal aria-label="Settings">
        <header className="sheet-head">
          <h2>Settings</h2>
          <button ref={closeRef} className="sheet-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="sheet-preview">
          <GameBoard fen={PREVIEW_FEN} lastMove={['e1', 'g1']} mark={{ square: 'g1', label: 'best' }} />
        </div>

        <section className="sheet-section">
          <h3>Pieces</h3>
          <div className="choice-grid pieces">
            {PIECE_SETS.map((p) => (
              <button key={p.id} className={`choice ${appearance.pieces === p.id ? 'on' : ''}`} onClick={() => set({ pieces: p.id })} aria-pressed={appearance.pieces === p.id}>
                <span className="choice-art piece-art" style={{ background: currentBoard.light }}>
                  {(['wN', 'bN'] as const).map((c) => (
                    <img key={c} src={p.src(c)} alt="" crossOrigin={p.crossOrigin ? 'anonymous' : undefined} draggable={false} />
                  ))}
                </span>
                <span className="choice-name">{p.name}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="sheet-section">
          <h3>Board</h3>
          <div className="choice-grid boards">
            {BOARDS.map((b) => (
              <button key={b.id} className={`choice ${appearance.board === b.id ? 'on' : ''}`} onClick={() => set({ board: b.id })} aria-pressed={appearance.board === b.id}>
                <span className="choice-art board-art">
                  <BoardSwatch board={b} />
                </span>
                <span className="choice-name">{b.name}</span>
              </button>
            ))}
          </div>
          <label className="sheet-toggle">
            <input type="checkbox" checked={appearance.coordinates} onChange={(e) => set({ coordinates: e.target.checked })} />
            Coordinates on the board
          </label>
          <label className="sheet-toggle">
            <input type="checkbox" checked={appearance.sound} onChange={(e) => set({ sound: e.target.checked })} />
            Move sounds
          </label>
        </section>

        <section className="sheet-section">
          <h3>Background</h3>
          <div className="theme-list">
            {THEMES.map((t) => (
              <button key={t.id} className={`theme ${appearance.theme === t.id ? 'on' : ''}`} onClick={() => set({ theme: t.id })} aria-pressed={appearance.theme === t.id}>
                <span className="theme-swatch" aria-hidden>
                  {t.swatch.map((c, i) => (
                    <span key={i} style={{ background: c }} />
                  ))}
                </span>
                {t.name}
              </button>
            ))}
          </div>
        </section>

        {account && <AccountSection {...account} />}
      </aside>
    </div>
  )
}

function AccountSection({ username, depth, onUsername, onDepth }: Account) {
  const [draft, setDraft] = useState(username)
  return (
    <section className="sheet-section">
      <h3>Games</h3>
      <form
        className="sheet-account"
        onSubmit={(e) => {
          e.preventDefault()
          if (draft.trim()) onUsername(draft.trim())
        }}
      >
        <label>
          <span>chess.com username</span>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} />
        </label>
        <button className="btn" type="submit" disabled={!draft.trim() || draft.trim() === username}>
          Load
        </button>
      </form>
      <label className="sheet-field">
        <span>Engine depth for new reviews</span>
        <select value={depth} onChange={(e) => onDepth(Number(e.target.value))}>
          <option value={12}>12, quick</option>
          <option value={16}>16</option>
          <option value={20}>20, slow</option>
        </select>
      </label>
    </section>
  )
}
