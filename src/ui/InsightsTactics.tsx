import { useState } from 'react'
import { brilliantMoves, tacticsBothWays, type TacticKind } from '../insights/chesscomStats'
import type { MoveRef, ReviewedGame } from '../insights/engineStats'
import { derived } from './derived'
import type { Drill } from './GamesDrawer'
import { movesDrill } from './moveDrill'

type Props = {
  games: ReviewedGame[]
  onDrill: (d: Drill) => void
}

const KIND_TEXT: Record<TacticKind, string> = { mate: 'Forced mates', fork: 'Forks', pin: 'Pins' }
const PIECE_NAME: Record<string, string> = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' }

/** chess.com's Tactics section, from both sides of the board, and every brilliant move. */
export function InsightsTactics({ games, onDrill }: Props) {
  const stats = derived(games, 'tactics-tab', () => ({ t: tacticsBothWays(games), brilliant: brilliantMoves(games) }))
  const [piece, setPiece] = useState('all')
  const [timeClass, setTimeClass] = useState('all')
  if (games.length === 0) return <p className="dim">These come from reviewed games, and none in this filter are reviewed.</p>

  const count = (title: string, refs: MoveRef[]) =>
    refs.length ? (
      <button className="link-button num" onClick={() => onDrill(movesDrill(title, refs, games))}>
        {refs.length.toLocaleString()}
      </button>
    ) : (
      <span className="num">0</span>
    )
  const rate = (a: number, b: number) => (a + b ? `${Math.round((a / (a + b)) * 100)}%` : '')

  const pieces = [...new Set(stats.brilliant.map((b) => b.piece))]
  const classes = [...new Set(stats.brilliant.map((b) => b.timeClass))]
  const shown = stats.brilliant.filter((b) => (piece === 'all' || b.piece === piece) && (timeClass === 'all' || b.timeClass === timeClass))
  const { rows, pinGames, hung } = stats.t

  return (
    <div className="insights-grid">
      <div className="insights-col">
        <h2>Tactics</h2>
        <table className="itable">
          <thead>
            <tr>
              <th />
              <th className="r">Found</th>
              <th className="r">Missed</th>
              <th className="r">Found rate</th>
              <th className="r" title="Chances your move handed the opponent">
                You allowed
              </th>
              <th className="r">They took</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.kind}>
                <td>{KIND_TEXT[r.kind]}</td>
                <td className="r">{count(`${KIND_TEXT[r.kind]} you found`, r.found)}</td>
                <td className="r">{count(`${KIND_TEXT[r.kind]} you missed`, r.missed)}</td>
                <td className="r num">{rate(r.found.length, r.missed.length)}</td>
                <td className="r">{count(`${KIND_TEXT[r.kind]} you allowed`, r.allowed)}</td>
                <td className="r">{count(`${KIND_TEXT[r.kind]} your opponent took`, r.allowedTaken)}</td>
              </tr>
            ))}
            <tr>
              <td>Pieces left hanging</td>
              <td colSpan={2} />
              <td />
              <td className="r">{count('Times you left material hanging', hung.mine)}</td>
              <td />
            </tr>
          </tbody>
        </table>
        <p className="dim note">
          A tactic counts when it was the engine's first choice; found means you played a move as good. Pins also need the engine's second choice to be clearly worse,
          so only pins that won something count
          {pinGames < games.length ? (
            <>
              , and they come from <span className="num">{pinGames.toLocaleString()}</span> of these <span className="num">{games.length.toLocaleString()}</span> games
            </>
          ) : null}
          . Your opponents left material hanging {count('Times your opponent left material hanging', hung.theirs)} times.
        </p>
      </div>

      <div className="insights-col">
        <h2>Brilliant moves</h2>
        {stats.brilliant.length === 0 ? (
          <p className="dim">No brilliant moves in these games yet.</p>
        ) : (
          <>
            <div className="brilliant-filters">
              <label>
                <span>Piece</span>
                <select value={piece} onChange={(e) => setPiece(e.target.value)}>
                  <option value="all">Any piece</option>
                  {pieces.map((p) => (
                    <option key={p} value={p}>
                      {PIECE_NAME[p] ?? p}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Time control</span>
                <select value={timeClass} onChange={(e) => setTimeClass(e.target.value)}>
                  <option value="all">Any</option>
                  {classes.map((t) => (
                    <option key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p>
              <span className="num">{shown.length.toLocaleString()}</span> brilliant {shown.length === 1 ? 'move' : 'moves'}
              {shown.length > 0 && (
                <button className="btn brilliant-open" onClick={() => onDrill(movesDrill('Your brilliant moves', shown, games))}>
                  Show {shown.length === 1 ? 'it' : 'them'}
                </button>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
