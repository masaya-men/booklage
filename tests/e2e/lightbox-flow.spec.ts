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

test('click card → lightbox opens → × closes it', async ({ page }) => {
  await page.goto('/board')
  await page.waitForLoadState('networkidle')
  await clearDb(page)

  // Seed one bookmark via /save
  const params = new URLSearchParams({
    url: 'https://example.com/a', title: 'Hello', image: 'https://via.placeholder.com/200',
    desc: '', site: 'Example', favicon: '',
  })
  await page.goto(`/save?${params.toString()}`)
  await page.waitForSelector('[data-state="saved"]', { timeout: 3000 })

  // Back to board
  await page.goto('/board')
  await page.waitForLoadState('networkidle')

  // Click the card
  await page.getByText('Hello').first().click()
  await expect(page.getByTestId('lightbox')).toBeVisible()

  // Close via button
  await page.getByRole('button', { name: '閉じる' }).click()
  await expect(page.getByTestId('lightbox')).toBeHidden()
})
