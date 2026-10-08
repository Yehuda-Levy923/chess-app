import { Chess } from 'chess.js'
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { Arrow } from 'react-chessboard'
import type { ChessComGame } from '../chesscom/api'
import { loadReview } from '../review/cache'
import { formatScore } from '../review/format'
import type { Label, Review } from '../review/types'
import { GameBoard } from './GameBoard'
import { opponentOf, shortDate } from './gameText'
import { useHistory } from './history'
import { useBoardKeys, notForBoard, onScreen } from './keys'
import { LABEL_TEXT } from './labels'
import { loadSolved, practiceOrder, practicePool, saveSolved, type Puzzle } from './practice'
import { judge, type Attempt } from './RetryPanel'
import { playCue, playMove } from './sound'
import './PracticeScreen.css'

export type PracticeFocus = { title: string; ids: Set<string> }

type Props = {
  username: string
  focus: PracticeFocus | null
  onClearFocus: () => void
  onOpen: (game: ChessComGame, ply?: number) => void
}

const ARROW_ANSWER = 'rgb(232 116 46 / 0.9)'

type Session = { solved: number; tried: number; streak: number; best: number }

/** Positions from your own games where you went wrong, to find the move you missed. */
export function PracticeScreen({ username, focus, onClearFocus, onOpen }: Props) {
  const { facts, summaries, summariesLoaded, byUuid } = useHistory()
  const rootRef = useRef<HTMLElement>(null)

  const pool = useMemo(() => {
    if (!facts) return []
    const byId = new Map(facts.map((f) => [f.id, f]))
    return practicePool(summaries, (id) => byId.get(id) ?? null, focus?.ids)
  }, [facts, summaries, focus])
  // Ordered once per pool, so solving one doesn't reshuffle the queue under you.
  const order = useMemo(() => practiceOrder(pool, loadSolved()), [pool])
  const games = useMemo(() => new Set(pool.map((p) => p.gameId)).size, [pool])

  const [at, setAt] = useState(0)
  const [session, setSession] = useState<Session>({ solved: 0, tried: 0, streak: 0, best: 0 })
  useEffect(() => setAt(0), [order])

  const puzzle = order[at] ?? null
  const next = useCallback(() => setAt((i) => (order.length ? (i + 1) % order.length : 0)), [order.length])

  if (!facts || !summariesLoaded) {
    return (
      <main className="practice" ref={rootRef}>
        <h1 className="page-title">Practice</h1>
        <p className="dim practice-lead">{facts ? 'Reading your reviews…' : 'Reading your games…'}</p>
      </main>
    )
  }

  return (
    <main className="practice" ref={rootRef}>
      <header className="practice-head">
        <h1 className="page-title">Practice</h1>
        <p className="dim practice-lead">
          {pool.length ? (
            <>
              <span className="num">{pool.length.toLocaleString()}</span> positions where you made a mistake or blunder, from{' '}
              <span className="num">{games.toLocaleString()}</span> reviewed {games === 1 ? 'game' : 'games'}
            </>
          ) : null}
        </p>
      </header>

      {focus && (
        <p className="practice-focus">
          Only games from <strong>{focus.title}</strong>
          <button className="btn btn-quiet" onClick={onClearFocus}>
            Practise everything
          </button>
        </p>
      )}

      {!puzzle ? (
        <div className="practice-empty">
          <p>{summaries.length ? 'None of your reviewed games here have a mistake or blunder to practise.' : 'Practice positions come from reviewed games, and none are reviewed yet.'}</p>
          <p className="dim">Open any game from Games to review it, or import the batch reviews under Insights, Engine.</p>
        </div>
      ) : (
        <PuzzleView
          key={puzzle.id}
          puzzle={puzzle}
          game={byUuid.get(puzzle.gameId) ?? null}
          me={username.toLowerCase()}
          rootRef={rootRef}
          session={session}
          position={`${at + 1} of ${order.length.toLocaleString()}`}
          onResult={(firstTry) => {
            setSession((s) => {
              const streak = firstTry ? s.streak + 1 : 0
              return { solved: s.solved + (firstTry ? 1 : 0), tried: s.tried + 1, streak, best: Math.max(s.best, streak) }
            })
            if (firstTry) {
              const solved = loadSolved()
              solved.add(puzzle.id)
              saveSolved(solved)
            }
          }}
          onNext={next}
          onOpen={onOpen}
        />
      )}
    </main>
  )
}

