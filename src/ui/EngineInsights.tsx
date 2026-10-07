import type { ChessComGame } from '../chesscom/api'
import { accuracyByMove, accuracyByPiece, accuracyOverTime, moveQuality, tactics, type ReviewedGame } from '../insights/engineStats'
import type { BatchProgress } from '../review/batch'
import { LABELS } from '../review/buildReview'
import { Badge } from './Badge'
import { BarChart, LineChart } from './charts'
import { formatDate } from './InsightsScreen'
import { GLYPH, LABEL_TEXT } from './labels'

type Props = {
  games: ReviewedGame[]
  totalGames: number
  unreviewed: ChessComGame[]
  batch: BatchProgress | null
  onBatch: (n: number) => void
  onStop: () => void
}

const PIECE_NAMES = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' } as const

const BATCH_SIZES = [10, 25, 50]

/** Reviews more games in the background; about a minute and a half each on one engine thread. */
function BatchControl({ unreviewed, batch, onBatch, onStop }: Pick<Props, 'unreviewed' | 'batch' | 'onBatch' | 'onStop'>) {
  if (batch) {
    const pos = batch.positions
    return (
      <div className="batch">
        <p>
          Reviewing game <span className="num">{Math.min(batch.done + 1, batch.total)}</span> of <span className="num">{batch.total}</span>
          {batch.current && (
            <span className="dim">
              {' '}
              {batch.current.white.username} vs {batch.current.black.username}, {formatDate(batch.current.endTime)}
            </span>
          )}
          {pos && (
            <span className="dim">
              , position <span className="num">{pos[0]}</span> of <span className="num">{pos[1]}</span>
            </span>
          )}
        </p>
        <div className="progress">
          <div style={{ width: `${((batch.done + (pos ? pos[0] / pos[1] : 0)) / batch.total) * 100}%` }} />
        </div>
        <button className="btn" onClick={onStop}>
          Stop
        </button>
      </div>
    )
  }
  if (unreviewed.length === 0) return <p className="dim batch">Every game in this filter has been reviewed.</p>
  return (
    <div className="batch">
      <p>
        <span className="num">{unreviewed.length.toLocaleString()}</span> {unreviewed.length === 1 ? 'game' : 'games'} in this filter aren't reviewed. Review the newest:
      </p>
      <div className="batch-buttons">
        {BATCH_SIZES.filter((_, i) => i === 0 || unreviewed.length > BATCH_SIZES[i - 1]).map((n) => (
          <button key={n} className="btn" onClick={() => onBatch(n)}>
            {Math.min(n, unreviewed.length)} games, about {Math.round(Math.min(n, unreviewed.length) * 1.5)} min
          </button>
        ))}
      </div>
    </div>
  )
}

export function EngineInsights({ games, totalGames, unreviewed, batch, onBatch, onStop }: Props) {
  const control = <BatchControl unreviewed={unreviewed} batch={batch} onBatch={onBatch} onStop={onStop} />
  if (games.length === 0) {
    return (
      <div>
        <p className="dim">
          These stats need Stockfish, so they only cover games reviewed in this app. None of the {totalGames.toLocaleString()} games in this filter have been
          reviewed yet.
        </p>
        {control}
      </div>
    )
  }

  const over = accuracyOverTime(games)
  const byMove = accuracyByMove(games)
  const quality = moveQuality(games)
  const pieces = accuracyByPiece(games)
  const t = tactics(games)
  const withChessCom = over.filter((p) => p.chessCom !== null)

  return (
    <div className="insights-grid">
      <p className="dim note wide">
        From the <span className="num">{games.length}</span> reviewed {games.length === 1 ? 'game' : 'games'} of the {totalGames.toLocaleString()} in this filter.
      </p>
      <div className="wide">{control}</div>
      <div className="insights-col">
        <h2>Accuracy</h2>
        <LineChart
          yLabel="Accuracy per reviewed game"
          yDomain={[0, 100]}
          series={[
            {
              id: 'ours',
              name: 'This app',
              points: over.map((p) => ({ x: p.t, y: p.ours, tip: <>{tipText(p)}</> })),
            },
            ...(withChessCom.length
              ? [{ id: 'cc', name: 'chess.com', dashed: true, points: withChessCom.map((p) => ({ x: p.t, y: p.chessCom!, tip: <>{tipText(p)}</> })) }]
              : []),
          ]}
        />

        <h2>Accuracy by move number</h2>
        <BarChart
          format={(v) => `${v.toFixed(1)}%`}
          bars={byMove.map((b) => ({
            key: b.label,
            label: b.label,
            value: b.accuracy ?? 0,
            tip: (
              <span className="dim">
                {b.moves.toLocaleString()} moves
              </span>
            ),
          }))}
        />

        <h2>Accuracy by piece</h2>
        <table className="itable">
          <thead>
            <tr>
              <th />
              <th className="r">Moves</th>
              <th className="r">Accuracy</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(PIECE_NAMES) as (keyof typeof PIECE_NAMES)[]).map((p) => (
              <tr key={p}>
                <td>{PIECE_NAMES[p]}</td>
                <td className="r num">{pieces[p].moves.toLocaleString()}</td>
                <td className="r num">{pieces[p].accuracy === null ? '' : `${pieces[p].accuracy!.toFixed(1)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="insights-col">
        <h2>Move quality</h2>
        <table className="itable">
          <tbody>
            {LABELS.filter((l) => quality.get(l)).map((l) => (
              <tr key={l}>
                <td className="label-cell">
                  {GLYPH[l] && <Badge label={l} size={15} />}
                  {LABEL_TEXT[l].name}
                </td>
                <td className="r num">{((quality.get(l) ?? 0) * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Tactics</h2>
        <table className="itable">
          <thead>
            <tr>
              <th />
              <th className="r">Found</th>
              <th className="r">Missed</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Forced mates</td>
              <td className="r num">{t.matesFound}</td>
              <td className="r num">{t.matesMissed}</td>
            </tr>
            <tr>
              <td>Forks</td>
              <td className="r num">{t.forksFound}</td>
              <td className="r num">{t.forksMissed}</td>
            </tr>
            <tr>
              <td>Pieces your opponent left hanging</td>
              <td className="r num">{t.opponentHungPunished}</td>
              <td className="r num">{t.opponentHung - t.opponentHungPunished}</td>
            </tr>
          </tbody>
        </table>
        <p className="dim note">
          You left material hanging <span className="num">{t.hungPieces}</span> {t.hungPieces === 1 ? 'time' : 'times'}. A fork or mate counts as available when it
          was the engine's first choice.
        </p>
      </div>
    </div>
  )
}

function tipText(p: { t: number; ours: number; chessCom: number | null }) {
  return (
    <>
      <span className="num">{p.ours.toFixed(1)}</span>
      {p.chessCom !== null && (
        <>
          {' '}
          <span className="dim">chess.com</span> <span className="num">{p.chessCom.toFixed(1)}</span>
        </>
      )}{' '}
      <span className="dim">{formatDate(p.t)}</span>
    </>
  )
}
