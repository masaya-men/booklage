import { test, expect } from '@playwright/test'

/* The /api/tweet-meta proxy is mocked at the route level so the test does
 * not depend on Twitter syndication availability or rate limits. The mock
 * returns a 2-photo mediaSlots payload that backfillTweetMeta will then
 * write through to IDB. */
test('Phase B: v12 photos-only bookmark gets mediaSlots backfilled within 5s of mount', async ({ page, context }) => {
  // Mock the proxy.
  await context.route('**/api/tweet-meta?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id_str: '12345',
        text: 'two photos',
        photos: [
          { url: 'https://pbs.twimg.com/a.jpg', width: 800, height: 600 },
          { url: 'https://pbs.twimg.com/b.jpg', width: 800, height: 600 },
        ],
        user: { name: 'A', screen_name: 'a' },
      }),
    })
  })

  // Seed a v12 photos-only bookmark.
  await page.addInitScript(() => {
    const open = indexedDB.open('booklage-db', 13)
    open.onupgradeneeded = (): void => {
      const db = open.result
      for (const store of ['bookmarks', 'cards', 'settings', 'preferences', 'moods']) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: store === 'settings' || store === 'preferences' ? 'key' : 'id' })
        }
      }
    }
    open.onsuccess = (): void => {
      const db = open.result
      const tx = db.transaction(['bookmarks', 'cards'], 'readwrite')
      tx.objectStore('bookmarks').put({
        id: 'b1',
        url: 'https://x.com/u/status/12345',
        title: 'old', description: '', thumbnail: '', favicon: '',
        siteName: 'X', type: 'tweet',
        savedAt: new Date().toISOString(),
        ogpStatus: 'fetched', tags: [],
        cardWidth: 240, sizePreset: 'S', orderIndex: 0,
        photos: ['https://pbs.twimg.com/a.jpg', 'https://pbs.twimg.com/b.jpg'],
        // intentionally no mediaSlots field
      })
      tx.objectStore('cards').put({
        id: 'c1', bookmarkId: 'b1', folderId: '',
        x: 240, y: 80, rotation: 0, scale: 1, zIndex: 1,
        gridIndex: 0, isManuallyPlaced: false,
        width: 240, height: 240,
      })
    }
  })

  await page.goto('/board')
  await page.waitForSelector('[data-bookmark-id="b1"]')

  // Wait up to 5s for the queue to drain (200ms interval × 1 task ≈ 200ms
  // dispatch + ~upstream fetch). 5s is generous to absorb CI variance.
  await expect.poll(async () => {
    return await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('booklage-db', 13)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      const tx = db.transaction('bookmarks', 'readonly')
      const get = tx.objectStore('bookmarks').get('b1')
      const bm = await new Promise<{ mediaSlots?: unknown[] } | undefined>((resolve, reject) => {
        get.onsuccess = () => resolve(get.result as never)
        get.onerror = () => reject(get.error)
      })
      return bm?.mediaSlots?.length ?? 0
    })
  }, { timeout: 5000, intervals: [200, 200, 400, 800] }).toBeGreaterThanOrEqual(2)
})
