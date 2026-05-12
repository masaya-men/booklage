import { test, expect, type Page } from '@playwright/test'

const DB_NAME = 'booklage-db'

async function clearDb(page: Page): Promise<void> {
  await page.evaluate(async (dbName) => {
    await new Promise<void>((resolve) => {
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
        tx.onerror = () => resolve()
      }
      req.onerror = () => resolve()
    })
  }, DB_NAME)
}

async function seedMultiImageBookmark(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const req = indexedDB.open('booklage-db')
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(new Error('open failed'))
    })
    const id = 'multi-image-test-1'
    const cardId = 'card-' + id
    const photos = [
      'https://via.placeholder.com/400x300?text=1',
      'https://via.placeholder.com/400x300?text=2',
      'https://via.placeholder.com/400x300?text=3',
      'https://via.placeholder.com/400x300?text=4',
    ]
    const now = new Date().toISOString()
    const tx = db.transaction(['bookmarks', 'cards'], 'readwrite')
    tx.objectStore('bookmarks').put({
      id,
      url: 'https://x.com/test/status/9999',
      title: 'Multi-image test tweet',
      description: '',
      thumbnail: photos[0],
      favicon: '',
      siteName: '',
      type: 'tweet',
      savedAt: now,
      ogpStatus: 'fetched',
      orderIndex: 0,
      cardWidth: 240,
      tags: [],
      displayMode: null,
      photos,
    })
    tx.objectStore('cards').put({
      id: cardId,
      bookmarkId: id,
      folderId: '',
      x: 0,
      y: 0,
      rotation: 0,
      scale: 1,
      zIndex: 0,
      gridIndex: 0,
      isManuallyPlaced: false,
      width: 240,
      height: 180,
      aspectRatio: 4 / 3,
    })
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => { db.close(); reject(new Error('seed tx failed')) }
    })
    return id
  })
}

test.describe('I-07 multi-image hover & lightbox carousel', () => {
  test('card hover swaps image; lightbox dots + ArrowUp/Down nav work', async ({ page }) => {
    await page.goto('/board')
    await page.waitForLoadState('networkidle')
    await clearDb(page)
    const bookmarkId = await seedMultiImageBookmark(page)
    await page.goto('/board')
    await page.waitForSelector(`[data-bookmark-id="${bookmarkId}"]`, { timeout: 10000 })

    const card = page.locator(`[data-bookmark-id="${bookmarkId}"]`)
    const img = card.locator('img').first()

    // Initial: no hover → photos[0] = text=1
    await expect(img).toHaveAttribute('src', /\?text=1$/)

    const box = await card.boundingBox()
    if (!box) throw new Error('no bounding box')

    // Hover math: idx = Math.floor(ratio * photos.length), clamped to [0, length-1].
    // For 4 photos: idx=0 at ratio<0.25, idx=1 at [0.25,0.5), idx=2 at [0.5,0.75),
    // idx=3 at [0.75,1.0]. Pick ratios that hit each bucket center.

    // ratio 0.6 → idx=2 → photos[2] = text=3
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5)
    await expect(img).toHaveAttribute('src', /\?text=3$/)

    // ratio 0.9 → idx=3 → photos[3] = text=4 (last)
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.5)
    await expect(img).toHaveAttribute('src', /\?text=4$/)

    const dots = card.locator('[data-testid="multi-image-dot"]')
    await expect(dots).toHaveCount(4)
    await expect(dots.nth(3)).toHaveAttribute('data-active', 'true')

    // Pointer leaves card → resets to idx=0 (text=1)
    await page.mouse.move(box.x + box.width + 100, box.y + box.height * 0.5)
    await expect(img).toHaveAttribute('src', /\?text=1$/)

    // Open lightbox
    await card.click()
    const lightbox = page.getByTestId('lightbox')
    await expect(lightbox).toBeVisible({ timeout: 3000 })

    const lbImg = lightbox.locator('img').first()
    await expect(lbImg).toHaveAttribute('src', /\?text=1$/)

    // ArrowDown advances forward
    await page.keyboard.press('ArrowDown')
    await expect(lbImg).toHaveAttribute('src', /\?text=2$/)

    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect(lbImg).toHaveAttribute('src', /\?text=4$/)

    // Clamp at last index — ArrowDown at the end is a no-op
    await page.keyboard.press('ArrowDown')
    await expect(lbImg).toHaveAttribute('src', /\?text=4$/)

    // ArrowUp goes back
    await page.keyboard.press('ArrowUp')
    await expect(lbImg).toHaveAttribute('src', /\?text=3$/)

    // Dot click jumps directly
    const lbDots = lightbox.locator('[role="tab"]')
    await expect(lbDots).toHaveCount(4)
    await lbDots.nth(0).click()
    await expect(lbImg).toHaveAttribute('src', /\?text=1$/)

    await page.keyboard.press('Escape')
    await expect(lightbox).toBeHidden({ timeout: 3000 })
  })

  test('single-photo card has no dots and no hover swap', async ({ page }) => {
    await page.goto('/board')
    await page.waitForLoadState('networkidle')
    await clearDb(page)

    const id = await page.evaluate(async () => {
      const req = indexedDB.open('booklage-db')
      const db = await new Promise<IDBDatabase>((resolve) => {
        req.onsuccess = () => resolve(req.result)
      })
      const bid = 'single-photo-test'
      const now = new Date().toISOString()
      const tx = db.transaction(['bookmarks', 'cards'], 'readwrite')
      tx.objectStore('bookmarks').put({
        id: bid,
        url: 'https://example.com/single',
        title: 'Single',
        description: '',
        thumbnail: 'https://via.placeholder.com/400x300?text=ONLY',
        favicon: '',
        siteName: '',
        type: 'website',
        savedAt: now,
        ogpStatus: 'fetched',
        orderIndex: 0,
        cardWidth: 240,
        tags: [],
        displayMode: null,
      })
      tx.objectStore('cards').put({
        id: 'c-' + bid,
        bookmarkId: bid,
        folderId: '',
        x: 0,
        y: 0,
        rotation: 0,
        scale: 1,
        zIndex: 0,
        gridIndex: 0,
        isManuallyPlaced: false,
        width: 240,
        height: 180,
        aspectRatio: 4 / 3,
      })
      await new Promise<void>((resolve) => { tx.oncomplete = () => { db.close(); resolve() } })
      return bid
    })

    await page.goto('/board')
    await page.waitForSelector(`[data-bookmark-id="${id}"]`, { timeout: 10000 })
    const card = page.locator(`[data-bookmark-id="${id}"]`)
    await card.hover()
    await expect(card.locator('[data-testid="multi-image-dot"]')).toHaveCount(0)
  })
})
