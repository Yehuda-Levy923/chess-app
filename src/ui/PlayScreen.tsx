import { Chess } from 'chess.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getEngine } from '../stockfish/shared'
import { pieceSetById, useAppearance } from './appearance'
import { emptyLine, fenAt, isPromotion, outcome, play, playUci, START_FEN, toPgn, type Line, type Outcome } from './boardLine'
import { BOTS, botById } from './bots'
import { GameBoard } from './GameBoard'
import { IconFlip } from './icons'
import { checkSquare, LineMoves, PromotionPicker, useClickMove } from './LineMoves'
import { localReviewGame, type LocalGame } from './localGame'
import { usePageVisible } from './pageVisible'
import { playMove } from './sound'
import { useReviewWhilePlaying } from './useReviewWhilePlaying'
import './PlayScreen.css'

type Side = 'white' | 'black'
type Choice = Side | 'random'

type Game = { line: Line; me: Side; botId: string; ended: Outcome | null; resigned: boolean }

function remembered(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}
function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore
  }
}

type Props = {
  username: string
  /** The review depth from Settings */
  depth: number
  /** A position to start from, sent over from the analysis board */
  seed: { fen: string; key: number } | null
  onAnalyse: (pgn: string) => void
  /** Opens the finished game's review, with the positions searched while it was played */
  onReview: (game: LocalGame) => void
}

