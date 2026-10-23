import { getMeta, setMeta } from '../review/cache'
import type { GameFacts, Outcome } from './facts'
import { ISO_NUMERIC } from './isoCountries'

// Where your opponents are from. chess.com only gives a player's country on
// their profile, so each opponent costs one request; the answers are kept in
// the review cache's meta store, so only new opponents are asked about later.

const CACHE = 'opponentCountries'
const POINTS: Record<Outcome, number> = { won: 1, drawn: 0.5, lost: 0 }

/** chess.com's own codes for places that aren't ISO countries. */
const CHESSCOM_CODES: Record<string, { name: string; mapAs: string | null }> = {
  XE: { name: 'England', mapAs: 'GB' },
  XS: { name: 'Scotland', mapAs: 'GB' },
  XW: { name: 'Wales', mapAs: 'GB' },
  XB: { name: 'Basque Country', mapAs: 'ES' },
  XC: { name: 'Catalonia', mapAs: 'ES' },
  XG: { name: 'Galicia', mapAs: 'ES' },
  XA: { name: 'Canary Islands', mapAs: 'ES' },
  XK: { name: 'Kosovo', mapAs: 'XK' },
  XX: { name: 'International', mapAs: null },
}

const regionNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'region' }) : null

export function countryName(code: string): string {
  if (CHESSCOM_CODES[code]) return CHESSCOM_CODES[code].name
  try {
    return regionNames?.of(code) ?? code
  } catch {
    return code
  }
}

/**
 * The key of a country on the world-atlas map: its ISO numeric code, or its
 * name for the few the map has without one. Null for places not on the map.
 */
export function mapKey(code: string): string | null {
  const as = CHESSCOM_CODES[code] ? CHESSCOM_CODES[code].mapAs : code
  if (as === null) return null
  if (as === 'XK') return 'Kosovo'
  return ISO_NUMERIC[as] ?? null
}

/** "https://api.chess.com/pub/country/US" → "US". */
export function codeFromUrl(url: string | undefined): string | null {
  const m = url ? /\/country\/([A-Z]{2})$/.exec(url) : null
  return m ? m[1] : null
}

export type CountryRow = { code: string; name: string; games: number; opponents: number; score: number; gameIds: string[] }

/** Your games and score by the opponent's country, most games first. */
export function byCountry(games: GameFacts[], countries: Map<string, string | null>): CountryRow[] {
  const rows = new Map<string, { games: GameFacts[]; opponents: Set<string> }>()
  for (const g of games) {
    const code = countries.get(g.opponent.toLowerCase())
    if (!code) continue
    const row = rows.get(code) ?? { games: [], opponents: new Set<string>() }
    row.games.push(g)
    row.opponents.add(g.opponent.toLowerCase())
    rows.set(code, row)
  }
  return [...rows.entries()]
    .map(([code, r]) => ({
      code,
      name: countryName(code),
      games: r.games.length,
      opponents: r.opponents.size,
      score: r.games.reduce((s, g) => s + POINTS[g.outcome], 0) / r.games.length,
      gameIds: r.games.map((g) => g.id),
    }))
    .sort((a, b) => b.games - a.games)
}

export async function cachedCountries(): Promise<Map<string, string | null>> {
  try {
    return new Map(Object.entries((await getMeta<Record<string, string | null>>(CACHE)) ?? {}))
  } catch {
    return new Map()
  }
}

/**
 * Looks up the countries of `usernames` (lower-case, most recent opponents
 * first) that aren't cached, two at a time, saving as it goes. A deleted or
 * closed account is stored as null so it isn't asked about again.
 */
export async function loadCountries(usernames: string[], known: Map<string, string | null>, onProgress: (known: Map<string, string | null>) => void, signal: AbortSignal): Promise<void> {
  const todo = usernames.filter((u) => !known.has(u))
  let next = 0
  let sinceSave = 0
  const save = () => setMeta(CACHE, Object.fromEntries(known)).catch(() => undefined)
  const worker = async () => {
    while (next < todo.length && !signal.aborted) {
      const u = todo[next++]
      const code = await fetchCountry(u, signal)
      if (code === undefined) continue
      known.set(u, code)
      if (++sinceSave >= 25) {
        sinceSave = 0
        await save()
        onProgress(new Map(known))
      }
    }
  }
  await Promise.all([worker(), worker()])
  await save()
  onProgress(new Map(known))
}

/** The player's country code, null when they have none or are gone, undefined when the request failed. */
async function fetchCountry(username: string, signal: AbortSignal): Promise<string | null | undefined> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    let res: Response
    try {
      res = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(username)}`, { signal })
    } catch {
      if (signal.aborted) return undefined
      await wait(attempt * 2000, signal)
      continue
    }
    if (res.ok) return codeFromUrl(((await res.json()) as { country?: string }).country)
    if (res.status === 404 || res.status === 410) return null
    // Rate limited or a server hiccup: back off and try again.
    await wait(attempt * 3000, signal)
  }
  return undefined
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true })
  })
}
