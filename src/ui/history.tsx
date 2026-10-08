import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChessComError, type ChessComGame } from '../chesscom/api'
import { factsOf, withPreGameRatings, type GameFacts } from '../insights/facts'
import { loadHistory } from '../insights/history'
import { getBook } from '../openings'
import { allSummaries } from '../review/cache'
import type { GameSummary } from '../review/summary'

// The player's whole history, loaded once for every screen: the games from
// chess.com (past months come from a local cache), each reduced to facts, and
// a summary of every reviewed game. Home, Games, Practice and Insights all
// read from here instead of loading it themselves.

export type History = {
  games: ChessComGame[] | null
  facts: GameFacts[] | null
  summaries: GameSummary[]
  /** False until the summaries have been read once, so "none reviewed" isn't said too early */
  summariesLoaded: boolean
  /** Months fetched so far, while loading */
  progress: [number, number] | null
  error: string | null
  byUuid: Map<string, ChessComGame>
  summaryById: Map<string, GameSummary>
  /** Re-reads the review summaries, e.g. after an import or a batch review */
  refreshSummaries: () => Promise<void>
}

const empty: History = {
  games: null,
  facts: null,
  summaries: [],
  summariesLoaded: false,
  progress: null,
  error: null,
  byUuid: new Map(),
  summaryById: new Map(),
  refreshSummaries: async () => {},
}

const HistoryContext = createContext<History>(empty)

export const useHistory = () => useContext(HistoryContext)

export function HistoryProvider({ username, children }: { username: string; children: ReactNode }) {
  const [games, setGames] = useState<ChessComGame[] | null>(null)
  const [facts, setFacts] = useState<GameFacts[] | null>(null)
  const [summaries, setSummaries] = useState<GameSummary[]>([])
  const [summariesLoaded, setSummariesLoaded] = useState(false)
  const [progress, setProgress] = useState<[number, number] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshSummaries = useCallback(async () => {
    try {
      setSummaries(await allSummaries())
    } catch (e) {
      console.error(e)
    }
    setSummariesLoaded(true)
  }, [])

  useEffect(() => {
    setGames(null)
    setFacts(null)
    setError(null)
    setProgress(null)
    if (!username) return
    const abort = new AbortController()
    loadHistory(username, (d, t) => setProgress([d, t]), abort.signal)
      .then((g) => !abort.signal.aborted && setGames(g))
      .catch((e) => {
        if (abort.signal.aborted) return
        setError(e instanceof ChessComError ? e.message : String(e))
      })
    return () => abort.abort()
  }, [username])

  // Reducing ten thousand PGNs takes about a second; yield first so the loading state paints.
  useEffect(() => {
    if (!games) return
    const t = setTimeout(() => {
      const book = getBook()
      setFacts(withPreGameRatings(games.map((g) => factsOf(g, username, book))))
      void refreshSummaries()
    }, 30)
    return () => clearTimeout(t)
  }, [games, username, refreshSummaries])

  const value = useMemo<History>(
    () => ({
      games,
      facts,
      summaries,
      summariesLoaded,
      progress,
      error,
      byUuid: new Map((games ?? []).map((g) => [g.uuid, g])),
      summaryById: new Map(summaries.map((s) => [s.gameId, s])),
      refreshSummaries,
    }),
    [games, facts, summaries, summariesLoaded, progress, error, refreshSummaries],
  )

  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>
}
