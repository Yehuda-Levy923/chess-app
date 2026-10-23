// The app's side of github-plugin.ts: starting review runs on GitHub and
// fetching what they made. Only works under the dev server, which is how the
// app always runs.

export type CloudRun = {
  id: number
  status: string
  conclusion: string
  event: string
  createdAt: string
  updatedAt: string
  /** Review jobs done, for a run that hasn't finished */
  jobs: { done: number; total: number } | null
  downloaded: boolean
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/github${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'X-Chess-App': '1', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(data.error ?? `GitHub request failed (${res.status})`)
  return data
}

export const cloudRuns = () => call<CloudRun[]>('/runs')

/** Starts a run for these games (chess.com numeric ids, newest first). Says how many didn't fit. */
export const sendForReview = (ids: number[], username: string, depth: number) => call<{ sent: number; left: number }>('/review', { ids, username, depth })

export const startResummarize = () => call<{ started: boolean }>('/resummarize', {})

/** Downloads every finished run not downloaded before into ci-reviews/. */
export const pullFinished = () => call<{ log: string[] }>('/pull', {})

/** Where setting up GitHub reviews stands; see github-setup.ts. */
export type SetupStatus = {
  cli: boolean
  login: string | null
  pending: { code: string; url: string } | null
  repo: string | null
  clone: boolean
  workflow: string | null
  error: string | null
}

export const setupStatus = () => call<SetupStatus>('/setup')

export const installCli = () => call<SetupStatus>('/setup/cli', {})

/** Starts GitHub's device sign-in: enter the code at the url. */
export const startLogin = () => call<{ code: string; url: string }>('/setup/login', {})

/** Forks the app to the signed-in account, turns reviews on, and saves the username there. */
export const makeFork = (username: string) => call<{ repo: string }>('/setup/fork', { username })
