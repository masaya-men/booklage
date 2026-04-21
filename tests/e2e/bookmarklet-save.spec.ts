import { test, expect, type Page } from '@playwright/test'

const DB_NAME = 'booklage-db'
const DB_VERSION = 8

async function clearDb(page: Page): Promise<void> {
  await page.evaluate(
    async ({ dbName, dbVersion }) => {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion)
        const timer = window.setTimeout(() => reject(new Error('clearDb open timeout')), 10_000)
        req.onsuccess = () => {
          window.clearTimeout(timer)
          const db = req.result
          const tx = db.transaction(['bookmarks', 'cards', 'folders'], 'readwrite')
          tx.objectStore('bookmarks').clear()
          tx.objectStore('cards').clear()
          tx.objectStore('folders').clear()
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(new Error('clear tx error'))
        }
        req.onerror = () => reject(new Error('open error'))
      })
    },
    { dbName: DB_NAME, dbVersion: DB_VERSION },
  )
}

async function countBookmarks(page: Page): Promise<number> {
  return page.evaluate(
    async ({ dbName, dbVersion }) => {
      return new Promise<number>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction('bookmarks', 'readonly')
          const count = tx.objectStore('bookmarks').count()
          count.onsuccess = () => {
            db.close()
            resolve(count.result)
          }
          count.onerror = () => reject(new Error('count error'))
        }
        req.onerror = () => reject(new Error('open error'))
      })
    },
    { dbName: DB_NAME, dbVersion: DB_VERSION },
  )
}

test.describe('Bookmarklet /save flow', () => {
  test('saves a bookmark via URL params and persists to IDB', async ({ page }) => {
    // Visit the board once to initialize IDB at v8
    await page.goto('/board')
    await page.waitForLoadState('networkidle')
    await clearDb(page)

    // Open /save with fixture OGP params
    const params = new URLSearchParams({
      url: 'https://example.com/article',
      title: 'Example Article',
      image: 'https://example.com/og.png',
      desc: 'Sample description',
      site: 'Example',
      favicon: 'https://example.com/favicon.ico',
    })
    await page.goto(`/save?${params.toString()}`)

    // Preview should show title + site
    await expect(page.getByText('Example Article')).toBeVisible()
    await expect(page.getByText('Example', { exact: true })).toBeVisible()

    // Default folder 'My Collage' gets auto-created; wait for it
    await expect(page.getByText('My Collage')).toBeVisible({ timeout: 5000 })

    // Click save
    await page.getByRole('button', { name: '保存する' }).click()

    // Success state
    await expect(page.getByText('保存しました！')).toBeVisible({ timeout: 5000 })

    // Verify IDB persistence
    const count = await countBookmarks(page)
    expect(count).toBe(1)
  })

  test('shows instructions when opened without url param', async ({ page }) => {
    await page.goto('/save')
    await expect(page.getByText('このページはブックマークレットから開いてください')).toBeVisible()
  })
})
