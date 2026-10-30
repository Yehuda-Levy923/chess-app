import type { BotStrength } from '../stockfish/engine'

// The computer opponents, one per piece. The top four use Stockfish's UCI_Elo,
// which is calibrated against engine rating lists rather than chess.com, so
// the numbers are a guide, not a chess.com rating. The bottom two sit below
// that calibration and are only described.

export type Bot = { id: string; piece: 'P' | 'N' | 'B' | 'R' | 'Q' | 'K'; name: string; level: string; strength: BotStrength }

export const BOTS: Bot[] = [
  { id: 'pawn', piece: 'P', name: 'Pawn', level: 'Beginner', strength: { skill: 0, depth: 1, movetime: 150 } },
  { id: 'knight', piece: 'N', name: 'Knight', level: 'Casual', strength: { skill: 5, depth: 4, movetime: 300 } },
  { id: 'bishop', piece: 'B', name: 'Bishop', level: '1400', strength: { elo: 1400, movetime: 600 } },
  { id: 'rook', piece: 'R', name: 'Rook', level: '1800', strength: { elo: 1800, movetime: 800 } },
  { id: 'queen', piece: 'Q', name: 'Queen', level: '2300', strength: { elo: 2300, movetime: 1000 } },
  { id: 'king', piece: 'K', name: 'King', level: 'Full strength', strength: { movetime: 1500 } },
]

export const botById = (id: string) => BOTS.find((b) => b.id === id) ?? BOTS[2]
