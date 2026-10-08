import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type PieceSymbol } from 'chess.js'
import type { Arrow } from 'react-chessboard'
import type { ChessComGame, ChessComPlayer } from '../chesscom/api'
import { winPercent } from '../review/accuracy'
import { classifyPlayedMove, LABELS, terminalScore, type Judgement } from '../review/buildReview'
import { estimateRating } from '../review/gameRating'
import { phaseGrades, phaseStarts, type PhaseName } from '../review/phases'
import { reviewGame } from '../review/reviewGame'
import { formatScore, uciToSan } from '../review/format'
import type { Label, PositionAnalysis, Review, ReviewedMove } from '../review/types'
import { getEngine } from '../stockfish/shared'
import { pieceSetById, useAppearance, type PieceCode } from './appearance'
import { Badge } from './Badge'
import { EvalBar } from './EvalBar'
import { EngineLines } from './EngineLines'
import { EvalGraph } from './EvalGraph'
import { GameBoard } from './GameBoard'
import { captures, checkedKing, clocksFromPgn, formatClock } from './gameInfo'
import { IconBack, IconBoard, IconPlay, IconExternal, IconFirst, IconFlip, IconKeyNext, IconKeyPrev, IconLast, IconNext, IconPrev, IconRetry } from './icons'
import { KEY_LABELS, LABEL_TEXT, toneOf } from './labels'
import { useLiveAnalysis, type Live } from './liveAnalysis'
import { MoveList } from './MoveList'
import { playCue, playMove as soundMove } from './sound'
import { judge, RetryPanel, type Attempt } from './RetryPanel'
import './ReviewScreen.css'

type Props = { game: ChessComGame; username: string; depth: number; onBack: () => void; /** Open on this move instead of the start */ startPly?: number | null }

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const RETRY_LABELS = ['mistake', 'miss', 'blunder']
/** A free move is only graded once the position before it was searched at least this deep. */
const MIN_JUDGE_DEPTH = 12
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

