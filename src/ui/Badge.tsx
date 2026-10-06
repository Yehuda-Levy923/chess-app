import type { Label } from '../review/types'
import { LABEL_TEXT, toneOf } from './labels'
import './Badge.css'

// Classification marks, drawn as SVG so they read the same on any board. Colour
// only ever comes from the three validated tones; the quiet labels share one
// neutral disc and are told apart by their icon.

const TEXT: Partial<Record<Label, string>> = {
  brilliant: '!!',
  great: '!',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
}

function Icon({ label }: { label: Label }) {
  const text = TEXT[label]
  if (text) {
    return (
      <text x="12" y="16.6" textAnchor="middle" fontSize={text.length > 1 ? 11.5 : 13} fontWeight={800} fill="currentColor" letterSpacing={-0.6}>
        {text}
      </text>
    )
  }
  switch (label) {
    case 'best':
      return <path d="M12 5.2l2.05 4.3 4.65.55-3.45 3.2.9 4.6L12 15.6l-4.15 2.25.9-4.6-3.45-3.2 4.65-.55z" fill="currentColor" />
    case 'excellent':
      return <path d="M7 12.4l3.2 3.2L17.2 8.6" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    case 'good':
      return <path d="M7.6 12.6l2.9 2.9 5.9-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    case 'book':
      return (
        <path
          d="M12 8.2c-1.6-1-3.4-1.3-5.4-1.1v8.6c2-.2 3.8.1 5.4 1.1 1.6-1 3.4-1.3 5.4-1.1V7.1c-2-.2-3.8.1-5.4 1.1zm0 0v8.6"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
      )
    case 'miss':
      return <path d="M8.3 8.3l7.4 7.4M15.7 8.3l-7.4 7.4" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" />
    default:
      return null
  }
}

export function Badge({ label, size = 20, className = '' }: { label: Label; size?: number; className?: string }) {
  const tone = toneOf(label) ?? (label === 'inaccuracy' ? 'warn' : 'quiet')
  return (
    <svg className={`badge badge-${tone} ${className}`} width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={LABEL_TEXT[label].name}>
      <circle cx="12" cy="12" r="11" className="badge-disc" />
      <Icon label={label} />
    </svg>
  )
}
