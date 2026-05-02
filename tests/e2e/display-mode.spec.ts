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
          const tx = db.transaction(['bookmarks', 'cards', 'moods', 'settings'], 'readwrite')
          tx.objectStore('bookmarks').clear()
          tx.objectStore('cards').clear()
          tx.objectStore('moods').clear()
          tx.objectStore('settings').clear()
          tx.oncomplete = () => { db.close(); resolve() }
          tx.onerror = () => reject(new Error('clear tx error'))
        }
        req.onerror = () => reject(new Error('open error'))
      })
    },
    { dbName: DB_NAME, dbVersion: DB_VERSION },
  )
}

test('displayMode pill switches between Visual / Editorial / Native', async ({ page }) => {
  await page.goto('/board')
  await page.waitForLoadState('networkidle')
  await clearDb(page)

  // Seed one bookmark
  await page.goto('/save?' + new URLSearchParams({
    url: 'https://example.com/abc', title: 'Hello', image: 'https://via.placeholder.com/100',
    desc: 'Description long enough to show in editorial', site: 'Example', favicon: '',
  }).toString())
  await page.waitForSelector('[data-state="saved"]', { timeout: 3000 })

  await page.goto('/board')
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('display-mode-pill')).toContainText('Visual')

  await page.getByTestId('display-mode-pill').click()
  await page.getByRole('button', { name: 'Editorial' }).click()
  await expect(page.getByTestId('display-mode-pill')).toContainText('Editorial')

  await page.getByTestId('display-mode-pill').click()
  await page.getByRole('button', { name: 'Native' }).click()
  await expect(page.getByTestId('display-mode-pill')).toContainText('Native')

  // Persistence across reload
  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('display-mode-pill')).toContainText('Native')
})
