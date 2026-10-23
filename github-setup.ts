import { execFile, spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Setting up GitHub reviews from inside the app, for a copy made with
// `npm run share`: install the GitHub CLI, sign in with GitHub's device code,
// fork the repo, turn its review workflow on and store the player's
// username. github-plugin.ts serves these steps to the Settings sheet.

export const UPSTREAM = 'Yehuda-Levy923/chess-app'
const GH_INSTALLED = join(process.env.ProgramFiles ?? 'C:\\Program Files', 'GitHub CLI', 'gh.exe')

/** The gh command: on PATH, or where winget just put it (PATH only updates for new processes). */
export function ghCommand(): string | null {
  if (spawnSync('gh', ['--version'], { windowsHide: true }).status === 0) return 'gh'
  return existsSync(GH_INSTALLED) ? GH_INSTALLED : null
}

function run(cmd: string, args: string[], cwd: string, timeout = 120_000): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (e, out, err) => resolve({ ok: !e, out: String(out).trim(), err: String(err || (e?.message ?? '')).trim() }))
  })
}

/** owner/name from github-repo.txt, if this copy has been set up. */
export function savedRepo(root: string): string | null {
  const file = join(root, 'github-repo.txt')
  if (!existsSync(file)) return null
  const name = readFileSync(file, 'utf8').trim()
  return /^[\w.-]+\/[\w.-]+$/.test(name) ? name : null
}

export type SetupStatus = {
  /** The GitHub CLI is installed */
  cli: boolean
  /** Signed-in GitHub account */
  login: string | null
  /** A device-code sign-in waiting for the user */
  pending: { code: string; url: string } | null
  /** The repository reviews run on: the saved fork, or the clone's own */
  repo: string | null
  /** This copy is a git clone, set up by hand rather than from Settings */
  clone: boolean
  /** The review workflow's state on that repository: active, disabled_fork, ... */
  workflow: string | null
  error: string | null
}

let login: { proc: ChildProcess; code: string | null; url: string; error: string | null } | null = null
let lastError: string | null = null

export async function setupStatus(root: string): Promise<SetupStatus> {
  const gh = ghCommand()
  const base: SetupStatus = { cli: !!gh, login: null, pending: login?.code ? { code: login.code, url: login.url } : null, repo: null, clone: existsSync(join(root, '.git')), workflow: null, error: lastError }
  if (!gh) return base
  const user = await run(gh, ['api', 'user', '--jq', '.login'], root, 20_000)
  if (!user.ok) return base
  base.login = user.out
  base.pending = null
  base.repo = savedRepo(root) ?? (base.clone ? ((await run(gh, ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], root, 20_000)).out || null) : null)
  if (base.repo) {
    const state = await run(gh, ['api', `repos/${base.repo}/actions/workflows/review.yml`, '--jq', '.state'], root, 20_000)
    base.workflow = state.ok ? state.out : null
  }
  return base
}

/** Installs the GitHub CLI with winget. Windows shows its own prompt to allow the installer. */
export async function installCli(root: string): Promise<void> {
  lastError = null
  if (ghCommand()) return
  const r = await run('winget', ['install', '-e', '--id', 'GitHub.cli', '--accept-package-agreements', '--accept-source-agreements'], root, 10 * 60_000)
  if (!ghCommand()) {
    lastError = `Couldn't install the GitHub CLI${r.err ? ` (${r.err.split('\n').slice(-1)[0]})` : ''}. Install it from https://cli.github.com and try again.`
    throw new Error(lastError)
  }
}

/**
 * Starts GitHub's device-code sign-in and returns the code to enter at
 * github.com/login/device. The gh process keeps polling until the code is
 * approved; setupStatus shows the account once it is.
 */
export function startLogin(root: string): Promise<{ code: string; url: string }> {
  lastError = null
  const gh = ghCommand()
  if (!gh) return Promise.reject(new Error('Install the GitHub CLI first.'))
  if (login?.code) return Promise.resolve({ code: login.code, url: login.url })
  return new Promise((resolve, reject) => {
    // The app opens GitHub's page itself, so gh's own browser launch is a no-op.
    const proc = spawn(gh, ['auth', 'login', '--web', '--hostname', 'github.com', '--git-protocol', 'https'], {
      cwd: root,
      windowsHide: true,
      env: { ...process.env, GH_BROWSER: 'cmd /c rem' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const session = { proc, code: null as string | null, url: 'https://github.com/login/device', error: null as string | null }
    login = session
    let text = ''
    const read = (chunk: Buffer) => {
      text += chunk.toString()
      const m = /one-time code:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/.exec(text)
      if (m && !session.code) {
        session.code = m[1]
        resolve({ code: m[1], url: session.url })
      }
    }
    proc.stdout.on('data', read)
    proc.stderr.on('data', read)
    proc.on('exit', (status) => {
      if (login === session) login = null
      if (status !== 0) {
        lastError = /expired/i.test(text) ? 'The code expired. Start the sign-in again.' : 'Signing in to GitHub didn\'t finish. Try again.'
        reject(new Error(lastError))
      }
    })
    setTimeout(() => !session.code && reject(new Error('GitHub didn\'t give a sign-in code. Try again.')), 30_000)
  })
}

/**
 * Forks the app's repo to the signed-in account (or brings an existing fork
 * up to date), turns its review workflow on, stores the chess.com username,
 * and saves the fork in github-repo.txt for the rest of the app.
 */
export async function makeFork(root: string, username: string): Promise<{ repo: string }> {
  lastError = null
  const gh = ghCommand()
  const fail = (text: string): never => {
    lastError = text
    throw new Error(text)
  }
  if (!gh) fail('Install the GitHub CLI first.')
  const me = await run(gh!, ['api', 'user', '--jq', '.login'], root)
  if (!me.ok) fail('Sign in to GitHub first.')
  const fork = `${me.out}/${UPSTREAM.split('/')[1]}`

  if ((await run(gh!, ['repo', 'view', fork, '--json', 'name'], root)).ok) {
    await run(gh!, ['repo', 'sync', fork], root)
  } else {
    const made = await run(gh!, ['repo', 'fork', UPSTREAM, '--clone=false', '--default-branch-only'], root)
    if (!made.ok) fail(`GitHub didn't make the copy: ${made.err.split('\n').slice(-1)[0]}`)
    // Forks are created in the background.
    for (let i = 0; i < 30 && !(await run(gh!, ['repo', 'view', fork, '--json', 'name'], root)).ok; i++) await new Promise((r) => setTimeout(r, 2000))
  }

  // Forks start with Actions off and their workflows paused.
  await run(gh!, ['api', '-X', 'PUT', `repos/${fork}/actions/permissions`, '-F', 'enabled=true', '-f', 'allowed_actions=all'], root)
  await run(gh!, ['workflow', 'enable', 'review.yml', '--repo', fork], root)
  const state = await run(gh!, ['api', `repos/${fork}/actions/workflows/review.yml`, '--jq', '.state'], root)
  if (state.out !== 'active') fail(`GitHub wouldn't let the app turn reviews on. Open https://github.com/${fork}/actions, press the green button to enable workflows, then press "Make my copy" again.`)

  const variable = await run(gh!, ['variable', 'set', 'CHESS_USERNAME', '--body', username, '--repo', fork], root)
  if (!variable.ok) fail(`Couldn't save your chess.com username on GitHub: ${variable.err.split('\n').slice(-1)[0]}`)

  writeFileSync(join(root, 'github-repo.txt'), `${fork}\n`)
  return { repo: fork }
}
