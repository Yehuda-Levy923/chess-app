import { Chess } from 'chess.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getBook } from '../openings'
import { bookDepth } from '../openings/book'
import { emptyLine, fenAt, isPromotion, outcome, parseInput, play, playUci, toPgn, type Line } from './boardLine'
import { EngineLines } from './EngineLines'
import { EvalBar } from './EvalBar'
import { GameBoard } from './GameBoard'
import { IconFirst, IconFlip, IconLast, IconNext, IconPrev } from './icons'
import { useBoardKeys } from './keys'
import { checkSquare, LineMoves, PromotionPicker, useClickMove } from './LineMoves'
import { useLiveAnalysis, type Live } from './liveAnalysis'
import { localReviewGame, type LocalGame } from './localGame'
import { usePageVisible } from './pageVisible'
import { playMove } from './sound'
import './PlayScreen.css'

const BEST_ARROW = 'rgb(42 120 214 / 0.85)'

type Props = {
  /** A game or position sent over from elsewhere in the app */
  seed: { pgn: string; key: number } | null
  onPlayFrom: (fen: string) => void
  /** Opens a review of the whole line, on the move shown */
  onReview: (game: LocalGame, ply: number) => void
}

/**
 * A free board: move either side, paste a FEN or PGN, read Stockfish's lines.
 * The arrow keys walk the line; Ctrl+Z undoes the last change to it (a move
 * that replaced others, a paste, a reset).
 */
