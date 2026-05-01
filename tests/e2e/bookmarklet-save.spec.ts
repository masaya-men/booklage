import { test, expect, type Page } from '@playwright/test'

const DB_NAME = 'booklage-db'
const DB_VERSION = 9

async function clearDb(page: Page): Promise<void> {
  await page.evaluate(
    async ({ dbName, dbVersion }) => {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion)
        const timer = window.setTimeout(() => reject(new Error('clearDb open timeout')), 10_000)
        req.onsuccess = () => {
          window.clearTimeout(timer)
          const db = req.result
          const tx = db.transaction(['bookmarks', 'cards'], 'readwrite')
          tx.objectStore('bookmarks').clear()
          tx.objectStore('cards').clear()
          tx.oncomplete = () => { db.close(); resolve() }
          tx.onerror = () => reject(new Error('clear tx error'))
        }
        req.onerror = () => reject(new Error('open error'))
      })
    },
    { dbName: DB_NAME, dbVersion: DB_VERSION },
  )
}

async function readAllBookmarks(page: Page): Promise<Array<{ id: string; tags: string[] }>> {
  return page.evaluate(
    async ({ dbName, dbVersion }) =>
      new Promise<Array<{ id: string; tags: string[] }>>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction('bookmarks', 'readonly')
          const all = tx.objectStore('bookmarks').getAll()
          all.onsuccess = () => {
            db.close()
            resolve(
              (all.result as Array<{ id: string; tags?: string[] }>).map((b) => ({
                id: b.id, tags: b.tags ?? [],
              })),
            )
          }
          all.onerror = () => reject(new Error('getAll error'))
        }
        req.onerror = () => reject(new Error('open error'))
      }),
    { dbName: DB_NAME, dbVersion: DB_VERSION },
  )
}

test.describe('Bookmarklet save toast flow', () => {
  test('auto-saves and shows checkmark', async ({ page }) => {
    await page.goto('/board')
    await page.waitForLoadState('networkidle')
    await clearDb(page)

    const params = new URLSearchParams({
      url: 'https://example.com/article',
      title: 'Example Article',
      image: 'https://example.com/og.png',
      desc: 'Sample description',
      site: 'Example',
      favicon: 'https://example.com/favicon.ico',
    })
    await page.goto(`/save?${params.toString()}`)

    await expect(page.getByTestId('save-toast')).toBeVisible()
    await expect(page.getByTestId('save-toast')).toHaveAttribute('data-state', 'saved', { timeout: 3000 })
    await expect(page.getByText('Inbox に保存しました')).toBeVisible()

    const bookmarks = await readAllBookmarks(page)
    expect(bookmarks).toHaveLength(1)
    expect(bookmarks[0].tags).toEqual([])
  })

  test('shows instructions when opened without url param', async ({ page }) => {
    await page.goto('/save')
    await expect(page.getByText('ブックマークレットから開いてください')).toBeVisible()
  })
})
