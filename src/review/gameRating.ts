// "Played like ~1900". Fitted by scripts/rating-fit.mjs on chess.com games that
// were reviewed on chess.com, from players sampled across the rating range
// (data from scripts/rating-data.mjs). Re-run both and paste the JSON here to refresh.
//
// What the data showed: accuracy rises only slowly with rating (in bullet,
// about 70 at 400 against 73.5 at 2400), because stronger players face stronger
// opponents in harder games. So one game's accuracy says little on its own. The
// blended figure starts from the player's real rating and moves it by how much
// better or worse they played than is typical at that rating.

type Model = {
  /** Accuracy-only estimate at each knot, non-decreasing */
  table: number[]
  /** Rating points per accuracy point, from a least-squares fit */
  slope: number
  /** Typical accuracy at each rating band */
  expected: number[]
  /** 10th and 90th percentile of (estimate − real rating) on held-out players */
  q10: number
  q90: number
}

const KNOTS = [20, 30, 40, 50, 60, 70, 75, 80, 85, 90, 95, 100]
const RATING_BANDS = [400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600, 2800]

// Fitted 2026-10-07 on 216 players (72 per time control), 15,546 rated sides.
const MODELS: Record<string, Model> = {
  bullet: {
    table: [1020, 1020, 1331, 1489, 1589, 1734, 1787, 1837, 1941, 1941, 1973, 1973],
    slope: 14.3,
    expected: [67.1, 67.5, 68, 69, 72.4, 72.4, 72.4, 72.8, 73.4, 73.5, 73.5, 78.8, 79.1],
    q10: -1289,
    q90: 888,
  },
  blitz: {
    table: [628, 628, 628, 720, 1411, 1712, 1928, 2147, 2252, 2510, 2690, 2690],
    slope: 35.1,
    expected: [70, 70, 70, 74.1, 75.1, 76.7, 76.7, 76.7, 78, 79.2, 81.6, 82, 83.1],
    q10: -815,
    q90: 1110,
  },
  rapid: {
    table: [750, 750, 768, 812, 966, 1327, 1707, 1944, 2002, 2021, 2121, 2393],
    slope: 24.8,
    expected: [65.1, 67.5, 69.6, 72.7, 74.2, 74.9, 75.6, 76.8, 78.5, 80.7, 84.5, 86.6, 91],
    q10: -677,
    q90: 943,
  },
}

export type RatingEstimate = {
  /** Rating going into the game, moved by how this game's accuracy compares with that rating's typical accuracy */
  blended: number | null
  /** What players this accurate are typically rated, ignoring who played */
  accuracyOnly: number
  /** The range real ratings fell in 80% of the time for the accuracy-only figure */
  low: number
  high: number
  /** Typical accuracy at the player's rating, the yardstick for the blend */
  expectedAccuracy: number | null
}

/** Null for time controls without a model (daily, variants). */
export function estimateRating(accuracy: number, timeClass: string, ratingBefore: number | null): RatingEstimate | null {
  const m = MODELS[timeClass]
  if (!m) return null
  const accuracyOnly = interp(KNOTS, m.table, accuracy)
  const expectedAccuracy = ratingBefore === null ? null : interp(RATING_BANDS, m.expected, ratingBefore)
  return {
    blended: ratingBefore === null || expectedAccuracy === null ? null : clampRating(ratingBefore + m.slope * (accuracy - expectedAccuracy)),
    accuracyOnly: clampRating(accuracyOnly),
    low: clampRating(accuracyOnly - m.q90),
    high: clampRating(accuracyOnly - m.q10),
    expectedAccuracy,
  }
}

function interp(xs: number[], ys: number[], x: number): number {
  if (x <= xs[0]) return ys[0]
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) return ys[i - 1] + ((x - xs[i - 1]) / (xs[i] - xs[i - 1])) * (ys[i] - ys[i - 1])
  }
  return ys[ys.length - 1]
}

function clampRating(r: number): number {
  return Math.round(Math.min(3300, Math.max(100, r)) / 10) * 10
}