/** Play the computer: pick an opponent by its piece, pick a side, play, take back, ask for a hint. */
export function PlayScreen({ username, depth, seed, onAnalyse, onReview }: Props) {
  const { appearance } = useAppearance()
  const set = pieceSetById(appearance.pieces)
  const [botId, setBotId] = useState(() => remembered('playBot', 'bishop'))
  const [choice, setChoice] = useState<Choice>(() => remembered('playSide', 'white') as Choice)
  const [startFen, setStartFen] = useState(START_FEN)
  const [game, setGame] = useState<Game | null>(null)
  const [thinking, setThinking] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [hinting, setHinting] = useState(false)
  const [pending, setPending] = useState<{ from: string; to: string } | null>(null)
  const [flipped, setFlipped] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Bumped whenever the position changes under a pending bot reply, so a stale reply is dropped.
  const turnToken = useRef(0)

  useEffect(() => {
    if (!seed) return
    setStartFen(seed.fen)
    setGame(null)
  }, [seed])

  const bot = botById(game?.botId ?? botId)
  const fen = game ? fenAt(game.line) : startFen
  const turn: Side = fen.split(' ')[1] === 'w' ? 'white' : 'black'
  const live = game && !game.ended
  const myTurn = !!live && turn === game.me && !thinking

  // The review runs on your move and after the game, never while the engine is
  // wanted for the computer's move or a hint, nor while another page is showing.
  const visible = usePageVisible()
  const positions = game ? [game.line.start, ...game.line.moves.slice(0, game.line.ply).map((m) => m.fen)] : []
  const searched = useReviewWhilePlaying(positions, depth, visible && (myTurn || !!game?.ended) && !hinting)
  const unsearched = positions.filter((f) => !searched.has(f)).length

  const start = () => {
    const me: Side = choice === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : choice
    remember('playBot', botId)
    remember('playSide', choice)
    turnToken.current++
    setHint(null)
    setError(null)
    setFlipped(false)
    getEngine().newGame().catch(() => undefined)
    setGame({ line: emptyLine(startFen), me, botId, ended: null, resigned: false })
  }

  const finishIfOver = (line: Line): Outcome | null => outcome(fenAt(line), [line.start, ...line.moves.slice(0, line.ply).map((m) => m.fen)])

  // The computer's move, whenever it is its turn.
  useEffect(() => {
    if (!game || game.ended || turn === game.me) return
    const token = ++turnToken.current
    setThinking(true)
    const at = fenAt(game.line)
    getEngine()
      .bestMove(at, botById(game.botId).strength)
      .then((uci) => {
        if (token !== turnToken.current) return
        setGame((g) => {
          if (!g || g.ended || fenAt(g.line) !== at) return g
          const line = playUci(g.line, uci)
          if (!line) return g
          playMove(line.moves[line.ply - 1].san)
          return { ...g, line, ended: finishIfOver(line) }
        })
      })
      .catch((e) => token === turnToken.current && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => token === turnToken.current && setThinking(false))
  }, [game, turn])

  const move = (from: string, to: string, promotion?: string) => {
    if (!game || !myTurn) return false
    const line = play(game.line, { from, to, promotion })
    if (!line) return false
    playMove(line.moves[line.ply - 1].san)
    setHint(null)
    setGame({ ...game, line, ended: finishIfOver(line) })
    return true
  }

  const tryMove = (from: string, to: string) => {
    if (!myTurn) return false
    if (isPromotion(fen, from, to)) {
      // Only offer the choice for a move that is otherwise legal.
      if (!play(game!.line, { from, to, promotion: 'q' })) return false
      setPending({ from, to })
      return false
    }
    return move(from, to)
  }
  const onDrop = ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => !!targetSquare && tryMove(sourceSquare, targetSquare)
  const click = useClickMove(fen, myTurn, tryMove)

  /** Back to the last position where it was your move, before the move you made from it. */
  const takeBack = useCallback(() => {
    setGame((g) => {
      if (!g || g.line.ply === 0) return g
      let ply = g.line.ply - 1
      const sideAt = (p: number) => (fenAt(g.line, p).split(' ')[1] === 'w' ? 'white' : 'black')
      while (ply > 0 && sideAt(ply) !== g.me) ply--
      if (sideAt(ply) !== g.me) return g
      turnToken.current++
      setThinking(false)
      setHint(null)
      return { ...g, line: { ...g.line, moves: g.line.moves.slice(0, ply), ply }, ended: null, resigned: false }
    })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (!rootRef.current || rootRef.current.closest('[hidden]')) return
      e.preventDefault()
      takeBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [takeBack])

  const askHint = () => {
    if (!myTurn) return
    const at = fen
    setHinting(true)
    getEngine()
      .analyse(at, 14, 900)
      .then((a) => {
        if (game && fenAt(game.line) === at && a.lines[0]?.pv[0]) setHint(a.lines[0].pv[0])
      })
      .catch(() => undefined)
      .finally(() => setHinting(false))
  }

  const resign = () => game && !game.ended && setGame({ ...game, ended: { winner: game.me === 'white' ? 'black' : 'white', reason: 'resignation' }, resigned: true })

  const rootRef = useRef<HTMLDivElement>(null)
  const me = game?.me ?? (choice === 'black' ? 'black' : 'white')
  const orientation: Side = flipped ? (me === 'white' ? 'black' : 'white') : me
  const lastMove = game && game.line.ply > 0 ? ([game.line.moves[game.line.ply - 1].uci.slice(0, 2), game.line.moves[game.line.ply - 1].uci.slice(2, 4)] as [string, string]) : null
  const inCheck = (() => {
    try {
      return new Chess(fen).inCheck()
    } catch {
      return false
    }
  })()

  const you = username || 'You'
  const top = orientation === 'white' ? 'black' : 'white'
  const nameOf = (s: Side) => (game ? (s === game.me ? you : `${bot.name}, ${bot.level}`) : s === me ? you : `${botById(botId).name}`)

  const status = !game
    ? null
    : game.ended
      ? endLine(game.ended, game.me, bot.name)
      : error
        ? error
        : thinking
          ? `${bot.name} is thinking`
          : turn === game.me
            ? inCheck
              ? 'Check. Your move'
              : 'Your move'
            : `${bot.name} to move`

  return (
    <div className="play" ref={rootRef}>
      <div className="board-col">
        <div className="player">
          <span className={`player-swatch ${top}`} />
          <span className="player-name">{nameOf(top)}</span>
        </div>
        <div className="play-board">
          <GameBoard
            fen={fen}
            orientation={orientation}
            lastMove={lastMove}
            check={checkSquare(fen, inCheck)}
            arrows={hint ? [{ startSquare: hint.slice(0, 2), endSquare: hint.slice(2, 4), color: 'rgb(42 120 214 / 0.85)' }] : []}
            allowDragging={myTurn}
            onPieceDrop={onDrop}
            selected={click.selected}
            targets={click.targets}
            onSquareClick={click.onSquareClick}
          />
          {pending && (
            <PromotionPicker
              color={turn === 'white' ? 'w' : 'b'}
              onPick={(p) => {
                move(pending.from, pending.to, p)
                setPending(null)
              }}
              onCancel={() => setPending(null)}
            />
          )}
        </div>
        <div className="player">
          <span className={`player-swatch ${orientation}`} />
          <span className="player-name">{nameOf(orientation)}</span>
        </div>
      </div>

      <aside className="panel play-panel">
        {!game ? (
          <div className="play-setup">
            <h1 className="page-title">Play the computer</h1>
            <div className="bot-row" role="radiogroup" aria-label="Opponent">
              {BOTS.map((b) => (
                <button key={b.id} role="radio" aria-checked={b.id === botId} className={`bot ${b.id === botId ? 'on' : ''}`} onClick={() => setBotId(b.id)}>
                  <img src={set.src(`${me === 'white' ? 'b' : 'w'}${b.piece}` as `w${'K'}`)} alt="" crossOrigin={set.crossOrigin ? 'anonymous' : undefined} draggable={false} />
                  <span className="bot-name">{b.name}</span>
                  <span className="bot-level num">{b.level}</span>
                </button>
              ))}
            </div>
            <div className="side-row" role="radiogroup" aria-label="Your pieces">
              {(['white', 'random', 'black'] as Choice[]).map((c) => (
                <button key={c} role="radio" aria-checked={c === choice} className={`side ${c === choice ? 'on' : ''}`} onClick={() => setChoice(c)}>
                  {c === 'random' ? (
                    <span className="side-split">
                      <img src={set.src('wK')} alt="" crossOrigin={set.crossOrigin ? 'anonymous' : undefined} draggable={false} />
                      <img src={set.src('bK')} alt="" crossOrigin={set.crossOrigin ? 'anonymous' : undefined} draggable={false} />
                    </span>
                  ) : (
                    <img src={set.src(c === 'white' ? 'wK' : 'bK')} alt="" crossOrigin={set.crossOrigin ? 'anonymous' : undefined} draggable={false} />
                  )}
                  <span>{c === 'random' ? 'Either' : c === 'white' ? 'White' : 'Black'}</span>
                </button>
              ))}
            </div>
            {startFen !== START_FEN && (
              <p className="play-from">
                From the analysis board's position.{' '}
                <button className="btn btn-quiet" onClick={() => setStartFen(START_FEN)}>
                  Start from the beginning instead
                </button>
              </p>
            )}
            <button className="btn btn-primary play-go" onClick={start}>
              Play the {botById(botId).name}
            </button>
          </div>
        ) : (
          <>
            <div className="panel-head play-head">
              <span className={`play-status ${game.ended ? 'over' : ''}`} aria-live="polite">
                {status}
              </span>
              <button className="btn btn-icon btn-quiet" onClick={() => setFlipped((f) => !f)} title="Flip board">
                <IconFlip />
              </button>
            </div>
            <div className="play-moves">
              <LineMoves line={{ ...game.line, ply: game.line.ply }} onPly={() => undefined} />
            </div>
            <div className="play-actions">
              {game.ended ? (
                <>
                  {game.line.ply > 0 && (
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        const h = pgnHeaders(game, you, bot.name)
                        onReview({ game: localReviewGame(toPgn(game.line, h), h.White, h.Black), me: game.me, searched })
                      }}
                    >
                      Review this game
                    </button>
                  )}
                  <button className="btn" onClick={() => onAnalyse(toPgn(game.line, pgnHeaders(game, you, bot.name)))}>
                    Analyse this game
                  </button>
                  <button className="btn" onClick={start}>
                    Rematch
                  </button>
                  <button className="btn btn-quiet" onClick={() => setGame(null)}>
                    New opponent
                  </button>
                  {!game.resigned && game.line.ply > 0 && (
                    <button className="btn btn-quiet" onClick={takeBack}>
                      Take back
                    </button>
                  )}
                  {game.line.ply > 0 && (
                    <p className="play-review-left">
                      {unsearched === 0 ? (
                        'The review is ready.'
                      ) : (
                        <>
                          <span className="num">{unsearched}</span> of <span className="num">{positions.length}</span> positions still to review
                        </>
                      )}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <button className="btn" onClick={takeBack} disabled={game.line.ply === 0} title="Take back (Ctrl+Z)">
                    Take back
                  </button>
                  <button className="btn" onClick={askHint} disabled={!myTurn}>
                    Hint
                  </button>
                  <button className="btn btn-quiet" onClick={resign}>
                    Resign
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  )
}

function endLine(o: Outcome, me: Side, bot: string): string {
  if (o.winner === null) return `Draw by ${o.reason}`
  const won = o.winner === me
  if (o.reason === 'resignation') return `You resigned. ${bot} wins`
  return won ? `Checkmate. You win` : `Checkmate. ${bot} wins`
}

function pgnHeaders(g: Game, you: string, bot: string): Record<string, string> {
  const result = !g.ended ? '*' : g.ended.winner === 'white' ? '1-0' : g.ended.winner === 'black' ? '0-1' : '1/2-1/2'
  return {
    Event: 'Against the computer',
    White: g.me === 'white' ? you : bot,
    Black: g.me === 'black' ? you : bot,
    Result: result,
  }
}
