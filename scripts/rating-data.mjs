// Collects (rating, accuracy) pairs from chess.com games that were reviewed on
// chess.com, across the whole rating range, to fit src/review/gameRating.ts.
// Players are sampled at random from public country lists, then kept until each
// rating band of each time control has enough of them. One request at a time;
// results are appended to calibration/rating-samples.json so the run resumes.
//
//   node scripts/rating-data.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const HEADERS = { 'User-Agent': 'chess-app personal calibration script (github.com/Yehuda-Levy923, private)' }
const COUNTRIES = ['US', 'IN', 'GB', 'DE', 'FR', 'BR', 'ES', 'IT', 'PL', 'NL', 'TR', 'PH', 'ID', 'CA', 'AU', 'IL', 'MX', 'AR', 'UA', 'SE']
const CLASSES = ['bullet', 'blitz', 'rapid']
const BANDS = [400, 800, 1200, 1600, 2000, 2400, 3400]
const PLAYERS_PER_BAND = 12
const MIN_REVIEWED_GAMES = 3
const MAX_REQUESTS = 4000
const OUT = join('calibration', 'rating-samples.json')

mkdirSync('calibration', { recursive: true })
const state = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { samples: [], players: {}, seen: [] }
const seen = new Set(state.seen)
let requests = 0

const bandOf = (r) => BANDS.findIndex((lo, i) => r >= lo && r < BANDS[i + 1])
const quota = () => {
  const q = {}
  for (const tc of CLASSES) q[tc] = BANDS.slice(0, -1).map(() => 0)
  for (const p of Object.values(state.players)) q[p.tc][p.band]++
  return q
}
const full = () => CLASSES.every((tc) => quota()[tc].every((n) => n >= PLAYERS_PER_BAND))

async function get(path) {
  for (let attempt = 0; attempt < 4; attempt++) {
    requests++
    let res
    try {
      res = await fetch(`https://api.chess.com/pub${path}`, { headers: HEADERS, signal: AbortSignal.timeout(30000) })
    } catch {
      // Timeouts and dropped connections: back off and retry like a rate limit.
      await sleep(5000 * (attempt + 1))
      continue
    }
    if (res.status === 429) {
      await sleep(5000 * (attempt + 1))
      continue
    }
    await sleep(120)
    if (!res.ok) return null
    return res.json()
  }
  return null
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const save = () => writeFileSync(OUT, JSON.stringify({ ...state, seen: [...seen] }))

const pool = []
for (const c of COUNTRIES) {
  const j = await get(`/country/${c}/players`)
  if (j?.players) pool.push(...j.players)
}
console.log(`${pool.length} candidate usernames from ${COUNTRIES.length} countries`)

// Random players are mostly rated under 1000, so higher bands are reached
// through leads: opponents met in fetched games, plus the public leaderboards.
const leads = new Map() // username -> { tc, rating }
const boards = await get('/leaderboards')
for (const tc of CLASSES) for (const p of boards?.[`live_${tc}`] ?? []) leads.set(p.username, { tc, rating: p.score })
// Mid-range seeds: opponents from a history already saved by the insights check, if any.
for (const f of existsSync('calibration') ? (await import('node:fs')).readdirSync('calibration') : []) {
  if (!f.startsWith('history-')) continue
  for (const g of JSON.parse(readFileSync(join('calibration', f), 'utf8')).slice(0, 3000)) {
    for (const p of [g.white, g.black]) if (!leads.has(p.username)) leads.set(p.username, { tc: g.timeClass, rating: p.rating })
  }
}
console.log(`${leads.size} leads`)

function nextCandidate() {
  const q = quota()
  const wanted = [...leads].filter(([u, l]) => !seen.has(u) && CLASSES.includes(l.tc) && bandOf(l.rating) >= 0 && q[l.tc][bandOf(l.rating)] < PLAYERS_PER_BAND)
  if (wanted.length) return wanted[Math.floor(Math.random() * wanted.length)][0]
  return pool.length ? pool.splice(Math.floor(Math.random() * pool.length), 1)[0] : null
}

while (!full() && requests < MAX_REQUESTS) {
  const user = nextCandidate()
  if (!user) break
  if (seen.has(user)) continue
  seen.add(user)
  const stats = await get(`/player/${encodeURIComponent(user)}/stats`)
  if (!stats) continue
  const q = quota()
  // The first time control this player helps fill.
  const pick = CLASSES.map((tc) => ({ tc, rating: stats[`chess_${tc}`]?.last?.rating }))
    .filter((c) => c.rating && bandOf(c.rating) >= 0)
    .find((c) => q[c.tc][bandOf(c.rating)] < PLAYERS_PER_BAND)
  if (!pick) continue
  const archives = (await get(`/player/${encodeURIComponent(user)}/games/archives`))?.archives ?? []
  const found = []
  for (const url of archives.slice(-3).reverse()) {
    const month = await get(url.replace('https://api.chess.com/pub', ''))
    for (const g of month?.games ?? []) {
      if (g.rules !== 'chess') continue
      for (const p of [g.white, g.black]) if (p.username !== user && !leads.has(p.username)) leads.set(p.username, { tc: g.time_class, rating: p.rating })
      if (g.time_class !== pick.tc || !g.accuracies) continue
      const plies = (g.pgn?.match(/\d+\.\s/g) ?? []).length * 2
      found.push({ tc: g.time_class, rating: g.white.rating, accuracy: g.accuracies.white, plies, player: user, game: g.uuid })
      found.push({ tc: g.time_class, rating: g.black.rating, accuracy: g.accuracies.black, plies, player: user, game: g.uuid })
    }
    if (found.length >= 40) break
  }
  if (found.length / 2 < MIN_REVIEWED_GAMES) continue
  state.samples.push(...found)
  state.players[user] = { tc: pick.tc, band: bandOf(pick.rating), rating: pick.rating, games: found.length / 2 }
  save()
  const qq = quota()
  console.log(`${requests} req | ${user} ${pick.tc} ${pick.rating}: ${found.length / 2} games | ${CLASSES.map((tc) => `${tc} ${qq[tc].join('/')}`).join('  ')}`)
}
save()
console.log(`done: ${Object.keys(state.players).length} players, ${state.samples.length} samples, ${requests} requests, full=${full()}`)