export function AnalysisScreen({ seed, onPlayFrom, onReview }: Props) {
  const [line, setLine] = useState<Line>(() => emptyLine())
  const [past, setPast] = useState<Line[]>([])
  const [flipped, setFlipped] = useState(false)
  const [engineOn, setEngineOn] = useState(true)
  const [input, setInput] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const [pending, setPending] = useState<{ from: string; to: string } | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const memo = useMemo(() => new Map<string, Live>(), [])
  const rootRef = useRef<HTMLDivElement>(null)

  /** Changes the line itself; stepping through it doesn't count, so undo only takes back edits. */
  const edit = (next: Line) => {
    setPast((p) => [...p.slice(-80), line])
    setLine(next)
  }
  const undo = () => {
    setPast((p) => {
      if (!p.length) return p
      setLine(p[p.length - 1])
      return p.slice(0, -1)
    })
  }

  useEffect(() => {
    if (!seed) return
    const r = parseInput(seed.pgn)
    if ('line' in r) {
      setPast((p) => [...p, line])
      setLine({ ...r.line, ply: 0 })
    }
    // Only a new seed loads; the line it replaces is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (!rootRef.current || rootRef.current.closest('[hidden]')) return
      e.preventDefault()
      undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const goto = (ply: number) => setLine((l) => ({ ...l, ply: Math.max(0, Math.min(l.moves.length, ply)) }))
  useBoardKeys(rootRef, { back: () => goto(line.ply - 1), forward: () => goto(line.ply + 1), first: () => goto(0), last: () => goto(line.moves.length) })

  const fen = fenAt(line)
  // Off while another page or a review is showing: a live search left running
  // here would hold the one engine for up to fifteen seconds.
  const visible = usePageVisible()
  const live = useLiveAnalysis(fen, engineOn && visible, memo)
  const best = live?.lines[0]
  const inCheck = (() => {
    try {
      return new Chess(fen).inCheck()
    } catch {
      return false
    }
  })()

  const opening = useMemo(() => {
    const sans = line.moves.slice(0, line.ply).map((m) => m.san)
    if (!sans.length || line.start !== emptyLine().start) return null
    const { byPly } = bookDepth(getBook(), sans)
    for (let i = Math.min(byPly.length, sans.length) - 1; i >= 0; i--) if (byPly[i]) return byPly[i]
    return null
  }, [line])

  const doMove = (from: string, to: string, promotion?: string) => {
    const next = play(line, { from, to, promotion })
    if (!next) return false
    playMove(next.moves[next.ply - 1].san)
    // Stepping onto the move that already comes next isn't an edit.
    if (next.moves.length === line.moves.length && next.moves[line.ply]?.uci === line.moves[line.ply]?.uci) setLine(next)
    else edit(next)
    return true
  }

  const tryMove = (from: string, to: string) => {
    if (isPromotion(fen, from, to)) {
      if (!play(line, { from, to, promotion: 'q' })) return false
      setPending({ from, to })
      return false
    }
    return doMove(from, to)
  }
  const onDrop = ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => !!targetSquare && tryMove(sourceSquare, targetSquare)
  const click = useClickMove(fen, true, tryMove)

  const load = () => {
    const r = parseInput(input)
    if ('error' in r) {
      setInputError(r.error)
      return
    }
    setInputError(null)
    setInput('')
    edit({ ...r.line, ply: r.line.moves.length })
  }

  const copy = async (what: 'FEN' | 'PGN') => {
    const text = what === 'FEN' ? fen : toPgn(line)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(`${what} copied`)
    } catch {
      setInput(text)
      setCopied(`${what} is in the box below`)
    }
    setTimeout(() => setCopied(null), 1800)
  }

  const orientation = flipped ? 'black' : 'white'

  /** Reviews every move of the line, with the side at the bottom of the board as yours. */
  const review = () => {
    const end = fenAt(line, line.moves.length)
    const over = outcome(end, [line.start, ...line.moves.map((m) => m.fen)])
    const result = !over ? '*' : over.winner === 'white' ? '1-0' : over.winner === 'black' ? '0-1' : '1/2-1/2'
    const pgn = toPgn(line, { White: 'White', Black: 'Black', Result: result })
    onReview({ game: localReviewGame(pgn, 'White', 'Black'), me: orientation, searched: new Map() }, line.ply)
  }
  const lastMove = line.ply > 0 ? ([line.moves[line.ply - 1].uci.slice(0, 2), line.moves[line.ply - 1].uci.slice(2, 4)] as [string, string]) : null

  return (
    <div className="analysis" ref={rootRef}>
      <div className="board-col">
        <div className="board-row">
          {/* Always in the layout, so turning the engine on or off never shifts the board. */}
          <div className="analysis-evalslot">{engineOn && best ? <EvalBar score={best.score} orientation={orientation} /> : <div className="evalbar evalbar-off" aria-hidden />}</div>
          <div className="analysis-board">
            <GameBoard
              fen={fen}
              orientation={orientation}
              lastMove={lastMove}
              check={checkSquare(fen, inCheck)}
              arrows={engineOn && best?.pv[0] ? [{ startSquare: best.pv[0].slice(0, 2), endSquare: best.pv[0].slice(2, 4), color: BEST_ARROW }] : []}
              allowDragging
              onPieceDrop={onDrop}
              selected={click.selected}
              targets={click.targets}
              onSquareClick={click.onSquareClick}
            />
            {pending && (
              <PromotionPicker
                color={fen.split(' ')[1] as 'w' | 'b'}
                onPick={(p) => {
                  doMove(pending.from, pending.to, p)
                  setPending(null)
                }}
                onCancel={() => setPending(null)}
              />
            )}
          </div>
        </div>
        <div className="analysis-nav">
          <button className="btn btn-icon" onClick={() => goto(0)} disabled={line.ply === 0} title="Start (Home)">
            <IconFirst />
          </button>
          <button className="btn btn-icon" onClick={() => goto(line.ply - 1)} disabled={line.ply === 0} title="Back (←)">
            <IconPrev />
          </button>
          <button className="btn btn-icon" onClick={() => goto(line.ply + 1)} disabled={line.ply === line.moves.length} title="Forward (→)">
            <IconNext />
          </button>
          <button className="btn btn-icon" onClick={() => goto(line.moves.length)} disabled={line.ply === line.moves.length} title="End (End)">
            <IconLast />
          </button>
          <button className="btn btn-icon btn-quiet" onClick={() => setFlipped((f) => !f)} title="Flip board">
            <IconFlip />
          </button>
        </div>
      </div>

      <aside className="panel analysis-panel">
        <div className="panel-head analysis-head">
          <h1 className="analysis-title">Analysis</h1>
          <span className="panel-opening" title={opening ? `${opening.eco} ${opening.name}` : undefined}>
            {opening ? opening.name : ''}
          </span>
        </div>
        <EngineLines
          live={live}
          enabled={engineOn}
          onToggle={setEngineOn}
          onPlayLine={(ucis) => {
            let l: Line | null = line
            for (const u of ucis) l = l && playUci(l, u)
            if (l) edit(l)
          }}
        />
        <div className="analysis-moves">
          {line.moves.length ? <LineMoves line={line} onPly={goto} /> : <p className="analysis-empty dim">Move a piece, or paste a game below.</p>}
        </div>
        <div className="analysis-tools">
          <div className="analysis-row">
            <button className="btn btn-primary" onClick={review} disabled={!line.moves.length}>
              Review this game
            </button>
            <button className="btn" onClick={undo} disabled={!past.length} title="Undo (Ctrl+Z)">
              Undo
            </button>
            <button className="btn" onClick={() => edit(emptyLine())} disabled={!line.moves.length && line.start === emptyLine().start}>
              New board
            </button>
            <button className="btn" onClick={() => onPlayFrom(fen)}>
              Play from here
            </button>
          </div>
          <div className="analysis-row">
            <button className="btn btn-quiet" onClick={() => copy('FEN')}>
              Copy FEN
            </button>
            <button className="btn btn-quiet" onClick={() => copy('PGN')} disabled={!line.moves.length}>
              Copy PGN
            </button>
            <span className="analysis-copied dim" aria-live="polite">
              {copied ?? ''}
            </span>
          </div>
          <label className="analysis-paste">
            <span className="dim">FEN or PGN</span>
            <textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                setInputError(null)
              }}
              rows={3}
              spellCheck={false}
            />
          </label>
          <div className="analysis-row">
            <button className="btn" onClick={load} disabled={!input.trim()}>
              Load
            </button>
            <span className="analysis-error" aria-live="polite">
              {inputError ?? ''}
            </span>
          </div>
        </div>
      </aside>
    </div>
  )
}
