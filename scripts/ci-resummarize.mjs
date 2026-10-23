// Rebuilds review summaries in the current format from reviews the workflow
// made before, and writes them as summary-only lines, which the app's import
// stores without touching the reviews it already has. The tactic flags of the
// old summaries are kept (they're the slow part); everything else is redone.
// Run by .github/workflows/review.yml when `mode` is resummarize.
//
//   node scripts/ci-resummarize.mjs --in prev --out ci-out
import { createReadStream, createWriteStream, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { parseArgs } from 'node:util'
import { createGunzip, createGzip } from 'node:zlib'
import { createServer } from 'vite'

const { values: args } = parseArgs({ options: { in: { type: 'string', default: 'prev' }, out: { type: 'string', default: 'ci-out' } } })

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const { summarize, SUMMARY_FORMAT } = await vite.ssrLoadModule('/src/review/summary.ts')

const files = walk(args.in).filter((f) => f.endsWith('.ndjson.gz')).sort()
console.log(`${files.length} review files`)

// Each review is summarized as it's read and only the summary is kept (2 KB
// against 60 KB). Files sort by run date, so a game reviewed twice keeps its
// latest review's summary.
const latest = new Map()
let failed = 0
for (const file of files) {
  const lines = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity })
  for await (const line of lines) {
    if (!line.trim()) continue
    const { review, summary } = JSON.parse(line)
    if (!review) continue
    try {
      latest.set(`${review.gameId}@${review.depth}`, summarize(review, { tactics: summary?.tactics }))
    } catch (e) {
      failed++
      console.error(`${review.gameId}: ${e instanceof Error ? e.message : e}`)
    }
  }
}

mkdirSync(args.out, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const gzip = createGzip()
const sink = gzip.pipe(createWriteStream(join(args.out, `summaries-${stamp}-format${SUMMARY_FORMAT}.ndjson.gz`)))
for (const summary of latest.values()) gzip.write(JSON.stringify({ summary }) + '\n')
gzip.end()
await new Promise((resolve) => sink.on('finish', resolve))
console.log({ summarized: latest.size, failed, format: SUMMARY_FORMAT })
await vite.close()
process.exit(0)

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}
