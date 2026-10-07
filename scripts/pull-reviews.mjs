// Downloads the reviews made by the "Review games" workflow into ci-reviews/
// (gitignored) and lists them in ci-reviews/index.json, which Insights reads
// to import them. Runs already downloaded are skipped. Needs the GitHub CLI,
// signed in to an account that can read the repo.
//
//   npm run pull-reviews
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const DIR = 'ci-reviews'
const DONE = join(DIR, 'downloaded-runs.json')
mkdirSync(DIR, { recursive: true })

const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

const done = new Set(existsSync(DONE) ? JSON.parse(readFileSync(DONE, 'utf8')) : [])
// Failed runs count too: a run where one job timed out still has the other jobs' reviews.
const runs = JSON.parse(gh('run', 'list', '--workflow', 'review.yml', '--status', 'completed', '--limit', '200', '--json', 'databaseId,conclusion,createdAt'))
for (const run of runs) {
  if (done.has(run.databaseId) || (run.conclusion === 'cancelled' && !hasArtifacts(run.databaseId))) continue
  process.stdout.write(`run ${run.databaseId} (${run.createdAt}, ${run.conclusion}): `)
  try {
    gh('run', 'download', String(run.databaseId), '--dir', join(DIR, `run-${run.databaseId}`))
    console.log('downloaded')
  } catch (e) {
    // Artifacts expire after 90 days, and a run that failed early has none.
    console.log(`nothing to download (${String(e.stderr ?? e.message).trim().split('\n')[0]})`)
  }
  done.add(run.databaseId)
}
writeFileSync(DONE, JSON.stringify([...done]))

const files = walk(DIR).filter((f) => f.endsWith('.ndjson.gz')).map((f) => relative(DIR, f).replaceAll('\\', '/')).sort()
writeFileSync(join(DIR, 'index.json'), JSON.stringify({ files }))
const mb = files.reduce((s, f) => s + statSync(join(DIR, f)).size, 0) / 1e6
console.log(`${files.length} review files (${mb.toFixed(1)} MB) listed in ${DIR}/index.json. Open Insights and import them.`)

function hasArtifacts(id) {
  try {
    return JSON.parse(gh('api', `repos/{owner}/{repo}/actions/runs/${id}/artifacts`, '--jq', '.total_count')) > 0
  } catch {
    return false
  }
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}
