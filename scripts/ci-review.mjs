// Reviews a player's chess.com games with a native Stockfish binary, through the
// app's own review code (loaded with Vite), and writes one gzipped NDJSON file of
// { review, summary } lines. Run by .github/workflows/review.yml; works locally
// too with any UCI engine.
//
//   node scripts/ci-review.mjs --user <name> --engine <path> [--shard 0 --shards 1]
//     [--since-days 0] [--limit 0] [--jobs <cpus>] [--max-minutes 0] [--out ci-out]
//
// Engine settings match the app: 1 thread and 128 MB hash per engine, MultiPV 2,
// depth 16 with the 2 s cap. One engine runs per CPU, each on its own game.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { parseArgs } from 'node:util'
import { createGzip } from 'node:zlib'
import { createServer } from 'vite'

const { values: args } = parseArgs({
  options: {
    user: { type: 'string' },
    engine: { type: 'string' },
    shard: { type: 'string', default: '0' },
    shards: { type: 'string', default: '1' },
    'since-days': { type: 'string', default: '0' },
    limit: { type: 'string', default: '0' },
    jobs: { type: 'string', default: String(availableParallelism()) },
    'max-minutes': { type: 'string', default: '0' },
    out: { type: 'string', default: 'ci-out' },
  },
})
if (!args.user || !args.engine) throw new Error('usage: node scripts/ci-review.mjs --user <name> --engine <path> [options]')

const DEPTH = 16
const shard = Number(args.shard)
const shards = Number(args.shards)
const sinceDays = Number(args['since-days'])
const limit = Number(args.limit)
const jobs = Math.max(1, Number(args.jobs))
const deadline = Number(args['max-minutes']) > 0 ? Date.now() + Number(args['max-minutes']) * 60_000 : Infinity
// chess.com's Cloudflare blocks requests without a User-Agent.
const UA = { 'User-Agent': 'chess-app personal review workflow (github.com/Yehuda-Levy923/chess-app)' }

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const load = (path) => vite.ssrLoadModule(path)
const { parseGames } = await load('/src/chesscom/api.ts')
const { buildReview, movesFromPgn } = await load('/src/review/buildReview.ts')
const { analyseGame } = await load('/src/review/analyseGame.ts')
const { clockInput } = await load('/src/review/reviewGame.ts')
const { summarize } = await load('/src/review/summary.ts')
const { getBook } = await load('/src/openings/index.ts')
const { Engine } = await load('/src/stockfish/engine.ts')

const all = await loadGames(args.user)
const since = sinceDays > 0 ? Date.now() / 1000 - sinceDays * 86400 : 0
let games = all.filter((g) => g.endTime >= since && shardOf(g.uuid) === shard)
if (limit > 0) games = games.slice(0, limit)
console.log(`shard ${shard}/${shards}: ${games.length} games (of ${all.length}), ${jobs} engines`)

mkdirSync(args.out, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const file = join(args.out, `reviews-${stamp}-shard${shard}of${shards}.ndjson.gz`)
const gzip = createGzip()
const sink = gzip.pipe(createWriteStream(file))

const started = Date.now()
let next = 0
let reviewed = 0
let failed = 0
let positions = 0
let stoppedEarly = 0

await Promise.all(Array.from({ length: Math.min(jobs, games.length) }, () => worker()))

gzip.end()
await new Promise((resolve) => sink.on('finish', resolve))
const seconds = Math.round((Date.now() - started) / 1000)
const stats = { shard, shards, games: games.length, reviewed, failed, stoppedEarly, positions, seconds, jobs, secondsPerPosition: positions ? (seconds * jobs) / positions : null }
writeFileSync(join(args.out, `stats-shard${shard}of${shards}.json`), JSON.stringify(stats, null, 2))
console.log(stats)
await vite.close()
process.exit(0)

async function worker() {
  let engine = startEngine()
  while (next < games.length) {
    if (Date.now() > deadline) {
      stoppedEarly = games.length - next
      next = games.length
      break
    }
    const game = games[next++]
    try {
      const moves = movesFromPgn(game.pgn)
      const analyses = await analyseGame(engine, moves, DEPTH, () => undefined)
      const review = buildReview(game.uuid, moves, analyses, getBook(), clockInput(game))
      gzip.write(JSON.stringify({ review, summary: summarize(review) }) + '\n')
      reviewed++
      positions += analyses.length
      if (reviewed % 25 === 0) {
        const secs = (Date.now() - started) / 1000
        console.log(`${reviewed}/${games.length} reviewed, ${positions} positions, ${(secs / reviewed).toFixed(1)} s a game overall`)
      }
    } catch (e) {
      failed++
      console.error(`review of ${game.url} failed: ${e instanceof Error ? e.message : e}`)
      // A crash leaves the engine dead; every later call would fail too.
      if (!engine.alive) engine = startEngine()
    }
  }
  engine.terminate()
}

/** The Engine class talks to a Web Worker; this gives it a child process instead. */
function startEngine() {
  // A .js engine (the npm stockfish package's builds) runs under Node, for testing without a binary.
  const [cmd, cmdArgs] = args.engine.endsWith('.js') ? [process.execPath, [args.engine]] : [args.engine, []]
  const proc = spawn(cmd, cmdArgs, { stdio: ['pipe', 'pipe', 'inherit'] })
  const worker = {
    onmessage: null,
    onerror: null,
    postMessage: (cmd) => proc.stdin.write(`${cmd}\n`),
    terminate: () => proc.kill(),
  }
  createInterface({ input: proc.stdout }).on('line', (line) => worker.onmessage?.({ data: line }))
  const fail = (message) => worker.onerror?.({ message, preventDefault() {} })
  proc.on('error', (e) => fail(e.message))
  proc.on('exit', (code, signal) => fail(`engine exited (${signal ?? code})`))
  proc.stdin.on('error', () => undefined)
  return new Engine({ worker, threads: 1, hashMb: 128, multiPv: 2 })
}

/** Stable across runs and machines, so a game always lands on the same shard. */
function shardOf(uuid) {
  return createHash('sha1').update(uuid).digest().readUInt32BE(0) % shards
}

async function loadGames(username) {
  const archives = (await getJson(`https://api.chess.com/pub/player/${username.toLowerCase()}/games/archives`)).archives
  const out = []
  for (const url of archives) out.push(...parseGames((await getJson(url)).games))
  return out.sort((a, b) => b.endTime - a.endTime)
}

async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    let res = null
    try {
      res = await fetch(url, { headers: UA })
    } catch (e) {
      if (attempt >= 5) throw e
    }
    if (res?.ok) return await res.json()
    // Rate limits and server errors are worth waiting out; anything else isn't.
    if (res && res.status !== 429 && res.status < 500) throw new Error(`${url} answered ${res.status}`)
    if (attempt >= 5) throw new Error(`${url} kept failing (${res?.status})`)
    await new Promise((r) => setTimeout(r, attempt * 5000))
  }
}
