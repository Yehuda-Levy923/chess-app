import { Chess } from 'chess.js'
import type { EngineLine, PositionAnalysis } from '../review/types'
import { LineCollector, parseInfo } from './uci'

const WORKER_URL = '/stockfish/stockfish-19.js'
const DEFAULT_MAX_MS = 2000
/** Safety cap on the search that tops a position up to the minimum depth, so a pathological position can't hang a review */
const FLOOR_MAX_MS = 30000

/** The part of a Worker the engine uses, so tests can drive it with a fake. */
export type WorkerLike = {
  postMessage(message: string): void
  terminate(): void
  onmessage: ((e: MessageEvent) => void) | null
  onerror: ((e: ErrorEvent) => void) | null
}

export type EngineOptions = { threads?: number; hashMb?: number; multiPv?: number; worker?: WorkerLike }

export type LiveUpdate = { depth: number; lines: EngineLine[] }

export type LiveOptions = {
  multiPv: number
  maxDepth?: number
  maxMs?: number
  signal: AbortSignal
  /** Called each time every line has reached a new depth */
  onUpdate: (u: LiveUpdate) => void
}

/**
 * One Stockfish worker speaking UCI. Calls are queued and run one at a time,
 * since the engine can only search one position at once.
 */
export class Engine {
  private worker: WorkerLike
  private listeners = new Set<(line: string) => void>()
  private failures = new Set<(err: Error) => void>()
  private dead: Error | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private ready: Promise<void>
  private multiPv: number

  constructor(opts: EngineOptions = {}) {
    this.worker = opts.worker ?? (new Worker(WORKER_URL) as unknown as WorkerLike)
    this.worker.onmessage = (e: MessageEvent) => {
      const text = typeof e.data === 'string' ? e.data : String(e.data)
      for (const line of text.split('\n')) for (const l of this.listeners) l(line)
    }
    // Without this a crashed or missing engine leaves every caller waiting forever.
    this.worker.onerror = (e: ErrorEvent) => {
      e.preventDefault()
      this.fail(new Error(`Stockfish stopped: ${e.message || 'the engine worker failed to load'}`))
    }
    const threads = opts.threads ?? defaultThreads()
    this.multiPv = opts.multiPv ?? 2
    this.ready = this.handshake(threads, opts.hashMb ?? 128, this.multiPv)
  }

  private async handshake(threads: number, hashMb: number, multiPv: number) {
    await this.sendAndWait('uci', (l) => l === 'uciok')
    this.send(`setoption name Threads value ${threads}`)
    this.send(`setoption name Hash value ${hashMb}`)
    this.send(`setoption name MultiPV value ${multiPv}`)
    await this.sendAndWait('isready', (l) => l === 'readyok')
  }

  /**
   * Searches to `depth`, or for at most `maxMs` when given, whichever comes
   * first. The cap matters: on a sharp position a fixed depth can take tens of
   * seconds in WASM.
   */
  analyse(fen: string, depth: number, maxMs: number = DEFAULT_MAX_MS, minDepth = 0): Promise<PositionAnalysis> {
    const run = async () => {
      await this.ready
      const whiteToMove = fen.split(' ')[1] === 'w'
      const search = async (go: string) => {
        const lines = new LineCollector()
        await this.sendAndWait(go, (l) => {
          const info = parseInfo(l, whiteToMove)
          if (info) lines.add(info)
          return l.startsWith('bestmove')
        })
        return lines.result()
      }
      this.send(`position fen ${fen}`)
      let result = await search(`go depth ${depth} movetime ${maxMs}`)
      // The time cap stopped it short of the floor: search on to it. The hash
      // still holds the first search, so the shallow plies come back at once.
      if (result.depth < Math.min(minDepth, depth)) {
        const deeper = await search(`go depth ${Math.min(minDepth, depth)} movetime ${FLOOR_MAX_MS}`)
        if (deeper.depth >= result.depth) result = deeper
      }
      return { fen, requestedDepth: depth, ...result }
    }
    return this.enqueue(run)
  }

