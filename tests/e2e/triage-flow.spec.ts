import { test, expect, type Page } from '@playwright/test'

const DB_NAME = 'booklage-db'
const DB_VERSION = 9

async function clearDb(page: Page): Promise<void> {
  await page.evaluate(
    async ({ dbName, dbVersion }) => {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction(['bookmarks', 'cards', 'moods'], 'readwrite')
          tx.objectStore('bookmarks').clear()
          tx.objectStore('cards').clear()
          tx.objectStore('moods').clear()
          tx.oncomplete = () => { db.close(); resolve() }
          tx.onerror = () => reject(new Error('clear tx error'))
        }
        req.onerror = () => reject(new Error('open error'))
      })
    },
    { dbName: DB_NAME, dbVersion: DB_VERSION },
  )
}

async function seedBookmarks(page: Page, titles: string[]): Promise<void> {
  for (const title of titles) {
    const params = new URLSearchParams({
      url: `https://example.com/${title}`, title, image: '', desc: '', site: '', favicon: '',
    })
    await page.goto(`/save?${params.toString()}`)
    await page.waitForSelector('[data-state="saved"]', { timeout: 3000 })
  }
}

test('triage: 3 inbox cards tagged via numbered chips → board has mood filter', async ({ page }) => {
  await page.goto('/board')
  await page.waitForLoadState('networkidle')
  await clearDb(page)

  // Seed 3 inbox bookmarks
  await seedBookmarks(page, ['A', 'B', 'C'])

  // Visit board, open triage
  await page.goto('/board')
  await page.getByRole('button', { name: '仕分けを始める' }).click()
  await expect(page).toHaveURL(/\/triage/)
  await expect(page.getByTestId('triage-page')).toBeVisible()

  // Create a new mood on first card
  await page.getByTestId('new-mood-chip').click()
  await page.getByTestId('new-mood-input').fill('design')
  await page.getByTestId('new-mood-input').press('Enter')

  // Second card: use the now-existing chip via "1" key
  await page.waitForTimeout(250)
  await page.keyboard.press('1')

  // Third card: skip
  await page.waitForTimeout(250)
  await page.keyboard.press('s')

  // Return to board
  await page.getByRole('button', { name: 'ボードへ戻る' }).click()
  await expect(page).toHaveURL(/\/board/)

  // Filter by "design" mood via sidebar
  await page.getByRole('button', { name: /design/ }).first().click()
  await expect(page.getByText('A', { exact: true })).toBeVisible()
  await expect(page.getByText('B', { exact: true })).toBeVisible()
})
