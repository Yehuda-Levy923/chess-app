import { fetchArchives, fetchMonth, type ChessComGame } from '../chesscom/api'

// A player's whole chess.com history, one IndexedDB record per month. Past
// months never change, so only the current month is refetched.

const DB = 'chess-app-history'
const STORE = 'months'

type MonthRecord = { url: string; games: ChessComGame[]; fetchedAt: number }

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function getMonth(db: IDBDatabase | null, url: string): Promise<MonthRecord | null> {
  if (!db) return null
  return new Promise((resolve) => {
    const req = db.transaction(STORE).objectStore(STORE).get(url)
    req.onsuccess = () => resolve((req.result as MonthRecord | undefined) ?? null)
    req.onerror = () => resolve(null)
  })
}

async function putMonth(db: IDBDatabase | null, rec: MonthRecord): Promise<void> {
  if (!db) return
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(rec, rec.url)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

/** True when the archive URL is for the current calendar month (its games can still change). */
export function isCurrentMonth(archiveUrl: string, now = new Date()): boolean {
  const [year, month] = archiveUrl.split('/').slice(-2).map(Number)
  return year === now.getFullYear() && month === now.getMonth() + 1
}

/** Every standard game the player has, newest first. */
export async function loadHistory(
  username: string,
  onProgress: (monthsDone: number, months: number) => void,
  signal?: AbortSignal,
): Promise<ChessComGame[]> {
  const db = await open().catch(() => null)
  const archives = await fetchArchives(username)
  const all: ChessComGame[] = []
  let done = 0
  for (const url of archives) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
    let rec = isCurrentMonth(url) ? null : await getMonth(db, url)
    if (!rec) {
      rec = { url, games: await fetchMonth(url), fetchedAt: Date.now() }
      await putMonth(db, rec)
    }
    all.push(...rec.games)
    onProgress(++done, archives.length)
  }
  return all.sort((a, b) => b.endTime - a.endTime)
}
