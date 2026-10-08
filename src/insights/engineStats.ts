import type { Color } from 'chess.js'
import { estimateRating } from '../review/gameRating'
import { colorAt, labelAt, moveNumberAt, moverWinPercentBefore, pieceAt, TACTIC, type GameSummary } from '../review/summary'
import type { Label } from '../review/types'
import type { GameFacts, PieceType } from './facts'
import { RATING_GAP_BUCKETS } from './stats'

// Stats that need Stockfish, so they only cover games reviewed in the app.
// They read review summaries (src/review/summary.ts), not full reviews.

export type ReviewedGame = { summary: GameSummary; facts: GameFacts; chessComAccuracy: number | null }

const GOOD_ENOUGH: Label[] = ['brilliant', 'great', 'best', 'excellent']
/** Moves that cost real points: chess.com's mistake and blunder bands, plus misses */
const COSTLY: Label[] = ['mistake', 'miss', 'blunder']

export function accuracyOverTime(games: ReviewedGame[]): { t: number; ours: number; chessCom: number | null }[] {
  return games.map((g) => ({ t: g.facts.endTime, ours: myAccuracy(g), chessCom: g.chessComAccuracy })).sort((a, b) => a.t - b.t)
}

const MOVE_BANDS = [
  { label: '1–10', lo: 1, hi: 10 },
  { label: '11–20', lo: 11, hi: 20 },
  { label: '21–30', lo: 21, hi: 30 },
  { label: '31–40', lo: 31, hi: 40 },
  { label: '41+', lo: 41, hi: Infinity },
]

/** Mean per-move accuracy of the player's moves, by move number band. */
export function accuracyByMove(games: ReviewedGame[]): { label: string; accuracy: number | null; moves: number }[] {
  return MOVE_BANDS.map((b) => {
    const m = meanOf(myMoves(games), (x) => x.moveNo >= b.lo && x.moveNo <= b.hi)
    return { label: b.label, accuracy: m.mean, moves: m.n }
  })
}

/** Share of the player's moves given each label. */
export function moveQuality(games: ReviewedGame[]): Map<Label, number> {
  const counts = new Map<Label, number>()
  let total = 0
  for (const m of myMoves(games)) {
    counts.set(m.label, (counts.get(m.label) ?? 0) + 1)
    total++
  }
  for (const [l, c] of counts) counts.set(l, c / total)
  return counts
}

/** Mean accuracy and move count for each piece the player moved. */
export function accuracyByPiece(games: ReviewedGame[]): Record<PieceType, { accuracy: number | null; moves: number }> {
  const out = {} as Record<PieceType, { accuracy: number | null; moves: number }>
  for (const p of ['p', 'n', 'b', 'r', 'q', 'k'] as PieceType[]) {
    const m = meanOf(myMoves(games), (x) => x.piece === p && x.label !== 'book')
    out[p] = { accuracy: m.mean, moves: m.n }
  }
  return out
}

export type Tactics = {
  matesFound: number
  matesMissed: number
  forksFound: number
  forksMissed: number
  /** Times the player left material to be won */
  hungPieces: number
  /** Times the opponent left material to be won, and how often the player took it */
  opponentHung: number
  opponentHungPunished: number
}

/**
 * Tactical moments from the player's side. A fork or mate counts as available
 * when it was the engine's best move; "found" means the player played a move
 * at least as good.
 */
export function tactics(games: ReviewedGame[]): Tactics {
  const t: Tactics = { matesFound: 0, matesMissed: 0, forksFound: 0, forksMissed: 0, hungPieces: 0, opponentHung: 0, opponentHungPunished: 0 }
  for (const g of games) {
    const s = g.summary
    const me = colorOf(g)
    for (let i = 0; i < s.labels.length; i++) {
      const f = s.tactics[i]
      if (colorAt(s, i) !== me) {
        // The opponent hung something; did the player's reply take advantage?
        if (f & TACTIC.hung && i + 1 < s.labels.length) {
          t.opponentHung++
          if (GOOD_ENOUGH.includes(labelAt(s, i + 1))) t.opponentHungPunished++
        }
        continue
      }
      if (f & TACTIC.mateAvailable) f & TACTIC.mateFound ? t.matesFound++ : t.matesMissed++
      if (f & TACTIC.forkAvailable) f & TACTIC.forkFound ? t.forksFound++ : t.forksMissed++
      if (f & TACTIC.hung) t.hungPieces++
    }
  }
  return t
}

