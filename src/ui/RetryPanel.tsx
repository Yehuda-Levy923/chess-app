import { Chess } from 'chess.js'
import { winPercentFor } from '../review/accuracy'
import { formatScore } from '../review/format'
import type { ReviewedMove, Score } from '../review/types'
import { getEngine } from '../stockfish/shared'
import { Badge } from './Badge'
import { LABEL_TEXT } from './labels'

const RETRY_DEPTH = 14
/** A retry counts when it keeps the position within chess.com's "excellent" band. */
const TOLERANCE = 2

export type Attempt =
  | { state: 'thinking'; san: string }
  | { state: 'right'; san: string; score: Score }
  | { state: 'wrong'; san: string; score: Score }

/** Plays a candidate move and asks the engine whether it holds the evaluation. */
export async function judge(target: ReviewedMove, from: string, to: string): Promise<Attempt | null> {
  const chess = new Chess(target.fenBefore)
  let move
  try {
    move = chess.move({ from, to, promotion: 'q' })
  } catch {
    return null
  }
  if (move.lan === target.bestUci) return { state: 'right', san: move.san, score: target.scoreBest! }
  const over = chess.isCheckmate() ? ({ kind: 'over', result: target.color === 'w' ? '1-0' : '0-1' } as const) : null
  const score = over ?? (await getEngine().analyse(chess.fen(), RETRY_DEPTH)).lines[0]?.score
  if (!score) return null
  const best = winPercentFor(target.scoreBest!, target.color)
  const got = winPercentFor(score, target.color)
  return { state: best - got <= TOLERANCE ? 'right' : 'wrong', san: move.san, score }
}

type Props = {
  targets: ReviewedMove[]
  index: number
  attempt: Attempt | null
  revealed: boolean
  onIndex: (i: number) => void
  onReveal: () => void
  onExit: () => void
}

export function RetryPanel({ targets, index, attempt, revealed, onIndex, onReveal, onExit }: Props) {
  const t = targets[index]
  if (!t) {
    return (
      <section className="coach retry">
        <p>No mistakes to retry for this side.</p>
        <div className="retry-actions">
          <button className="btn" onClick={onExit}>Back to review</button>
        </div>
      </section>
    )
  }
  const side = t.color === 'w' ? 'White' : 'Black'
  return (
    <section className="coach retry">
      <p className="retry-line">
        <span className="num dim">
          {index + 1} of {targets.length}
        </span>{' '}
        {side} to move. You played <strong>{t.san}</strong>, {LABEL_TEXT[t.label].phrase}. Find better.
      </p>
      {attempt?.state === 'thinking' && <p className="dim">Checking {attempt.san}…</p>}
      {attempt?.state === 'right' && (
        <p className="retry-result">
          <Badge label="best" size={18} />
          Correct. {attempt.san} keeps it at <span className="num">{formatScore(attempt.score)}</span>.
        </p>
      )}
      {attempt?.state === 'wrong' && (
        <p className="retry-result">
          <Badge label="mistake" size={18} />
          {attempt.san} scores <span className="num">{formatScore(attempt.score)}</span>. Try again.
        </p>
      )}
      {revealed && (
        <p>
          The engine plays {t.bestSan} (<span className="num">{t.scoreBest ? formatScore(t.scoreBest) : ''}</span>).
        </p>
      )}
      <div className="retry-actions">
        <button className="btn" onClick={() => onIndex(index - 1)} disabled={index === 0}>
          Previous
        </button>
        <button className="btn" onClick={onReveal} disabled={revealed}>
          Show answer
        </button>
        <button className="btn" onClick={() => onIndex(index + 1)} disabled={index === targets.length - 1}>
          Next
        </button>
        <button className="btn" onClick={onExit}>Done</button>
      </div>
    </section>
  )
}
