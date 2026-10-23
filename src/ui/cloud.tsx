import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cloudRuns, pullFinished, sendForReview, startResummarize, type CloudRun } from '../github/client'
import { numericId } from '../github/gameIds'
import { importDownloadedReviews } from '../review/importReviews'
import { useHistory } from './history'

// Reviews made on GitHub, so the computer doesn't have to stay on while
// Stockfish works. Opening the app downloads and imports whatever finished
// since last time; while a run is going, its progress is checked every so
// often and its reviews come in as soon as it's done.
//
// It needs the GitHub CLI, signed in, in a clone of the repo. A copy made
// with `npm run share` has none of that, so there it stays out of sight
// instead of showing a button that can only fail.

const POLL_MS = 30_000

type Cloud = {
  /** False until GitHub has answered once; false for good on a copy without it */
  available: boolean
  runs: CloudRun[] | null
  /** A run that hasn't finished, if any */
  active: CloudRun | null
  /** Downloading or importing finished runs */
  syncing: boolean
  /** What the last import brought in */
  imported: number | null
  error: string | null
  /** Your games with no review yet, newest first */
  unreviewed: number
  /** Starts a run for every game with no review */
  reviewAll: (depth: number) => Promise<void>
  /** How many games the last request left for a later run */
  left: number
  resummarize: () => Promise<void>
  sync: () => Promise<void>
}

const CloudContext = createContext<Cloud | null>(null)

export const useCloud = () => useContext(CloudContext)

export function CloudProvider({ username, children }: { username: string; children: ReactNode }) {
  const { games, summaryById, summariesLoaded, refreshSummaries } = useHistory()
  const [runs, setRuns] = useState<CloudRun[] | null>(null)
  const [available, setAvailable] = useState(false)
  const answered = useRef(false)
  const [syncing, setSyncing] = useState(false)
  const [imported, setImported] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [left, setLeft] = useState(0)
  const busy = useRef(false)

  const refreshRuns = useCallback(async (): Promise<boolean> => {
    try {
      setRuns(await cloudRuns())
      answered.current = true
      setAvailable(true)
      return true
    } catch (e) {
      // Before GitHub has ever answered, a failure means it isn't set up here: say nothing.
      if (answered.current) setError(e instanceof Error ? e.message : String(e))
      return false
    }
  }, [])

  // Download finished runs, import them, and let every screen see the new reviews.
  const sync = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setSyncing(true)
    try {
      // Without GitHub there's nothing to download, but files copied in by hand still import.
      if (await refreshRuns()) await pullFinished()
      const done = await importDownloadedReviews()
      if (done && done.reviews > 0) {
        setImported(done.reviews)
        await refreshSummaries()
      }
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      busy.current = false
      setSyncing(false)
      void refreshRuns()
    }
  }, [refreshSummaries, refreshRuns])

  // Once per opening of the app, after the history and summaries are read.
  const synced = useRef(false)
  useEffect(() => {
    if (!username || !summariesLoaded || synced.current) return
    synced.current = true
    void sync()
  }, [username, summariesLoaded, sync])

  const active = runs?.find((r) => r.status !== 'completed') ?? null

  // While a run is going: check on it, and import as soon as it finishes.
  const wasActive = useRef<number | null>(null)
  useEffect(() => {
    if (active) wasActive.current = active.id
    else if (wasActive.current !== null) {
      wasActive.current = null
      void sync()
    }
    if (!active) return
    const t = setInterval(() => document.visibilityState === 'visible' && void refreshRuns(), POLL_MS)
    return () => clearInterval(t)
  }, [active, refreshRuns, sync])

  const unreviewedIds = useMemo(() => {
    if (!games || !summariesLoaded) return []
    return games.filter((g) => !summaryById.has(g.uuid)).flatMap((g) => numericId(g.url) ?? [])
  }, [games, summaryById, summariesLoaded])

  const reviewAll = useCallback(
    async (depth: number) => {
      setError(null)
      try {
        const r = await sendForReview(unreviewedIds, username, depth)
        setLeft(r.left)
        // GitHub takes a few seconds to list a new run.
        setTimeout(() => void refreshRuns(), 4000)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [unreviewedIds, username, refreshRuns],
  )

  const resummarize = useCallback(async () => {
    setError(null)
    try {
      await startResummarize()
      setTimeout(() => void refreshRuns(), 4000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [refreshRuns])

  const value = useMemo<Cloud>(
    () => ({ available, runs, active, syncing, imported, error, unreviewed: unreviewedIds.length, reviewAll, left, resummarize, sync }),
    [available, runs, active, syncing, imported, error, unreviewedIds.length, reviewAll, left, resummarize, sync],
  )
  return <CloudContext.Provider value={value}>{children}</CloudContext.Provider>
}
