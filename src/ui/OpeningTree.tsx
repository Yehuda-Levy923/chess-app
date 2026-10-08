import { Chess } from 'chess.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Arrow } from 'react-chessboard'
import type { GameFacts, Side } from '../insights/facts'
import { branches, buildTree, nodeAt } from '../insights/tree'
import { getBook } from '../openings'
import { bookDepth } from '../openings/book'
import type { GameSummary } from '../review/summary'
import { PerfBar } from './charts'
import { derived } from './derived'
import { performance } from './findings'
import { GameBoard } from './GameBoard'
import type { Drill } from './GamesDrawer'
import { IconBack } from './icons'
import { useBoardKeys } from './keys'
import { gamesThrough } from './openingLines'

type Props = {
  /** Games played as `side` */
  games: GameFacts[]
  side: Side
  path: string[]
  onPath: (path: string[]) => void
  onDrill: (d: Drill) => void
  /** Engine summaries by game id, for win chances and move accuracy where games were reviewed */
  summaries?: Map<string, GameSummary>
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`
const signed = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(1)}`

/** Arrow colours for the candidate moves: the most played in the accent, the rest fainter. */
const ARROW_MAIN = 'rgb(255 106 26 / 0.9)'
const ARROW_OTHER = 'rgb(255 255 255 / 0.55)'

/**
 * Your games as a move tree. The board shows the position with your candidate
 * moves as arrows; play a move on it, or pick one from the table, to follow a
 * line. Where games were reviewed, the engine adds your win chance and how
 * accurate each move tended to be.
 */
export function OpeningTree({ games, side, path, onPath, onDrill, summaries }: Props) {
  const tree = derived(games, 'tree', () => buildTree(games))
  const node = nodeAt(tree, path) ?? tree
  const here = useMemo(() => gamesThrough(games, path), [games, path])
  const perf = performance(here)
  const position = positionAfter(path)
  const myTurn = (path.length % 2 === 0) === (side === 'white')
  const opening = path.length ? (bookDepth(getBook(), path).opening?.name ?? null) : null
  const [note, setNote] = useState<string | null>(null)

  /** Average engine win chance for you after ply `k` in these games, and how many reviewed games it rests on. */
  const winChance = (list: GameFacts[], k: number) => {
    let sum = 0
    let n = 0
    for (const g of list) {
      const s = summaries?.get(g.id)
      const wp = s?.winPercent?.[k]
      if (wp === undefined || s!.firstPly !== 1) continue
      sum += side === 'white' ? wp : 100 - wp
      n++
    }
    return n ? { value: sum / n, n } : null
  }
  /** Average engine accuracy of your move at ply index `i` in these games. */
  const moveAccuracy = (list: GameFacts[], i: number) => {
    let sum = 0
    let n = 0
    for (const g of list) {
      const s = summaries?.get(g.id)
      const a = s?.moveAccuracy?.[i]
      if (a === undefined || a === null || s!.firstPly !== 1) continue
      sum += a
      n++
    }
    return n ? sum / n : null
  }

  const rows = branches(node).map((b) => {
    const through = here.filter((g) => g.sans[path.length] === b.san)
    return {
      ...b,
      through,
      perf: performance(through),
      after: winChance(through, path.length + 1),
      accuracy: myTurn ? moveAccuracy(through, path.length) : null,
    }
  })
  const now = winChance(here, path.length)
  const engine = !!summaries && rows.some((r) => r.after)
  const lineName = path.map((san, i) => `${i % 2 === 0 ? `${i / 2 + 1}.` : ''}${san}`).join(' ')

  // The candidate moves as arrows, most played first.
  const arrows: Arrow[] = rows.slice(0, 4).flatMap((r, i) => {
    const m = uciOf(position.fen, r.san)
    return m && r.share >= 0.05 ? [{ startSquare: m.from, endSquare: m.to, color: i === 0 ? ARROW_MAIN : ARROW_OTHER }] : []
  })

  // ← back, → your most played continuation.
  const treeRef = useRef<HTMLDivElement>(null)
  useBoardKeys(treeRef, {
    back: () => path.length && onPath(path.slice(0, -1)),
    forward: () => rows[0] && onPath([...path, rows[0].san]),
    first: () => onPath([]),
  })

  useEffect(() => setNote(null), [path])

  const onDrop = ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
    if (!targetSquare) return false
    let san: string
    try {
      san = new Chess(position.fen).move({ from: sourceSquare, to: targetSquare, promotion: 'q' }).san
    } catch {
      return false
    }
    if (rows.some((r) => r.san === san)) {
      onPath([...path, san])
      return true
    }
    setNote(`${myTurn ? 'You never played' : 'You never faced'} ${san} here.`)
    return false
  }

  return (
    <div className="tree" ref={treeRef}>
      <div className="tree-board">
        <GameBoard fen={position.fen} orientation={side} lastMove={position.lastMove} arrows={arrows} allowDragging onPieceDrop={onDrop} />
        {note && <p className="tree-note">{note}</p>}
        <div className="tree-path">
          <button className="btn btn-quiet" onClick={() => onPath(path.slice(0, -1))} disabled={path.length === 0} title="Back (←)">
            <IconBack size={16} /> Back
          </button>
          <ol className="tree-moves">
            <li>
              <button className={path.length === 0 ? 'on' : ''} onClick={() => onPath([])}>
                Start
              </button>
            </li>
            {path.map((san, i) => (
              <li key={i}>
                <button className={i === path.length - 1 ? 'on' : ''} onClick={() => onPath(path.slice(0, i + 1))}>
                  {i % 2 === 0 ? `${i / 2 + 1}. ` : ''}
                  {san}
                </button>
              </li>
            ))}
          </ol>
        </div>
        <p className="tree-help dim">Drag a piece to follow a line. → follows your most played move, ← goes back.</p>
      </div>

      <div className="tree-table">
        <div className="tree-summary">
          <span className="tree-opening">{opening ?? (path.length ? 'Unnamed line' : 'Starting position')}</span>
          <span className="dim">
            <span className="num">{node.record.games.toLocaleString()}</span> {node.record.games === 1 ? 'game' : 'games'}, you scored{' '}
            <span className="num">{pct(perf.actual)}</span> where your ratings predicted <span className="num">{pct(perf.expected)}</span>
            {now && (
              <>
                . Engine: you stand at <span className="num">{now.value.toFixed(0)}%</span> here on average
              </>
            )}
          </span>
          {here.length > 0 && (
            <button
              className="btn btn-quiet tree-games"
              onClick={() => onDrill({ title: opening ?? 'Games through this line', detail: lineName || undefined, games: here })}
            >
              Games
            </button>
          )}
        </div>

        <h2>{myTurn ? 'Your moves here' : 'Replies you faced'}</h2>
        {rows.length === 0 ? (
          <p className="dim">These games went no further within the first 15 moves.</p>
        ) : (
          <table className="itable tree-rows">
            <thead>
              <tr>
                <th>Move</th>
                <th className="r">Games</th>
                <th className="r">Score</th>
                <th className="r" title="Points per 100 games above or below what the ratings predicted">
                  vs ratings
                </th>
                {engine && (
                  <th className="r" title="Your average engine win chance after this move, in reviewed games">
                    Win chance after
                  </th>
                )}
                {engine && myTurn && (
                  <th className="r" title="How accurate this move was on average, by the engine">
                    Accuracy
                  </th>
                )}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((b, i) => (
                <tr
                  key={b.san}
                  className={b.perf.games < 10 ? 'few' : ''}
                  onClick={() => onPath([...path, b.san])}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && onPath([...path, b.san])}
                  title={`${b.node.record.won} won, ${b.node.record.drawn} drawn, ${b.node.record.lost} lost`}
                >
                  <td className="move">
                    <span className={`tree-swatch ${i === 0 && b.share >= 0.05 ? 'main' : b.share >= 0.05 && i < 4 ? 'other' : ''}`} aria-hidden />
                    {path.length % 2 === 0 ? `${path.length / 2 + 1}. ` : `${Math.ceil(path.length / 2)}… `}
                    {b.san}
                  </td>
                  <td className="r num">
                    {b.node.record.games.toLocaleString()} <span className="dim">{(b.share * 100).toFixed(0)}%</span>
                  </td>
                  <td className="r num">{pct(b.perf.actual)}</td>
                  {/* Under ten games a percentage is mostly noise, so the row stays quiet. */}
                  <td className={`r num delta ${b.perf.games >= 25 && Math.abs(b.perf.z) >= 2 ? 'strong' : ''}`}>
                    {b.perf.games >= 10 ? signed((b.perf.actual - b.perf.expected) * 100) : ''}
                  </td>
                  {engine && <td className="r num">{b.after && b.after.n >= 5 ? `${b.after.value.toFixed(0)}%` : ''}</td>}
                  {engine && myTurn && <td className="r num">{b.accuracy !== null && b.perf.games >= 5 ? b.accuracy.toFixed(0) : ''}</td>}
                  <td className="bar-cell">{b.perf.games >= 10 && <PerfBar actual={b.perf.actual} expected={b.perf.expected} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function positionAfter(path: string[]): { fen: string; lastMove: [string, string] | null } {
  const chess = new Chess()
  let last: [string, string] | null = null
  for (const san of path) {
    try {
      const m = chess.move(san)
      last = [m.from, m.to]
    } catch {
      break
    }
  }
  return { fen: chess.fen(), lastMove: last }
}

function uciOf(fen: string, san: string): { from: string; to: string } | null {
  try {
    const m = new Chess(fen).move(san)
    return { from: m.from, to: m.to }
  } catch {
    return null
  }
}
