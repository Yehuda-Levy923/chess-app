import { pieceSetById, useAppearance } from './appearance'

// Filters shown as a row of choices rather than a dropdown, so every option is
// in view. Styles live in InsightsScreen.css (.filter-row, .filter-opt).

type Option<T extends string> = { id: T; label: React.ReactNode; title?: string }

export function ChoiceRow<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: Option<T>[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="filter-row" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className={`filter-opt ${typeof o.label === 'string' ? '' : 'filter-king'} ${value === o.id ? 'on' : ''}`} onClick={() => onChange(o.id)} title={o.title} disabled={disabled}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** A king in the player's piece set; "both" is half white, half black. */
export function King({ side }: { side: 'white' | 'black' | 'both' }) {
  const { appearance } = useAppearance()
  const set = pieceSetById(appearance.pieces)
  const img = (code: 'wK' | 'bK', cls = '') => <img className={cls} src={set.src(code)} alt="" crossOrigin={set.crossOrigin ? 'anonymous' : undefined} draggable={false} />
  if (side !== 'both') return img(side === 'white' ? 'wK' : 'bK')
  return (
    <span className="king-split">
      {img('wK', 'left')}
      {img('bK', 'right')}
    </span>
  )
}

/** One white piece in the player's set, by its letter (p, n, b, r, q, k). */
export function PieceIcon({ piece }: { piece: string }) {
  const { appearance } = useAppearance()
  const set = pieceSetById(appearance.pieces)
  return <img src={set.src(`w${piece.toUpperCase()}` as 'wK')} alt="" crossOrigin={set.crossOrigin ? 'anonymous' : undefined} draggable={false} />
}

/** The three colour choices, as kings. `both` is whatever id the screen uses for either colour. */
export const colourOptions = <B extends string>(both: B) => [
  { id: 'white' as const, label: <King side="white" />, title: 'White' },
  { id: both, label: <King side="both" />, title: 'Either colour' },
  { id: 'black' as const, label: <King side="black" />, title: 'Black' },
]
