import { test, expect } from '@playwright/test'

test.describe('/save-iframe postMessage flow', () => {
  test('writes a bookmark to IDB on valid booklage:save message', async ({ page }) => {
    await page.goto('/save-iframe')
    await page.waitForSelector('[data-testid="save-iframe-mounted"]', { state: 'attached' })

    // Inject same-origin allowlist hatch so the in-page handler accepts our test message.
    await page.evaluate(() => {
      const w = globalThis as { __BOOKLAGE_ALLOWED_ORIGINS__?: string[] }
      w.__BOOKLAGE_ALLOWED_ORIGINS__ = [window.location.origin]
    })

    // Listen for the result message
    const resultPromise = page.evaluate(() => {
      return new Promise<unknown>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('result timeout')), 5000)
        const listener = (ev: MessageEvent): void => {
          if ((ev.data as { type?: string } | null)?.type === 'booklage:save:result') {
            window.clearTimeout(timer)
            window.removeEventListener('message', listener)
            resolve(ev.data)
          }
        }
        window.addEventListener('message', listener)
      })
    })

    // Post a save message
    await page.evaluate(() => {
      window.postMessage({
        type: 'booklage:save',
        payload: {
          url: 'https://example.com/test-article',
          title: 'Test Article',
          description: 'A test',
          image: 'https://example.com/og.png',
          favicon: 'https://example.com/favicon.ico',
          siteName: 'Example',
          nonce: 'test-nonce-1',
        },
      }, window.location.origin)
    })

    const result = await resultPromise
    expect((result as { ok: boolean }).ok).toBe(true)
    expect((result as { nonce: string }).nonce).toBe('test-nonce-1')
  })

  test('answers booklage:probe with current pipActive state', async ({ page }) => {
    await page.goto('/save-iframe?bookmarklet=1')
    await page.waitForSelector('[data-testid="save-iframe-mounted"]', { state: 'attached' })
    // bookmarklet=1 enables any-origin acceptance, so no allowlist hatch needed.

    // First probe (no presence seen yet) → falls back to queryPipPresence which
    // times out and returns false (no PipCompanion is mounted in this test).
    const result1 = await page.evaluate(() => {
      return new Promise<unknown>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('probe1 timeout')), 1000)
        window.addEventListener('message', function listener(ev: MessageEvent) {
          if ((ev.data as { type?: string } | null)?.type === 'booklage:probe:result') {
            window.clearTimeout(timer)
            window.removeEventListener('message', listener)
            resolve(ev.data)
          }
        })
        window.postMessage({ type: 'booklage:probe', payload: { nonce: 'pq-1' } }, window.location.origin)
      })
    })
    expect((result1 as { pipActive: boolean }).pipActive).toBe(false)
    expect((result1 as { nonce: string }).nonce).toBe('pq-1')

    // Now broadcast a pip:open event manually on the booklage channel — the
    // SaveIframeClient should pick it up via subscribePipPresence and the next
    // probe should answer true.
    await page.evaluate(() => {
      const ch = new BroadcastChannel('booklage')
      ch.postMessage({ type: 'pip:open' })
      ch.close()
    })
    // Small wait for native BC delivery
    await page.waitForTimeout(50)

    const result2 = await page.evaluate(() => {
      return new Promise<unknown>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('probe2 timeout')), 1000)
        window.addEventListener('message', function listener(ev: MessageEvent) {
          if ((ev.data as { type?: string } | null)?.type === 'booklage:probe:result' &&
              (ev.data as { nonce?: string }).nonce === 'pq-2') {
            window.clearTimeout(timer)
            window.removeEventListener('message', listener)
            resolve(ev.data)
          }
        })
        window.postMessage({ type: 'booklage:probe', payload: { nonce: 'pq-2' } }, window.location.origin)
      })
    })
    expect((result2 as { pipActive: boolean }).pipActive).toBe(true)
  })
})
