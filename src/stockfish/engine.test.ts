import { describe, expect, it } from 'vitest'
import { Engine, type LiveUpdate, type WorkerLike } from './engine'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
// White is in check and Kxb2 is the only legal move.
const ONE_MOVE = 'k7/8/8/8/8/8/1q6/K7 w - - 0 1'

/**
 * A scripted Stockfish: answers the handshake, and on "go" prints one depth per
 * tick (all MultiPV lines) until it reaches the depth asked for or gets "stop".
 */
class FakeStockfish implements WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  sent: string[] = []
  /** Depth a "go ... movetime" search reaches before its time runs out, once per position */
  capDepth: number | null = null
  private capped = false
  private multiPv = 1
  private legal = 20
  private timer: ReturnType<typeof setTimeout> | null = null

  postMessage(cmd: string) {
    this.sent.push(cmd)
    if (cmd === 'uci') {
      this.emit('option name UCI_Elo type spin default 1320 min 1320 max 3190')
      this.emit('uciok')
    }
    else if (cmd === 'isready') this.emit('readyok')
    else if (cmd.startsWith('setoption name MultiPV value')) this.multiPv = Number(cmd.split(' ').at(-1))
    else if (cmd.startsWith('position fen')) {
      this.legal = cmd.includes(ONE_MOVE) ? 1 : 20
      this.capped = false
    } else if (cmd.startsWith('go')) {
      // The first timed search of a position runs out of time at capDepth.
      const depth = Number(cmd.match(/depth (\d+)/)?.[1] ?? 1)
      const cap = this.capDepth !== null && cmd.includes('movetime') && !this.capped
      this.capped ||= cap
      this.search(cap ? Math.min(depth, this.capDepth!) : depth)
    }
    else if (cmd === 'stop') this.finish()
  }

  terminate() {}

  private search(maxDepth: number) {
    let depth = 0
    const step = () => {
      depth++
      for (let k = 1; k <= Math.min(this.multiPv, this.legal); k++) {
        this.emit(`info depth ${depth} seldepth ${depth} multipv ${k} score cp ${10 * k} nodes 1 pv e2e4 e7e5`)
      }
      if (depth >= maxDepth) this.finish()
      else this.timer = setTimeout(step, 1)
    }
    this.timer = setTimeout(step, 1)
  }

  private finish() {
    if (this.timer === null) return
    clearTimeout(this.timer)
    this.timer = null
    setTimeout(() => this.emit('bestmove e2e4'), 1)
  }

  private emit(line: string) {
    queueMicrotask(() => this.onmessage?.({ data: line } as MessageEvent))
  }
}

const setup = () => {
  const worker = new FakeStockfish()
  return { worker, engine: new Engine({ worker, multiPv: 2 }) }
}

describe('Engine.analyse', () => {
  it('searches on to the minimum depth when the time cap stops it short', async () => {
    const { engine, worker } = setup()
    worker.capDepth = 12
    const result = await engine.analyse(START, 16, 2000, 15)
    expect(result.depth).toBe(15)
    expect(result.requestedDepth).toBe(16)
    expect(worker.sent.filter((c) => c.startsWith('go'))).toEqual(['go depth 16 movetime 2000', 'go depth 15 movetime 30000'])
  })

  it('searches once when the first search clears the minimum', async () => {
    const { engine, worker } = setup()
    worker.capDepth = 15
    expect((await engine.analyse(START, 16, 2000, 15)).depth).toBe(15)
    expect(worker.sent.filter((c) => c.startsWith('go'))).toHaveLength(1)
  })

  it('never asks for more than the requested depth', async () => {
    const { engine, worker } = setup()
    worker.capDepth = 8
    expect((await engine.analyse(START, 12, 2000, 15)).depth).toBe(12)
  })

  it('stops on abort, rejects, and lets the next call run', async () => {
    const { engine, worker } = setup()
    const ctrl = new AbortController()
    const search = engine.analyse(START, 99, 2000, 0, ctrl.signal)
    setTimeout(() => ctrl.abort(), 5)
    await expect(search).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker.sent).toContain('stop')
    expect(await engine.bestMove(START, { movetime: 100 })).toBe('e2e4')
  })

  it('never starts a search that was cancelled while waiting in the queue', async () => {
    const { engine, worker } = setup()
    const ctrl = new AbortController()
    const first = engine.analyse(START, 3)
    const second = engine.analyse(START, 3, 2000, 0, ctrl.signal)
    ctrl.abort()
    await first
    await expect(second).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker.sent.filter((c) => c.startsWith('go'))).toHaveLength(1)
  })
})

