import { accuracyByMoveNumber, castlingByPhase, gameShapes, SHAPE_TEXT, type CastleWhen } from '../insights/chesscomStats'
import { accuracyByPiece, moveQuality, type ReviewedGame } from '../insights/engineStats'
import type { PieceType } from '../insights/facts'
import { LABELS } from '../review/buildReview'
import { Badge } from './Badge'
import { LineChart, ScoreBar } from './charts'
import { derived } from './derived'
import type { Drill } from './GamesDrawer'
import { GLYPH, LABEL_TEXT } from './labels'
import { gamesDrill, labelled, movesDrill } from './moveDrill'

type Props = {
  games: ReviewedGame[]
  onDrill: (d: Drill) => void
}

const PIECES: { p: PieceType; name: string }[] = [
  { p: 'p', name: 'Pawn' },
  { p: 'n', name: 'Knight' },
  { p: 'b', name: 'Bishop' },
  { p: 'r', name: 'Rook' },
  { p: 'q', name: 'Queen' },
  { p: 'k', name: 'King' },
]

const CASTLE_TEXT: Record<CastleWhen, string> = {
  opening: 'In the opening',
  middlegame: 'In the middlegame',
  endgame: 'In the endgame',
  never: "Didn't castle",
}

const pct = (x: number) => `${Math.round(x * 100)}%`

/** chess.com's Moves section: what kind of moves you make, with which pieces, and how games go. */
export function InsightsMoves({ games, onDrill }: Props) {
  const stats = derived(games, 'moves-tab', () => ({
    quality: moveQuality(games),
    byMove: accuracyByMoveNumber(games),
    pieces: accuracyByPiece(games),
    castling: castlingByPhase(games),
    shapes: gameShapes(games),
  }))
  if (games.length === 0) return <p className="dim">These come from reviewed games, and none in this filter are reviewed.</p>
  const pieceMoves = PIECES.reduce((s, x) => s + stats.pieces[x.p].moves, 0)

  return (
    <div className="insights-grid">
      <div className="insights-col">
        <h2>Move quality</h2>
        <table className="itable quality perf-rows">
          <tbody>
            {LABELS.filter((l) => stats.quality.get(l)).map((l) => {
              const open = () => onDrill(movesDrill(`Your ${LABEL_TEXT[l].name.toLowerCase()} moves`, labelled(games, l), games))
              return (
                <tr key={l} tabIndex={0} title={`List your ${LABEL_TEXT[l].name.toLowerCase()} moves`} onClick={open} onKeyDown={(e) => e.key === 'Enter' && open()}>
                  <td className="label-cell">
                    {GLYPH[l] ? <Badge label={l} size={15} /> : <span className="badge-space" />}
                    {LABEL_TEXT[l].name}
                  </td>
                  <td className="r num">{((stats.quality.get(l) ?? 0) * 100).toFixed(1)}%</td>
                  <td className="bar-cell">
                    <span className="sharebar" style={{ width: `${Math.min(100, (stats.quality.get(l) ?? 0) * 200)}%` }} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <h2>Accuracy by move number</h2>
        {stats.byMove.length >= 2 ? (
          <LineChart
            yLabel="Your average accuracy at each move number, book moves left out"
            yDomain={[0, 100]}
            formatX={(x) => `Move ${x}`}
            series={[
              {
                id: 'acc',
                name: 'Accuracy',
                points: stats.byMove.map((p) => ({
                  x: p.move,
                  y: p.accuracy,
                  tip: (
                    <>
                      Move {p.move}: <span className="num">{p.accuracy.toFixed(1)}</span> <span className="dim">over {p.moves.toLocaleString()} moves</span>
                    </>
                  ),
                })),
              },
            ]}
          />
        ) : (
          <p className="dim">Not enough reviewed moves yet.</p>
        )}

        <h2>Pieces</h2>
        <table className="itable perf-rows static">
          <thead>
            <tr>
              <th />
              <th className="r">Share of moves</th>
              <th className="r" title="Book moves left out">
                Accuracy
              </th>
            </tr>
          </thead>
          <tbody>
            {PIECES.map(({ p, name }) => (
              <tr key={p}>
                <td className="name">{name}</td>
                <td className="r num">{pieceMoves ? pct(stats.pieces[p].moves / pieceMoves) : ''}</td>
                <td className="r num">{stats.pieces[p].accuracy === null ? '' : stats.pieces[p].accuracy!.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="insights-col">
        <h2>Game shapes</h2>
        <table className="itable perf-rows">
          <thead>
            <tr>
              <th />
              <th className="r">Games</th>
              <th className="r">Score</th>
              <th className="r">Accuracy</th>
            </tr>
          </thead>
          <tbody>
            {stats.shapes.map((r) => {
              const open = () => onDrill(gamesDrill(`${SHAPE_TEXT[r.shape].name}: ${SHAPE_TEXT[r.shape].means.toLowerCase()}`, r.gameIds, games))
              return (
                <tr key={r.shape} tabIndex={0} onClick={open} onKeyDown={(e) => e.key === 'Enter' && open()}>
                  <td className="name">
                    {SHAPE_TEXT[r.shape].name}
                    <span className="row-sub">{SHAPE_TEXT[r.shape].means}</span>
                  </td>
                  <td className="r num">
                    {r.games.toLocaleString()} <span className="dim">{pct(r.share)}</span>
                  </td>
                  <td className="r num">{pct(r.score)}</td>
                  <td className="r num">{r.accuracy.toFixed(1)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <h2>When you castled</h2>
        {stats.castling.used === 0 ? (
          <p className="dim">Needs reviews with phase data; rebuild the summaries on GitHub from the Skills tab.</p>
        ) : (
          <table className="itable perf-rows">
            <thead>
              <tr>
                <th />
                <th className="r">Games</th>
                <th className="r">Score</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {stats.castling.rows.map((r) => {
                const open = () => onDrill(gamesDrill(`Castled: ${CASTLE_TEXT[r.when].toLowerCase()}`, r.gameIds, games))
                return (
                  <tr key={r.when} tabIndex={0} onClick={open} onKeyDown={(e) => e.key === 'Enter' && open()}>
                    <td className="name">{CASTLE_TEXT[r.when]}</td>
                    <td className="r num">{r.games.toLocaleString()}</td>
                    <td className="r num">{pct(r.score)}</td>
                    <td className="bar-cell">
                      <ScoreBar score={r.score} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
