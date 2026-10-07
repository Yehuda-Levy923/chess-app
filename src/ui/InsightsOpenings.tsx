import { useMemo, useState } from 'react'
import type { GameFacts, Side } from '../insights/facts'
import { derived } from './derived'
import type { Drill } from './GamesDrawer'
import { openingRows, typicalLine } from './openingLines'
import { OpeningTree } from './OpeningTree'

type Props = {
  games: GameFacts[]
  /** The screen's colour filter; with "either colour" this tab picks one itself */
  filterSide: Side | null
  onDrill: (d: Drill) => void
}

type Sort = 'games' | 'cost'

const pct = (x: number) => `${(x * 100).toFixed(1)}%`
const signed = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(1)}`

/** Your openings for one colour on the left; picking one opens the move tree at its usual line. */
export function InsightsOpenings({ games, filterSide, onDrill }: Props) {
  const busier: Side = games.filter((g) => g.side === 'white').length >= games.length / 2 ? 'white' : 'black'
  const [localSide, setLocalSide] = useState<Side>(busier)
  const side = filterSide ?? localSide
  const [sort, setSort] = useState<Sort>('games')
  const [path, setPath] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)

  const mine = derived(games, `side:${side}`, () => games.filter((g) => g.side === side))
  const rows = useMemo(() => {
    const list = [...derived(mine, 'rows', () => openingRows(mine, side))]
    return sort === 'games' ? list.sort((a, b) => b.games - a.games) : list.sort((a, b) => b.cost - a.cost)
  }, [mine, side, sort])
  const maxGames = Math.max(1, ...rows.map((r) => r.games))

  const pickSide = (s: Side) => {
    setLocalSide(s)
    setPath([])
    setSelected(null)
  }

  return (
    <div className="openings">
      <div className="openings-list">
        <div className="openings-head">
          {!filterSide && (
            <div className="tree-side" role="group" aria-label="Colour">
              {(['white', 'black'] as Side[]).map((s) => (
                <button key={s} className={side === s ? 'on' : ''} aria-pressed={side === s} onClick={() => pickSide(s)}>
                  As {s === 'white' ? 'White' : 'Black'}
                </button>
              ))}
            </div>
          )}
          <label className="openings-sort">
            Sort by
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="games">Most played</option>
              <option value="cost">Most points lost</option>
            </select>
          </label>
        </div>

        <ol className="opening-rows">
          {rows.map((r) => {
            const delta = (r.actual - r.expected) * 100
            const strong = Math.abs(r.z) >= 2
            return (
              <li key={r.family}>
                <button
                  className={`opening-row ${selected === r.family ? 'on' : ''}`}
                  onClick={() => {
                    setSelected(r.family)
                    setPath(typicalLine(r.facts))
                  }}
                >
                  <span className="opening-name">{r.family}</span>
                  <span className="opening-games num">{r.games.toLocaleString()}</span>
                  <span className="opening-share" aria-hidden>
                    <span style={{ width: `${(r.games / maxGames) * 100}%` }} />
                  </span>
                  <span className="opening-score num">{pct(r.actual)}</span>
                  <span className={`opening-delta num ${strong ? 'strong' : ''}`} title={`${pct(r.expected)} expected from the ratings`}>
                    {signed(delta)}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
        <p className="dim note">
          Last column: points per 100 games above or below what the ratings predicted; bold when it's unlikely to be chance. Families with fewer than 10 games are
          left out.
        </p>
        {selected && (
          <button
            className="btn btn-quiet"
            onClick={() => {
              const r = rows.find((x) => x.family === selected)
              if (r) onDrill({ title: `${r.family} as ${side === 'white' ? 'White' : 'Black'}`, games: r.facts })
            }}
          >
            All {selected} games
          </button>
        )}
      </div>

      <OpeningTree games={mine} side={side} path={path} onPath={setPath} onDrill={onDrill} />
    </div>
  )
}
