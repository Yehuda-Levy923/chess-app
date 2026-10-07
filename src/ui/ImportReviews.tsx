import { useEffect, useRef, useState } from 'react'
import { importDownloadedReviews, pendingReviewFiles, type ImportProgress } from '../review/importReviews'

type Props = {
  /** Whether any reviews exist yet; with none and nothing to import, say how to get some */
  hasReviews: boolean
  onImported: () => void
}

/**
 * Brings in reviews computed on GitHub Actions and downloaded with
 * `npm run pull-reviews`. Shown only when there's something to import.
 */
export function ImportReviews({ hasReviews, onImported }: Props) {
  const [pending, setPending] = useState<number | null>(null)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const ctrl = useRef<AbortController | null>(null)

  useEffect(() => {
    let live = true
    pendingReviewFiles()
      .then((n) => live && setPending(n))
      .catch(() => live && setPending(0))
    return () => {
      live = false
    }
  }, [result])

  // Leaving the screen stops the import; files already done stay imported.
  useEffect(() => () => ctrl.current?.abort(), [])

  const start = async () => {
    const c = new AbortController()
    ctrl.current = c
    setResult(null)
    setProgress({ filesDone: 0, files: pending ?? 0, reviews: 0 })
    try {
      const done = await importDownloadedReviews(setProgress, c.signal)
      setResult(done ? `Imported ${done.reviews.toLocaleString()} reviews from ${done.files} ${done.files === 1 ? 'file' : 'files'}.` : 'Nothing to import.')
    } catch (e) {
      setResult(e instanceof DOMException && e.name === 'AbortError' ? 'Import stopped. Finished files stay imported.' : e instanceof Error ? e.message : String(e))
    } finally {
      setProgress(null)
      onImported()
    }
  }

  if (progress) {
    return (
      <div className="batch">
        <p>
          Importing file <span className="num">{Math.min(progress.filesDone + 1, progress.files)}</span> of <span className="num">{progress.files}</span>,{' '}
          <span className="num">{progress.reviews.toLocaleString()}</span> reviews so far
        </p>
        <div className="progress">
          <div style={{ width: `${progress.files ? (progress.filesDone / progress.files) * 100 : 0}%` }} />
        </div>
        <button className="btn" onClick={() => ctrl.current?.abort()}>
          Stop
        </button>
      </div>
    )
  }

  return (
    <>
      {result && !(pending !== null && pending > 0) && <p className="batch dim">{result}</p>}
      {pending !== null && pending > 0 ? (
        <div className="batch import">
          {/* The last result shares this line, so the button doesn't move between Stop and resume. */}
          <p>
            {result && <span className="dim">{result} </span>}
            <span className="num">{pending}</span> downloaded review {pending === 1 ? 'file is' : 'files are'} ready.
          </p>
          <button className="btn btn-primary" onClick={start}>
            Import reviews
          </button>
        </div>
      ) : (
        !hasReviews &&
        pending === 0 && (
          <p className="batch dim">
            Run <code>npm run pull-reviews</code> to download reviews from GitHub, then import them here.
          </p>
        )
      )}
    </>
  )
}
