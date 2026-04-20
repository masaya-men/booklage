/**
 * In-memory cache to dedupe measurement requests within a session.
 * IDB is the authoritative cache; this just prevents duplicate work
 * for the same card before IDB writes complete.
 */
const inFlightCardIds = new Set<string>()

/**
 * Schedule a measurement-then-persist for a card. Idempotent per cardId
 * within a session. Calls `persist` once with the result (not before
 * idle callback). Caller must ensure persist function uses the
 * `useBoardData` hook's `persistMeasuredAspect`.
 */
export function scheduleMeasurement(
  cardId: string,
  measure: () => Promise<number | null>,
  persist: (cardId: string, aspectRatio: number) => Promise<void>,
): void {
  if (inFlightCardIds.has(cardId)) return
  inFlightCardIds.add(cardId)

  const run = async (): Promise<void> => {
    try {
      const aspect = await measure()
      if (aspect && Number.isFinite(aspect) && aspect > 0) {
        await persist(cardId, aspect)
      }
    } finally {
      inFlightCardIds.delete(cardId)
    }
  }

  // Defer to idle so we don't block the main thread / drag UX
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    ;(window as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(run)
  } else {
    setTimeout(run, 0)
  }
}

export function clearInFlightCache(): void {
  inFlightCardIds.clear()
}
