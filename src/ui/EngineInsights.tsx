import type { ChessComGame } from '../chesscom/api'
import {
  accuracyByClock,
  accuracyByOpening,
  accuracyByRatingGap,
  accuracyOverTime,
  moveQuality,
  playingLevel,
  tacticMoments,
  tactics,
  tilt,
  type GameGroup,
  type MoveRef,
  type MoveBand,
  type PlayingLevel,
  type ReviewedGame,
} from '../insights/engineStats'
import type { GameFacts } from '../insights/facts'
import type { BatchProgress } from '../review/batch'
import { LABELS } from '../review/buildReview'
import { colorAt, labelAt } from '../review/summary'
import type { Label } from '../review/types'
import { Badge } from './Badge'
import { LineChart, PerfBar } from './charts'
import { formatDate } from './dates'
import { derived } from './derived'
import type { Drill } from './GamesDrawer'
import { GLYPH, LABEL_TEXT } from './labels'

type Props = {
  games: ReviewedGame[]
  totalGames: number
  /** Every game, reviewed or not, so "after a loss" sees the previous game either way */
  history: GameFacts[]
  unreviewed: ChessComGame[]
  batch: BatchProgress | null
  onBatch: (n: number) => void
  onStop: () => void
  onDrill: (d: Drill) => void
  /** Opens the Openings tab on this opening family */
  onOpening: (family: string) => void
}

const BATCH_SIZES = [10, 25, 50]

/** Reviews more games in the background; about a minute and a half each on one engine thread. */
function BatchControl({ unreviewed, batch, onBatch, onStop }: Pick<Props, 'unreviewed' | 'batch' | 'onBatch' | 'onStop'>) {
  if (batch) {
    const pos = batch.positions
    return (
      <div className="batch">
        <p>
          Reviewing game <span className="num">{Math.min(batch.done + 1, batch.total)}</span> of <span className="num">{batch.total}</span>
          {batch.current && (
            <span className="dim">
              {' '}
              {batch.current.white.username} vs {batch.current.black.username}, {formatDate(batch.current.endTime)}
            </span>
          )}
          {pos && (
            <span className="dim">
              , position <span className="num">{pos[0]}</span> of <span className="num">{pos[1]}</span>
            </span>
          )}
        </p>
        <div className="progress">
          <div style={{ width: `${((batch.done + (pos ? pos[0] / pos[1] : 0)) / batch.total) * 100}%` }} />
        </div>
        <button className="btn" onClick={onStop}>
          Stop
        </button>
      </div>
    )
  }
  if (unreviewed.length === 0) return null
  return (
    <div className="batch">
      <p>
        <span className="num">{unreviewed.length.toLocaleString()}</span> {unreviewed.length === 1 ? 'game' : 'games'} in this filter aren't reviewed. Review the
        newest here:
      </p>
      <div className="batch-buttons">
        {BATCH_SIZES.filter((_, i) => i === 0 || unreviewed.length > BATCH_SIZES[i - 1]).map((n) => (
          <button key={n} className="btn" onClick={() => onBatch(n)}>
            {Math.min(n, unreviewed.length)} games, about {Math.round(Math.min(n, unreviewed.length) * 1.5)} min
          </button>
        ))}
      </div>
    </div>
  )
}

