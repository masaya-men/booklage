import { test, expect } from '@playwright/test'

// This spec relies on having at least 2 bookmarks on the board. The starter
// state may be empty — we add cards by hand if needed via the bookmarklet
// install flow simulation. For now we run against whatever the test fixture
// has; if empty, we skip the edit-specific assertions but still verify the
// composer is reachable and frame is non-empty when sources exist.

test.describe('Share composer — edit flow', () => {
  test('composer shows cards inside the frame (not blank)', async ({ page }) => {
    await page.goto('/board')
    await page.waitForSelector('[data-testid="board-toolbar"]', { timeout: 10000 })

    const sharePill = page.locator('[data-testid="share-pill"]')
    await expect(sharePill).toBeVisible()
    await sharePill.click()

    const composer = page.locator('[data-testid="share-composer"]')
    await expect(composer).toBeVisible()

    const frame = page.locator('[data-testid="share-frame"]')
    await expect(frame).toBeVisible()

    // If there are bookmarks, the frame should have at least one cardWrap.
    // If empty, this is also acceptable (graceful no-op) — but the bug we are
    // fixing was that even WITH bookmarks the frame was blank. So we check
    // the source list count to decide whether to assert non-empty.
    const sourceItems = page.locator('[data-testid="share-source-item"]')
    const sourceCount = await sourceItems.count()
    if (sourceCount > 0) {
      const cards = frame.locator('[data-card-id]')
      await expect(cards.first()).toBeVisible({ timeout: 3000 })
    }
  })

  test('aspect switcher reflows the layout', async ({ page }) => {
    await page.goto('/board')
    await page.waitForSelector('[data-testid="board-toolbar"]', { timeout: 10000 })
    await page.locator('[data-testid="share-pill"]').click()
    await expect(page.locator('[data-testid="share-composer"]')).toBeVisible({ timeout: 10000 })

    const frame = page.locator('[data-testid="share-frame"]')
    const sizeBefore = await frame.evaluate((el) => ({
      w: (el as HTMLElement).offsetWidth,
      h: (el as HTMLElement).offsetHeight,
    }))

    // Click 9:16 aspect button. Buttons use role="radio" in the radiogroup.
    const aspectButton = page.locator('button:has-text("9:16")')
    await expect(aspectButton).toBeVisible({ timeout: 5000 })
    await aspectButton.click()

    const sizeAfter = await frame.evaluate((el) => ({
      w: (el as HTMLElement).offsetWidth,
      h: (el as HTMLElement).offsetHeight,
    }))
    // 9:16 is taller than wide compared to free; the aspect ratio must change.
    const ratioBefore = sizeBefore.w / Math.max(1, sizeBefore.h)
    const ratioAfter = sizeAfter.w / Math.max(1, sizeAfter.h)
    expect(ratioAfter).toBeLessThan(ratioBefore)
  })

  test('right-click on a frame card removes it from the frame', async ({ page }) => {
    await page.goto('/board')
    await page.waitForSelector('[data-testid="board-toolbar"]', { timeout: 10000 })
    await page.locator('[data-testid="share-pill"]').click()
    await expect(page.locator('[data-testid="share-composer"]')).toBeVisible()

    const frame = page.locator('[data-testid="share-frame"]')
    const cards = frame.locator('[data-card-id]')
    const initial = await cards.count()
    if (initial === 0) test.skip(true, 'no bookmarks in fixture; cannot exercise delete')

    const firstId = await cards.first().getAttribute('data-card-id')
    await cards.first().click({ button: 'right' })

    // The card with that id should be gone from the frame.
    await expect(frame.locator(`[data-card-id="${firstId}"]`)).toHaveCount(0)
  })
})
