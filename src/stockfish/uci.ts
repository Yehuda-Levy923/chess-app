import type { EngineLine, Score } from '../review/types'

export type InfoLine = { depth: number; multipv: number; score: Score; pv: string[] }

/**
 * Parses a UCI "info" line carrying a score and pv. Scores in UCI are from the
 * side to move; `whiteToMove` flips them to White's point of view. Returns null
 * for info lines without a score (currmove, nps, string, ...) and for bounds.
 */
export function parseInfo(line: string, whiteToMove: boolean): InfoLine | null {
  if (!line.startsWith('info ')) return null
  const t = line.split(' ')
  const at = (key: string) => t.indexOf(key)

  const depthAt = at('depth')
  const scoreAt = at('score')
  const pvAt = at('pv')
  if (depthAt < 0 || scoreAt < 0 || pvAt < 0) return null
  if (t[scoreAt + 3] === 'lowerbound' || t[scoreAt + 3] === 'upperbound') return null

  const sign = whiteToMove ? 1 : -1
  const value = Number(t[scoreAt + 2])
  let score: Score
  if (t[scoreAt + 1] === 'cp') score = { kind: 'cp', cp: sign * value }
  else if (t[scoreAt + 1] === 'mate') score = { kind: 'mate', mate: sign * value }
  else return null

  const multipvAt = at('multipv')
  return {
    depth: Number(t[depthAt + 1]),
    multipv: multipvAt < 0 ? 1 : Number(t[multipvAt + 1]),
    score,
    pv: t.slice(pvAt + 1).filter(Boolean),
  }
}

/** Keeps the deepest line seen for each multipv slot and returns them best first. */
export class LineCollector {
  private lines = new Map<number, InfoLine>()

  add(info: InfoLine) {
    const current = this.lines.get(info.multipv)
    if (!current || info.depth >= current.depth) this.lines.set(info.multipv, info)
  }

  result(): { depth: number; lines: EngineLine[] } {
    const sorted = [...this.lines.values()].sort((a, b) => a.multipv - b.multipv)
    return {
      depth: sorted[0]?.depth ?? 0,
      lines: sorted.map(({ score, pv }) => ({ score, pv })),
    }
  }
}
