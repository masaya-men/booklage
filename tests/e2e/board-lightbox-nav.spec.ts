import { test, expect, type Page } from '@playwright/test'

// These tests require at least 3 bookmarks on the board. The CI fixture
// is typically empty, so each test guards with test.skip() and gracefully
// no-ops in that case. When run locally against a developer's IndexedDB
// state with bookmarks, all 3 should pass.

async function cardCount(page: Page): Promise<number> {
  return page.locator('[data-card-id]').count()
}

async function openFirstCard(page: Page): Promise<void> {
  await page.locator('[data-card-id]').first().click()
  await expect(page.getByTestId('lightbox')).toBeVisible({ timeout: 3000 })
}

test.describe('Board-side Lightbox nav', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/board')
    await page.waitForSelector('[data-testid="board-toolbar"]', { timeout: 10000 })
  })

  test('arrow keys navigate between cards', async ({ page }) => {
    const count = await cardCount(page)
    test.skip(count < 3, `Need 3+ board cards, found ${count}`)

    await openFirstCard(page)
    const initialText = await page.getByTestId('lightbox').textContent()

    await page.keyboard.press('ArrowRight')
    await expect.poll(
      async () => page.getByTestId('lightbox').textContent(),
      { timeout: 2000 },
    ).not.toBe(initialText)
  })

  test('chevron click navigates', async ({ page }) => {
    const count = await cardCount(page)
    test.skip(count < 3, `Need 3+ board cards, found ${count}`)

    await openFirstCard(page)
    const initialText = await page.getByTestId('lightbox').textContent()

    // Chevron is opacity:0 by default; force-click bypasses the visibility check
    await page.getByLabel('次のカード').click({ force: true })
    await expect.poll(
      async () => page.getByTestId('lightbox').textContent(),
      { timeout: 2000 },
    ).not.toBe(initialText)
  })

  test('dot click jumps to that index', async ({ page }) => {
    const count = await cardCount(page)
    test.skip(count < 3, `Need 3+ board cards, found ${count}`)

    await openFirstCard(page)
    const initialText = await page.getByTestId('lightbox').textContent()

    // Click the 2nd dot (aria-label "カード 2 / N")
    const dotLabel = new RegExp(`^カード 2 / `)
    await page.getByLabel(dotLabel).first().click({ force: true })
    await expect.poll(
      async () => page.getByTestId('lightbox').textContent(),
      { timeout: 2000 },
    ).not.toBe(initialText)
  })
})
