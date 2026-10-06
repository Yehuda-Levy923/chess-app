import { createContext, useContext } from 'react'

// Everything the viewer can restyle: page theme, board and piece set. The
// default look is the Fire theme (the user's own photo, public/backgrounds)
// with chess.com's Burled Wood board and Lolz pieces. Those images
// are chess.com's and are loaded from their CDN, never copied into the repo, so
// this stays a private tool. The other sets are open-licence copies from Lichess
// in public/pieces and public/boards.

const CHESSCOM = 'https://images.chesscomfiles.com/chess-themes'

export type ThemeId = 'system' | 'fire' | 'walnut' | 'graphite' | 'felt' | 'paper'

export type Theme = { id: ThemeId; name: string; swatch: [string, string, string] }

export const THEMES: Theme[] = [
  { id: 'fire', name: 'Fire', swatch: ['#070403', '#ff6a1a', '#ffd27a'] },
  { id: 'walnut', name: 'Walnut', swatch: ['#1c1814', '#2a241e', '#efe6d8'] },
  { id: 'graphite', name: 'Graphite', swatch: ['#161616', '#222221', '#ecebe6'] },
  { id: 'felt', name: 'Felt', swatch: ['#11201a', '#1a2e25', '#e9efe8'] },
  { id: 'paper', name: 'Paper', swatch: ['#f4f1ea', '#fcfaf5', '#1d1b17'] },
  { id: 'system', name: 'Match system', swatch: ['#f4f1ea', '#161616', '#7d7a73'] },
]

export type BoardDef = {
  id: string
  name: string
  /** Full 8x8 board image, a8 light. Flat boards have none. */
  image?: string
  crossOrigin?: boolean
  /** Square colours. On image boards these only colour the coordinates and the picker swatch. */
  light: string
  dark: string
}

export const BOARDS: BoardDef[] = [
  { id: 'burled', name: 'Burled wood', image: `${CHESSCOM}/boards/burled_wood/150.png`, crossOrigin: true, light: '#e6cba3', dark: '#7d4727' },
  { id: 'wood', name: 'Oak', image: '/boards/wood4.jpg', light: '#c09e69', dark: '#875b36' },
  { id: 'maple', name: 'Maple', image: '/boards/maple.jpg', light: '#e0be92', dark: '#b46e3b' },
  { id: 'marble', name: 'Green marble', image: '/boards/marble.jpg', light: '#93a994', dark: '#5a7159' },
  { id: 'blue-marble', name: 'Blue marble', image: '/boards/blue-marble.jpg', light: '#e5e0d4', dark: '#949fae' },
  { id: 'moss', name: 'Moss', light: '#e7e4cc', dark: '#6f8a56' },
  { id: 'cocoa', name: 'Cocoa', light: '#ecd8b8', dark: '#a6764f' },
  { id: 'stone', name: 'Stone', light: '#dddad2', dark: '#8f8b80' },
]

export type PieceSetDef = { id: string; name: string; crossOrigin?: boolean; src: (piece: PieceCode) => string }

export type PieceCode = `${'w' | 'b'}${'P' | 'N' | 'B' | 'R' | 'Q' | 'K'}`

export const PIECE_CODES: PieceCode[] = ['wP', 'wN', 'wB', 'wR', 'wQ', 'wK', 'bP', 'bN', 'bB', 'bR', 'bQ', 'bK']

const lichess = (id: string, name: string): PieceSetDef => ({ id, name, src: (p) => `/pieces/${id}/${p}.svg` })

export const PIECE_SETS: PieceSetDef[] = [
  { id: 'lolz', name: 'Lolz', crossOrigin: true, src: (p) => `${CHESSCOM}/pieces/lolz/150/${p.toLowerCase()}.png` },
  lichess('cburnett', 'Cburnett'),
  lichess('merida', 'Merida'),
  lichess('california', 'California'),
  lichess('maestro', 'Maestro'),
  lichess('staunty', 'Staunty'),
  lichess('fantasy', 'Fantasy'),
]

export type Appearance = { theme: ThemeId; board: string; pieces: string; coordinates: boolean }

export const DEFAULT_APPEARANCE: Appearance = { theme: 'fire', board: 'burled', pieces: 'lolz', coordinates: true }

const KEY = 'appearance'

// Per-viewer convenience: an unreadable store just means the defaults.
export function loadAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_APPEARANCE
    const saved = JSON.parse(raw) as Partial<Appearance>
    return {
      theme: THEMES.some((t) => t.id === saved.theme) ? saved.theme! : DEFAULT_APPEARANCE.theme,
      board: BOARDS.some((b) => b.id === saved.board) ? saved.board! : DEFAULT_APPEARANCE.board,
      pieces: PIECE_SETS.some((p) => p.id === saved.pieces) ? saved.pieces! : DEFAULT_APPEARANCE.pieces,
      coordinates: saved.coordinates ?? DEFAULT_APPEARANCE.coordinates,
    }
  } catch {
    return DEFAULT_APPEARANCE
  }
}

export function saveAppearance(a: Appearance) {
  try {
    localStorage.setItem(KEY, JSON.stringify(a))
  } catch {
    // ignore
  }
}

/** "system" leaves the attribute off so the stylesheet's media query picks Paper or Graphite. */
export function applyTheme(theme: ThemeId) {
  if (theme === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = theme
}

export const boardById = (id: string) => BOARDS.find((b) => b.id === id) ?? BOARDS[0]
export const pieceSetById = (id: string) => PIECE_SETS.find((p) => p.id === id) ?? PIECE_SETS[0]

type Ctx = { appearance: Appearance; setAppearance: (a: Appearance) => void; openSettings: () => void }

export const AppearanceContext = createContext<Ctx>({
  appearance: DEFAULT_APPEARANCE,
  setAppearance: () => {},
  openSettings: () => {},
})

export const useAppearance = () => useContext(AppearanceContext)
