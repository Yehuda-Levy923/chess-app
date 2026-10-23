import { useCloud } from './cloud'

/** Minutes or hours since an ISO time, for "started 12 min ago". */
function since(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const h = Math.floor(mins / 60)
  return `${h} h ${mins % 60} min ago`
}

/**
 * Where the GitHub reviews stand: the button that sends every unreviewed
 * game, the progress of a run that's going, and what the last import
 * brought in.
 */
export function CloudStatus({ depth }: { depth: number }) {
  const cloud = useCloud()
  if (!cloud || (!cloud.available && !cloud.imported)) return null
  const { active, sent, syncing, imported, error, unreviewed, left } = cloud

  return (
    <div className="cloud">
      {active ? (
        <>
          <p>
            Reviewing on GitHub
            {active.jobs && active.jobs.total > 0 ? (
              <>
                , <span className="num">{active.jobs.done}</span> of <span className="num">{active.jobs.total}</span> {active.jobs.total === 1 ? 'job' : 'jobs'} done
              </>
            ) : null}
            . Started {since(active.createdAt)}. You can close the app; the reviews come in when you next open it.
          </p>
          {active.jobs && active.jobs.total > 0 && (
            <div className="progress">
              <div style={{ width: `${(active.jobs.done / active.jobs.total) * 100}%` }} />
            </div>
          )}
        </>
      ) : sent ? (
        <p className="dim">Sent to GitHub. Waiting for the run to start…</p>
      ) : syncing ? (
        <p className="dim">Fetching finished reviews from GitHub…</p>
      ) : unreviewed > 0 ? (
        <div className="cloud-send">
          <p>
            <span className="num">{unreviewed.toLocaleString()}</span> {unreviewed === 1 ? 'game has' : 'games have'} no review. GitHub can review them while your
            computer is off.
          </p>
          <button className="btn btn-primary" onClick={() => void cloud.reviewAll(depth)}>
            Review {unreviewed === 1 ? 'it' : 'them'} on GitHub
          </button>
        </div>
      ) : null}
      {imported ? (
        <p className="dim">
          Brought in <span className="num">{imported.toLocaleString()}</span> reviews from GitHub.
        </p>
      ) : null}
      {left > 0 && (
        <p className="dim">
          <span className="num">{left.toLocaleString()}</span> more didn't fit in one run; send them again when this one finishes.
        </p>
      )}
      {error && <p className="cloud-error">GitHub: {error}</p>}
    </div>
  )
}
