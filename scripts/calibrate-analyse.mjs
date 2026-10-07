// Analyses every game of USER that chess.com has an accuracy for, with the same
// engine settings as the app (full network, 1 thread, depth 16, 2 s cap,
// MultiPV 2). Results go to calibration/analyses/<uuid>.json, so the run can be
// stopped and resumed, and fitting never has to re-run the engine.
//
//   node scripts/calibrate-analyse.mjs <username> [shard] [shards]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { createServer } from 'vite'

const [user, shard = '0', shards = '1'] = process.argv.slice(2)
if (!user) throw new Error('usage: node scripts/calibrate-analyse.mjs <username> [shard] [shards]')

const DEPTH = 16
const MAX_MS = 2000
const OUT = join('calibration', 'analyses')
mkdirSync(OUT, { recursive: true })

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const { LineCollector, parseInfo } = await vite.ssrLoadModule('/src/stockfish/uci.ts')
const { movesFromPgn, terminalScore } = await vite.ssrLoadModule('/src/review/buildReview.ts')

const games = await loadGames(user)
const mine = games.filter((_, i) => i % Number(shards) === Number(shard))
console.log(`shard ${shard}/${shards}: ${mine.length} of ${games.length} rated games`)

const engine = await startEngine()
let done = 0
for (const g of mine) {
  const file = join(OUT, `${g.uuid}.json`)
  done++
  if (existsSync(file)) continue
  const moves = movesFromPgn(g.pgn)
  const fens = [moves[0]?.before ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', ...moves.map((m) => m.after)]
  const started = Date.now()
  engine.send('ucinewgame')
  const analyses = []
  for (const fen of fens) {
    const over = terminalScore(fen)
    analyses.push(over ? { fen, depth: DEPTH, requestedDepth: DEPTH, lines: [{ score: over, pv: [] }] } : await engine.analyse(fen))
  }
  writeFileSync(file, JSON.stringify({ game: g, analyses }))
  const secs = Math.round((Date.now() - started) / 1000)
  console.log(`[${shard}] ${done}/${mine.length} ${g.uuid} ${fens.length} positions ${secs}s`)
}
console.log(`shard ${shard} finished`)
await vite.close()
process.exit(0)

async function loadGames(username) {
  const cache = join('calibration', `${username}-rated-games.json`)
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'))
  const { archives } = await (await fetch(`https://api.chess.com/pub/player/${username}/games/archives`)).json()
  const rated = []
  for (const a of archives) {
    const { games } = await (await fetch(a)).json()
    for (const g of games) {
      if (g.rules !== 'chess' || !g.pgn || !g.accuracies) continue
      rated.push({
        uuid: g.uuid,
        url: g.url,
        pgn: g.pgn,
        timeClass: g.time_class,
        timeControl: g.time_control,
        rated: g.rated,
        rules: g.rules,
        endTime: g.end_time,
        white: { username: g.white.username, rating: g.white.rating, result: g.white.result },
        black: { username: g.black.username, rating: g.black.rating, result: g.black.result },
        accuracies: g.accuracies,
      })
    }
  }
  rated.sort((x, y) => y.endTime - x.endTime)
  writeFileSync(cache, JSON.stringify(rated))
  return rated
}

async function startEngine() {
  const init = createRequire(import.meta.url)('stockfish')
  const sf = await init('single')
  let onLine = () => {}
  sf.listener = (line) => onLine(line)
  const send = (cmd) => sf.sendCommand(cmd)
  const waitFor = (pred) => new Promise((resolve) => (onLine = (l) => pred(l) && resolve()))

  send('uci')
  await waitFor((l) => l === 'uciok')
  send('setoption name Threads value 1')
  send('setoption name Hash value 64')
  send('setoption name MultiPV value 2')
  send('isready')
  await waitFor((l) => l === 'readyok')

  return {
    send,
    async analyse(fen) {
      const lines = new LineCollector()
      const whiteToMove = fen.split(' ')[1] === 'w'
      const finished = new Promise((resolve) => {
        onLine = (l) => {
          const info = parseInfo(l, whiteToMove)
          if (info) lines.add(info)
          if (l.startsWith('bestmove')) resolve()
        }
      })
      send(`position fen ${fen}`)
      send(`go depth ${DEPTH} movetime ${MAX_MS}`)
      await finished
      return { fen, requestedDepth: DEPTH, ...lines.result() }
    },
  }
}
