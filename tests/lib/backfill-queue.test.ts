import { describe, it, expect, vi } from 'vitest'
import { createBackfillQueue } from '@/lib/board/backfill-queue'

const tick = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

describe('createBackfillQueue', () => {
  it('respects maxConcurrent = 3 (max 3 in-flight at any time)', async () => {
    const inFlight: number[] = []
    let maxObserved = 0
    let live = 0
    const q = createBackfillQueue({ maxConcurrent: 3, minIntervalMs: 0 })

    const tasks = Array.from({ length: 12 }).map((_, i) =>
      q.add(async () => {
        live++
        maxObserved = Math.max(maxObserved, live)
        inFlight.push(i)
        await tick(20)
        live--
      }),
    )

    await Promise.all(tasks)
    expect(maxObserved).toBe(3)
    expect(inFlight.length).toBe(12)
  })

  it('respects minIntervalMs between task dispatches', async () => {
    const dispatchTimes: number[] = []
    const q = createBackfillQueue({ maxConcurrent: 1, minIntervalMs: 50 })

    const tasks = Array.from({ length: 4 }).map(() =>
      q.add(async () => {
        dispatchTimes.push(performance.now())
        await tick(5)
      }),
    )
    await Promise.all(tasks)

    // Consecutive dispatches should be >= 50ms apart (allow 5ms scheduling jitter).
    for (let i = 1; i < dispatchTimes.length; i++) {
      const gap = dispatchTimes[i] - dispatchTimes[i - 1]
      expect(gap).toBeGreaterThanOrEqual(45)
    }
  })

  it('AbortController stops pending tasks (in-flight tasks see signal.aborted)', async () => {
    const controller = new AbortController()
    const q = createBackfillQueue({ maxConcurrent: 1, minIntervalMs: 0, signal: controller.signal })
    const completed: number[] = []
    const tasks = Array.from({ length: 6 }).map((_, i) =>
      q.add(async (signal) => {
        await tick(40)
        if (signal.aborted) return
        completed.push(i)
      }),
    )

    // Cancel after the first task should complete (~40ms in).
    await tick(60)
    controller.abort()
    await Promise.allSettled(tasks)

    // First task observed signal.aborted=false at end (completed before abort).
    // Subsequent tasks see signal.aborted=true and return without push.
    expect(completed.length).toBeLessThanOrEqual(2)
    expect(completed.length).toBeGreaterThanOrEqual(1)
  })

  it('isolates a failing task — other tasks continue', async () => {
    const q = createBackfillQueue({ maxConcurrent: 2, minIntervalMs: 0 })
    const seen: number[] = []
    const results = await Promise.allSettled([
      q.add(async () => { seen.push(0) }),
      q.add(async () => { throw new Error('boom') }),
      q.add(async () => { seen.push(2) }),
      q.add(async () => { seen.push(3) }),
    ])
    expect(results[0].status).toBe('fulfilled')
    expect(results[1].status).toBe('rejected')
    expect(results[2].status).toBe('fulfilled')
    expect(results[3].status).toBe('fulfilled')
    expect(seen.sort()).toEqual([0, 2, 3])
  })
})
