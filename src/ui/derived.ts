// Insights tabs unmount when you switch away, so useMemo can't keep their
// numbers. These are cached against the filtered game list instead: the
// screen keeps that array stable until a filter changes, and once it's gone
// the cache entry goes with it.

const cache = new WeakMap<object, Map<string, unknown>>()

/** `fn()` computed once per `on` object and `key`. */
export function derived<T>(on: object, key: string, fn: () => T): T {
  let entries = cache.get(on)
  if (!entries) {
    entries = new Map()
    cache.set(on, entries)
  }
  if (!entries.has(key)) entries.set(key, fn())
  return entries.get(key) as T
}
