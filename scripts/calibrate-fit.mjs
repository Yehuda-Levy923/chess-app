// Compares our game accuracy with chess.com's on every game analysed by
// calibrate-analyse.mjs, and (with --fit) searches for accuracy constants that
// match chess.com better, holding out every fourth game to check the fit
// generalises instead of memorising.
//
//   node scripts/calibrate-fit.mjs [--fit]
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createServer } from 'vite'

const DIR = join('calibration', 'analyses')
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
const { gameAccuracy, winPercent, DEFAULT_ACCURACY } = await vite.ssrLoadModule('/src/review/accuracy.ts')

const games = readdirSync(DIR).map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')))
// One sample per side: White-POV win percents, and chess.com's figure for that side.
const samples = games.flatMap(({ game, analyses }) => {
  const scores = analyses.map((a) => a.lines[0]?.score ?? { kind: 'cp', cp: 0 })
  return [
    { id: game.uuid, side: 'w', tc: game.timeClass, scores, target: game.accuracies.white },
    { id: game.uuid, side: 'b', tc: game.timeClass, scores, target: game.accuracies.black },
  ]
})

function evaluate(params, set) {
  const errors = set.map((s) => {
    const series = s.scores.map((sc) => winPercent(sc, params))
    return gameAccuracy(series, 'w', params)[s.side] - s.target
  })
  const mae = errors.reduce((a, e) => a + Math.abs(e), 0) / errors.length
  const bias = errors.reduce((a, e) => a + e, 0) / errors.length
  const within5 = errors.filter((e) => Math.abs(e) <= 5).length / errors.length
  return { mae, bias, within5, n: errors.length }
}

const fmt = (r) => `MAE ${r.mae.toFixed(2)}  bias ${r.bias >= 0 ? '+' : ''}${r.bias.toFixed(2)}  within 5 pts ${(100 * r.within5).toFixed(0)}%  (${r.n} sides)`
console.log(`${games.length} games analysed`)
console.log(`current formula:  ${fmt(evaluate(DEFAULT_ACCURACY, samples))}`)
for (const tc of ['bullet', 'blitz', 'rapid']) {
  const sub = samples.filter((s) => s.tc === tc)
  if (sub.length) console.log(`  ${tc.padEnd(7)} ${fmt(evaluate(DEFAULT_ACCURACY, sub))}`)
}

function search(train) {
  let best = { params: DEFAULT_ACCURACY, r: evaluate(DEFAULT_ACCURACY, train) }
  for (const winK of [0.00368208, 0.0045, 0.0055, 0.0065, 0.0075, 0.009, 0.011]) {
    for (const decay of [0.02, 0.03, 0.04354415386753951, 0.055, 0.07, 0.09]) {
      for (const harmonicWeight of [0, 0.1, 0.2, 0.35, 0.5]) {
        for (const offset of [-3, -1, 0, 1, 3, 5]) {
          const params = { ...DEFAULT_ACCURACY, winK, decay, harmonicWeight, offset }
          const r = evaluate(params, train)
          if (r.mae < best.r.mae) best = { params, r }
        }
      }
    }
  }
  return best.params
}

if (process.argv.includes('--cv')) {
  // Four folds by game: every game is held out exactly once.
  let ours = 0
  let theirs = 0
  for (let f = 0; f < 4; f++) {
    const test = samples.filter((_, i) => Math.floor(i / 2) % 4 === f)
    const params = search(samples.filter((_, i) => Math.floor(i / 2) % 4 !== f))
    const a = evaluate(params, test)
    const b = evaluate(DEFAULT_ACCURACY, test)
    ours += a.mae * a.n
    theirs += b.mae * b.n
    console.log(`fold ${f}: tuned ${fmt(a)} | current ${fmt(b)} | winK ${params.winK} decay ${params.decay.toFixed(3)} harmonic ${params.harmonicWeight} offset ${params.offset}`)
  }
  console.log(`all folds: tuned MAE ${(ours / samples.length).toFixed(2)} vs current ${(theirs / samples.length).toFixed(2)}`)
}

if (process.argv.includes('--fit')) {
  const test = samples.filter((_, i) => Math.floor(i / 2) % 4 === 3)
  const train = samples.filter((_, i) => Math.floor(i / 2) % 4 !== 3)
  let best = { params: DEFAULT_ACCURACY, r: evaluate(DEFAULT_ACCURACY, train) }
  // Coarse grid over the three constants that shape the result most: how fast
  // centipawns turn into winning chances, how hard a lost percent is punished,
  // and how much the harmonic mean (dragged down by blunders) counts.
  for (const winK of [0.00368208, 0.0045, 0.0055, 0.0065, 0.0075, 0.009, 0.011]) {
    for (const decay of [0.02, 0.03, 0.04354415386753951, 0.055, 0.07, 0.09]) {
      for (const harmonicWeight of [0, 0.1, 0.2, 0.35, 0.5]) {
        for (const offset of [-3, -1, 0, 1, 3, 5]) {
          const params = { ...DEFAULT_ACCURACY, winK, decay, harmonicWeight, offset }
          const r = evaluate(params, train)
          if (r.mae < best.r.mae) best = { params, r }
        }
      }
    }
  }
  console.log(`\nbest on training games: ${fmt(best.r)}`)
  console.log(`same params, held-out:  ${fmt(evaluate(best.params, test))}`)
  console.log(`current, held-out:      ${fmt(evaluate(DEFAULT_ACCURACY, test))}`)
  console.log('params', JSON.stringify(best.params))
}
await vite.close()
process.exit(0)
