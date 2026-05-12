/** Generic rate-limit queue for background refreshes.
 *
 *  Why this exists:
 *    Tweet syndication backfill (and similar future backfills) walks every
 *    eligible bookmark on board mount. We want to:
 *      - cap simultaneous in-flight fetches (Twitter rate-limit politeness +
 *        Cloudflare Functions invocation budget protection)
 *      - space out dispatches (= micro-rate-limit) so a burst of 500 tasks
 *        doesn't peg the proxy in <1s
 *      - cleanly cancel everything when the user navigates away
 *
 *  The queue is intentionally tiny — no priorities, no cancellation per
 *  task, no retry. Add those when a concrete need shows up.
 */
export type BackfillQueueOptions = {
  /** Maximum number of tasks running concurrently. */
  readonly maxConcurrent: number
  /** Minimum elapsed time between two task dispatches, ms. */
  readonly minIntervalMs: number
  /** Optional AbortController.signal — when aborted, all pending tasks are
   *  skipped (the runner exits without invoking them) and in-flight tasks
   *  receive the signal so they can early-return. */
  readonly signal?: AbortSignal
}

export type BackfillTask = (signal: AbortSignal) => Promise<void>

export type BackfillQueue = {
  readonly add: (task: BackfillTask) => Promise<void>
}

export function createBackfillQueue(opts: BackfillQueueOptions): BackfillQueue {
  const { maxConcurrent, minIntervalMs } = opts
  // Synthesize a never-firing signal when none is provided so downstream
  // task code can rely on a non-null signal reference.
  const signal: AbortSignal = opts.signal ?? new AbortController().signal

  let inFlight = 0
  let lastDispatchAt = 0
  const pending: Array<{
    task: BackfillTask
    resolve: () => void
    reject: (err: unknown) => void
  }> = []

  const tick = (): void => {
    if (signal.aborted) {
      // Drain pending list — resolve them so awaiters don't hang.
      while (pending.length > 0) {
        const next = pending.shift()
        if (next) next.resolve()
      }
      return
    }
    while (inFlight < maxConcurrent && pending.length > 0) {
      const now = performance.now()
      const wait = Math.max(0, lastDispatchAt + minIntervalMs - now)
      if (wait > 0) {
        // Defer the next dispatch until the interval has elapsed.
        setTimeout(tick, wait)
        return
      }
      const entry = pending.shift()
      if (!entry) return
      inFlight++
      lastDispatchAt = performance.now()
      void Promise.resolve()
        .then(() => entry.task(signal))
        .then(
          () => { entry.resolve() },
          (err) => { entry.reject(err) },
        )
        .finally(() => {
          inFlight--
          tick()
        })
    }
  }

  const add = (task: BackfillTask): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      pending.push({ task, resolve, reject })
      tick()
    })
  }

  return { add }
}