/** A move in a reviewed game: summary index i is review.moves[i], ply summary.firstPly + i. */
export type MoveRef = { gameId: string; index: number }

/**
 * The moves behind each tactics() count, so a number can list its positions.
 * For opponentHung and opponentHungPunished the index is the opponent's move.
 */
export function tacticMoments(games: ReviewedGame[]): Record<keyof Tactics, MoveRef[]> {
  const t: Record<keyof Tactics, MoveRef[]> = { matesFound: [], matesMissed: [], forksFound: [], forksMissed: [], hungPieces: [], opponentHung: [], opponentHungPunished: [] }
  for (const g of games) {
    const s = g.summary
    const me = colorOf(g)
    const at = (index: number): MoveRef => ({ gameId: s.gameId, index })
    for (let i = 0; i < s.labels.length; i++) {
      const f = s.tactics[i]
      if (colorAt(s, i) !== me) {
        if (f & TACTIC.hung && i + 1 < s.labels.length) {
          t.opponentHung.push(at(i))
          if (GOOD_ENOUGH.includes(labelAt(s, i + 1))) t.opponentHungPunished.push(at(i))
        }
        continue
      }
      if (f & TACTIC.mateAvailable) (f & TACTIC.mateFound ? t.matesFound : t.matesMissed).push(at(i))
      if (f & TACTIC.forkAvailable) (f & TACTIC.forkFound ? t.forksFound : t.forksMissed).push(at(i))
      if (f & TACTIC.hung) t.hungPieces.push(at(i))
    }
  }
  return t
}

const CLOCK_BANDS = [
  { label: 'Over half', lo: 0.5, hi: Infinity },
  { label: '25–50%', lo: 0.25, hi: 0.5 },
  { label: '10–25%', lo: 0.1, hi: 0.25 },
  // Split, because 5–10% plays like the bands above and under 5% is a scramble.
  { label: '5–10%', lo: 0.05, hi: 0.1 },
  { label: 'Under 5%', lo: 0, hi: 0.05 },
]

/** Win percent range, from the mover's side, where a position still counts as undecided. */
export const CONTESTED = { lo: 20, hi: 80 }

export type MoveBand = {
  label: string
  /** Mean per-move accuracy, book moves excluded */
  accuracy: number | null
  /** Sample standard deviation of per-move accuracy, for a standard error of accuracySd / sqrt(moves) */
  accuracySd: number | null
  moves: number
  /** Share of those moves that were mistakes, misses or blunders */
  costlyRate: number | null
}

/**
 * The player's moves by how much of their starting time was left when they
 * made them. Shares rather than seconds, so bullet and rapid line up.
 *
 * By default only moves made while the game was still undecided (CONTESTED)
 * count. Low-clock moves come mostly late in games that are already won or
 * lost, where nearly any move keeps the evaluation and scores as accurate, so
 * without this the scramble looks like the player's best phase.
 */
export function accuracyByClock(games: ReviewedGame[], { contestedOnly = true }: { contestedOnly?: boolean } = {}): MoveBand[] {
  const moves = [...myMoves(games)].filter(
    (m) => m.label !== 'book' && m.clockShare !== null && (!contestedOnly || m.winBefore === null || (m.winBefore >= CONTESTED.lo && m.winBefore <= CONTESTED.hi)),
  )
  return CLOCK_BANDS.map((b) => {
    const inBand = moves.filter((m) => m.clockShare! >= b.lo && m.clockShare! < b.hi)
    const m = meanOf(inBand, () => true)
    return { label: b.label, accuracy: m.mean, accuracySd: m.sd, moves: m.n, costlyRate: m.n ? inBand.filter((x) => COSTLY.includes(x.label)).length / m.n : null }
  })
}

