import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const saved: string[] = []
const meta = new Map<string, unknown>()
vi.mock('./cache', () => ({
  saveReviews: async (entries: { review: { gameId: string } }[]) => void saved.push(...entries.map((e) => e.review.gameId)),
  getMeta: async (k: string) => meta.get(k),
  setMeta: async (k: string, v: unknown) => void meta.set(k, v),
}))

const { importDownloadedReviews, pendingReviewFiles } = await import('./importReviews')
const { SUMMARY_FORMAT } = await import('./summary')

const ndjson = (ids: string[]) => ids.map((id) => JSON.stringify({ review: { gameId: id }, summary: { gameId: id, format: SUMMARY_FORMAT } })).join('\n') + '\n'

const gzip = (text: string) => new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()

function serve(files: Record<string, ArrayBuffer | string>) {
  vi.stubGlobal('fetch', async (url: string) => {
    if (url === '/ci-reviews/index.json') return new Response(JSON.stringify({ files: Object.keys(files) }), { headers: { 'content-type': 'application/json' } })
    const name = url.replace('/ci-reviews/', '')
    return name in files ? new Response(files[name]) : new Response('missing', { status: 404 })
  })
}

describe('importDownloadedReviews', () => {
  beforeEach(() => {
    saved.length = 0
    meta.clear()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('reads gzipped files and ones the server already unzipped', async () => {
    const many = Array.from({ length: 450 }, (_, i) => `g${i}`)
    serve({ 'a.ndjson.gz': await gzip(ndjson(many)), 'b.ndjson.gz': ndjson(['x', 'y']) })
    expect(await pendingReviewFiles()).toBe(2)
    expect(await importDownloadedReviews()).toEqual({ files: 2, reviews: 452 })
    expect(saved).toEqual([...many, 'x', 'y'])
  })

  it('skips files imported before', async () => {
    serve({ 'a.ndjson.gz': await gzip(ndjson(['1'])) })
    await importDownloadedReviews()
    serve({ 'a.ndjson.gz': await gzip(ndjson(['1'])), 'b.ndjson.gz': await gzip(ndjson(['2'])) })
    expect(await pendingReviewFiles()).toBe(1)
    expect(await importDownloadedReviews()).toEqual({ files: 1, reviews: 1 })
    expect(saved).toEqual(['1', '2'])
  })

  it('is null without an index, as in a production build', async () => {
    vi.stubGlobal('fetch', async () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }))
    expect(await importDownloadedReviews()).toBeNull()
    expect(await pendingReviewFiles()).toBe(0)
  })
})
