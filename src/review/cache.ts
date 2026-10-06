import type { Review } from './types'

// Finished reviews, keyed by chess.com game uuid and depth, so reopening a game
// doesn't re-run Stockfish. Failures fall through to "not cached".

const DB = 'chess-app'
const STORE = 'reviews'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

const key = (gameId: string, depth: number) => `${gameId}@${depth}`

export async function loadReview(gameId: string, depth: number): Promise<Review | null> {
  try {
    const db = await open()
    return await new Promise((resolve) => {
      const req = db.transaction(STORE).objectStore(STORE).get(key(gameId, depth))
      req.onsuccess = () => resolve((req.result as Review | undefined) ?? null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function saveReview(review: Review): Promise<void> {
  try {
    const db = await open()
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(review, key(review.gameId, review.depth))
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch {
    // A review that can't be cached is still a review.
  }
}

/** Every cached review, for showing our accuracy next to chess.com's in the game list. */
export async function allReviews(): Promise<Review[]> {
  try {
    const db = await open()
    return await new Promise((resolve) => {
      const req = db.transaction(STORE).objectStore(STORE).getAll()
      req.onsuccess = () => resolve(req.result as Review[])
      req.onerror = () => resolve([])
    })
  } catch {
    return []
  }
}
