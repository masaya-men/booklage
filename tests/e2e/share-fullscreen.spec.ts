import { test, expect } from '@playwright/test'

/* These tests assume:
 *  - The board /board page loads the share button.
 *  - Some bookmarks exist (re-uses share-composer-edit fixture pattern).
 *  - The viewport is desktop (1280x800) by default in playwright.config.
 */

const openComposer = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.goto('/board')
  await page.waitForSelector('[data-testid="board-toolbar"]', { timeout: 10000 })
  await page.locator('[data-testid="share-pill"]').click()
  await expect(page.locator('[data-testid="share-composer"]')).toBeVisible({ timeout: 10000 })
}

test.describe('Share composer — fullscreen / preview mode', () => {
  test('⛶ button toggles preview mode (modal expands, chrome auto-hides)', async ({ page }) => {
    await openComposer(page)
    const modal = page.locator('[data-testid="share-composer"]')
    await expect(modal).toHaveAttribute('data-mode', 'layout')

    await page.locator('[data-testid="share-fullscreen-btn"]').click()
    await expect(modal).toHaveAttribute('data-mode', 'preview')

    // Modal should fill the viewport (within transition tolerance).
    // Viewport is 1280x800; preview modal morphs to near-full-screen.
    const box = await modal.boundingBox()
    expect(box?.width).toBeGreaterThan(1200)
    expect(box?.height).toBeGreaterThan(650)
  })

  test('F key toggles preview mode', async ({ page }) => {
    await openComposer(page)
    const modal = page.locator('[data-testid="share-composer"]')

    await page.keyboard.press('f')
    await expect(modal).toHaveAttribute('data-mode', 'preview')

    await page.keyboard.press('f')
    await expect(modal).toHaveAttribute('data-mode', 'layout')
  })

  test('Esc cascade: preview → layout → close', async ({ page }) => {
    await openComposer(page)
    const modal = page.locator('[data-testid="share-composer"]')

    await page.keyboard.press('f')
    await expect(modal).toHaveAttribute('data-mode', 'preview')

    await page.keyboard.press('Escape')
    await expect(modal).toHaveAttribute('data-mode', 'layout')

    await page.keyboard.press('Escape')
    await expect(modal).not.toBeVisible()
  })

  test('H/S/B keys pin individual chrome (preview only)', async ({ page }) => {
    await openComposer(page)
    const modal = page.locator('[data-testid="share-composer"]')

    // In layout mode, H/S/B do nothing.
    await page.keyboard.press('h')
    await expect(modal).toHaveAttribute('data-pin-h', 'false')

    await page.keyboard.press('f') // → preview
    await page.keyboard.press('h')
    await expect(modal).toHaveAttribute('data-pin-h', 'true')

    await page.keyboard.press('s')
    await expect(modal).toHaveAttribute('data-pin-s', 'true')

    await page.keyboard.press('b')
    await expect(modal).toHaveAttribute('data-pin-b', 'true')

    // Toggle off
    await page.keyboard.press('h')
    await expect(modal).toHaveAttribute('data-pin-h', 'false')
  })

  test('toggleMode resets pins', async ({ page }) => {
    await openComposer(page)
    const modal = page.locator('[data-testid="share-composer"]')

    await page.keyboard.press('f') // preview
    await page.keyboard.press('h')
    await page.keyboard.press('s')
    await expect(modal).toHaveAttribute('data-pin-h', 'true')

    await page.keyboard.press('f') // layout
    await expect(modal).toHaveAttribute('data-pin-h', 'false')
    await expect(modal).toHaveAttribute('data-pin-s', 'false')
  })

  test('? toggles help overlay; Esc closes help before falling through', async ({ page }) => {
    await openComposer(page)
    const help = page.locator('[role="dialog"][aria-label="Keyboard shortcuts"]')
    const modal = page.locator('[data-testid="share-composer"]')

    await expect(help).toHaveCount(0)
    await page.keyboard.press('?')
    await expect(help).toBeVisible()

    // Even in preview mode, Esc should close help first, NOT exit preview.
    await page.keyboard.press('f')
    await expect(modal).toHaveAttribute('data-mode', 'preview')
    await page.keyboard.press('?')
    await expect(help).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(help).toHaveCount(0)
    await expect(modal).toHaveAttribute('data-mode', 'preview') // still preview
  })

  test('aspect switcher reachable in preview via header pin', async ({ page }) => {
    await openComposer(page)
    const modal = page.locator('[data-testid="share-composer"]')

    await page.keyboard.press('f') // preview
    await page.keyboard.press('h') // pin header so aspect switcher is reachable
    await expect(modal).toHaveAttribute('data-pin-h', 'true')

    const frame = page.locator('[data-testid="share-frame"]')
    const before = await frame.boundingBox()
    // The 9:16 button is icon-only with data-aspect="9:16" (no visible text label).
    await page.locator('[data-aspect="9:16"]').click()
    await page.waitForTimeout(400) // allow reflow
    const after = await frame.boundingBox()
    // 9:16 frame is taller than wide; before (free / wide viewport) should differ.
    expect(after?.width).not.toBe(before?.width)
  })

  test('source panel overlays canvas in preview (board card positions stable)', async ({ page }) => {
    await openComposer(page)
    const modal = page.locator('[data-testid="share-composer"]')

    await page.keyboard.press('f')
    // Capture a representative card position BEFORE pinning source.
    const card = page.locator('[data-card-id]').first()
    const beforeCount = await card.count()
    if (beforeCount === 0) {
      // Empty board — skip this assertion gracefully.
      test.skip(true, 'No bookmarks present; cannot verify card position stability')
      return
    }
    const posBefore = await card.boundingBox()

    await page.keyboard.press('s') // pin source list
    await expect(modal).toHaveAttribute('data-pin-s', 'true')
    await page.waitForTimeout(400)

    const posAfter = await card.boundingBox()
    // Overlay behavior: card position must NOT shift when source pins in.
    expect(posAfter?.x).toBeCloseTo(posBefore?.x ?? 0, 0)
    expect(posAfter?.y).toBeCloseTo(posBefore?.y ?? 0, 0)
  })

  test('keyboard shortcuts ignored when typing in inputs', async ({ page }) => {
    await openComposer(page)
    const modal = page.locator('[data-testid="share-composer"]')

    // The composer has no top-level input by default. Inject a temporary
    // input to verify the focus-guard. (If the composer adds inputs later,
    // assert against the real one.)
    await page.evaluate(() => {
      const input = document.createElement('input')
      input.id = '__test_input'
      input.type = 'text'
      document.body.appendChild(input)
      input.focus()
    })

    await page.keyboard.press('f')
    await expect(modal).toHaveAttribute('data-mode', 'layout') // F was swallowed by input

    await page.evaluate(() => document.getElementById('__test_input')?.remove())
  })

  test('touch / coarse pointer hides ⛶ button', async ({ browser }) => {
    const context = await browser.newContext({ hasTouch: true, isMobile: false })
    const page = await context.newPage()
    // Force the matchMedia result; Playwright's hasTouch may not be enough
    // on its own to flip (hover: hover) and (pointer: fine). Use addInitScript.
    await page.addInitScript(() => {
      const original = window.matchMedia
      window.matchMedia = (q: string) => {
        if (q.includes('hover: hover') || q.includes('pointer: fine')) {
          return { ...original(q), matches: false } as MediaQueryList
        }
        return original(q)
      }
    })
    await page.goto('/board')
    await page.waitForSelector('[data-testid="board-toolbar"]', { timeout: 10000 })
    await page.locator('[data-testid="share-pill"]').click()
    await expect(page.locator('[data-testid="share-composer"]')).toBeVisible()

    await expect(page.locator('[data-testid="share-fullscreen-btn"]')).toHaveCount(0)

    // F key has no effect either.
    await page.keyboard.press('f')
    await expect(page.locator('[data-testid="share-composer"]')).toHaveAttribute('data-mode', 'layout')

    await context.close()
  })
})
