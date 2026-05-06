import { test, expect, type Page } from '@playwright/test'
import { encodeShareData } from '../../lib/share/encode'
import type { ShareCard, ShareData } from '../../lib/share/types'

// Build a /share#d=... URL with N synthetic cards. Uses encodeShareData
// directly in Node — CompressionStream is available since Node 18.
async function makeShareUrl(n: number): Promise<string> {
  const cards: ShareCard[] = Array.from({ length: n }, (_, i) => ({
    u: `https://example.com/card-${i}`,
    t: `Card ${i}`,
    ty: 'website' as const,
    x: 0.05 + ((i * 0.13) % 0.8),
    y: 0.05 + ((i * 0.17) % 0.8),
    w: 0.18,
    h: 0.18,
    s: 'M' as const,
  }))
  const data: ShareData = { v: 1, aspect: '16:9', cards }
  const encoded = await encodeShareData(data)
  return `/share#d=${encoded}`
}

async function openLightboxOnFirstCard(page: Page): Promise<void> {
  const firstCard = page.locator('[data-testid^="share-frame-card-"]').first()
  await firstCard.click()
  await expect(page.getByTestId('lightbox')).toBeVisible()
}

test.describe('Receive-side Lightbox + nav', () => {
  test('clicking a card opens the Lightbox', async ({ page }) => {
    await page.goto(await makeShareUrl(5))
    await expect(page.getByText('Booklage を試す')).toBeVisible()

    await openLightboxOnFirstCard(page)
    await expect(page.getByTestId('lightbox')).toContainText('Card 0')
  })

  test('arrow keys navigate cards', async ({ page }) => {
    await page.goto(await makeShareUrl(5))
    await openLightboxOnFirstCard(page)

    await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('lightbox')).toContainText('Card 1')

    await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('lightbox')).toContainText('Card 2')

    await page.keyboard.press('ArrowLeft')
    await expect(page.getByTestId('lightbox')).toContainText('Card 1')
  })

  test('arrow right from last loops to first', async ({ page }) => {
    await page.goto(await makeShareUrl(3))
    // Click the last card (index 2)
    await page.locator('[data-testid="share-frame-card-2"]').click()
    await expect(page.getByTestId('lightbox')).toContainText('Card 2')

    await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('lightbox')).toContainText('Card 0')
  })

  test('Esc closes the Lightbox', async ({ page }) => {
    await page.goto(await makeShareUrl(3))
    await openLightboxOnFirstCard(page)

    await page.keyboard.press('Escape')
    // Lightbox close animation is ~500ms — wait for it
    await expect(page.getByTestId('lightbox')).not.toBeVisible({ timeout: 2000 })
  })

  test('corner link reads Booklage を試す', async ({ page }) => {
    await page.goto(await makeShareUrl(3))
    await expect(page.getByText('Booklage を試す')).toBeVisible()
    // Old phrasings must not be present
    await expect(page.getByText('Booklage で表現する')).not.toBeVisible()
    await expect(page.getByText('自分も Booklage を使う')).not.toBeVisible()
  })
})
