import { useCallback, useEffect, useMemo, useState } from 'react'
import { Chess, type PieceSymbol } from 'chess.js'
import type { Arrow } from 'react-chessboard'
import type { ChessComGame, ChessComPlayer } from '../chesscom/api'
import { getBook } from '../openings'
import { winPercent } from '../review/accuracy'
import { analyseGame } from '../review/analyseGame'
import { buildReview, LABELS, movesFromPgn } from '../review/buildReview'
import { loadReview, saveReview } from '../review/cache'
import { formatScore, uciToSan } from '../review/format'
import type { Label, Review, ReviewedMove } from '../review/types'
import { getEngine } from '../stockfish/shared'
import { pieceSetById, useAppearance, type PieceCode } from './appearance'
import { Badge } from './Badge'
import { EvalBar } from './EvalBar'
import { EngineLines } from './EngineLines'
import { EvalGraph } from './EvalGraph'
import { GameBoard } from './GameBoard'
import { captures, checkedKing, clocksFromPgn, formatClock, timeSpent } from './gameInfo'
import { IconBack, IconBoard, IconExternal, IconFirst, IconFlip, IconKeyNext, IconKeyPrev, IconLast, IconNext, IconPrev, IconRetry } from './icons'
import { KEY_LABELS, LABEL_TEXT, toneOf } from './labels'
import { classifyFree, useLiveAnalysis, type BestInfo, type Live } from './liveAnalysis'
import { MoveList } from './MoveList'
import { judge, RetryPanel, type Attempt } from './RetryPanel'
import './ReviewScreen.css'

type Props = { game: ChessComGame; username: string; depth: number; onBack: () => void }

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const RETRY_LABELS = ['mistake', 'miss', 'blunder']
const BEST_ARROW = 'rgb(42 120 214 / 0.85)'

function playMove(fen: string, from: string, to: string): { fen: string; san: string } | null {
  try {
    const chess = new Chess(fen)
    const m = chess.move({ from, to, promotion: 'q' })
    return { fen: chess.fen(), san: m.san }
  } catch {
    return null
  }
}

/** A move played off the game's main line. */
type FreeMove = { san: string; uci: string; fenBefore: string; fenAfter: string }

/** A line the viewer is exploring. It branches from the main line after `basePly`; `index` 0 is the branch point. */
type Variation = { basePly: number; moves: FreeMove[]; index: number }

function playUci(fen: string, uci: string): FreeMove | null {
  try {
    const chess = new Chess(fen)
    const m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' })
    return { san: m.san, uci: m.lan, fenBefore: fen, fenAfter: chess.fen() }
  } catch {
    return null
  }
}

/** "15.Bg5" or "15...Bg5" for a move played from `fenBefore`. */
function numbered(fenBefore: string, san: string): string {
  const [, turn, , , , full] = fenBefore.split(' ')
  return `${full}${turn === 'w' ? '.' : '...'}${san}`
}

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === 'on'
  } catch {
    return fallback
  }
}

function writeFlag(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? 'on' : 'off')
  } catch {
    // ignore
  }
}