export type GameGroup = {
  label: string
  games: number
  /** Mean of the player's game accuracy */
  accuracy: number | null
  /** Sample standard deviation of game accuracy, for a standard error of accuracySd / sqrt(games) */
  accuracySd: number | null
  /** Mistakes, misses and blunders per game */
  costlyPerGame: number | null
  /** Points per game: win 1, draw 0.5 */
  score: number | null
  gameIds: string[]
}

/**
 * Accuracy per opening, worst first, for openings with at least `minGames`
 * reviewed games. `level` picks the family ("Sicilian Defense") or the full
 * name with its variation.
 */
export function accuracyByOpening(games: ReviewedGame[], { minGames = 10, level = 'family' }: { minGames?: number; level?: 'family' | 'full' } = {}): GameGroup[] {
  const groups = new Map<string, ReviewedGame[]>()
  for (const g of games) {
    const name = level === 'family' ? g.facts.family : g.facts.opening
    if (!name) continue
    const list = groups.get(name)
    if (list) list.push(g)
    else groups.set(name, [g])
  }
  return [...groups]
    .filter(([, gs]) => gs.length >= minGames)
    .map(([name, gs]) => group(name, gs))
    .sort((a, b) => a.accuracy! - b.accuracy!)
}

/** Accuracy by how much stronger the opponent was going into the game. */
export function accuracyByRatingGap(games: ReviewedGame[]): GameGroup[] {
  return RATING_GAP_BUCKETS.map((b) =>
    group(
      b.label,
      games.filter((g) => {
        const gap = g.facts.oppRatingBefore - g.facts.myRatingBefore
        return gap >= b.lo && gap < b.hi
      }),
    ),
  )
}

/** Gap between one game's end and the next one's start that still counts as the same sitting. */
export const SESSION_GAP_SECONDS = 15 * 60

/**
 * Accuracy by what happened in the game before, within one sitting. `history`
 * is every game the player has (reviewed or not), so the previous game is found
 * even when it wasn't reviewed.
 */
export function tilt(games: ReviewedGame[], history: GameFacts[]): GameGroup[] {
  const ordered = [...history].sort((a, b) => a.startTime - b.startTime)
  const prevOf = new Map<string, GameFacts[]>()
  // The run of games before each one in the same sitting, most recent first.
  let run: GameFacts[] = []
  for (const g of ordered) {
    if (run.length && g.startTime - run[0].endTime > SESSION_GAP_SECONDS) run = []
    prevOf.set(g.id, run)
    run = [g, ...run].slice(0, 5)
  }
  const buckets: Record<string, ReviewedGame[]> = { first: [], won: [], drawn: [], lost: [], lostTwice: [] }
  for (const g of games) {
    const prev = prevOf.get(g.facts.id)
    if (!prev) continue
    if (prev.length === 0) buckets.first.push(g)
    else if (prev[0].outcome === 'lost' && prev[1]?.outcome === 'lost') buckets.lostTwice.push(g)
    else buckets[prev[0].outcome].push(g)
  }
  return [
    group('First game of a sitting', buckets.first),
    group('After a win', buckets.won),
    group('After a draw', buckets.drawn),
    group('After one loss', buckets.lost),
    group('After two or more losses in a row', buckets.lostTwice),
  ]
}

export type PlayingLevel = {
  timeClass: string
  games: number
  /**
   * Mean of each game's blended "played like" rating: the rating going in,
   * moved by how the game's accuracy compares with typical at that rating.
   */
  blended: number | null
  blendedSd: number | null
  /** Mean of each game's accuracy-only estimate, which ignores the player's rating */
  accuracyOnly: number | null
  accuracyOnlySd: number | null
  /** Mean rating going into these games, for comparison */
  ratingBefore: number | null
  gameIds: string[]
}

/**
 * The player's average playing level per time control, from the same model as
 * a review's "played like" figure (src/review/gameRating.ts), most-played first.
 * Time controls without a model (daily) are left out. Averaging many games
 * removes most of the per-game noise, but not the model's own error, so the
 * accuracy-only figure is still a rough level rather than a rating.
 */
