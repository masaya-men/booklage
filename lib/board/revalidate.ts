const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

// Decide whether a bookmark is due for revalidation based on its
// lastCheckedAt timestamp. undefined / null = never checked = due.
export function shouldRevalidate(lastCheckedAt: number | undefined, now: number): boolean {
  if (lastCheckedAt == null) return true
  return now - lastCheckedAt > THIRTY_DAYS_MS
}

export type RevalidationResult =
  | { kind: 'alive'; data?: { title?: string; image?: string; description?: string; favicon?: string; siteName?: string } }
  | { kind: 'gone' }
  | { kind: 'unknown' /* transient failure — do not change status */ }

export type Fetcher = (url: string) => Promise<RevalidationResult>

// Default fetcher hits /api/ogp. 404/410 = gone. 5xx/timeout/network = unknown (transient).
export const defaultFetcher: Fetcher = async (url) => {
  try {
    const res = await fetch(`/api/ogp?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(10_000) })
    if (res.status === 404 || res.status === 410) return { kind: 'gone' }
    if (!res.ok) return { kind: 'unknown' }
    const data = await res.json()
    if (data?.error) return { kind: 'unknown' }
    return { kind: 'alive', data }
  } catch {
    return { kind: 'unknown' }
  }
}

type QueueOptions = {
  readonly fetcher: Fetcher
  readonly maxConcurrent?: number
  readonly onResult?: (bookmarkId: string, result: RevalidationResult) => void | Promise<void>
}

// Bounded-concurrency queue for revalidation fetches. dedup by bookmarkId.
export class RevalidationQueue {
  private inFlight = new Set<string>()
  private pending: Array<{ id: string; url: string }> = []
  private readonly fetcher: Fetcher
  private readonly maxConcurrent: number
  private readonly onResult?: QueueOptions['onResult']

  constructor(opts: QueueOptions) {
    this.fetcher = opts.fetcher
    this.maxConcurrent = opts.maxConcurrent ?? 3
    this.onResult = opts.onResult
  }

  enqueue(id: string, url: string): void {
    if (this.inFlight.has(id)) return
    if (this.pending.some((p) => p.id === id)) return
    this.pending.push({ id, url })
    this.pump()
  }

  private pump(): void {
    while (this.inFlight.size < this.maxConcurrent && this.pending.length > 0) {
      const next = this.pending.shift()
      if (!next) break
      this.inFlight.add(next.id)
      void this.fetcher(next.url)
        .then(async (r) => { await this.onResult?.(next.id, r) })
        .catch(async () => { await this.onResult?.(next.id, { kind: 'unknown' }) })
        .finally(() => {
          this.inFlight.delete(next.id)
          this.pump()
        })
    }
  }
}
