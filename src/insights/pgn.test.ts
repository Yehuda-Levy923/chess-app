import { describe, expect, it } from 'vitest'
import { parsePgn, parseTimeControl } from './pgn'

const pgn = `[Event "Live Chess"]
[White "yehuda_levy"]
[Black "opp"]
[Result "1-0"]
[CurrentPosition "5Q1k/pp4pp/4P3/q7/8/7P/PP6/6K1 b - - 6 40"]
[ECOUrl "https://www.chess.com/openings/Caro-Kann-Defense-Exchange-Variation-3...cxd5-4.Nf3-Nc6"]
[TimeControl "60"]
[Termination "yehuda_levy won by checkmate"]

1. e4 {[%clk 0:00:59.8]} 1... c6 {[%clk 0:00:59.2]} 2. Nf3 {[%clk 0:00:59.7]} 2... d5 {[%clk 0:01:00]} 3. O-O?! 3... Qxf2+ 4. Qf8# 1-0`

describe('parsePgn', () => {
  const p = parsePgn(pgn)

  it('reads headers', () => {
    expect(p.headers.White).toBe('yehuda_levy')
    expect(p.headers.CurrentPosition).toBe('5Q1k/pp4pp/4P3/q7/8/7P/PP6/6K1 b - - 6 40')
  })

  it('reads SAN moves without numbers, results or annotations', () => {
    expect(p.sans).toEqual(['e4', 'c6', 'Nf3', 'd5', 'O-O', 'Qxf2+', 'Qf8#'])
  })

  it('pairs clocks with the move they follow, null where missing', () => {
    expect(p.clocks).toEqual([59.8, 59.2, 59.7, 60, null, null, null])
  })
})

describe('parseTimeControl', () => {
  it('reads base and increment', () => {
    expect(parseTimeControl('180+2')).toEqual({ base: 180, increment: 2 })
    expect(parseTimeControl('60')).toEqual({ base: 60, increment: 0 })
    expect(parseTimeControl('1/86400')).toBeNull()
  })
})
