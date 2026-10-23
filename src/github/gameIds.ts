// Which games a review run should do, passed to the GitHub workflow as one
// input. Workflow inputs are capped at about 65,000 characters in total, so
// the games go as chess.com's numeric ids, sorted, each written as the gap
// from the one before in base 36: a few characters a game instead of a
// 36-character uuid, enough for every game a player is likely to have.

/** chess.com's numeric id from a game URL, e.g. ".../game/live/123456789" → 123456789. */
export function numericId(url: string): number | null {
  const m = /\/(\d+)(?:[/?#]|$)/.exec(url)
  return m ? Number(m[1]) : null
}

export function encodeIds(ids: number[]): string {
  const sorted = [...new Set(ids)].sort((a, b) => a - b)
  return sorted.map((id, i) => (id - (i ? sorted[i - 1] : 0)).toString(36)).join('.')
}

export function decodeIds(text: string): number[] {
  if (!text.trim()) return []
  let at = 0
  return text
    .trim()
    .split('.')
    .map((gap) => (at += parseInt(gap, 36)))
}

/** The longest encoding one run takes, leaving room for the workflow's other inputs. */
export const MAX_ENCODED = 60_000

/**
 * As many of `newestFirst` as fit in one run, newest first. The rest wait for
 * the next run; about eight thousand games fit.
 */
export function fitting(newestFirst: number[]): number[] {
  let lo = 0
  let hi = newestFirst.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (encodeIds(newestFirst.slice(0, mid)).length <= MAX_ENCODED) lo = mid
    else hi = mid - 1
  }
  return newestFirst.slice(0, lo)
}
