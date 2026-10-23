import { useCallback, useEffect, useState } from 'react'
import { installCli, makeFork, setupStatus, startLogin, type SetupStatus } from '../github/client'
import { useCloud } from './cloud'

type Busy = 'cli' | 'login' | 'fork' | null

/**
 * Sets up reviews on GitHub from Settings: install the GitHub CLI, sign in
 * with a one-time code, and make your own copy of the app on GitHub. A clone
 * that's already connected just says where its reviews run.
 */
export function GithubSetup({ username }: { username: string }) {
  const cloud = useCloud()
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState<{ code: string; url: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const s = await setupStatus()
      setStatus(s)
      return s
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return null
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // While a sign-in code is out, check every few seconds whether it was approved.
  const waiting = !!(code ?? status?.pending) && !status?.login
  useEffect(() => {
    if (!waiting) return
    const t = setInterval(async () => {
      const s = await refresh()
      if (s?.login) setCode(null)
    }, 3000)
    return () => clearInterval(t)
  }, [waiting, refresh])

  const act = async (what: Busy, fn: () => Promise<unknown>) => {
    setBusy(what)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
      await refresh()
    }
  }

  if (!status) return <p className="dim">Checking GitHub…</p>

  const ready = !!status.repo && status.workflow === 'active' && !!status.login
  if (ready && status.clone) {
    return (
      <p>
        Reviews run on <strong>{status.repo}</strong>. Home sends your unreviewed games there.
      </p>
    )
  }

  const shown = code ?? status.pending
  const openGithub = async () => {
    if (!shown) return
    try {
      await navigator.clipboard.writeText(shown.code)
      setCopied(true)
    } catch {
      setCopied(false)
    }
    window.open(shown.url, '_blank', 'noopener')
  }

  return (
    <div className="gh-setup">
      <p className="dim">GitHub reviews your games on its own computers, free, so yours can be off. Three steps, once.</p>
      <ol className="gh-steps">
        <li className={status.cli ? 'done' : ''}>
          <span className="gh-step-name">GitHub's command-line tool</span>
          {status.cli ? (
            <span className="gh-step-state">Installed</span>
          ) : (
            <>
              <button className="btn" disabled={busy !== null} onClick={() => void act('cli', installCli)}>
                {busy === 'cli' ? 'Installing…' : 'Install it'}
              </button>
              <span className="gh-step-note">Windows asks you to allow the installer. Pressing this accepts winget's terms for it.</span>
            </>
          )}
        </li>

        <li className={status.login ? 'done' : ''}>
          <span className="gh-step-name">Your GitHub account</span>
          {status.login ? (
            <span className="gh-step-state">Signed in as {status.login}</span>
          ) : shown ? (
            <>
              <span className="gh-code num">{shown.code}</span>
              <button className="btn btn-primary" onClick={() => void openGithub()}>
                {copied ? 'Copied. Open GitHub again' : 'Copy the code and open GitHub'}
              </button>
              <span className="gh-step-note">Paste the code there and approve. This updates by itself once you have.</span>
            </>
          ) : (
            <>
              <button
                className="btn"
                disabled={!status.cli || busy !== null}
                onClick={() =>
                  void act('login', async () => {
                    setCode(await startLogin())
                  })
                }
              >
                {busy === 'login' ? 'Asking GitHub…' : 'Sign in to GitHub'}
              </button>
              <span className="gh-step-note">No account? Make a free one at github.com first.</span>
            </>
          )}
        </li>

        <li className={ready ? 'done' : ''}>
          <span className="gh-step-name">Your copy of the app on GitHub</span>
          {ready ? (
            <span className="gh-step-state">
              {status.repo}, reviewing {username}
            </span>
          ) : (
            <>
              <button
                className="btn"
                disabled={!status.login || !username || busy !== null}
                onClick={() =>
                  void act('fork', async () => {
                    await makeFork(username)
                    await cloud?.sync()
                  })
                }
              >
                {busy === 'fork' ? 'Making it…' : 'Make my copy'}
              </button>
              {!username && <span className="gh-step-note">Enter your chess.com username above first.</span>}
            </>
          )}
        </li>
      </ol>
      {ready && <p>Done. Home now has "Review them on GitHub", and a daily run reviews your new games.</p>}
      {(error ?? status.error) && <p className="gh-error">{error ?? status.error}</p>}
    </div>
  )
}
