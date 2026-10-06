import type { Color } from 'chess.js'

/** Engine score from White's point of view. `mate` is signed: positive means White mates. */
export type Score =
  | { kind: 'cp'; cp: number }
  | { kind: 'mate'; mate: number }
  | { kind: 'over'; result: '1-0' | '0-1' | '1/2-1/2' }

export type EngineLine = {
  score: Score
  /** UCI moves, e.g. ["e2e4", "e7e5"] */
  pv: string[]
}

/** Stockfish's view of one position: its top lines, best first. */
export type PositionAnalysis = {
  fen: string
  /** Depth actually reached; can be below the request when the time cap hits */
  depth: number
  requestedDepth?: number
  lines: EngineLine[]
}

export type Label =
  | 'book'
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder'

export type ReviewedMove = {
  ply: number
  color: Color
  san: string
  uci: string
  fenBefore: string
  fenAfter: string
  label: Label
  /** Expected points thrown away by this move, 0..1, from the mover's side */
  loss: number
  accuracy: number
  /** White-POV win percent after the move, for the graph */
  winPercentAfter: number
  scoreAfter: Score
  bestUci: string | null
  bestSan: string | null
  scoreBest: Score | null
  note: string | null
  opening: string | null
}

export type Review = {
  gameId: string
  /** The depth that was asked for; reviews are cached under it */
  depth: number
  /** The shallowest depth any position actually reached */
  minDepth: number
  moves: ReviewedMove[]
  accuracy: { w: number; b: number }
  counts: { w: Record<Label, number>; b: Record<Label, number> }
  opening: string | null
  initialWinPercent: number
}