describe('Engine.analyseLive', () => {
  it('streams one update per completed depth with every line', async () => {
    const { engine } = setup()
    const updates: LiveUpdate[] = []
    const result = await engine.analyseLive(START, {
      multiPv: 3,
      maxDepth: 4,
      signal: new AbortController().signal,
      onUpdate: (u) => updates.push(u),
    })
    expect(updates.map((u) => u.depth)).toEqual([1, 2, 3, 4])
    expect(updates.every((u) => u.lines.length === 3)).toBe(true)
    expect(result.lines).toHaveLength(3)
    expect(result.depth).toBe(4)
  })

  it('still streams when fewer legal moves exist than lines asked for', async () => {
    const { engine } = setup()
    const updates: LiveUpdate[] = []
    await engine.analyseLive(ONE_MOVE, { multiPv: 3, maxDepth: 2, signal: new AbortController().signal, onUpdate: (u) => updates.push(u) })
    expect(updates.map((u) => u.lines.length)).toEqual([1, 1])
  })

  it('stops on abort, rejects, restores MultiPV, and leaves the queue usable', async () => {
    const { engine, worker } = setup()
    const ctrl = new AbortController()
    const live = engine.analyseLive(START, {
      multiPv: 3,
      maxDepth: 99,
      signal: ctrl.signal,
      onUpdate: (u) => u.depth === 2 && ctrl.abort(),
    })
    await expect(live).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker.sent).toContain('stop')
    expect(worker.sent.filter((c) => c.startsWith('setoption name MultiPV')).slice(-2)).toEqual([
      'setoption name MultiPV value 3',
      'setoption name MultiPV value 2',
    ])

    const review = await engine.analyse(START, 3)
    expect(review.lines).toHaveLength(2)
    expect(review.depth).toBe(3)
  })

  it('never starts a search that was cancelled while waiting in the queue', async () => {
    const { engine, worker } = setup()
    const ctrl = new AbortController()
    const first = engine.analyse(START, 3)
    const live = engine.analyseLive(START, { multiPv: 3, signal: ctrl.signal, onUpdate: () => undefined })
    ctrl.abort()
    await first
    await expect(live).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker.sent.filter((c) => c.startsWith('go'))).toHaveLength(1)
  })
})


describe('Engine.bestMove', () => {
  it('limits strength for the one move, clamped to the range the engine reports, then restores it', async () => {
    const { engine, worker } = setup()
    expect(await engine.bestMove(START, { elo: 900, movetime: 500 })).toBe('e2e4')
    const opts = worker.sent.filter((c) => c.startsWith('setoption name UCI_') || c.startsWith('setoption name Skill'))
    expect(opts).toEqual([
      'setoption name UCI_LimitStrength value true',
      'setoption name UCI_Elo value 1320',
      'setoption name UCI_LimitStrength value false',
      'setoption name Skill Level value 20',
    ])
    expect(worker.sent).toContain('go movetime 500')
  })

  it('uses Skill Level and a shallow depth below the calibrated range', async () => {
    const { engine, worker } = setup()
    await engine.bestMove(START, { skill: 3, depth: 2, movetime: 300 })
    expect(worker.sent).toContain('setoption name Skill Level value 3')
    expect(worker.sent).toContain('go depth 2 movetime 300')
    expect(worker.sent.at(-1)).toBe('setoption name Skill Level value 20')
  })
})