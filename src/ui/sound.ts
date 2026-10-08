// Board sounds, synthesised with Web Audio so there are no sound files to
// license or load: a short filtered noise burst reads as a piece set down on
// wood, and two soft sine notes make the retry cues. Quiet by design; they
// sit under the UI, not on top of it.

let enabled = true
let ctx: AudioContext | null = null

export function setSoundEnabled(on: boolean) {
  enabled = on
}

function audio(): AudioContext | null {
  if (!enabled || typeof window === 'undefined') return null
  try {
    ctx ??= new AudioContext()
    // Browsers start the context suspended until the first user gesture.
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** A wooden knock: band-passed noise with a fast decay. */
function knock(a: AudioContext, at: number, { freq = 1400, gain = 0.22, decay = 0.07 } = {}) {
  const length = Math.ceil(a.sampleRate * (decay + 0.02))
  const buffer = a.createBuffer(1, length, a.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (a.sampleRate * decay * 0.35))
  const src = a.createBufferSource()
  src.buffer = buffer
  const band = a.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = freq
  band.Q.value = 1.4
  const amp = a.createGain()
  amp.gain.setValueAtTime(gain, at)
  amp.gain.exponentialRampToValueAtTime(0.0001, at + decay)
  src.connect(band).connect(amp).connect(a.destination)
  src.start(at)
  src.stop(at + decay + 0.02)
}

function tone(a: AudioContext, at: number, freq: number, { gain = 0.08, length = 0.18 } = {}) {
  const osc = a.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = freq
  const amp = a.createGain()
  amp.gain.setValueAtTime(0.0001, at)
  amp.gain.exponentialRampToValueAtTime(gain, at + 0.012)
  amp.gain.exponentialRampToValueAtTime(0.0001, at + length)
  osc.connect(amp).connect(a.destination)
  osc.start(at)
  osc.stop(at + length + 0.02)
}

/** The sound for a move, from its SAN: capture, castle and check each sound a little different. */
export function playMove(san: string) {
  const a = audio()
  if (!a) return
  const t = a.currentTime + 0.005
  if (san.startsWith('O-O')) {
    knock(a, t, { freq: 1250 })
    knock(a, t + 0.09, { freq: 1500, gain: 0.18 })
  } else if (san.includes('x')) {
    knock(a, t, { freq: 900, gain: 0.3, decay: 0.09 })
    knock(a, t + 0.035, { freq: 1700, gain: 0.12 })
  } else {
    knock(a, t)
  }
  if (san.includes('#')) tone(a, t + 0.08, 392, { gain: 0.05, length: 0.4 })
  else if (san.includes('+')) tone(a, t + 0.06, 880, { gain: 0.035, length: 0.14 })
}

export type Cue = 'right' | 'wrong' | 'brilliant'

/** Short feedback cues: a rising pair for right, one low note for wrong, a bright triad for brilliant. */
export function playCue(cue: Cue) {
  const a = audio()
  if (!a) return
  const t = a.currentTime + 0.01
  if (cue === 'right') {
    tone(a, t, 659)
    tone(a, t + 0.11, 988)
  } else if (cue === 'wrong') {
    tone(a, t, 220, { gain: 0.06, length: 0.22 })
  } else {
    tone(a, t, 784, { gain: 0.05 })
    tone(a, t + 0.08, 988, { gain: 0.05 })
    tone(a, t + 0.16, 1319, { gain: 0.06, length: 0.32 })
  }
}
