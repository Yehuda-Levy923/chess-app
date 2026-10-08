import { useEffect, useRef, type RefObject } from 'react'

// One rule for the arrow keys on every board: ← back a move, → forward,
// Home and End to the ends. Screens stay mounted while hidden (so Back keeps
// their state), so a board only listens while it is actually on screen and
// no sheet is open over it.

export type Stepper = {
  back: () => void
  forward: () => void
  first?: () => void
  last?: () => void
}

/** True when a key press belongs to a text field, a menu, or a modifier shortcut. */
export function notForBoard(e: KeyboardEvent): boolean {
  const t = e.target
  if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return true
  return e.ctrlKey || e.metaKey || e.altKey
}

/** True when the element is rendered and no sheet covers it. */
export function onScreen(el: Element | null): boolean {
  if (!el || !el.isConnected || el.closest('[hidden]')) return false
  const overlay = document.querySelector('.sheet')
  return !overlay || overlay.contains(el)
}

export function useBoardKeys(ref: RefObject<Element | null>, stepper: Stepper | null) {
  // Read the latest callbacks without re-binding the listener on every render.
  const latest = useRef(stepper)
  latest.current = stepper

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = latest.current
      if (!s || notForBoard(e) || !onScreen(ref.current)) return
      if (e.key === 'ArrowLeft') s.back()
      else if (e.key === 'ArrowRight') s.forward()
      else if (e.key === 'Home' && s.first) s.first()
      else if (e.key === 'End' && s.last) s.last()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ref])
}
