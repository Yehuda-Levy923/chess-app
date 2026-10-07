import { Chess } from 'chess.js'
import { useMemo } from 'react'
import type { GameFacts, Side } from '../insights/facts'
import { branches, buildTree, nodeAt } from '../insights/tree'
import { getBook } from '../openings'
import { bookDepth } from '../openings/book'
import { PerfBar } from './charts'
import { performance } from './findings'
import { GameBoard } from './GameBoard'
import { derived } from './derived'
import type { Drill } from './GamesDrawer'
import { IconBack } from './icons'
import { gamesThrough } from './openingLines'

type Props = {
  /** Games played as `side` */
  games: GameFacts[]
  side: Side
  path: string[]
  onPath: (path: string[]) => void
  onDrill: (d: Drill) => void
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`
const signed = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(1)}`

/** Your games as a move tree: the position, then each move played from it with how it went. */
export function OpeningTree({ games, side, path, onPath, onDrill }: Props) {
  const tree = derived(games, 'tree', () => buildTree(games))
  const node = nodeAt(tree, path) ?? tree
  const here = useMemo(() => gamesThrough(games, path), [games, path])
  const perf = performance(here)
  const position = positionAfter(path)
  const myTurn = (path.length % 2 === 0) === (side === 'white')
  const opening = path.length ? (bookDepth(getBook(), path).opening?.name ?? null) : null
  const rows = branches(node).map((b) => {
    const through = here.filter((g) => g.sans[path.length] === b.san)
    return { ...b, through, perf: performance(through) }
  })
  const lineName = path.map((san, i) => `${i % 2 === 0 ? `${i / 2 + 1}.` : ''}${san}`).join(' ')

  return (
    <div className="tree">
      <div className="tree-board">
        <GameBoard fen={position.fen} orientation={side} lastMove={position.lastMove} />
        <div className="tree-path">
          <button className="btn btn-quiet" onClick={() => onPath(path.slice(0, -1))} disabled={path.length === 0}>
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
      </div>

      <div className="tree-table">
        <div className="tree-summary">
          <span className="tree-opening">{opening ?? (path.length ? 'Unnamed line' : 'Starting position')}</span>
          <span className="dim">
            <span className="num">{node.record.games.toLocaleString()}</span> {node.record.games === 1 ? 'game' : 'games'}, you scored{' '}
            <span className="num">{pct(perf.actual)}</span> where your ratings predicted <span className="num">{pct(perf.expected)}</span>
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
                <th className="r">Share</th>
                <th className="r">Score</th>
                <th className="r" title="Points per 100 games above or below what the ratings predicted">
                  vs ratings
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr
                  key={b.san}
                  className={b.perf.games < 10 ? 'few' : ''}
                  onClick={() => onPath([...path, b.san])}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && onPath([...path, b.san])}
                  title={`${b.node.record.won} won, ${b.node.record.drawn} drawn, ${b.node.record.lost} lost`}
                >
                  <td className="move">
                    {path.length % 2 === 0 ? `${path.length / 2 + 1}. ` : `${Math.ceil(path.length / 2)}… `}
                    {b.san}
                  </td>
                  <td className="r num">{b.node.record.games.toLocaleString()}</td>
                  <td className="r num dim">{(b.share * 100).toFixed(0)}%</td>
                  <td className="r num">{pct(b.perf.actual)}</td>
                  {/* Under ten games a percentage is mostly noise, so the row stays quiet. */}
                  <td className={`r num delta ${b.perf.games >= 25 && Math.abs(b.perf.z) >= 2 ? 'strong' : ''}`}>
                    {b.perf.games >= 10 ? signed((b.perf.actual - b.perf.expected) * 100) : ''}
                  </td>
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
