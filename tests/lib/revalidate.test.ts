import { describe, it, expect, vi } from 'vitest'
import { shouldRevalidate, RevalidationQueue } from '@/lib/board/revalidate'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

describe('shouldRevalidate', () => {
  it('returns true for never-checked', () => {
    expect(shouldRevalidate(undefined, Date.now())).toBe(true)
  })

  it('returns true if last check > 30 days ago', () => {
    const old = Date.now() - THIRTY_DAYS_MS - 1000
    expect(shouldRevalidate(old, Date.now())).toBe(true)
  })

  it('returns false for fresh check', () => {
    expect(shouldRevalidate(Date.now() - 1000, Date.now())).toBe(false)
  })

  it('returns false if last check exactly at 30 day boundary', () => {
    const exact = Date.now() - THIRTY_DAYS_MS + 1000
    expect(shouldRevalidate(exact, Date.now())).toBe(false)
  })
})

describe('RevalidationQueue', () => {
  it('limits concurrent fetches to 3', async () => {
    const fetchMock = vi.fn(() =>
      new Promise((resolve) => setTimeout(() => resolve({ kind: 'alive', data: {} }), 50)),
    )
    const queue = new RevalidationQueue({ fetcher: fetchMock as never, maxConcurrent: 3 })
    queue.enqueue('b1', 'https://example.com/1')
    queue.enqueue('b2', 'https://example.com/2')
    queue.enqueue('b3', 'https://example.com/3')
    queue.enqueue('b4', 'https://example.com/4')
    await new Promise((r) => setTimeout(r, 10))
    expect(fetchMock).toHaveBeenCalledTimes(3)
    await new Promise((r) => setTimeout(r, 80))
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('deduplicates same-id enqueues', () => {
    const fetchMock = vi.fn(() => new Promise(() => {}))
    const queue = new RevalidationQueue({ fetcher: fetchMock as never, maxConcurrent: 3 })
    queue.enqueue('b1', 'https://example.com/1')
    queue.enqueue('b1', 'https://example.com/1')
    queue.enqueue('b1', 'https://example.com/1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('invokes onResult callback per result', async () => {
    const results: Array<{ id: string; kind: string }> = []
    const fetchMock = vi.fn(async () => ({ kind: 'gone' as const }))
    const queue = new RevalidationQueue({
      fetcher: fetchMock as never,
      maxConcurrent: 3,
      onResult: (id, r) => { results.push({ id, kind: r.kind }) },
    })
    queue.enqueue('b1', 'https://example.com/dead')
    await new Promise((r) => setTimeout(r, 30))
    expect(results).toEqual([{ id: 'b1', kind: 'gone' }])
  })
})
