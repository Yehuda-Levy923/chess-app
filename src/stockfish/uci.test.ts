import { describe, expect, it } from 'vitest'
import { LineCollector, parseInfo } from './uci'

const line = 'info depth 18 seldepth 24 multipv 1 score cp 34 nodes 123 nps 1000 hashfull 10 time 120 pv e2e4 e7e5 g1f3'

describe('parseInfo', () => {
  it('reads depth, multipv, score and pv', () => {
    expect(parseInfo(line, true)).toEqual({
      depth: 18,
      multipv: 1,
      score: { kind: 'cp', cp: 34 },
      pv: ['e2e4', 'e7e5', 'g1f3'],
    })
  })

  it("flips the score to White's view when Black is to move", () => {
    expect(parseInfo(line, false)?.score).toEqual({ kind: 'cp', cp: -34 })
    expect(parseInfo('info depth 10 multipv 2 score mate 3 pv a7a8q', false)?.score).toEqual({ kind: 'mate', mate: -3 })
  })

  it('skips bounds and lines without a score', () => {
    expect(parseInfo('info depth 18 multipv 1 score cp 34 lowerbound nodes 1 pv e2e4', true)).toBeNull()
    expect(parseInfo('info depth 18 currmove e2e4 currmovenumber 1', true)).toBeNull()
    expect(parseInfo('bestmove e2e4 ponder e7e5', true)).toBeNull()
  })

  it('defaults multipv to 1 when absent', () => {
    expect(parseInfo('info depth 5 score cp 10 pv d2d4', true)?.multipv).toBe(1)
  })
})

describe('LineCollector', () => {
  it('keeps the deepest line per slot, best first', () => {
    const c = new LineCollector()
    c.add({ depth: 10, multipv: 2, score: { kind: 'cp', cp: 5 }, pv: ['d2d4'] })
    c.add({ depth: 10, multipv: 1, score: { kind: 'cp', cp: 20 }, pv: ['e2e4'] })
    c.add({ depth: 11, multipv: 1, score: { kind: 'cp', cp: 25 }, pv: ['e2e4', 'e7e5'] })
    expect(c.result()).toEqual({
      depth: 11,
      lines: [
        { score: { kind: 'cp', cp: 25 }, pv: ['e2e4', 'e7e5'] },
        { score: { kind: 'cp', cp: 5 }, pv: ['d2d4'] },
      ],
    })
  })
})
