// Fire moments, for the Fire theme only: sparks thrown off a square when a
// move or an answer deserves it, and the flames behind the app flaring up.
// Nothing runs when the system asks for reduced motion.

function fireOn(): boolean {
  if (document.documentElement.dataset.theme !== 'fire') return false
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

type Spark = { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number }

/**
 * A burst of sparks from a point on screen. They fly out, rise like embers
 * (hot air carries them up), cool from yellow to red and go out.
 */
export function sparks(x: number, y: number, count = 40) {
  if (!fireOn()) return
  const canvas = document.createElement('canvas')
  const dpr = window.devicePixelRatio || 1
  canvas.width = window.innerWidth * dpr
  canvas.height = window.innerHeight * dpr
  canvas.className = 'sparks'
  canvas.setAttribute('aria-hidden', 'true')
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas.remove()
  ctx.scale(dpr, dpr)

  const list: Spark[] = Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2
    const speed = 60 + Math.random() * 220
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 80,
      age: 0,
      life: 0.6 + Math.random() * 0.9,
      size: 1.2 + Math.random() * 1.8,
    }
  })

  let last = performance.now()
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
    ctx.globalCompositeOperation = 'lighter'
    let alive = 0
    for (const s of list) {
      s.age += dt
      if (s.age >= s.life) continue
      alive++
      // Drag, then lift: the burst slows and the sparks drift upward.
      s.vx *= 1 - 2.2 * dt
      s.vy = s.vy * (1 - 2.2 * dt) - 140 * dt
      s.x += s.vx * dt
      s.y += s.vy * dt
      const t = s.age / s.life
      // Yellow-white when fresh, orange, then a dull red as it dies.
      const g = Math.round(230 - 170 * t)
      const b = Math.round(150 * (1 - t) ** 2)
      // Drawn as a short streak along its path, the way a spark reads to the eye.
      ctx.strokeStyle = `rgba(255, ${g}, ${b}, ${(1 - t) ** 1.4})`
      ctx.lineWidth = s.size * (1 - t * 0.5)
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(s.x - s.vx * 0.025, s.y - s.vy * 0.025)
      ctx.lineTo(s.x, s.y)
      ctx.stroke()
    }
    if (alive) requestAnimationFrame(frame)
    else canvas.remove()
  }
  requestAnimationFrame(frame)
}

/** Sparks from the middle of an element, e.g. the mark on a square. */
export function sparksFrom(el: Element | null, count?: number) {
  if (!el) return
  const r = el.getBoundingClientRect()
  if (r.width === 0) return
  sparks(r.left + r.width / 2, r.top + r.height / 2, count)
}

let flareTimer = 0

/** The flames behind the app flare up for a couple of seconds. */
export function flare() {
  if (!fireOn()) return
  const root = document.documentElement
  // Restart the animation if it's already running.
  window.clearTimeout(flareTimer)
  delete root.dataset.flare
  void root.offsetWidth
  root.dataset.flare = ''
  flareTimer = window.setTimeout(() => delete root.dataset.flare, 2600)
}
