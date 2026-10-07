// Fits accuracy -> rating per time control from calibration/rating-samples.json
// (collected by rating-data.mjs) and prints the table for src/review/gameRating.ts.
// Error is measured on held-out players, not held-out games, so one person's
// games can't leak from training into testing.
//
//   node scripts/rating-fit.mjs
import { readFileSync } from 'node:fs'

const { samples, players } = JSON.parse(readFileSync('calibration/rating-samples.json', 'utf8'))
const KNOTS = [20, 30, 40, 50, 60, 70, 75, 80, 85, 90, 95, 100]

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null
}

/** Median rating near each knot (weighted by distance), then made non-decreasing. */
function fit(rows) {
  const raw = KNOTS.map((k, i) => {
    const lo = KNOTS[i - 1] ?? k - 10
    const hi = KNOTS[i + 1] ?? k + 10
    const near = rows.filter((r) => r.accuracy >= (lo + k) / 2 && r.accuracy < (k + hi) / 2)
    return near.length >= 8 ? median(near.map((r) => r.rating)) : null
  })
  // Fill gaps by carrying neighbours, then pool adjacent violators so the curve only rises.
  for (let i = 0; i < raw.length; i++) if (raw[i] === null) raw[i] = raw.slice(0, i).reverse().find((v) => v !== null) ?? null
  for (let i = raw.length - 1; i >= 0; i--) if (raw[i] === null) raw[i] = raw[i + 1] ?? null
  const blocks = raw.map((v) => ({ sum: v, n: 1 }))
  for (let i = 1; i < blocks.length; ) {
    if (blocks[i - 1].sum / blocks[i - 1].n > blocks[i].sum / blocks[i].n) {
      blocks[i - 1] = { sum: blocks[i - 1].sum + blocks[i].sum, n: blocks[i - 1].n + blocks[i].n }
      blocks.splice(i, 1)
      i = Math.max(1, i - 1)
    } else i++
  }
  return blocks.flatMap((b) => Array(b.n).fill(Math.round(b.sum / b.n)))
}

function predict(table, accuracy) {
  if (accuracy <= KNOTS[0]) return table[0]
  for (let i = 1; i < KNOTS.length; i++) {
    if (accuracy <= KNOTS[i]) {
      const t = (accuracy - KNOTS[i - 1]) / (KNOTS[i] - KNOTS[i - 1])
      return table[i - 1] + t * (table[i] - table[i - 1])
    }
  }
  return table[table.length - 1]
}

const RATING_BANDS = [400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600, 2800]

/** Least-squares slope of rating on accuracy: rating points per accuracy point. */
function slope(rows) {
  const n = rows.length
  const ma = rows.reduce((s, r) => s + r.accuracy, 0) / n
  const mr = rows.reduce((s, r) => s + r.rating, 0) / n
  let cov = 0
  let va = 0
  for (const r of rows) {
    cov += (r.accuracy - ma) * (r.rating - mr)
    va += (r.accuracy - ma) ** 2
  }
  return va ? cov / va : 0
}

/** Median accuracy of players rated near each band centre, made non-decreasing. */
function expectedAccuracy(rows) {
  const raw = RATING_BANDS.map((b) => {
    const near = rows.filter((r) => Math.abs(r.rating - b) < 150)
    return near.length >= 8 ? median(near.map((r) => r.accuracy)) : null
  })
  for (let i = 0; i < raw.length; i++) if (raw[i] === null) raw[i] = raw.slice(0, i).reverse().find((v) => v !== null) ?? null
  for (let i = raw.length - 1; i >= 0; i--) if (raw[i] === null) raw[i] = raw[i + 1] ?? null
  for (let i = 1; i < raw.length; i++) raw[i] = Math.max(raw[i], raw[i - 1])
  return raw.map((v) => Math.round(v * 10) / 10)
}

const quantile = (xs, q) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]
}

const out = {}
for (const tc of ['bullet', 'blitz', 'rapid']) {
  const rows = samples.filter((s) => s.tc === tc && s.accuracy > 0)
  const names = [...new Set(rows.map((r) => r.player))]
  // Five folds by player, for both estimates.
  const errors = []
  const blendErrors = []
  for (let f = 0; f < 5; f++) {
    const test = new Set(names.filter((_, i) => i % 5 === f))
    const train = rows.filter((r) => !test.has(r.player))
    const table = fit(train)
    const b = slope(train)
    const exp = expectedAccuracy(train)
    for (const r of rows.filter((r) => test.has(r.player))) {
      errors.push(predict(table, r.accuracy) - r.rating)
      blendErrors.push(b * (r.accuracy - interp(RATING_BANDS, exp, r.rating)))
    }
  }
  const table = fit(rows)
  const abs = errors.map(Math.abs).sort((a, b) => a - b)
  out[tc] = {
    table,
    slope: Math.round(slope(rows) * 10) / 10,
    expected: expectedAccuracy(rows),
    q10: Math.round(quantile(errors, 0.1)),
    q90: Math.round(quantile(errors, 0.9)),
    typicalError: Math.round(median(abs) ?? 0),
  }
  const range = [Math.min(...rows.map((r) => r.rating)), Math.max(...rows.map((r) => r.rating))]
  console.log(`${tc}: ${rows.length} sides from ${names.length} players, ratings ${range[0]}–${range[1]}`)
  console.log(`  accuracy-only, held-out players: median error ${out[tc].typicalError}; 80% between ${-out[tc].q90} and ${-out[tc].q10} of the estimate`)
  console.log(`  blend: ${out[tc].slope} rating points per accuracy point; median adjustment ${Math.round(median(blendErrors.map(Math.abs)))}`)
  console.log(`  ${KNOTS.map((k, i) => `${k}%→${table[i]}`).join('  ')}`)
  console.log(`  typical accuracy by rating: ${RATING_BANDS.map((b, i) => `${b}:${out[tc].expected[i]}`).join(' ')}`)
}
console.log(`\nplayers collected: ${Object.keys(players).length}`)
console.log(JSON.stringify({ knots: KNOTS, ratingBands: RATING_BANDS, ...out }))

function interp(xs, ys, x) {
  if (x <= xs[0]) return ys[0]
  for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return ys[i - 1] + ((x - xs[i - 1]) / (xs[i] - xs[i - 1])) * (ys[i] - ys[i - 1])
  return ys[ys.length - 1]
}
