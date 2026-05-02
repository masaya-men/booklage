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

test('save via /save popup → board tab fades in new card without manual refresh', async ({ context }) => {
  const boardPage = await context.newPage()
  await boardPage.goto('/board')
  await boardPage.waitForLoadState('networkidle')
  await clearDb(boardPage)

  const savePage = await context.newPage()
  const params = new URLSearchParams({
    url: 'https://example.com/hello', title: 'Hello', image: '', desc: '', site: 'Example', favicon: '',
  })
  await savePage.goto(`/save?${params.toString()}`)
  await savePage.waitForSelector('[data-state="saved"]', { timeout: 3000 })

  // Board tab should reflect the new card within 2 seconds (BroadcastChannel + reload)
  await expect(boardPage.getByText('Hello').first()).toBeVisible({ timeout: 2000 })
})
