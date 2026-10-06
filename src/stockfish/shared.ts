import { Engine } from './engine'

let engine: Engine | null = null

/**
 * The app's one Stockfish worker. Loading the 94 MB network twice would be
 * pointless; a worker that crashed is replaced on the next call.
 */
export function getEngine(): Engine {
  if (!engine?.alive) engine = new Engine()
  return engine
}

// Stockfish threads were seen running on in Chrome after their page had been
// navigated away from, so shut the worker down explicitly.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    engine?.terminate()
    engine = null
  })
}
