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
})
