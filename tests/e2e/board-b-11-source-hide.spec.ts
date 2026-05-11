import { test, expect, type Page } from '@playwright/test'

// B-#11: source card is held visibility:hidden on the board for the duration
// of the lightbox session. Chevron-nav must NOT change which card is hidden —
// it always stays the originally clicked card until close.
//
// Seeds 2 bookmarks via /save so the test runs in fresh CI contexts too.

const DB_NAME = 'booklage-db'

async function clearDb(page: Page): Promise<void> {
  await page.evaluate(async (dbName) => {
    await new Promise<void>((resolve, reject) => {
      // Open without version: matches whatever version the app upgraded to.
      const req = indexedDB.open(dbName)
      req.onsuccess = () => {
        const db = req.result
        const stores: string[] = []
        for (const name of Array.from(db.objectStoreNames)) {
          if (['bookmarks', 'cards', 'moods'].includes(name)) stores.push(name)
        }
        if (stores.length === 0) { db.close(); resolve(); return }
        const tx = db.transaction(stores, 'readwrite')
        for (const name of stores) tx.objectStore(name).clear()
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = () => reject(new Error('clear tx error'))
      }
      req.onerror = () => reject(new Error('open error'))
    })
  }, DB_NAME)
}

async function seedBookmark(page: Page, slug: string, title: string): Promise<void> {
  const params = new URLSearchParams({
    url: `https://example.com/${slug}`,
    title,
    image: `https://via.placeholder.com/200?text=${slug}`,
    desc: '',
    site: 'Example',
    favicon: '',
  })
  await page.goto(`/save?${params.toString()}`)
  // /save fast-closes after IDB write; state never reaches 'saved'.
  // Poll IDB directly to confirm the row landed before moving on.
  await page.waitForFunction(
    async (url) => {
      const req = indexedDB.open('booklage-db')
      const db = await new Promise<IDBDatabase | null>((resolve) => {
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(null)
      })
      if (!db) return false
      if (!Array.from(db.objectStoreNames).includes('bookmarks')) { db.close(); return false }
      const tx = db.transaction(['bookmarks'], 'readonly')
      const all = await new Promise<unknown[]>((resolve) => {
        const r = tx.objectStore('bookmarks').getAll()
        r.onsuccess = () => resolve((r.result as unknown[]) ?? [])
        r.onerror = () => resolve([])
      })
      db.close()
      return all.some((b) => (b as { url?: string }).url === url)
    },
    `https://example.com/${slug}`,
    { timeout: 5000 },
  )
}

async function visibilityOf(page: Page, bookmarkId: string): Promise<string> {
  return page.evaluate((id) => {
    const el = document.querySelector<HTMLElement>(`[data-bookmark-id="${id}"]`)
    if (!el) return 'missing'
    return getComputedStyle(el).visibility
  }, bookmarkId)
}

test.describe('B-#11 source card hide', () => {
  test('source card stays hidden across chevron, returns on close', async ({ page }) => {
    await page.goto('/board')
    await page.waitForLoadState('networkidle')
    await clearDb(page)

    await seedBookmark(page, 'a', 'Alpha card')
    await seedBookmark(page, 'b', 'Beta card')

    await page.goto('/board')
    await page.waitForSelector('[data-testid="board-top-header"]', { timeout: 10000 })
    await page.waitForSelector('[data-bookmark-id]', { timeout: 5000 })

    const ids = await page.locator('[data-bookmark-id]').evaluateAll((els) =>
      els.slice(0, 2).map((el) => el.getAttribute('data-bookmark-id') ?? ''),
    )
    const [firstId, secondId] = ids
    expect(firstId).toBeTruthy()
    expect(secondId).toBeTruthy()

    expect(await visibilityOf(page, firstId)).toBe('visible')
    expect(await visibilityOf(page, secondId)).toBe('visible')

    await page.locator(`[data-bookmark-id="${firstId}"]`).click()
    await expect(page.getByTestId('lightbox')).toBeVisible({ timeout: 3000 })

    // First card hidden, second still visible.
    await expect.poll(() => visibilityOf(page, firstId), { timeout: 1500 }).toBe('hidden')
    expect(await visibilityOf(page, secondId)).toBe('visible')

    // Chevron-nav forward. Hidden card MUST stay the source (firstId), not
    // the now-displayed secondId.
    await page.getByLabel('次のカード').click({ force: true })
    await page.waitForTimeout(800)
    expect(await visibilityOf(page, firstId)).toBe('hidden')
    expect(await visibilityOf(page, secondId)).toBe('visible')

    // Close. Source card returns to visible after the close tween (~500ms).
    await page.keyboard.press('Escape')
    await expect.poll(() => visibilityOf(page, firstId), { timeout: 2000 }).toBe('visible')
    expect(await visibilityOf(page, secondId)).toBe('visible')
  })
})
