import { getMeta, saveReviews, saveSummaries, setMeta } from './cache'
import { SUMMARY_FORMAT, summarize, type GameSummary } from './summary'
import type { Review } from './types'

// Imports reviews made by the "Review games" GitHub workflow. scripts/pull-reviews.mjs
// downloads them into ci-reviews/ and lists them in ci-reviews/index.json; the dev
// server serves that folder, so this only works under `npm run dev`.

const INDEX = '/ci-reviews/index.json'
const IMPORTED = 'importedReviewFiles'
const BATCH = 200

export type ImportProgress = { filesDone: number; files: number; reviews: number }

/** Downloaded review files not imported yet; 0 when there are none or no index. */
export async function pendingReviewFiles(): Promise<number> {
  const files = await listFiles()
  if (!files) return 0
  const imported = new Set((await getMeta<string[]>(IMPORTED)) ?? [])
  return files.filter((f) => !imported.has(f)).length
}

/**
 * Stores every review in the downloaded files that weren't imported before.
 * Each file is read as a stream and saved in batches, so memory stays at about
 * one batch whatever the total. Returns null when there is no index to read.
 */
export async function importDownloadedReviews(onProgress: (p: ImportProgress) => void = () => undefined, signal?: AbortSignal): Promise<{ files: number; reviews: number } | null> {
  const files = await listFiles()
  if (!files) return null
  const imported = new Set((await getMeta<string[]>(IMPORTED)) ?? [])
  const todo = files.filter((f) => !imported.has(f))
  let reviews = 0
  for (let i = 0; i < todo.length; i++) {
    onProgress({ filesDone: i, files: todo.length, reviews })
    const res = await fetch(`/ci-reviews/${todo[i]}`, { signal })
    if (!res.ok) throw new Error(`Couldn't read ${todo[i]} (${res.status}).`)
    let batch: { review: Review; summary: GameSummary }[] = []
    // Lines with only a summary come from the workflow's resummarize run: newer summaries for reviews already here.
    let summariesOnly: GameSummary[] = []
    const flush = async () => {
      if (batch.length) await saveReviews(batch)
      if (summariesOnly.length) await saveSummaries(summariesOnly)
      reviews += batch.length + summariesOnly.length
      batch = []
      summariesOnly = []
      onProgress({ filesDone: i, files: todo.length, reviews })
    }
    for await (const line of lines(await decompressed(res))) {
      if (signal?.aborted) throw new DOMException('Import cancelled', 'AbortError')
      const entry = JSON.parse(line) as { review?: Review; summary: GameSummary }
      if (!entry.review) summariesOnly.push(entry.summary)
      else {
        // Files made before a summary format change: rebuild it, reusing the workflow's tactic checks.
        if ((entry.summary.format ?? 1) < SUMMARY_FORMAT) entry.summary = summarize(entry.review, { tactics: entry.summary.tactics })
        batch.push({ review: entry.review, summary: entry.summary })
      }
      if (batch.length + summariesOnly.length >= BATCH) await flush()
    }
    await flush()
    imported.add(todo[i])
    await setMeta(IMPORTED, [...imported])
  }
  onProgress({ filesDone: todo.length, files: todo.length, reviews })
  return { files: todo.length, reviews }
}

async function listFiles(): Promise<string[] | null> {
  try {
    const res = await fetch(INDEX)
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null
    return ((await res.json()) as { files: string[] }).files
  } catch {
    return null
  }
}

/** The file's text, gunzipped unless the server already did that. */
async function decompressed(res: Response): Promise<ReadableStream<string>> {
  const bytes = await res.arrayBuffer()
  const head = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength))
  const raw = new Blob([bytes]).stream()
  const text = head[0] === 0x1f && head[1] === 0x8b ? raw.pipeThrough(new DecompressionStream('gzip')) : raw
  return text.pipeThrough(new TextDecoderStream())
}

async function* lines(stream: ReadableStream<string>): AsyncGenerator<string> {
  const reader = stream.getReader()
  let rest = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    const parts = (rest + value).split('\n')
    rest = parts.pop()!
    for (const p of parts) if (p.trim()) yield p
  }
  if (rest.trim()) yield rest
}
