import { winPercent } from '../review/accuracy'
import { formatScore } from '../review/format'
import type { Score } from '../review/types'

type Props = { score: Score; orientation: 'white' | 'black' }

export function EvalBar({ score, orientation }: Props) {
  const white = winPercent(score)
  const text = formatScore(score).replace(/^\+/, '')
  const whiteAhead = white >= 50
  return (
    <div className={`evalbar ${orientation === 'black' ? 'flipped' : ''}`} aria-label={`Evaluation ${formatScore(score)}`}>
      <div className="evalbar-white" style={{ height: `${white}%` }} />
      <span className={`evalbar-text num ${whiteAhead ? 'on-white' : 'on-black'}`}>{text.replace(/^-/, '')}</span>
    </div>
  )
}
