import { test, expect } from '@playwright/test'

test.describe('Share sender flow', () => {
  test('Share pill opens composer; confirm opens action sheet', async ({ page }) => {
    await page.goto('/board')
    await page.waitForSelector('[data-testid="board-top-header"]', { timeout: 10000 })

    // If the board is empty, the share pill still exists but composer will
    // show no source items. We just verify the pill → composer → confirm flow.
    const sharePill = page.locator('[data-testid="share-pill"]')
    await expect(sharePill).toBeVisible()
    await sharePill.click()

    const composer = page.locator('[data-testid="share-composer"]')
    await expect(composer).toBeVisible()

    // Click confirm — even with zero cards, this should generate a (mostly empty) PNG + URL
    await page.getByText(/画像 \+ URL でシェア/).click()

    // Action sheet should appear
    await expect(page.getByText('シェア方法を選ぶ')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('画像をダウンロード')).toBeVisible()
  })
})
