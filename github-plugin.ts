import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { ghCommand, installCli, makeFork, savedRepo, setupStatus, startLogin } from './github-setup.ts'
import { encodeIds, fitting } from './src/github/gameIds.ts'

// Lets the app hand reviews to the "Review games" GitHub workflow and fetch
// the results, through the GitHub CLI you're signed in with: no token ever
// reaches the browser. Dev server only (the app always runs under it).
//
//   GET  /api/github/runs         recent runs, with job progress for running ones
//   POST /api/github/review       { ids, username, depth }: review these games
//   POST /api/github/resummarize  rebuild every summary in the current format
//   POST /api/github/pull         download finished runs into ci-reviews/
//   GET  /api/github/setup        where setting up stands (github-setup.ts)
//   POST /api/github/setup/cli    install the GitHub CLI
//   POST /api/github/setup/login  start a device-code sign-in
//   POST /api/github/setup/fork   { username }: fork, turn reviews on, save it
//
// Any page in the browser can send requests to localhost, so each request has
// to carry the X-Chess-App header (a cross-site page can't add one without a
// CORS preflight, which this never answers) and, when the browser says where
// it came from, come from this server's own origin.
//
// Which repository: github-repo.txt ("owner/name") when it's there, which is
// how a copy made with `npm run share` points at its owner's fork (setting
// up from Settings writes it); otherwise the git clone the app runs in.

const WORKFLOW = 'review.yml'

/** `--repo owner/name` from github-repo.txt, or nothing to use the clone's own remote. */
export function repoArgs(root: string): string[] {
  const name = savedRepo(root)
  return name ? ['--repo', name] : []
}

type Json = Record<string, unknown> | unknown[]

function run(cmd: string, args: string[], cwd: string, timeout = 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, timeout, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).trim().split('\n').slice(-3).join(' ')))
      else resolve(stdout)
    })
  })
}

function send(res: ServerResponse, status: number, body: Json) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let text = ''
  for await (const chunk of req) {
    text += chunk
    if (text.length > 2_000_000) throw new Error('Request too large')
  }
  return text ? (JSON.parse(text) as Record<string, unknown>) : {}
}

function allowed(req: IncomingMessage): boolean {
  if (req.headers['x-chess-app'] !== '1') return false
  const origin = req.headers.origin
  return !origin || origin === `http://${req.headers.host}`
}

/** Parallel jobs for a run: one per ~40 games, up to the workflow's usual 16. */
function shardsFor(games: number): number {
  return Math.max(1, Math.min(16, Math.ceil(games / 40)))
}

export function githubPlugin(): Plugin {
  return {
    name: 'chess-app-github',
    configureServer(server) {
      const root = server.config.root
      // Every gh command here takes --repo; read the file each time so setting it up needs no restart.
      const gh = (...args: string[]) => run(ghCommand() ?? 'gh', [...args, ...repoArgs(root)], root)

      server.middlewares.use('/api/github', async (req, res) => {
        if (!allowed(req)) return send(res, 403, { error: 'Not allowed' })
        try {
          const path = (req.url ?? '').split('?')[0]
          if (req.method === 'GET' && path === '/runs') return send(res, 200, await runs(gh, root))
          if (req.method === 'GET' && path === '/setup') return send(res, 200, await setupStatus(root))
          if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' })

          if (path === '/review') {
            const body = await readBody(req)
            const ids = (Array.isArray(body.ids) ? body.ids : []).filter((x): x is number => typeof x === 'number' && Number.isSafeInteger(x))
            const username = typeof body.username === 'string' && /^[\w-]{1,40}$/.test(body.username) ? body.username : null
            const depth = [16, 18, 20].includes(Number(body.depth)) ? Number(body.depth) : 16
            if (!username || ids.length === 0) return send(res, 400, { error: 'No games to send' })
            const sent = fitting(ids)
            await gh('workflow', 'run', WORKFLOW, '-f', 'mode=review', '-f', `username=${username}`, '-f', `game_ids=${encodeIds(sent)}`, '-f', `depth=${depth}`, '-f', `shards=${shardsFor(sent.length)}`, '-f', 'since_days=0')
            return send(res, 200, { sent: sent.length, left: ids.length - sent.length })
          }
          if (path === '/resummarize') {
            await gh('workflow', 'run', WORKFLOW, '-f', 'mode=resummarize')
            return send(res, 200, { started: true })
          }
          if (path === '/setup/cli') {
            await installCli(root)
            return send(res, 200, await setupStatus(root))
          }
          if (path === '/setup/login') return send(res, 200, await startLogin(root))
          if (path === '/setup/fork') {
            const body = await readBody(req)
            const username = typeof body.username === 'string' && /^[\w-]{1,40}$/.test(body.username) ? body.username : null
            if (!username) return send(res, 400, { error: 'Enter your chess.com username first.' })
            return send(res, 200, await makeFork(root, username))
          }
          if (path === '/pull') {
            const out = await run(process.execPath, ['scripts/pull-reviews.mjs'], root, 15 * 60_000)
            return send(res, 200, { log: out.trim().split('\n').slice(-6) })
          }
          return send(res, 404, { error: 'Unknown endpoint' })
        } catch (e) {
          return send(res, 500, { error: e instanceof Error ? e.message : String(e) })
        }
      })
    },
  }
}

type Run = { databaseId: number; status: string; conclusion: string; event: string; createdAt: string; updatedAt: string; displayTitle: string }

/** The last few runs; running ones say how many of their jobs are done. */
async function runs(gh: (...a: string[]) => Promise<string>, root: string) {
  const list = JSON.parse(await gh('run', 'list', '--workflow', WORKFLOW, '--limit', '10', '--json', 'databaseId,status,conclusion,event,createdAt,updatedAt,displayTitle')) as Run[]
  const downloadedFile = join(root, 'ci-reviews', 'downloaded-runs.json')
  const downloaded = new Set<number>(existsSync(downloadedFile) ? (JSON.parse(readFileSync(downloadedFile, 'utf8')) as number[]) : [])
  return Promise.all(
    list.map(async (r) => {
      let jobs: { done: number; total: number } | null = null
      if (r.status !== 'completed') {
        const view = JSON.parse(await gh('run', 'view', String(r.databaseId), '--json', 'jobs')) as { jobs: { name: string; status: string; conclusion: string }[] }
        // Count the jobs doing the work: not the plan job, nor the mode's skipped one.
        const work = view.jobs.filter((j) => j.name !== 'plan' && j.conclusion !== 'skipped')
        jobs = { done: work.filter((j) => j.status === 'completed').length, total: work.length }
      }
      return { id: r.databaseId, status: r.status, conclusion: r.conclusion, event: r.event, createdAt: r.createdAt, updatedAt: r.updatedAt, jobs, downloaded: downloaded.has(r.databaseId) }
    }),
  )
}
