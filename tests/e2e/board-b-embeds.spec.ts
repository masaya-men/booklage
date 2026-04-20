import { test, expect, type Page } from '@playwright/test'

const DB_NAME = 'booklage-db'

type BookmarkSeed = {
  id: string
  url: string
  title: string
  thumbnail: string
}

type CardSeed = {
  id: string
  bookmarkId: string
  width: number
  height: number
}

/**
 * Open the existing IDB (version 8), clear bookmarks+cards stores, then insert one record pair.
 * We do NOT delete the DB — the app holds the connection open and deleteDatabase would block.
 */
async function seedOne(page: Page, bookmark: BookmarkSeed, card: CardSeed): Promise<void> {
  await page.evaluate(
    async ({ dbName, bm, c }) => {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName, 8)
        const timer = window.setTimeout(() => reject(new Error('seedOne open timeout')), 10_000)
        req.onsuccess = () => {
          window.clearTimeout(timer)
          const db = req.result
          const tx = db.transaction(['bookmarks', 'cards'], 'readwrite')
          const bStore = tx.objectStore('bookmarks')
          const cStore = tx.objectStore('cards')
          // Clear existing records so each test starts fresh
          bStore.clear()
          cStore.clear()
          const now = new Date().toISOString()
          bStore.put({
            id: bm.id,
            url: bm.url,
            title: bm.title,
            description: '',
            thumbnail: bm.thumbnail,
            favicon: '',
            siteName: '',
            type: 'website',
            savedAt: now,
            folderId: 'default',
            ogpStatus: 'fetched',
            sizePreset: 'M',
            orderIndex: 0,
          })
          cStore.put({
            id: c.id,
            bookmarkId: bm.id,
            folderId: 'default',
            x: 0,
            y: 0,
            rotation: 0,
            scale: 1,
            zIndex: 0,
            gridIndex: 0,
            isManuallyPlaced: false,
            width: c.width,
            height: c.height,
          })
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => {
            db.close()
            reject(tx.error)
          }
        }
        req.onerror = () => {
          window.clearTimeout(timer)
          reject(req.error)
        }
        req.onblocked = () => {
          window.clearTimeout(timer)
          reject(new Error('seedOne open blocked'))
        }
      })
    },
    { dbName: DB_NAME, bm: bookmark, c: card },
  )
}

test.describe('B-embeds card rendering', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate first so IDB context belongs to the app origin and DB is initialised
    await page.goto('/board')
    await page.locator('[data-theme-id]').first().waitFor({ timeout: 15_000 })
    await page.waitForTimeout(500)
  })

  test('White-card source renders as TextCard (not blank)', async ({ page }) => {
    await seedOne(
      page,
      { id: 'tc-bm-1', url: 'https://r3f.maximeheckel.com/lens2', title: 'Lens 2', thumbnail: '' },
      { id: 'tc-c-1', bookmarkId: 'tc-bm-1', width: 280, height: 360 },
    )
    await page.reload()
    await page.locator('[data-card-id]').first().waitFor({ timeout: 10_000 })

    const card = page.locator('[data-card-id]').first()
    await expect(card).toBeVisible()

    // Title text rendered inside card
    await expect(card.getByText('Lens 2')).toBeVisible()

    // Favicon from Google S2 service
    const favicon = card.locator('img[src*="google.com/s2/favicons"]')
    await expect(favicon).toBeVisible()
  })

  test('YouTube card renders thumbnail with play overlay', async ({ page }) => {
    await seedOne(
      page,
      {
        id: 'yt-bm-1',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Test YT',
        thumbnail: '',
      },
      { id: 'yt-c-1', bookmarkId: 'yt-bm-1', width: 480, height: 270 },
    )
    await page.reload()
    await page.locator('[data-card-id]').first().waitFor({ timeout: 10_000 })

    const card = page.locator('[data-card-id]').first()
    await expect(card).toBeVisible()

    // YouTube thumbnail uses ytimg.com with the video ID in the path
    const thumb = card.locator('img[src*="ytimg.com/vi/dQw4w9WgXcQ"]')
    await expect(thumb).toBeVisible({ timeout: 5_000 })

    // Play overlay SVG icon
    const playPath = card.locator('path[d^="M8 5"]')
    await expect(playPath).toHaveCount(1)
  })

  test('TikTok card renders with play overlay', async ({ page }) => {
    await seedOne(
      page,
      {
        id: 'tt-bm-1',
        url: 'https://www.tiktok.com/@user/video/12345',
        title: 'TikTok test',
        thumbnail: '',
      },
      { id: 'tt-c-1', bookmarkId: 'tt-bm-1', width: 270, height: 480 },
    )
    await page.reload()
    await page.locator('[data-card-id]').first().waitFor({ timeout: 10_000 })

    const card = page.locator('[data-card-id]').first()
    await expect(card).toBeVisible()

    // TikTok oEmbed is slow/blocked in CI — assert the VideoThumbCard shell rendered.
    // Either the placeholder div (no thumb yet) or the play overlay SVG confirms it.
    // The play overlay is always rendered regardless of thumbnail fetch status.
    const playPath = card.locator('path[d^="M8 5"]')
    await expect(playPath).toHaveCount(1)
  })

  test('Generic site with OGP thumbnail renders ImageCard', async ({ page }) => {
    await seedOne(
      page,
      {
        id: 'img-bm-1',
        url: 'https://example.com/article',
        title: 'Example',
        thumbnail: 'https://example.com/image.jpg',
      },
      { id: 'img-c-1', bookmarkId: 'img-bm-1', width: 280, height: 210 },
    )
    await page.reload()
    await page.locator('[data-card-id]').first().waitFor({ timeout: 10_000 })

    const card = page.locator('[data-card-id]').first()
    await expect(card).toBeVisible()

    // ImageCard renders the OGP thumbnail directly
    const thumb = card.locator('img[src="https://example.com/image.jpg"]')
    await expect(thumb).toBeVisible()
  })
})