type ViewProps = {
  puzzle: Puzzle
  game: ChessComGame | null
  me: string
  rootRef: RefObject<HTMLElement | null>
  session: Session
  position: string
  /** Once per puzzle: whether it was solved on the first try without help */
  onResult: (firstTry: boolean) => void
  onNext: () => void
  onOpen: (game: ChessComGame, ply?: number) => void
}

function PuzzleView({ puzzle, game, me, rootRef, session, position, onResult, onNext, onOpen }: ViewProps) {
  const [review, setReview] = useState<Review | null | 'missing'>(null)
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [tried, setTried] = useState<{ fen: string; from: string; to: string } | null>(null)
  const [wrongs, setWrongs] = useState(0)
  const [hinted, setHinted] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [solved, setSolved] = useState(false)
  // Which position of the game is on the board; the puzzle is at puzzle.index.
  const [view, setView] = useState(puzzle.index)
  const reported = useRef(false)

  useEffect(() => {
    let live = true
    loadReview(puzzle.gameId, puzzle.depth).then((r) => live && setReview(r ?? 'missing'))
    return () => {
      live = false
    }
  }, [puzzle.gameId, puzzle.depth])

  const report = (firstTry: boolean) => {
    if (reported.current) return
    reported.current = true
    onResult(firstTry)
  }

  const r = review && review !== 'missing' ? review : null
  const target = r?.moves[puzzle.index] ?? null
  const done = solved || revealed
  const n = r?.moves.length ?? 0
  // Before it's answered you can look back at how the position came about, not ahead at what happened.
  const maxView = done ? n : puzzle.index
  const step = (d: number) => setView((v) => Math.max(0, Math.min(maxView, v + d)))
  const atPuzzle = view === puzzle.index

  const reveal = () => {
    if (done) return
    setRevealed(true)
    setView(puzzle.index)
    setTried(null)
    report(false)
  }

  useBoardKeys(rootRef, {
    back: () => step(-1),
    forward: () => {
      if (view < maxView && r) playMove(r.moves[view].san)
      step(1)
    },
    first: () => setView(0),
    last: () => setView(maxView),
  })

  // Space or Enter for the next puzzle once this one is done, H for a hint, S to show the answer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (notForBoard(e) || !onScreen(rootRef.current) || e.target instanceof HTMLButtonElement) return
      if ((e.key === ' ' || e.key === 'Enter') && done) onNext()
      else if (e.key === 'h' && !done) setHinted(true)
      else if (e.key === 's' && !done) reveal()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (review === null) return <div className="puzzle-loading" />
  if (!r || !target || !target.bestUci) {
    return (
      <div className="practice-empty">
        <p>This position's review couldn't be read.</p>
        <button className="btn" onClick={onNext}>
          Next position
        </button>
      </div>
    )
  }

  const onDrop = ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
    if (!targetSquare || done || !atPuzzle || attempt?.state === 'thinking') return false
    const chess = new Chess(target.fenBefore)
    let move
    try {
      move = chess.move({ from: sourceSquare, to: targetSquare, promotion: 'q' })
    } catch {
      return false
    }
    playMove(move.san)
    const fen = chess.fen()
    setTried({ fen, from: sourceSquare, to: targetSquare })
    setAttempt({ state: 'thinking', san: move.san })
    judge(target, sourceSquare, targetSquare).then((a) => {
      setAttempt(a)
      if (a?.state === 'right') {
        playCue('right')
        setSolved(true)
        report(wrongs === 0 && !hinted)
      } else {
        playCue('wrong')
        setWrongs((w) => w + 1)
        // Let the wrong move sit long enough to read, then put the position back.
        setTimeout(() => setTried((t) => (t?.fen === fen ? null : t)), 900)
      }
    })
    return true
  }

  // The board: the puzzle (with your try on it), or another position of the game.
  let fen: string
  let lastMove: [string, string] | null
  let mark: { square: string; label: Label } | null = null
  const arrows: Arrow[] = []
  if (atPuzzle) {
    fen = tried?.fen ?? target.fenBefore
    const prev = r.moves[puzzle.index - 1]
    lastMove = tried ? [tried.from, tried.to] : prev ? [prev.uci.slice(0, 2), prev.uci.slice(2, 4)] : null
    if (tried && (attempt?.state === 'right' || attempt?.state === 'wrong')) mark = { square: tried.to, label: attempt.state === 'right' ? 'best' : 'mistake' }
    if (revealed) arrows.push({ startSquare: target.bestUci.slice(0, 2), endSquare: target.bestUci.slice(2, 4), color: ARROW_ANSWER })
  } else {
    const m = r.moves[view - 1]
    fen = view === n ? r.moves[n - 1].fenAfter : r.moves[view].fenBefore
    lastMove = m ? [m.uci.slice(0, 2), m.uci.slice(2, 4)] : null
    if (m) mark = { square: m.uci.slice(2, 4), label: m.label }
  }
  const hintSquare = hinted && !done && atPuzzle && !tried ? target.bestUci.slice(0, 2) : null

  const side = target.color === 'w' ? 'White' : 'Black'
  const opp = game ? opponentOf(game, me) : null

  return (
    <div className="puzzle">
      <div className="puzzle-board">
        <GameBoard
          fen={fen}
          orientation={puzzle.side}
          lastMove={lastMove}
          mark={mark}
          arrows={arrows}
          hint={hintSquare}
          allowDragging={atPuzzle && !done && attempt?.state !== 'thinking'}
          onPieceDrop={onDrop}
        />
        <p className="puzzle-where dim num">
          {atPuzzle ? 'The position' : view < puzzle.index ? `${puzzle.index - view} ${puzzle.index - view === 1 ? 'move' : 'moves'} before` : `${view - puzzle.index} ${view - puzzle.index === 1 ? 'move' : 'moves'} after`}
          <span className="puzzle-keys">← → to step through the game</span>
        </p>
      </div>

      <section className="puzzle-panel">
        <p className="puzzle-prompt">
          {done ? (solved ? 'Solved' : 'The answer') : `${side} to move. Find the better move.`}
        </p>
        <p className="puzzle-context">
          Move {puzzle.moveNumber}
          {opp && game ? (
            <>
              {' '}
              against {opp.username}, {shortDate(game.endTime, true)}
            </>
          ) : null}
          . You played <strong>{target.san}</strong>, {LABEL_TEXT[target.label].phrase}.
        </p>

        <div className="puzzle-status" aria-live="polite">
          {attempt?.state === 'thinking' && <p className="dim">Checking {attempt.san}…</p>}
          {attempt?.state === 'right' && (
            <p className="right">
              {attempt.san} holds it at <span className="num">{formatScore(attempt.score)}</span>
              {target.bestSan && target.bestSan !== attempt.san ? <>, as good as the engine's {target.bestSan}</> : null}.
            </p>
          )}
          {attempt?.state === 'wrong' && !revealed && (
            <p>
              {attempt.san} scores <span className="num">{formatScore(attempt.score)}</span>. Try again.
            </p>
          )}
          {revealed && (
            <p>
              The engine plays <strong>{target.bestSan}</strong>
              {target.scoreBest ? (
                <>
                  , <span className="num">{formatScore(target.scoreBest)}</span>
                </>
              ) : null}
              .
            </p>
          )}
          {hinted && !done && <p className="dim">The piece to move is marked.</p>}
        </div>

        <div className="puzzle-actions">
          {done ? (
            <button className="btn btn-primary puzzle-next" onClick={onNext}>
              Next position <kbd>Space</kbd>
            </button>
          ) : (
            <>
              <button className="btn" onClick={() => setHinted(true)} disabled={hinted}>
                Hint <kbd>H</kbd>
              </button>
              <button className="btn" onClick={reveal}>
                Show answer <kbd>S</kbd>
              </button>
              <button className="btn btn-quiet" onClick={onNext}>
                Skip
              </button>
            </>
          )}
          {game && (
            <button className="btn btn-quiet" onClick={() => onOpen(game, puzzle.ply)}>
              Open the game
            </button>
          )}
        </div>

        <dl className="puzzle-session">
          <div>
            <dt>Position</dt>
            <dd className="num">{position}</dd>
          </div>
          <div>
            <dt>Solved first try</dt>
            <dd className="num">
              {session.solved} of {session.tried}
            </dd>
          </div>
          <div>
            <dt>Streak</dt>
            <dd className="num">{session.streak}</dd>
          </div>
          <div>
            <dt>Best streak</dt>
            <dd className="num">{session.best}</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
