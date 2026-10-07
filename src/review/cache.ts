import { SUMMARY_FORMAT, summarize, type GameSummary } from './summary'
import type { Review } from './types'

// Finished reviews, keyed by chess.com game uuid and depth, so reopening a game
// doesn't re-run Stockfish. Each review also gets a small summary in its own
// store, which is what the game list and the insights read: loading ten
// thousand full reviews would take several hundred MB. Failures fall through
// to "not cached".

const DB = 'chess-app'
const REVIEWS = 'reviews'
const SUMMARIES = 'summaries'
const META = 'meta'

let connection: Promise<IDBDatabase> | null = null

// One shared connection. An upgrade waits for every open connection to close,
// so each one closes itself when a newer version asks; a tab still running
// older code can hold it up, and then the request fails instead of hanging.
function open(): Promise<IDBDatabase> {
  connection ??= connect().catch((e) => {
    connection = null
    throw e
  })
  return connection
}

function connect(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2)
    req.onblocked = () => reject(new Error('The review cache is being upgraded; close other tabs of the app and reload.'))
    req.onupgradeneeded = (e) => {
      const db = req.result
      if (e.oldVersion < 1) db.createObjectStore(REVIEWS)
      if (e.oldVersion < 2) {
        // Reviews cached before this get their summaries lazily, in allSummaries.
        db.createObjectStore(SUMMARIES)
        db.createObjectStore(META)
      }
    }
    req.onsuccess = () => {
      const db = req.result
      db.onversionchange = () => {
        db.close()
        connection = null
      }
      resolve(db)
    }
    req.onerror = () => reject(req.error)
  })
}

const key = (gameId: string, depth: number) => `${gameId}@${depth}`

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function loadReview(gameId: string, depth: number): Promise<Review | null> {
  try {
    const db = await open()
    return ((await request(db.transaction(REVIEWS).objectStore(REVIEWS).get(key(gameId, depth)))) as Review | undefined) ?? null
  } catch {
    return null
  }
}

export async function saveReview(review: Review): Promise<void> {
  try {
    await saveReviews([{ review, summary: summarize(review) }])
  } catch {
    // A review that can't be cached is still a review.
  }
}

/** Stores reviews with their summaries in one transaction. Throws if the write fails. */
export async function saveReviews(entries: { review: Review; summary: GameSummary }[]): Promise<void> {
  const db = await open()
  const tx = db.transaction([REVIEWS, SUMMARIES], 'readwrite')
  for (const { review, summary } of entries) {
    tx.objectStore(REVIEWS).put(review, key(review.gameId, review.depth))
    tx.objectStore(SUMMARIES).put(summary, key(summary.gameId, summary.depth))
  }
  await done(tx)
}

/**
 * One summary per reviewed game. A game reviewed at two depths is cached twice;
 * the newest review version wins, then the deeper one.
 */
export async function allSummaries(): Promise<GameSummary[]> {
  try {
    const db = await open()
    const read = db.transaction([REVIEWS, SUMMARIES])
    const [stored, summaryKeys, reviewKeys] = await Promise.all([
      request(read.objectStore(SUMMARIES).getAll()) as Promise<GameSummary[]>,
      request(read.objectStore(SUMMARIES).getAllKeys()),
      request(read.objectStore(REVIEWS).getAllKeys()),
    ])
    // Summaries in an older format are rebuilt from their reviews, keeping the tactic flags.
    const current = new Map<IDBValidKey, GameSummary>()
    const outdated = new Map<IDBValidKey, GameSummary>()
    stored.forEach((s, i) => ((s.format ?? 1) >= SUMMARY_FORMAT ? current : outdated).set(summaryKeys[i], s))
    const summaries = [...current.values()]
    for (const k of reviewKeys.filter((k) => !current.has(k))) {
      const review = (await request(db.transaction(REVIEWS).objectStore(REVIEWS).get(k))) as Review | undefined
      if (!review) continue
      const summary = summarize(review, { tactics: outdated.get(k)?.tactics })
      const tx = db.transaction(SUMMARIES, 'readwrite')
      tx.objectStore(SUMMARIES).put(summary, k)
      await done(tx)
      summaries.push(summary)
    }
    const best = new Map<string, GameSummary>()
    for (const s of summaries) {
      const prev = best.get(s.gameId)
      if (!prev || s.version > prev.version || (s.version === prev.version && s.depth > prev.depth)) best.set(s.gameId, s)
    }
    return [...best.values()]
  } catch {
    return []
  }
}

/** Every cached review in full. Heavy once many games are reviewed; prefer allSummaries. */
export async function allReviews(): Promise<Review[]> {
  try {
    const db = await open()
    return (await request(db.transaction(REVIEWS).objectStore(REVIEWS).getAll())) as Review[]
  } catch {
    return []
  }
}

/** Small persistent values, such as which downloaded review files were imported. */
export async function getMeta<T>(name: string): Promise<T | undefined> {
  const db = await open()
  return (await request(db.transaction(META).objectStore(META).get(name))) as T | undefined
}

export async function setMeta(name: string, value: unknown): Promise<void> {
  const db = await open()
  const tx = db.transaction(META, 'readwrite')
  tx.objectStore(META).put(value, name)
  await done(tx)
}
