import { describe, expect, it } from 'vitest'
import { TACTIC, type GameSummary } from '../review/summary'
import { accuracyByMoveNumber, castlingByPhase, gameShapes, phaseSkills, shapeOf, tacticsBothWays } from './chesscomStats'
import type { ReviewedGame } from './engineStats'
import type { GameFacts, Outcome } from './facts'

// Reviewed games put together from just the fields these stats read.
// Label letters: b best, m mistake, k book.
function rg(over: {
  id?: string
  side?: 'white' | 'black'
  outcome?: Outcome
  curve?: number[]
  labels?: string
  tactics?: number[]
  format?: number
  phases?: [number | null, number | null]
  phaseAccuracy?: { w: (number | null)[]; b: (number | null)[] }
  castled?: GameFacts['castled']
  timeClass?: string
  endTime?: number
}): ReviewedGame {
  const labels = over.labels ?? 'bbbbbbbb'
  const summary = {
    gameId: over.id ?? 'g',
    format: over.format ?? 3,
    firstPly: 1,
    firstColor: 'w',
    labels,
    pieces: 'p'.repeat(labels.length),
    moveAccuracy: Array(labels.length).fill(80),
    tactics: over.tactics ?? Array(labels.length).fill(0),
    winPercent: over.curve ?? Array(labels.length + 1).fill(50),
    accuracy: { w: 80, b: 70 },
    phases: over.phases ?? [2, 6],
    phaseAccuracy: over.phaseAccuracy ?? { w: [90, 80, 70], b: [60, 50, 40] },
  } as unknown as GameSummary
  const facts = {
    id: over.id ?? 'g',
    side: over.side ?? 'white',
    outcome: over.outcome ?? 'won',
    castled: over.castled ?? null,
    timeClass: over.timeClass ?? 'blitz',
    endTime: over.endTime ?? 1,
  } as GameFacts
  return { summary, facts, chessComAccuracy: null }
}

// Ten opening plies at 50, then the part that counts.
const after = (...xs: number[]) => [...Array(10).fill(50), ...xs]

describe('shapeOf', () => {
  it('reads the game from your side of the board', () => {
    expect(shapeOf(rg({ curve: after(55, 70, 90, 100) }))).toBe('control')
    // The same curve as Black is a game White controlled, so a loss outplayed.
    expect(shapeOf(rg({ side: 'black', outcome: 'lost', curve: after(55, 70, 90, 100) }))).toBe('outplayed')
  })

  it('names comebacks, slips and seesaws', () => {
    expect(shapeOf(rg({ curve: after(40, 20, 50, 90) }))).toBe('comeback')
    expect(shapeOf(rg({ outcome: 'lost', curve: after(60, 85, 50, 5) }))).toBe('thrown')
    expect(shapeOf(rg({ outcome: 'drawn', curve: after(70, 30, 70, 30, 50) }))).toBe('seesaw')
    expect(shapeOf(rg({ outcome: 'drawn', curve: after(45, 55, 50) }))).toBe('close')
  })

  it('counts each shape with its score', () => {
    const rows = gameShapes([rg({ id: 'a', curve: after(60, 90) }), rg({ id: 'b', curve: after(60, 90) }), rg({ id: 'c', outcome: 'lost', curve: after(40, 10) })])
    expect(rows.map((r) => [r.shape, r.games, r.score])).toEqual([
      ['control', 2, 1],
      ['outplayed', 1, 0],
    ])
  })
})

describe('castlingByPhase', () => {
  it('places the castling move against the phase boundaries', () => {
    // Middlegame from ply index 10, endgame from 40. White castles on move 4 (index 6), Black on move 8 (index 15).
    const phases: [number, number] = [10, 40]
    const { rows, used } = castlingByPhase([
      rg({ id: 'a', phases, castled: { side: 'short', move: 4 } }),
      rg({ id: 'b', side: 'black', outcome: 'lost', phases, castled: { side: 'short', move: 8 } }),
      rg({ id: 'c', phases }),
      rg({ id: 'old', format: 2, castled: { side: 'short', move: 4 } }),
    ])
    expect(used).toBe(3)
    expect(rows.map((r) => [r.when, r.games, r.score])).toEqual([
      ['opening', 1, 1],
      ['middlegame', 1, 0],
      ['never', 1, 1],
    ])
  })
})

describe('phaseSkills', () => {
  it('averages your side of each phase per time control', () => {
    const games = Array.from({ length: 12 }, (_, i) => rg({ id: `g${i}`, endTime: i }))
    const [row] = phaseSkills(games)
    expect(row.timeClass).toBe('blitz')
    expect(row.phases.map((p) => p.accuracy)).toEqual([90, 80, 70])
    // Better accuracy plays like a higher rating.
    expect(row.phases[0].rating!).toBeGreaterThan(row.phases[2].rating!)
  })

  it('skips summaries from before phases were recorded', () => {
    expect(phaseSkills([rg({ format: 2 })])).toEqual([])
  })
})

describe('tacticsBothWays', () => {
  it('splits found, missed and allowed, and counts pins only where recorded', () => {
    const pin = TACTIC.pinAvailable
    const fork = TACTIC.forkAvailable
    const games = [
      // White moves at even indexes: a pin found, a fork missed; Black (the opponent) gets a fork and takes it.
      rg({ id: 'a', tactics: [pin | TACTIC.pinFound, 0, fork, fork | TACTIC.forkFound, 0, 0, 0, TACTIC.hung] }),
      rg({ id: 'old', format: 2, tactics: [pin, 0, 0, 0, 0, 0, 0, 0] }),
    ]
    const { rows, pinGames, hung } = tacticsBothWays(games)
    const by = Object.fromEntries(rows.map((r) => [r.kind, r]))
    expect(pinGames).toBe(1)
    expect(by.pin.found).toHaveLength(1)
    expect(by.pin.missed).toHaveLength(0)
    expect(by.fork.missed).toEqual([{ gameId: 'a', index: 2 }])
    expect(by.fork.allowed).toEqual([{ gameId: 'a', index: 3 }])
    expect(by.fork.allowedTaken).toHaveLength(1)
    expect(hung.theirs).toEqual([{ gameId: 'a', index: 7 }])
  })
})

describe('tacticsBothWays, chances that last', () => {
  it('counts a forced mate once, on the move it appears', () => {
    const mate = TACTIC.mateAvailable
    // The opponent (Black, odd indexes) has a mate from index 3 that runs to the end.
    const { rows } = tacticsBothWays([rg({ tactics: [0, 0, 0, mate | TACTIC.mateFound, 0, mate | TACTIC.mateFound, 0, mate | TACTIC.mateFound] })])
    const m = rows.find((r) => r.kind === 'mate')!
    expect(m.allowed).toEqual([{ gameId: 'g', index: 3 }])
    expect(m.allowedTaken).toHaveLength(1)
  })
})

describe('accuracyByMoveNumber', () => {
  it('leaves out book moves and thin move numbers', () => {
    const games = Array.from({ length: 20 }, (_, i) => rg({ id: `g${i}`, labels: 'kkbbbbbb' }))
    const rows = accuracyByMoveNumber(games)
    expect(rows.map((r) => r.move)).toEqual([2, 3, 4])
    expect(rows[0]).toEqual({ move: 2, accuracy: 80, moves: 20 })
  })
})