/** Stats from Stockfish reviews: where your accuracy drops, and what tends to come before it. */
export function EngineInsights({ games, totalGames, history, unreviewed, batch, onBatch, onStop, onDrill, onOpening }: Props) {
  const control = <BatchControl unreviewed={unreviewed} batch={batch} onBatch={onBatch} onStop={onStop} />
  if (games.length === 0) {
    return (
      <div>
        <p className="dim">
          These stats need Stockfish, so they only cover reviewed games. None of the {totalGames.toLocaleString()} games in this filter are reviewed yet.
        </p>
        {control}
      </div>
    )
  }

  const stats = derived(games, 'engine', () => ({
    over: accuracyOverTime(games),
    byClock: accuracyByClock(games),
    afterResult: tilt(games, history),
    byOpening: accuracyByOpening(games, { minGames: 30 }),
    byGap: accuracyByRatingGap(games),
    quality: moveQuality(games),
    t: tactics(games),
    tm: tacticMoments(games),
    level: playingLevel(games),
  }))
  const mean = stats.over.reduce((s, p) => s + p.ours, 0) / Math.max(1, stats.over.length)
  const withChessCom = stats.over.filter((p) => p.chessCom !== null)
  // Single games swing by 30 points; with hundreds of them the trend only shows as an average.
  const smooth = stats.over.length > 200
  // Worst first by distance below your average in standard errors, not raw
  // accuracy, so a 700-game opening outranks an 11-game fluke.
  const scored = stats.byOpening.flatMap((g) => (g.accuracy !== null && g.accuracySd ? [{ g, z: (g.accuracy - mean) / (g.accuracySd / Math.sqrt(g.games)) }] : []))
  const worstOpenings = scored.filter((x) => x.z < 0).sort((a, b) => a.z - b.z).slice(0, 6).map((x) => x.g)
  const bestOpenings = scored.filter((x) => x.z > 0).sort((a, b) => b.z - a.z).slice(0, 6).map((x) => x.g)
  const facts = new Map(games.map((g) => [g.facts.id, g.facts]))
  const drill = (title: string, ids: string[]) => onDrill({ title, games: ids.flatMap((id) => facts.get(id) ?? []) })

  // Individual moves: each opens its game's review on that move.
  const reviewed = new Map(games.map((g) => [g.facts.id, g]))
  const drillMoves = (title: string, refs: MoveRef[]) => {
    const ids = [...new Set(refs.map((r) => r.gameId))]
    onDrill({
      title,
      games: ids.flatMap((id) => facts.get(id) ?? []),
      moments: refs.flatMap((r) => {
        const g = reviewed.get(r.gameId)
        return g ? [{ id: r.gameId, ply: g.summary.firstPly + r.index }] : []
      }),
    })
  }
  const labelled = (label: Label): MoveRef[] =>
    games.flatMap((g) => {
      const mine = g.facts.side === 'white' ? 'w' : 'b'
      const s = g.summary
      const out: MoveRef[] = []
      for (let i = 0; i < s.labels.length; i++) if (colorAt(s, i) === mine && labelAt(s, i) === label) out.push({ gameId: g.facts.id, index: i })
      return out
    })
  const key = (r: MoveRef) => `${r.gameId}:${r.index}`
  const punished = new Set(stats.tm.opponentHungPunished.map(key))
  const unpunished = stats.tm.opponentHung.filter((r) => !punished.has(key(r)))
  const count = (title: string, refs: MoveRef[]) =>
    refs.length ? (
      <button className="link-button num" onClick={() => drillMoves(title, refs)}>
        {refs.length.toLocaleString()}
      </button>
    ) : (
      <span className="num">0</span>
    )

  return (
    <div className="engine-tab">
      <p className="dim note">
        From the <span className="num">{games.length.toLocaleString()}</span> reviewed {games.length === 1 ? 'game' : 'games'} of the{' '}
        <span className="num">{totalGames.toLocaleString()}</span> in this filter. Your average accuracy in them is <span className="num">{mean.toFixed(1)}</span>, marked by
        the tick on each bar; bold accuracies differ from it by more than chance would explain.
      </p>
      {control}

      <PlayingLevelSection levels={stats.level} onPick={(l) => drill(`${cap(l.timeClass)}, reviewed games`, l.gameIds)} />

      <div className="insights-grid">
        <div className="insights-col">
          <h2>{smooth ? `Accuracy over time, ${WINDOW}-game average` : 'Accuracy over time'}</h2>
          <LineChart
            zoomable
            yLabel="Accuracy per reviewed game"
            yDomain={[0, 100]}
            formatX={(t) => new Date(t * 1000).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
            series={[
              {
                id: 'ours',
                name: 'This app',
                points: smooth
                  ? rolling(stats.over.map((p) => ({ t: p.t, v: p.ours }))).map((p) => ({ x: p.t, y: p.v, tip: avgTip(p) }))
                  : stats.over.map((p) => ({ x: p.t, y: p.ours, tip: tipText(p) })),
              },
              ...(withChessCom.length >= 2
                ? [
                    {
                      id: 'cc',
                      name: 'chess.com',
                      dashed: true,
                      points: smooth
                        ? rolling(withChessCom.map((p) => ({ t: p.t, v: p.chessCom! }))).map((p) => ({ x: p.t, y: p.v, tip: avgTip(p) }))
                        : withChessCom.map((p) => ({ x: p.t, y: p.chessCom!, tip: tipText(p) })),
                    },
                  ]
                : []),
            ]}
          />

          <h2>Accuracy by how much clock was left</h2>
          <p className="dim caption">
            Only moves made while the game was still open (a 20–80% chance of winning), since once it's decided almost any move scores well. The tick here is
            your average over these moves.
          </p>
          <BandRows bands={stats.byClock} />

          <h2>After a win, a draw or a loss</h2>
          <GroupRows groups={stats.afterResult} mean={mean} onPick={(g) => drill(`Reviewed games: ${g.label.toLowerCase()}`, g.gameIds)} />
        </div>

        <div className="insights-col">
          <h2>Openings you play least accurately</h2>
          {worstOpenings.length ? (
            <GroupRows groups={worstOpenings} mean={mean} onPick={(g) => onOpening(g.label)} hint="Open in the opening tree" />
          ) : (
            <p className="dim">No opening with 30 or more reviewed games is below your average accuracy.</p>
          )}

          <h2>Openings you play best</h2>
          {bestOpenings.length ? (
            <GroupRows groups={bestOpenings} mean={mean} onPick={(g) => onOpening(g.label)} hint="Open in the opening tree" />
          ) : (
            <p className="dim">No opening with 30 or more reviewed games is above your average accuracy.</p>
          )}

          <h2>Against stronger and weaker opponents</h2>
          <GroupRows groups={stats.byGap} mean={mean} onPick={(g) => drill(`Opponents ${g.label}, reviewed games`, g.gameIds)} />

          <h2>Move quality</h2>
          <table className="itable quality perf-rows">
            <tbody>
              {LABELS.filter((l) => stats.quality.get(l)).map((l) => (
                <tr
                  key={l}
                  tabIndex={0}
                  title={`List your ${LABEL_TEXT[l].name.toLowerCase()} moves`}
                  onClick={() => drillMoves(`Your ${LABEL_TEXT[l].name.toLowerCase()} moves`, labelled(l))}
                  onKeyDown={(e) => e.key === 'Enter' && drillMoves(`Your ${LABEL_TEXT[l].name.toLowerCase()} moves`, labelled(l))}
                >
                  <td className="label-cell">
                    {GLYPH[l] ? <Badge label={l} size={15} /> : <span className="badge-space" />}
                    {LABEL_TEXT[l].name}
                  </td>
                  <td className="r num">{((stats.quality.get(l) ?? 0) * 100).toFixed(1)}%</td>
                  <td className="bar-cell">
                    <span className="sharebar" style={{ width: `${Math.min(100, (stats.quality.get(l) ?? 0) * 200)}%` }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>Tactics</h2>
          <table className="itable">
            <thead>
              <tr>
                <th />
                <th className="r">Found</th>
                <th className="r">Missed</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Forced mates</td>
                <td className="r">{count('Forced mates you found', stats.tm.matesFound)}</td>
                <td className="r">{count('Forced mates you missed', stats.tm.matesMissed)}</td>
              </tr>
              <tr>
                <td>Forks</td>
                <td className="r">{count('Forks you found', stats.tm.forksFound)}</td>
                <td className="r">{count('Forks you missed', stats.tm.forksMissed)}</td>
              </tr>
              <tr>
                <td>Pieces your opponent left hanging</td>
                <td className="r">{count('Hanging pieces you took', stats.tm.opponentHungPunished)}</td>
                <td className="r">{count('Hanging pieces you left', unpunished)}</td>
              </tr>
            </tbody>
          </table>
          <p className="dim note">
            You left material hanging {count('Times you left material hanging', stats.tm.hungPieces)} {stats.t.hungPieces === 1 ? 'time' : 'times'}. A fork or mate counts as
            available when it was the engine's first choice.
          </p>
        </div>
      </div>
    </div>
  )
}

/** Game groups: games, accuracy against your average, mistakes per game, score. Rows open their games. */
function GroupRows({ groups, mean, onPick, hint }: { groups: GameGroup[]; mean: number; onPick: (g: GameGroup) => void; hint?: string }) {
  return (
    <table className="itable perf-rows">
      <thead>
        <tr>
          <th />
          <th className="r">Games</th>
          <th className="r">Accuracy</th>
          <th className="r" title="Mistakes, misses and blunders per game">
            Errors
          </th>
          <th className="r">Score</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {groups
          .filter((g) => g.games > 0)
          .map((g) => {
          const few = g.games < 10
          return (
            <tr key={g.label} className={few ? 'few' : ''} title={hint} tabIndex={0} onClick={() => onPick(g)} onKeyDown={(e) => e.key === 'Enter' && onPick(g)}>
              <td className="name">{g.label.charAt(0).toUpperCase() + g.label.slice(1)}</td>
              <td className="r num">{g.games.toLocaleString()}</td>
              <td className={`r num ${clears(g.accuracy, g.accuracySd, g.games, mean) ? 'strong' : ''}`}>{g.accuracy === null ? '' : g.accuracy.toFixed(1)}</td>
              <td className="r num">{g.costlyPerGame === null ? '' : g.costlyPerGame.toFixed(1)}</td>
              <td className="r num">{g.score === null ? '' : `${Math.round(g.score * 100)}%`}</td>
              <td className="bar-cell">{!few && g.accuracy !== null && <PerfBar actual={g.accuracy / 100} expected={mean / 100} />}</td>
            </tr>
          )
          })}
      </tbody>
    </table>
  )
}

/**
 * Move bands: per-move accuracy and the share of moves that were errors. The
 * baseline is the average over all these moves, not the per-game average:
 * per-move and per-game accuracy are different measures.
 */
function BandRows({ bands }: { bands: MoveBand[] }) {
  const counted = bands.filter((b) => b.accuracy !== null)
  const moves = counted.reduce((s, b) => s + b.moves, 0)
  const mean = moves ? counted.reduce((s, b) => s + b.accuracy! * b.moves, 0) / moves : 0
  return (
    <table className="itable perf-rows static">
      <thead>
        <tr>
          <th />
          <th className="r">Moves</th>
          <th className="r">Accuracy</th>
          <th className="r" title="Share of moves that were mistakes, misses or blunders">
            Errors
          </th>
          <th />
        </tr>
      </thead>
      <tbody>
        {bands.map((b) => (
          <tr key={b.label} className={b.moves < 50 ? 'few' : ''}>
            <td className="name">{b.label}</td>
            <td className="r num">{b.moves.toLocaleString()}</td>
            <td className={`r num ${b.moves >= 50 && clears(b.accuracy, b.accuracySd, b.moves, mean) ? 'strong' : ''}`}>{b.accuracy === null ? '' : b.accuracy.toFixed(1)}</td>
            <td className="r num">{b.costlyRate === null ? '' : `${(b.costlyRate * 100).toFixed(1)}%`}</td>
            <td className="bar-cell">{b.moves >= 50 && b.accuracy !== null && <PerfBar actual={b.accuracy / 100} expected={mean / 100} />}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function tipText(p: { t: number; ours: number; chessCom: number | null }) {
  return (
    <>
      <span className="num">{p.ours.toFixed(1)}</span>
      {p.chessCom !== null && (
        <>
          {' '}
          <span className="dim">chess.com</span> <span className="num">{p.chessCom.toFixed(1)}</span>
        </>
      )}{' '}
      <span className="dim">{formatDate(p.t)}</span>
    </>
  )
}

/**
 * Whether an accuracy sits at least two standard errors from your average,
 * so bold marks a difference that's unlikely to be noise.
 */
function clears(accuracy: number | null, sd: number | null, n: number, mean: number): boolean {
  if (accuracy === null || sd === null || n < 10 || sd === 0) return false
  return Math.abs(accuracy - mean) / (sd / Math.sqrt(n)) >= 2
}

const WINDOW = 50

/** Trailing average over WINDOW games, thinned to about 400 points for drawing. */
function rolling(points: { t: number; v: number }[]): { t: number; v: number; n: number }[] {
  const sorted = [...points].sort((a, b) => a.t - b.t)
  const out: { t: number; v: number; n: number }[] = []
  let sum = 0
  sorted.forEach((p, i) => {
    sum += p.v
    if (i >= WINDOW) sum -= sorted[i - WINDOW].v
    if (i >= WINDOW - 1) out.push({ t: p.t, v: sum / WINDOW, n: WINDOW })
  })
  const step = Math.max(1, Math.floor(out.length / 400))
  return out.filter((_, i) => i % step === 0 || i === out.length - 1)
}

function avgTip(p: { t: number; v: number }) {
  return (
    <>
      <span className="num">{p.v.toFixed(1)}</span> <span className="dim">average of the {WINDOW} games to {formatDate(p.t)}</span>
    </>
  )
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** How far the reviews put you from your rating, per time control: the readable part first, then the table. */
function PlayingLevelSection({ levels, onPick }: { levels: PlayingLevel[]; onPick: (l: PlayingLevel) => void }) {
  const shown = levels.filter((l) => l.games > 0 && l.blended !== null)
  if (shown.length === 0) return null
  const gap = (l: PlayingLevel) => Math.round(l.blended! - l.ratingBefore!)
  const said = shown
    .filter((l) => l.games >= 30 && l.ratingBefore !== null)
    .map((l) => {
      const d = gap(l)
      const size = Math.abs(d) < 10 ? 'right at' : `about ${Math.abs(Math.round(d / 5) * 5)} ${d < 0 ? 'below' : 'above'}`
      return `${size} your ${l.timeClass} rating`
    })
  return (
    <section className="level">
      <h2>Your playing level</h2>
      {said.length > 0 && <p className="level-lead">The reviews put you {said.join(', and ')}.</p>}
      <table className="itable perf-rows">
        <thead>
          <tr>
            <th />
            <th className="r">Reviewed games</th>
            <th className="r">Rating going in</th>
            <th className="r">Plays like</th>
            <th className="r">Difference</th>
            <th className="r" title="From accuracy alone, ignoring your rating. A single game's estimate can be off by several hundred points.">
              Accuracy alone, rough
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((l) => (
            <tr key={l.timeClass} className={l.games < 10 ? 'few' : ''} tabIndex={0} onClick={() => onPick(l)} onKeyDown={(e) => e.key === 'Enter' && onPick(l)}>
              <td className="name">{cap(l.timeClass)}</td>
              <td className="r num">{l.games.toLocaleString()}</td>
              <td className="r num">{l.ratingBefore === null ? '' : Math.round(l.ratingBefore).toLocaleString()}</td>
              <td className="r num level-value">{Math.round(l.blended!).toLocaleString()}</td>
              <td className="r num">{l.ratingBefore === null ? '' : `${gap(l) > 0 ? '+' : gap(l) < 0 ? '−' : ''}${Math.abs(gap(l))}`}</td>
              <td className="r num dim">{l.accuracyOnly === null ? '' : `~${(Math.round(l.accuracyOnly / 10) * 10).toLocaleString()}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="dim caption">
        "Plays like" is the figure on each game's review, averaged: your rating going in, moved up or down by how your accuracy compares with players at that rating.
        Accuracy alone ignores your rating, so it's only a rough level.
      </p>
    </section>
  )
}