export function ReviewScreen({ game, username, depth, onBack }: Props) {
  const mySide = game.black.username.toLowerCase() === username.toLowerCase() ? 'black' : 'white'
  const { appearance, openSettings } = useAppearance()
  const [review, setReview] = useState<Review | null>(null)
  const [progress, setProgress] = useState<[number, number] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ply, setPly] = useState(0)
  const [orientation, setOrientation] = useState<'white' | 'black'>(mySide)
  const [tab, setTab] = useState<'moves' | 'report'>('moves')
  const [retry, setRetry] = useState<{ index: number; attempt: Attempt | null; fen: string | null; revealed: boolean } | null>(null)
  const [variation, setVariation] = useState<Variation | null>(null)
  const [engineOn, setEngineOn] = useState(() => readFlag('engine', true))
  // Live results by FEN, kept for the whole screen so revisited positions show at once.
  const memo = useMemo(() => new Map<string, Live>(), [])

  useEffect(() => {
    const abort = new AbortController()
    ;(async () => {
      const cached = await loadReview(game.uuid, depth)
      if (cached) return setReview(cached)
      const moves = movesFromPgn(game.pgn)
      setProgress([0, moves.length + 1])
      const analyses = await analyseGame(getEngine(), moves, depth, (d, t) => setProgress([d, t]), abort.signal)
      const r = buildReview(game.uuid, moves, analyses, getBook())
      await saveReview(r)
      if (!abort.signal.aborted) setReview(r)
    })().catch((e) => {
      if (!abort.signal.aborted) setError(e instanceof Error ? e.message : String(e))
    })
    return () => abort.abort()
  }, [game, depth])

  const n = review?.moves.length ?? 0
  const go = useCallback(
    (p: number) => {
      setVariation(null)
      setPly(Math.max(0, Math.min(n, p)))
    },
    [n],
  )

  const step = useCallback(
    (d: 1 | -1) => {
      if (!variation) return go(ply + d)
      const i = variation.index + d
      if (i < 0) go(variation.basePly - 1)
      else if (i <= variation.moves.length) setVariation({ ...variation, index: i })
    },
    [variation, go, ply],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || document.querySelector('.sheet')) return
      if (e.key === 'f' && !e.ctrlKey && !e.metaKey) {
        setOrientation((o) => (o === 'white' ? 'black' : 'white'))
        return
      }
      if (retry) return
      if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'Home') go(0)
      else if (e.key === 'End') go(n)
      else if (e.key === 'Escape' && variation) go(variation.basePly)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, step, n, retry, variation])

  const myColor = mySide === 'white' ? 'w' : 'b'
  const targets = useMemo(
    () => review?.moves.filter((m) => m.color === myColor && RETRY_LABELS.includes(m.label)) ?? [],
    [review, myColor],
  )
  const clocks = useMemo(() => clocksFromPgn(game.pgn), [game.pgn])

  // The position on the board: a retry, an explored line, or the game itself.
  const retryTarget = retry ? targets[retry.index] : null
  const mainFen = (p: number) => (p > 0 && review ? review.moves[p - 1].fenAfter : START_FEN)
  const varMove = variation && variation.index > 0 ? variation.moves[variation.index - 1] : null
  const fen = retryTarget
    ? (retry!.fen ?? retryTarget.fenBefore)
    : variation
      ? (varMove?.fenAfter ?? mainFen(variation.basePly))
      : mainFen(ply)
  const live = useLiveAnalysis(fen, !!review && engineOn && !retry, memo)

  if (error) {
    return (
      <main className="review-status">
        <h1>The review stopped</h1>
        <p>{error}</p>
        <button className="btn" onClick={onBack}>
          Back to games
        </button>
      </main>
    )
  }

  if (!review) {
    const [done, total] = progress ?? [0, 0]
    return (
      <main className="review-status">
        <div className="review-status-board">
          <GameBoard fen={START_FEN} orientation={mySide} small />
        </div>
        <h1>
          {game.white.username} <span className="dim">vs</span> {game.black.username}
        </h1>
        <p className="dim">
          {progress ? (
            <>
              Analysing position <span className="num">{done}</span> of <span className="num">{total}</span> at depth {depth}
            </>
          ) : (
            'Loading Stockfish…'
          )}
        </p>
        <div className="progress">
          <div style={{ width: total ? `${(done / total) * 100}%` : '0%' }} />
        </div>
        <button className="btn" onClick={onBack}>
          Cancel
        </button>
      </main>
    )
  }

  const current: ReviewedMove | null = ply > 0 ? review.moves[ply - 1] : null

  // What the engine thought of the position a free move was played from. The
  // branch point falls back to the review's own analysis of it.
  const parentInfo = (fenBefore: string, isBranchPoint: boolean): BestInfo | null => {
    const m = memo.get(fenBefore)
    if (m?.lines[0]) return { score: m.lines[0].score, uci: m.lines[0].pv[0] ?? null, second: m.lines[1]?.score ?? null }
    const rm = isBranchPoint && variation ? review.moves[variation.basePly] : null
    return rm?.scoreBest ? { score: rm.scoreBest, uci: rm.bestUci, second: null } : null
  }
  const scoreOf = (f: string) => memo.get(f)?.lines[0]?.score ?? (live?.fen === f ? live.over : null)
  const labelOf = (i: number): Label | null => {
    const m = variation!.moves[i]
    return classifyFree(m.fenBefore, m.uci, parentInfo(m.fenBefore, i === 0), scoreOf(m.fenAfter))
  }
  const varLabel = variation && varMove ? labelOf(variation.index - 1) : null
  const varParent = variation && varMove ? parentInfo(varMove.fenBefore, variation.index === 1) : null
  const varScore = varMove ? scoreOf(varMove.fenAfter) : null

  const score = retryTarget
    ? retryTarget.scoreBest!
    : variation
      ? (live?.lines[0]?.score ?? live?.over ?? scoreOf(fen) ?? current?.scoreAfter ?? { kind: 'cp' as const, cp: 0 })
      : (current?.scoreAfter ?? { kind: 'cp' as const, cp: 0 })

  const arrows: Arrow[] = []
  if (retryTarget && retry?.revealed && retryTarget.bestUci) {
    arrows.push({ startSquare: retryTarget.bestUci.slice(0, 2), endSquare: retryTarget.bestUci.slice(2, 4), color: BEST_ARROW })
  }
  if (!retryTarget && !variation && current?.bestUci && current.bestUci !== current.uci && toneOf(current.label) !== 'found') {
    arrows.push({ startSquare: current.bestUci.slice(0, 2), endSquare: current.bestUci.slice(2, 4), color: BEST_ARROW })
  }
  if (varMove && varLabel && varParent?.uci && varParent.uci !== varMove.uci && toneOf(varLabel) !== 'found') {
    arrows.push({ startSquare: varParent.uci.slice(0, 2), endSquare: varParent.uci.slice(2, 4), color: BEST_ARROW })
  }

  const shownMove = retryTarget ? null : variation ? varMove : current
  const shownLabel = retryTarget ? null : variation ? varLabel : (current?.label ?? null)
  const lastMove: [string, string] | null = shownMove ? [shownMove.uci.slice(0, 2), shownMove.uci.slice(2, 4)] : null
  const mark = shownMove && shownLabel ? { square: shownMove.uci.slice(2, 4), label: shownLabel } : null

  const top = orientation === 'white' ? game.black : game.white
  const bottom = orientation === 'white' ? game.white : game.black
  const taken = captures(fen)

  // The clock each player had showing at this point of the game.
  const clockAt = (side: 'white' | 'black') => {
    const own = side === 'white' ? 1 : 2
    let p = ply
    while (p > 0 && (p % 2 === 1 ? 1 : 2) !== own) p--
    if (p === 0) return null
    return clocks[p - 1] ?? null
  }
  const toMove = new Chess(fen).turn() === 'w' ? 'white' : 'black'

  const nextKey = review.moves.find((m) => m.ply > ply && KEY_LABELS.includes(m.label))
  const prevKey = [...review.moves].reverse().find((m) => m.ply < ply && KEY_LABELS.includes(m.label))

  const startRetry = (index: number) => setRetry({ index, attempt: null, fen: null, revealed: false })
  const currentTarget = current ? targets.indexOf(current) : -1
  const spent = current ? timeSpent(clocks, current.ply, game.timeControl) : null

  /** Plays moves from the shown position. Moves that repeat the game itself stay on the main line. */
  const extendWith = (ucis: string[]) => {
    let at = fen
    let added: FreeMove[] = []
    for (const u of ucis) {
      const m = playUci(at, u)
      if (!m) break
      added.push(m)
      at = m.fenAfter
    }
    if (added.length === 0) return false
    if (variation) {
      const kept = variation.moves.slice(0, variation.index)
      setVariation({ ...variation, moves: [...kept, ...added], index: kept.length + added.length })
      return true
    }
    let k = 0
    while (k < added.length && review.moves[ply + k]?.uci === added[k].uci) k++
    if (k === added.length) {
      go(ply + k)
      return true
    }
    added = added.slice(k)
    setPly(ply + k)
    setVariation({ basePly: ply + k, moves: added, index: added.length })
    return true
  }

  const onDrop = ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
    if (!targetSquare) return false
    if (!retryTarget) return extendWith([sourceSquare + targetSquare])
    if (retry?.attempt?.state === 'thinking') return false
    const tried = playMove(retryTarget.fenBefore, sourceSquare, targetSquare)
    if (!tried) return false
    const index = retry!.index
    setRetry((r) => r && { ...r, fen: tried.fen, attempt: { state: 'thinking', san: tried.san } })
    judge(retryTarget, sourceSquare, targetSquare).then((a) => {
      setRetry((r) => (r && r.index === index ? { ...r, attempt: a } : r))
      // A wrong try goes back so the next one starts from the real position.
      if (a?.state === 'wrong') {
        setTimeout(() => setRetry((r) => (r && r.index === index && r.fen === tried.fen ? { ...r, fen: null } : r)), 900)
      }
    })
    return true
  }

  const pieceSet = pieceSetById(appearance.pieces)
  const playerBar = (p: ChessComPlayer, side: 'white' | 'black') => {
    const mine = side === 'white' ? taken.byWhite : taken.byBlack
    const lead = side === 'white' ? taken.lead : -taken.lead
    const clock = clockAt(side)
    const color = side === 'white' ? 'b' : 'w'
    return (
      <div className="player">
        <span className={`player-swatch ${side}`} aria-hidden />
        <span className="player-name">{p.username}</span>
        <span className="num dim">{p.rating}</span>
        <span className="player-captures" aria-label={`Captured: ${mine.join(' ') || 'nothing'}`}>
          {groupCaptures(mine).map((group, gi) => (
            <span key={gi} className="capture-group">
              {group.map((t, i) => (
                <img key={i} src={pieceSet.src(`${color}${t.toUpperCase()}` as PieceCode)} alt="" crossOrigin={pieceSet.crossOrigin ? 'anonymous' : undefined} />
              ))}
            </span>
          ))}
          {lead > 0 && <span className="player-lead num">+{lead}</span>}
        </span>
        {clock !== null && <span className={`player-clock num ${toMove === side && !retryTarget ? 'running' : ''}`}>{formatClock(clock)}</span>}
      </div>
    )
  }

  const accuracyRow = (side: 'white' | 'black') => {
    const p = side === 'white' ? game.white : game.black
    return (
      <div className={`acc ${side}`}>
        <span className="acc-name">
          <span className={`player-swatch ${side}`} aria-hidden />
          {p.username}
        </span>
        <span className="acc-value num">{review.accuracy[side === 'white' ? 'w' : 'b'].toFixed(1)}</span>
        {game.accuracies && <span className="acc-theirs num">chess.com {game.accuracies[side].toFixed(1)}</span>}
      </div>
    )
  }

  return (
    <main className="review">
      <div className="board-col">
        {playerBar(top, orientation === 'white' ? 'black' : 'white')}
        <div className="board-row">
          <EvalBar score={score} orientation={orientation} />
          <div className="board">
            <GameBoard
              fen={fen}
              orientation={orientation}
              arrows={arrows}
              lastMove={lastMove}
              mark={mark}
              check={checkedKing(fen)}
              allowDragging={retry?.attempt?.state !== 'thinking'}
              onPieceDrop={onDrop}
            />
          </div>
        </div>
        {playerBar(bottom, orientation)}
      </div>

      <aside className="panel">
        <div className="panel-head">
          <button className="btn btn-quiet back" onClick={onBack}>
            <IconBack /> Games
          </button>
          <span className="panel-opening" title={review.opening ?? undefined}>
            {review.opening ?? 'Unnamed opening'}
          </span>
          <a className="btn btn-quiet btn-icon" href={game.url} target="_blank" rel="noreferrer" aria-label="Open on chess.com" title="Open on chess.com">
            <IconExternal />
          </a>
          <button className="btn btn-quiet btn-icon" onClick={openSettings} aria-label="Board and pieces" title="Board and pieces">
            <IconBoard />
          </button>
        </div>

        <div className="accuracy">
          {accuracyRow('white')}
          <span className="acc-label">Accuracy</span>
          {accuracyRow('black')}
        </div>

        <EvalGraph review={review} ply={ply} onPly={(p) => !retry && go(p)} />

        <EngineLines
          live={live}
          enabled={engineOn}
          onToggle={(on) => {
            setEngineOn(on)
            writeFlag('engine', on)
          }}
          onPlayLine={(ucis) => !retry && extendWith(ucis)}
        />

        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'moves'} className={tab === 'moves' ? 'on' : ''} onClick={() => setTab('moves')}>
            Moves
          </button>
          <button role="tab" aria-selected={tab === 'report'} className={tab === 'report' ? 'on' : ''} onClick={() => setTab('report')}>
            Report
          </button>
        </div>

        {tab === 'report' ? (
          <table className="summary">
            <thead>
              <tr>
                <th />
                <th className="r">{game.white.username}</th>
                <th className="r">{game.black.username}</th>
              </tr>
            </thead>
            <tbody>
              {LABELS.map((l) => (
                <tr key={l} className={review.counts.w[l] || review.counts.b[l] ? '' : 'empty'}>
                  <td>
                    <span className="summary-label">
                      <Badge label={l} size={18} />
                      {LABEL_TEXT[l].name}
                    </span>
                  </td>
                  <td className="r num">{review.counts.w[l] || ''}</td>
                  <td className="r num">{review.counts.b[l] || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <>
            {retry ? (
              <RetryPanel
                targets={targets}
                index={retry.index}
                attempt={retry.attempt}
                revealed={retry.revealed}
                onIndex={startRetry}
                onReveal={() => setRetry((r) => r && { ...r, revealed: true })}
                onExit={() => setRetry(null)}
              />
            ) : variation ? (
              <section className="coach">
                {varMove ? (
                  <>
                    <div className="coach-line">
                      {varLabel ? <Badge label={varLabel} size={26} /> : <span className="badge-pending" aria-hidden />}
                      <p>
                        <strong>{numbered(varMove.fenBefore, varMove.san)}</strong>{' '}
                        {varLabel ? `is ${LABEL_TEXT[varLabel].phrase}` : 'is being analysed'}
                      </p>
                      {varScore && <span className={`coach-eval num ${winPercent(varScore) >= 50 ? 'white' : 'black'}`}>{formatScore(varScore)}</span>}
                    </div>
                    {varLabel && varParent?.uci && varParent.uci !== varMove.uci && !QUIET_ENOUGH.includes(varLabel) && (
                      <p className="coach-note">
                        Best was {uciToSan(varMove.fenBefore, varParent.uci)} ({formatScore(varParent.score)}).
                      </p>
                    )}
                  </>
                ) : (
                  <div className="coach-line">
                    <p className="dim">Your line branches here.</p>
                  </div>
                )}
                <div className="variation">
                  {variation.moves.map((m, i) => {
                    const l = labelOf(i)
                    return (
                      <button key={i} className={`move ${variation.index === i + 1 ? 'current' : ''}`} onClick={() => setVariation({ ...variation, index: i + 1 })}>
                        <span className="move-san">{i === 0 || m.fenBefore.split(' ')[1] === 'w' ? numbered(m.fenBefore, m.san) : m.san}</span>
                        {l && MARKED.includes(l) && <Badge label={l} size={15} />}
                      </button>
                    )
                  })}
                </div>
                <div className="coach-foot">
                  <button className="btn coach-retry" onClick={() => go(variation.basePly)}>
                    <IconBack /> Back to the game
                  </button>
                </div>
              </section>
            ) : (
              <section className="coach">
                {current ? (
                  <>
                    <div className="coach-line">
                      <Badge label={current.label} size={26} />
                      <p>
                        <strong>
                          {Math.ceil(current.ply / 2)}
                          {current.color === 'w' ? '.' : '...'} {current.san}
                        </strong>{' '}
                        is {LABEL_TEXT[current.label].phrase}
                      </p>
                      <span className={`coach-eval num ${evalSide(current)}`}>{formatScore(current.scoreAfter)}</span>
                    </div>
                    {current.note && <p className="coach-note">{current.note}</p>}
                    <div className="coach-foot">
                      {spent !== null && <span className="dim num">{formatSpent(spent)} on the clock</span>}
                      {currentTarget >= 0 && (
                        <button className="btn coach-retry" onClick={() => startRetry(currentTarget)}>
                          <IconRetry /> Retry this move
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="coach-line">
                    <p className="dim">Starting position. Arrow keys step through the game, F flips the board.</p>
                  </div>
                )}
              </section>
            )}
            <MoveList moves={review.moves} ply={ply} onPly={(p) => !retry && go(p)} />
          </>
        )}

        <div className="controls">
          <div className="nav">
            <button className="btn btn-icon" onClick={() => go(0)} disabled={!!retry || ply === 0} aria-label="First move" title="First move (Home)">
              <IconFirst />
            </button>
            <button className="btn btn-icon" onClick={() => prevKey && go(prevKey.ply)} disabled={!!retry || !prevKey} aria-label="Previous key moment" title="Previous key moment">
              <IconKeyPrev />
            </button>
            <button className="btn nav-step" onClick={() => step(-1)} disabled={!!retry || (!variation && ply === 0)} aria-label="Previous move" title="Previous move (←)">
              <IconPrev size={18} />
            </button>
            <button className="btn nav-step" onClick={() => step(1)} disabled={!!retry || (variation ? variation.index === variation.moves.length : ply === n)} aria-label="Next move" title="Next move (→)">
              <IconNext size={18} />
            </button>
            <button className="btn btn-icon" onClick={() => nextKey && go(nextKey.ply)} disabled={!!retry || !nextKey} aria-label="Next key moment" title="Next key moment">
              <IconKeyNext />
            </button>
            <button className="btn btn-icon" onClick={() => go(n)} disabled={!!retry || ply === n} aria-label="Last move" title="Last move (End)">
              <IconLast />
            </button>
          </div>
          <div className="controls-row">
            <button className="btn btn-icon" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))} aria-label="Flip board" title="Flip board (F)">
              <IconFlip />
            </button>
            <button
              className="btn btn-primary retry-all"
              onClick={() => {
                setTab('moves')
                startRetry(0)
              }}
              disabled={!!retry || targets.length === 0}
            >
              <IconRetry />
              {targets.length ? `Retry my mistakes (${targets.length})` : 'No mistakes to retry'}
            </button>
          </div>
        </div>
      </aside>
    </main>
  )
}

/** Runs of the same piece type, so captured pawns stack together. */
function groupCaptures(pieces: PieceSymbol[]): PieceSymbol[][] {
  const groups: PieceSymbol[][] = []
  for (const p of pieces) {
    const last = groups[groups.length - 1]
    if (last && last[0] === p) last.push(p)
    else groups.push([p])
  }
  return groups
}

function evalSide(m: ReviewedMove): 'white' | 'black' {
  return m.winPercentAfter >= 50 ? 'white' : 'black'
}

function formatSpent(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
}

/** Labels worth a mark in a move list; the quiet ones would only add noise. */
const MARKED: Label[] = ['brilliant', 'great', 'inaccuracy', 'mistake', 'miss', 'blunder']

/** Labels where naming the engine's choice adds nothing. */
const QUIET_ENOUGH: Label[] = ['best', 'brilliant', 'great', 'excellent']