  /**
   * Streams analysis of one position until `maxDepth`, `maxMs` or `signal`
   * ends it. Aborting stops the search, waits for Stockfish to confirm, and
   * rejects with an AbortError, so the next queued call starts clean. MultiPV
   * is set for this call only.
   */
  analyseLive(fen: string, opts: LiveOptions): Promise<PositionAnalysis> {
    const { multiPv, maxDepth = 22, maxMs = 15000, signal, onUpdate } = opts
    const run = async () => {
      await this.ready
      if (signal.aborted) throw abortError()
      // Stockfish prints fewer lines than MultiPV when there are fewer legal moves.
      const expected = Math.max(1, Math.min(multiPv, legalMoveCount(fen) ?? multiPv))
      const whiteToMove = fen.split(' ')[1] === 'w'
      const lines = new LineCollector()
      if (multiPv !== this.multiPv) this.send(`setoption name MultiPV value ${multiPv}`)
      this.send(`position fen ${fen}`)
      const stop = () => this.send('stop')
      const searching = this.sendAndWait(`go depth ${maxDepth} movetime ${maxMs}`, (l) => {
        const info = parseInfo(l, whiteToMove)
        if (info) {
          lines.add(info)
          if (info.multipv === expected && !signal.aborted) {
            try {
              onUpdate(lines.result())
            } catch (err) {
              console.error(err)
            }
          }
        }
        return l.startsWith('bestmove')
      })
      // Listening only after "go" is sent: a stop that arrives before go is ignored.
      signal.addEventListener('abort', stop, { once: true })
      if (signal.aborted) stop()
      try {
        await searching
      } finally {
        signal.removeEventListener('abort', stop)
        if (multiPv !== this.multiPv && this.alive) this.send(`setoption name MultiPV value ${this.multiPv}`)
      }
      if (signal.aborted) throw abortError()
      return { fen, requestedDepth: maxDepth, ...lines.result() }
    }
    return this.enqueue(run)
  }

  private enqueue<T>(run: () => Promise<T>): Promise<T> {
    const next = this.queue.then(run, run)
    this.queue = next.catch(() => undefined)
    return next
  }

  /** Clears the engine's hash between games so one game's search can't leak into the next. */
  newGame(): Promise<void> {
    const run = async () => {
      await this.ready
      this.send('ucinewgame')
      await this.sendAndWait('isready', (l) => l === 'readyok')
    }
    return this.enqueue(run)
  }

  get alive(): boolean {
    return this.dead === null
  }

  terminate() {
    this.worker.terminate()
    this.fail(new Error('Stockfish was shut down'))
  }

  private fail(err: Error) {
    this.dead = err
    for (const f of this.failures) f(err)
    this.failures.clear()
    this.listeners.clear()
  }

  private send(cmd: string) {
    this.worker.postMessage(cmd)
  }

  private sendAndWait(cmd: string, done: (line: string) => boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.dead) return reject(this.dead)
      const listener = (line: string) => {
        if (!done(line)) return
        this.listeners.delete(listener)
        this.failures.delete(reject)
        resolve()
      }
      this.listeners.add(listener)
      this.failures.add(reject)
      this.send(cmd)
    })
  }
}

// One thread. Measured on an i5-1235U (2 performance + 8 efficiency cores):
// with 8 threads a sharp middlegame had not reached depth 11 after 45 s; with 1
// thread it reached depth 12 in 0.8 s. More threads raise nodes per second
// but the WASM build's threads waste them.
function defaultThreads(): number {
  return 1
}

function legalMoveCount(fen: string): number | null {
  try {
    return new Chess(fen).moves().length
  } catch {
    return null
  }
}

function abortError(): DOMException {
  return new DOMException('Analysis cancelled', 'AbortError')
}
