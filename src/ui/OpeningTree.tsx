import { Chess } from 'chess.js'
import { useEffect, useMemo, useState } from 'react'
import type { GameFacts, Side } from '../insights/facts'
import { score } from '../insights/stats'
import { branches, buildTree, nodeAt } from '../insights/tree'
import { getBook } from '../openings'
import { bookDepth } from '../openings/book'
import { ScoreBar } from './charts'
import { GameBoard } from './GameBoard'
import { IconBack } from './icons'
import { formatDate } from './InsightsScreen'

/** `filterSide` is the screen's colour filter; with "either colour" the tree picks one locally. */
type Props = { games: GameFacts[]; filterSide: Side | null }

export function OpeningTree({ games, filterSide }: Props) {
  const busier: Side = games.filter((g) => g.side === 'white').length >= games.length / 2 ? 'white' : 'black'
  const [localSide, setLocalSide] = useState<Side>(filterSide ?? busier)
  const side = filterSide ?? localSide
  const [path, setPath] = useState<string[]>([])
  useEffect(() => setPath([]), [side])

  const tree = useMemo(() => buildTree(games.filter((g) => g.side === side)), [games, side])

  const node = nodeAt(tree, path) ?? tree
  const position = positionAfter(path)
  const myTurn = (path.length % 2 === 0) === (side === 'white')
  const rows = branches(node)
  const opening = path.length ? bookDepth(getBook(), path).opening?.name ?? null : null

  return (
    <div className="tree">
      <div className="tree-board">
        <GameBoard fen={position.fen} orientation={side} lastMove={position.lastMove} />
        <div className="tree-path">
          <button className="btn btn-quiet" onClick={() => setPath((p) => p.slice(0, -1))} disabled={path.length === 0}>
            <IconBack size={16} /> Back
          </button>
          <ol className="tree-moves">
            <li>
              <button className={path.length === 0 ? 'on' : ''} onClick={() => setPath([])}>
                Start
              </button>
            </li>
            {path.map((san, i) => (
              <li key={i}>
                <button className={i === path.length - 1 ? 'on' : ''} onClick={() => setPath(path.slice(0, i + 1))}>
                  {i % 2 === 0 ? `${i / 2 + 1}. ` : ''}
                  {san}
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="tree-table">
        {!filterSide && (
          <div className="tree-side" role="group" aria-label="Colour">
            {(['white', 'black'] as Side[]).map((s) => (
              <button key={s} className={side === s ? 'on' : ''} aria-pressed={side === s} onClick={() => setLocalSide(s)}>
                As {s === 'white' ? 'White' : 'Black'}
              </button>
            ))}
          </div>
        )}
        <p className="tree-summary">
          {opening && <span className="tree-opening">{opening}</span>}
          <span className="dim">
            <span className="num">{node.record.games.toLocaleString()}</span> {node.record.games === 1 ? 'game' : 'games'} reached this position, last on{' '}
            {formatDate(node.lastPlayed)}
          </span>
        </p>
        <h2>{myTurn ? 'Your moves here' : 'Replies you faced'}</h2>
        {rows.length === 0 ? (
          <p className="dim">The games that got here went no further within the first 15 moves.</p>
        ) : (
          <table className="itable tree-rows">
            <thead>
              <tr>
                <th>Move</th>
                <th className="r">Games</th>
                <th className="r">Share</th>
                <th className="r">Won</th>
                <th className="r">Drawn</th>
                <th className="r">Lost</th>
                <th className="r">Score</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.san} onClick={() => setPath([...path, b.san])} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setPath([...path, b.san])}>
                  <td className="move">
                    {path.length % 2 === 0 ? `${path.length / 2 + 1}. ` : `${Math.ceil(path.length / 2)}… `}
                    {b.san}
                  </td>
                  <td className="r num">{b.node.record.games.toLocaleString()}</td>
                  <td className="r num dim">{(b.share * 100).toFixed(1)}%</td>
                  <td className="r num won">{b.node.record.won.toLocaleString()}</td>
                  <td className="r num drawn">{b.node.record.drawn.toLocaleString()}</td>
                  <td className="r num lost">{b.node.record.lost.toLocaleString()}</td>
                  <td className="r num">{Math.round(score(b.node.record) * 100)}%</td>
                  <td className="bar-cell">
                    <ScoreBar score={score(b.node.record)} />
                  </td>
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
