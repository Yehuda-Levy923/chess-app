import type { Label } from '../review/types'

/** How a label reads in text: "a blunder", "best". */
export const LABEL_TEXT: Record<Label, { name: string; phrase: string }> = {
  brilliant: { name: 'Brilliant', phrase: 'brilliant' },
  great: { name: 'Great', phrase: 'a great move' },
  best: { name: 'Best', phrase: 'best' },
  excellent: { name: 'Excellent', phrase: 'excellent' },
  good: { name: 'Good', phrase: 'good' },
  book: { name: 'Book', phrase: 'a book move' },
  inaccuracy: { name: 'Inaccuracy', phrase: 'an inaccuracy' },
  mistake: { name: 'Mistake', phrase: 'a mistake' },
  miss: { name: 'Miss', phrase: 'a miss' },
  blunder: { name: 'Blunder', phrase: 'a blunder' },
}

/** Standard annotation glyphs. Quiet labels get none. */
export const GLYPH: Partial<Record<Label, string>> = {
  brilliant: '!!',
  great: '!',
  inaccuracy: '?!',
  mistake: '?',
  miss: '?',
  blunder: '??',
}

/**
 * Three marker roles, validated as a set for colour-blind separation. Everything
 * else stays in ink.
 */
export type Tone = 'found' | 'error' | 'blunder' | null

export function toneOf(label: Label): Tone {
  if (label === 'brilliant' || label === 'great') return 'found'
  if (label === 'mistake' || label === 'miss') return 'error'
  if (label === 'blunder') return 'blunder'
  return null
}

export const KEY_LABELS: Label[] = ['brilliant', 'great', 'mistake', 'miss', 'blunder']