export function ReviewScreen({ game, username, depth, onBack, startPly = null }: Props) {
  const mySide = game.black.username.toLowerCase() === username.toLowerCase() ? 'black' : 'white'
  const { appearance, openSettings } = useAppearance()
  const [review, setReview] = useState<Review | null>(null)
  const [progress, setProgress] = useState<[number, number] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ply, setPly] = useState(0)
  const [orientation, setOrientation] = useState<'white' | 'black'>(mySide)
  const [tab, setTab] = useState<'moves' | 'report'>('moves')
  const [retry, setRetry] = useState<{ index: number; attempt: Attempt | null; fen: string | null; revealed: boolean; to?: string } | null>(null)
  const [variation, setVariation] = useState<Variation | null>(null)
  // Guided review: which key moment, and whether we're looking at the position before it or the move itself.
  const [guide, setGuide] = useState<{ step: number; phase: 'before' | 'after' } | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [engineOn, setEngineOn] = useState(() => readFlag('engine', true))
  // Live results by FEN, kept for the whole screen so revisited positions show at once.
  const memo = useMemo(() => new Map<string, Live>(), [])

  useEffect(() => {
    const abort = new AbortController()
    ;(async () => {
      const { review: r } = await reviewGame(game, depth, getEngine(), (d, t) => setProgress([d, t]), abort.signal)
      if (abort.signal.aborted) return
      setReview(r)
      if (startPly !== null) setPly(Math.max(0, Math.min(r.moves.length, startPly)))
    })().catch((e) => {
      if (!abort.signal.aborted) setError(e instanceof Error ? e.message : String(e))
    })
    return () => abort.abort()
  }, [game, depth])

  const n = review?.moves.length ?? 0
  const go = useCallback(
    (p: number) => {
      setVariation(null)
      setGuide(null)
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

  const moments = useMemo(() => review?.moves.filter((m) => KEY_LABELS.includes(m.label)) ?? [], [review])

  /** Moves the guided review to a key moment: first the position before it, then the move itself. */
  const showGuide = useCallback(
    (step: number, phase: 'before' | 'after') => {
      const m = moments[step]
      if (!m) return
      setVariation(null)
      setPly(phase === 'before' ? m.ply - 1 : m.ply)
      setGuide({ step, phase })
    },
    [moments],
  )
  const guideNext = useCallback(() => {
    if (!guide) return showGuide(0, 'before')
    if (guide.phase === 'before') return showGuide(guide.step, 'after')
    if (guide.step + 1 < moments.length) return showGuide(guide.step + 1, 'before')
    setGuide(null)
    go(n)
  }, [guide, moments.length, showGuide, go, n])
  const guideBack = useCallback(() => {
    if (!guide) return
    if (guide.phase === 'after') showGuide(guide.step, 'before')
    else if (guide.step > 0) showGuide(guide.step - 1, 'after')
  }, [guide, showGuide])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || document.querySelector('.sheet')) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const k = e.key
      if (k === '?') setShortcutsOpen((o) => !o)
      else if (k === 'f') setOrientation((o) => (o === 'white' ? 'black' : 'white'))
      else if (k === 'Escape' && shortcutsOpen) setShortcutsOpen(false)
      else if (retry) {
        if (k === 'Escape') setRetry(null)
        else return
      } else if (k === ' ' && e.shiftKey) guideBack()
      else if (k === ' ') guideNext()
      else if (k === 'Escape' && guide) setGuide(null)
      else if (k === 'Escape' && variation) go(variation.basePly)
      else if (k === 'ArrowLeft' || k === 'j') {
        setGuide(null)
        step(-1)
      } else if (k === 'ArrowRight' || k === 'k') {
        setGuide(null)
        step(1)
      } else if (k === 'Home') go(0)
      else if (k === 'End') go(n)
      else if (k === 'g') onBack()
      else if (k === 'r' && review) {
        // Retry the mistake on screen if there is one, otherwise the first.
        const mine = review.moves.filter((m) => m.color === (mySide === 'white' ? 'w' : 'b') && RETRY_LABELS.includes(m.label))
        const at = mine.findIndex((m) => m.ply === ply)
        if (mine.length) setRetry({ index: Math.max(0, at), attempt: null, fen: null, revealed: false })
      } else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, step, n, retry, variation, guide, guideNext, guideBack, shortcutsOpen, onBack, review, mySide, ply])

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

  // Sound when a move lands on the board: stepping forward through the game or
  // a line plays it, stepping back stays quiet. A brilliant move gets its own cue.
  const heard = useRef<{ ply: number; index: number }>({ ply: 0, index: 0 })
  useEffect(() => {
    if (!review || retry) return
    const prev = heard.current
    const index = variation?.index ?? 0
    heard.current = { ply, index }
    if (variation) {
      if (index > prev.index && prev.ply === ply) soundMove(variation.moves[index - 1].san)
      return
    }
    // One step forward only: a jump (to the end, or the next guided moment) isn't a move being played.
    if (ply === prev.ply + 1) {
      const m = review.moves[ply - 1]
      if (!m) return
      soundMove(m.san)
      if (m.label === 'brilliant') setTimeout(() => playCue('brilliant'), 140)
    }
  }, [ply, variation, review, retry])

  if (error) {
    return (
      <main className="review-status">
        <h1>The review stopped</h1>
        <p>{error}</p>
        <button className="btn" onClick={onBack}>
          Back
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

  // The engine's view of a position in the explored line: finished positions
  // need no search, the branch point can use the review's own (usually deeper)
  // analysis, everything else comes from the live search.
  const analysisOf = (f: string, mainPly: number | null): PositionAnalysis | null => {
    const over = terminalScore(f)
    if (over) return { fen: f, depth: Infinity, lines: [{ score: over, pv: [] }] }
    const m = memo.get(f)
    const stored = mainPly !== null ? review.analyses?.[mainPly] : undefined
    if (stored && stored.depth >= (m?.depth ?? 0)) return stored
    return m?.depth ? { fen: f, depth: m.depth, lines: m.lines } : null
  }

  // Each free move is judged the way the review judges game moves, but only
  // once the position it was played from has been searched deep enough; a quick
  // drag would otherwise be graded against a shallow guess.
  const judgements: (Judgement | null)[] = []
  if (variation) {
    variation.moves.forEach((m, i) => {
      const before = analysisOf(m.fenBefore, i === 0 ? variation.basePly : null)
      const after = analysisOf(m.fenAfter, null)
      const prevVar = i > 0 ? variation.moves[i - 1] : null
      const prevMain = i === 0 && variation.basePly > 0 ? review.moves[variation.basePly - 1] : null
      const prevLoss = prevVar ? judgements[i - 1]?.loss : prevMain?.loss
      const prev = prevVar ?? prevMain
      const previous = prev && prevLoss !== undefined ? { loss: prevLoss, uci: prev.uci, captured: prev.san.includes('x') } : null
      judgements.push(before && after && before.depth >= MIN_JUDGE_DEPTH ? classifyPlayedMove(m.fenBefore, m.uci, before, after, previous) : null)
    })
  }
  const labelOf = (i: number): Label | null => judgements[i]?.label ?? null
  const varJudgement = variation && varMove ? judgements[variation.index - 1] : null
  const varLabel = varJudgement?.label ?? null
  const varParent = varJudgement?.bestUci && varJudgement.scoreBest ? { uci: varJudgement.bestUci, score: varJudgement.scoreBest } : null
  const scoreOf = (f: string) => memo.get(f)?.lines[0]?.score ?? (live?.fen === f ? live.over : null)
  const varScore = varMove ? (varJudgement?.scoreAfter ?? scoreOf(varMove.fenAfter)) : null

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
  // In a retry, the try itself gets the mark: best when it holds, a question mark when it doesn't.
  const retryMark =
    retry?.to && retry.fen && (retry.attempt?.state === 'right' || retry.attempt?.state === 'wrong')
      ? { square: retry.to, label: (retry.attempt.state === 'right' ? 'best' : 'mistake') as Label }
      : null
  const mark = retryMark ?? (shownMove && shownLabel ? { square: shownMove.uci.slice(2, 4), label: shownLabel } : null)

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

  /** Opens the engine's line from before `move` as an explored line, at its first move. */
  const showBestLine = (move: ReviewedMove) => {
    const line: FreeMove[] = []
    let at = move.fenBefore
    for (const u of move.bestLine ?? []) {
      const m = playUci(at, u)
      if (!m) break
      line.push(m)
      at = m.fenAfter
    }
    if (line.length === 0) return
    setPly(move.ply - 1)
    setVariation({ basePly: move.ply - 1, moves: line, index: 1 })
  }

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
    setRetry((r) => r && { ...r, fen: tried.fen, to: targetSquare, attempt: { state: 'thinking', san: tried.san } })
    soundMove(tried.san)
    judge(retryTarget, sourceSquare, targetSquare).then((a) => {
      setRetry((r) => (r && r.index === index ? { ...r, attempt: a } : r))
      if (a) playCue(a.state === 'right' ? 'right' : 'wrong')
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

  const grades = phaseGrades(review)

  const accuracyRow = (side: 'white' | 'black') => {
    const p = side === 'white' ? game.white : game.black
    const accuracy = review.accuracy[side === 'white' ? 'w' : 'b']
    // chess.com records the rating after the game; the shift is a few points, well inside the model's error.
    const est = estimateRating(accuracy, game.timeClass, p.rating || null)
    return (
      <div className={`acc ${side}`}>
        <span className="acc-name">
          <span className={`player-swatch ${side}`} aria-hidden />
          {p.username}
        </span>
        <span className="acc-value num">{accuracy.toFixed(1)}</span>
        {game.accuracies && <span className="acc-theirs num">chess.com {game.accuracies[side].toFixed(1)}</span>}
        {est && (est.blended ?? est.accuracyOnly) !== null && (
          <span className="acc-rating">
            Played like <span className="num">{(est.blended ?? est.accuracyOnly).toLocaleString()}</span>
          </span>
        )}
        {est && est.blended !== null && (
          <span className="acc-rating-alone num" title="Accuracy barely changes with rating, so on its own it only narrows a game down this far">
            <span>accuracy alone {est.accuracyOnly.toLocaleString()}</span>
            <span>
              range {est.low.toLocaleString()}–{est.high.toLocaleString()}
            </span>
          </span>
        )}
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
            <IconBack /> Back
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
          <span className="acc-label">
            Accuracy
            <span className="acc-depth num" title="The shallowest depth any position in this game reached">
              depth {review.minDepth || review.depth}+
            </span>
          </span>
          {accuracyRow('black')}
        </div>

        <EvalGraph review={review} ply={ply} onPly={(p) => !retry && go(p)} phases={phaseStarts(review)} />

        <EngineLines
          live={live}
          enabled={engineOn}
          onToggle={(on) => {
            setEngineOn(on)
            writeFlag('engine', on)
          }}
          onPlayLine={(ucis) => !retry && extendWith(ucis)}
        />

        {guide && moments[guide.step] && (
          <GuideBar
            step={guide.step}
            total={moments.length}
            phase={guide.phase}
            move={moments[guide.step]}
            onNext={guideNext}
            onBack={guideBack}
            onStop={() => setGuide(null)}
          />
        )}

        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'moves'} className={tab === 'moves' ? 'on' : ''} onClick={() => setTab('moves')}>
            Moves
          </button>
          <button role="tab" aria-selected={tab === 'report'} className={tab === 'report' ? 'on' : ''} onClick={() => setTab('report')}>
            Report
          </button>
        </div>

        {tab === 'report' ? (
          <div className="report">
            <table className="summary">
              <thead>
                <tr>
                  <th />
                  <th className="r">{game.white.username}</th>
                  <th className="r">{game.black.username}</th>
                </tr>
              </thead>
              <tbody>
                {PHASES.map((ph) => {
                  const w = grades.w[ph]
                  const b = grades.b[ph]
                  if (!w && !b) return null
                  return (
                    <tr key={ph}>
                      <td>{PHASE_TEXT[ph]}</td>
                      {[w, b].map((g, i) => (
                        <td key={i} className="r">
                          {g && (
                            <span className="phase-grade" title={`${LABEL_TEXT[g.label].name}, ${g.moves} moves`}>
                              <span className="num">{g.accuracy.toFixed(0)}</span>
                              <Badge label={g.label} size={18} />
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <table className="summary counts">
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
          </div>
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
                      {current.bestLine && current.bestLine.length > 0 && current.bestUci !== current.uci && (
                        <button className="btn coach-retry" onClick={() => showBestLine(current)} title="Step through it with the arrow keys">
                          <IconNext /> Best line
                        </button>
                      )}
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
            <button className="btn guide-start" onClick={() => (guide ? setGuide(null) : guideNext())} disabled={!!retry || moments.length === 0} title="Walk through the key moments (Space)">
              <IconPlay /> {guide ? 'Stop review' : 'Play review'}
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
          <button className="shortcuts-hint" onClick={() => setShortcutsOpen(true)}>
            Keyboard shortcuts <kbd>?</kbd>
          </button>
        </div>
      </aside>
      {shortcutsOpen && <Shortcuts onClose={() => setShortcutsOpen(false)} />}
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

/** Labels worth a mark in a move list; the quiet ones would only add noise. */
const MARKED: Label[] = ['brilliant', 'great', 'inaccuracy', 'mistake', 'miss', 'blunder']

/** Labels where naming the engine's choice adds nothing. */
const QUIET_ENOUGH: Label[] = ['best', 'brilliant', 'great', 'excellent']

const PHASES: PhaseName[] = ['opening', 'middlegame', 'endgame']
const PHASE_TEXT: Record<PhaseName, string> = { opening: 'Opening', middlegame: 'Middlegame', endgame: 'Endgame' }

/** The guided review's bar: where you are, what to do, and the way on. */
function GuideBar({ step, total, phase, move, onNext, onBack, onStop }: {
  step: number
  total: number
  phase: 'before' | 'after'
  move: ReviewedMove
  onNext: () => void
  onBack: () => void
  onStop: () => void
}) {
  const side = move.color === 'w' ? 'White' : 'Black'
  const last = step === total - 1 && phase === 'after'
  return (
    <section className={`guide ${phase}`} aria-live="polite">
      <div className="guide-progress" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={i < step || (i === step && phase === 'after') ? 'done' : i === step ? 'now' : ''} />
        ))}
      </div>
      <p className="guide-text">
        <span className="guide-count num">
          {step + 1} of {total}
        </span>
        {phase === 'before' ? (
          <>
            {' '}
            {side} to move. What would you play?
          </>
        ) : (
          <>
            {' '}
            {side} played <strong>{move.san}</strong>, {LABEL_TEXT[move.label].phrase}.
          </>
        )}
      </p>
      <div className="guide-actions">
        <button className="btn btn-quiet" onClick={onBack} disabled={step === 0 && phase === 'before'} aria-label="Back (Shift+Space)">
          <IconPrev />
        </button>
        <button className="btn btn-primary" onClick={onNext}>
          {phase === 'before' ? 'Show the move' : last ? 'Finish' : 'Next moment'} <kbd>Space</kbd>
        </button>
        <button className="btn btn-quiet" onClick={onStop}>
          Stop
        </button>
      </div>
    </section>
  )
}

const SHORTCUTS: [string, string][] = [
  ['← → or J K', 'Previous / next move'],
  ['Home End', 'Start / end of the game'],
  ['Space', 'Play the guided review, or its next step'],
  ['R', 'Retry the mistake on screen'],
  ['F', 'Flip the board'],
  ['Esc', 'Leave a line, retry or guided review'],
  ['G', 'Back to the page you came from'],
  ['?', 'Show or hide this list'],
]

function Shortcuts({ onClose }: { onClose: () => void }) {
  return (
    <div className="sheet-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="sheet shortcuts" role="dialog" aria-modal aria-label="Keyboard shortcuts">
        <header className="sheet-head">
          <h2>Keyboard shortcuts</h2>
          <button className="sheet-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <dl className="shortcut-list">
          {SHORTCUTS.map(([keys, what]) => (
            <div key={keys}>
              <dt>
                {keys.split(' ').map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </div>
  )
}
