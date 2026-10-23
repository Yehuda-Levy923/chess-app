import { useEffect, useMemo, useState } from 'react'
import type { GameFacts } from '../insights/facts'
import { byCountry, cachedCountries, loadCountries, mapKey } from '../insights/geography'
import { ScoreBar } from './charts'
import type { Drill } from './GamesDrawer'
import { WorldMap } from './WorldMap'

type Props = {
  games: GameFacts[]
  /** Every game, so countries load for all your opponents whatever the filter */
  history: GameFacts[]
  onDrill: (d: Drill) => void
}

const pct = (x: number) => `${Math.round(x * 100)}%`

/** chess.com's Geography section: where your opponents are from, and how you do against each country. */
export function InsightsGeography({ games, history, onDrill }: Props) {
  const [countries, setCountries] = useState<Map<string, string | null> | null>(null)
  const [showAll, setShowAll] = useState(false)

  // Most recent opponents first, so a first load that's still going already says something about now.
  const opponents = useMemo(() => {
    const seen = new Set<string>()
    for (const g of [...history].sort((a, b) => b.endTime - a.endTime)) seen.add(g.opponent.toLowerCase())
    return [...seen]
  }, [history])

  useEffect(() => {
    const abort = new AbortController()
    void (async () => {
      const known = await cachedCountries()
      if (abort.signal.aborted) return
      setCountries(new Map(known))
      await loadCountries(opponents, known, (k) => !abort.signal.aborted && setCountries(k), abort.signal)
    })()
    return () => abort.abort()
  }, [opponents])

  const rows = useMemo(() => (countries ? byCountry(games, countries) : []), [games, countries])
  const byKey = useMemo(() => {
    const m = new Map<string, { games: number; score: number; codes: string[] }>()
    for (const r of rows) {
      const k = mapKey(r.code)
      if (!k) continue
      const prev = m.get(k)
      const games = (prev?.games ?? 0) + r.games
      m.set(k, { games, score: ((prev ? prev.score * prev.games : 0) + r.score * r.games) / games, codes: [...(prev?.codes ?? []), r.code] })
    }
    return m
  }, [rows])
  // Shade by games on a log scale: one country usually dwarfs the rest.
  const values = useMemo(() => {
    const max = Math.log1p(Math.max(1, ...[...byKey.values()].map((v) => v.games)))
    return new Map([...byKey].map(([k, v]) => [k, Math.log1p(v.games) / max]))
  }, [byKey])

  if (!countries) return <p className="dim">Reading saved countries…</p>
  const known = opponents.filter((u) => countries.has(u)).length
  const drill = (title: string, ids: string[]) => {
    const set = new Set(ids)
    onDrill({ title, games: games.filter((g) => set.has(g.id)) })
  }
  const shown = showAll ? rows : rows.slice(0, 20)

  return (
    <div className="geography">
      {known < opponents.length && (
        <p className="dim note">
          Looking up your opponents' countries on chess.com: <span className="num">{known.toLocaleString()}</span> of{' '}
          <span className="num">{opponents.length.toLocaleString()}</span> so far. They're saved, so this only happens once.
        </p>
      )}
      <WorldMap
        values={values}
        tip={(key, name) => {
          const v = byKey.get(key)
          return v ? `${name}: ${v.games.toLocaleString()} ${v.games === 1 ? 'game' : 'games'}, you scored ${pct(v.score)}` : null
        }}
        onPick={(key) => {
          const ids = rows.filter((r) => mapKey(r.code) === key).flatMap((r) => r.gameIds)
          const names = rows.filter((r) => mapKey(r.code) === key).map((r) => r.name)
          drill(`Against players from ${names.join(' and ')}`, ids)
        }}
      />

      <table className="itable perf-rows geography-table">
        <thead>
          <tr>
            <th />
            <th className="r">Games</th>
            <th className="r">Players</th>
            <th className="r">Score</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const open = () => drill(`Against players from ${r.name}`, r.gameIds)
            return (
              <tr key={r.code} className={r.games < 10 ? 'few' : ''} tabIndex={0} onClick={open} onKeyDown={(e) => e.key === 'Enter' && open()}>
                <td className="name">{r.name}</td>
                <td className="r num">{r.games.toLocaleString()}</td>
                <td className="r num">{r.opponents.toLocaleString()}</td>
                <td className="r num">{pct(r.score)}</td>
                <td className="bar-cell">
                  <ScoreBar score={r.score} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {rows.length > 20 && (
        <button className="btn btn-quiet" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show the top 20' : `Show all ${rows.length} countries`}
        </button>
      )}
    </div>
  )
}
