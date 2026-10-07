// Fast PGN reading for whole-history stats. chess.js validates every move and
// would take over a minute for ten thousand games; the stats only need the SAN
// text, the clock comments and a few headers, so this reads those directly.

export type ParsedPgn = {
  headers: Record<string, string>
  sans: string[]
  /** Seconds left on the mover's clock after each ply, when the PGN records it */
  clocks: (number | null)[]
}

export function parsePgn(pgn: string): ParsedPgn {
  const headers: Record<string, string> = {}
  const headerRe = /^\[(\w+) "(.*)"\]\s*$/gm
  let m: RegExpExecArray | null
  while ((m = headerRe.exec(pgn))) headers[m[1]] = m[2]

  const body = pgn.replace(/^\[.*\]\s*$/gm, '')
  const sans: string[] = []
  const clocks: (number | null)[] = []
  const tokenRe = /\{([^}]*)\}|(\S+)/g
  while ((m = tokenRe.exec(body))) {
    if (m[1] !== undefined) {
      const clk = /\[%clk (\d+):(\d+):(\d+(?:\.\d+)?)\]/.exec(m[1])
      if (clk && clocks.length > 0 && clocks[clocks.length - 1] === null) {
        clocks[clocks.length - 1] = Number(clk[1]) * 3600 + Number(clk[2]) * 60 + Number(clk[3])
      }
      continue
    }
    const t = m[2]
    if (/^\d+\.+$/.test(t) || /^(1-0|0-1|1\/2-1\/2|\*)$/.test(t) || t.startsWith('$')) continue
    sans.push(t.replace(/^\d+\.+/, '').replace(/[!?]+$/, ''))
    clocks.push(null)
  }
  return { headers, sans, clocks }
}

/** "180+2" → { base: 180, increment: 2 }. Daily games ("1/86400") give null. */
export function parseTimeControl(tc: string): { base: number; increment: number } | null {
  const m = /^(\d+)(?:\+(\d+))?$/.exec(tc)
  if (!m) return null
  return { base: Number(m[1]), increment: Number(m[2] ?? 0) }
}