export function playingLevel(games: ReviewedGame[]): PlayingLevel[] {
  const byClass = new Map<string, ReviewedGame[]>()
  for (const g of games) {
    const list = byClass.get(g.facts.timeClass)
    if (list) list.push(g)
    else byClass.set(g.facts.timeClass, [g])
  }
  const out: PlayingLevel[] = []
  for (const [timeClass, gs] of byClass) {
    const blended: number[] = []
    const accuracyOnly: number[] = []
    const ratings: number[] = []
    const ids: string[] = []
    for (const g of gs) {
      const e = estimateRating(myAccuracy(g), timeClass, g.facts.myRatingBefore)
      if (!e) continue
      if (e.blended !== null) blended.push(e.blended)
      accuracyOnly.push(e.accuracyOnly)
      ratings.push(g.facts.myRatingBefore)
      ids.push(g.facts.id)
    }
    if (ids.length === 0) continue
    const b = stats(blended)
    const a = stats(accuracyOnly)
    out.push({ timeClass, games: ids.length, blended: b.mean, blendedSd: b.sd, accuracyOnly: a.mean, accuracyOnlySd: a.sd, ratingBefore: stats(ratings).mean, gameIds: ids })
  }
  return out.sort((x, y) => y.games - x.games)
}
function group(label: string, games: ReviewedGame[]): GameGroup {
  if (games.length === 0) return { label, games: 0, accuracy: null, accuracySd: null, costlyPerGame: null, score: null, gameIds: [] }
  const acc = games.map(myAccuracy)
  let costly = 0
  let score = 0
  for (const g of games) {
    score += g.facts.outcome === 'won' ? 1 : g.facts.outcome === 'drawn' ? 0.5 : 0
    const me = colorOf(g)
    for (let i = 0; i < g.summary.labels.length; i++) if (colorAt(g.summary, i) === me && COSTLY.includes(labelAt(g.summary, i))) costly++
  }
  const { mean, sd } = stats(acc)
  return { label, games: games.length, accuracy: mean, accuracySd: sd, costlyPerGame: costly / games.length, score: score / games.length, gameIds: games.map((g) => g.facts.id) }
}

type MyMove = {
  moveNo: number
  label: Label
  piece: PieceType
  accuracy: number
  clockShare: number | null
  /** The player's win percent before the move; null on summaries without it */
  winBefore: number | null
}

function* myMoves(games: ReviewedGame[]): Generator<MyMove> {
  for (const g of games) {
    const s = g.summary
    const me = colorOf(g)
    const base = g.facts.clock?.base ?? null
    for (let i = 0; i < s.labels.length; i++) {
      if (colorAt(s, i) !== me) continue
      // Time left when the move was started: the player's previous reading, or the starting time.
      const before = i >= 2 ? s.clock[i - 2] : base
      yield {
        moveNo: moveNumberAt(s, i),
        label: labelAt(s, i),
        piece: pieceAt(s, i),
        accuracy: s.moveAccuracy[i],
        clockShare: before !== null && base ? before / base : null,
        winBefore: s.winPercent ? moverWinPercentBefore(s, i) : null,
      }
    }
  }
}

function meanOf(moves: Iterable<MyMove>, keep: (m: MyMove) => boolean): { mean: number | null; sd: number | null; n: number } {
  const xs: number[] = []
  for (const m of moves) if (keep(m)) xs.push(m.accuracy)
  return { ...stats(xs), n: xs.length }
}

function stats(xs: number[]): { mean: number | null; sd: number | null } {
  if (xs.length === 0) return { mean: null, sd: null }
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length
  if (xs.length < 2) return { mean, sd: null }
  return { mean, sd: Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length - 1)) }
}

function myAccuracy(g: ReviewedGame): number {
  return g.summary.accuracy[colorOf(g)]
}

function colorOf(g: ReviewedGame): Color {
  return g.facts.side === 'white' ? 'w' : 'b'
}
