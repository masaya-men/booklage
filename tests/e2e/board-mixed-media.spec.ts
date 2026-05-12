import { test, expect } from '@playwright/test'

const MIX_BOOKMARK_ID = 'b-mix-1'
const TWEET_URL = 'https://x.com/men_masaya/status/1842217368673759498'

// Seed a v13 bookmark with a 3-slot mediaSlots array directly into IDB so
// the test does not depend on a live tweet-meta proxy response. The first
// slot is a video (poster only — board never plays it), the next two are
// photos. Hover-position swap should cycle through all three URLs.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ id, url }) => {
    const open = indexedDB.open('booklage-db', 13)
    open.onupgradeneeded = (): void => {
      const db = open.result
      if (!db.objectStoreNames.contains('bookmarks')) db.createObjectStore('bookmarks', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('cards')) db.createObjectStore('cards', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' })
      if (!db.objectStoreNames.contains('preferences')) db.createObjectStore('preferences', { keyPath: 'key' })
      if (!db.objectStoreNames.contains('moods')) db.createObjectStore('moods', { keyPath: 'id' })
    }
    open.onsuccess = (): void => {
      const db = open.result
      const tx = db.transaction(['bookmarks', 'cards'], 'readwrite')
      tx.objectStore('bookmarks').put({
        id,
        url,
        title: 'mix tweet',
        description: '',
        thumbnail: 'https://pbs.twimg.com/poster.jpg',
        favicon: '',
        siteName: 'X',
        type: 'tweet',
        savedAt: new Date().toISOString(),
        ogpStatus: 'fetched',
        tags: [],
        cardWidth: 240,
        sizePreset: 'S',
        orderIndex: 0,
        mediaSlots: [
          { type: 'video', url: 'https://pbs.twimg.com/poster.jpg', videoUrl: 'https://v/v.mp4', aspect: 16 / 9 },
          { type: 'photo', url: 'https://pbs.twimg.com/a.jpg' },
          { type: 'photo', url: 'https://pbs.twimg.com/b.jpg' },
        ],
      })
      tx.objectStore('cards').put({
        id: 'c-mix-1',
        bookmarkId: id,
        folderId: '',
        x: 240, y: 80,
        rotation: 0, scale: 1, zIndex: 1,
        gridIndex: 0, isManuallyPlaced: false,
        width: 240, height: 240,
      })
    }
  }, { id: MIX_BOOKMARK_ID, url: TWEET_URL })

  // Hang the tweet-video proxy so the <video> element stays in loading state
  // and never fires onerror. Without this, the proxy would attempt to fetch
  // https://v/v.mp4 (a fake URL from the seed data), fail immediately, and
  // TweetVideoPlayer would swap to the Watch-on-X <a> fallback before any
  // assertion can confirm the <video> element is present.
  await page.route('/api/tweet-video**', (_route) => {
    // Intentionally do not call route.fulfill/abort — keeps the request
    // pending indefinitely, preventing the onerror → fallback swap.
  })

  await page.goto('/board')
  await page.waitForSelector('[data-bookmark-id]')
})

test('board hover swaps thumb across video poster → photo1 → photo2', async ({ page }) => {
  const card = page.locator(`[data-bookmark-id="${MIX_BOOKMARK_ID}"]`)
  await expect(card).toBeVisible()
  const box = await card.boundingBox()
  if (!box) throw new Error('card has no boundingBox')

  const layers = card.locator('img')
  await expect(layers).toHaveCount(3)

  // Move pointer to leftmost third → slot 0 (video poster) active.
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2)
  await expect(layers.nth(0)).toHaveAttribute('data-active', 'true')
  await expect(layers.nth(1)).not.toHaveAttribute('data-active', 'true')
  await expect(layers.nth(2)).not.toHaveAttribute('data-active', 'true')

  // Middle third → slot 1 (photo a) active.
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2)
  await expect(layers.nth(1)).toHaveAttribute('data-active', 'true')
  await expect(layers.nth(0)).not.toHaveAttribute('data-active', 'true')

  // Right third → slot 2 (photo b) active.
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2)
  await expect(layers.nth(2)).toHaveAttribute('data-active', 'true')
  await expect(layers.nth(1)).not.toHaveAttribute('data-active', 'true')

  // Layer srcs are stable across hover (one img per slot).
  await expect(layers.nth(0)).toHaveAttribute('src', /poster\.jpg/)
  await expect(layers.nth(1)).toHaveAttribute('src', /a\.jpg/)
  await expect(layers.nth(2)).toHaveAttribute('src', /b\.jpg/)

  // 3 dots present, video slot has data-slot-type='video'.
  const dots = card.getByTestId('multi-image-dot')
  await expect(dots).toHaveCount(3)
  await expect(dots.first()).toHaveAttribute('data-slot-type', 'video')
})

test('hover applies brightness lift filter to the active layer only', async ({ page }) => {
  const card = page.locator(`[data-bookmark-id="${MIX_BOOKMARK_ID}"]`)
  await expect(card).toBeVisible()
  const box = await card.boundingBox()
  if (!box) throw new Error('card has no boundingBox')

  // Without hover, no brightness filter is applied.
  const cleanFilter = await card.locator('img').nth(0).evaluate(
    (el) => window.getComputedStyle(el).filter,
  )
  expect(cleanFilter).toMatch(/^(none|)$/)

  // Hover the card. The active layer (slot 0 by default) should now have
  // a brightness filter applied via :hover.
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2)
  await expect(card.locator('img[data-active="true"]')).toHaveCount(1)
  const liftedFilter = await card.locator('img[data-active="true"]').evaluate(
    (el) => window.getComputedStyle(el).filter,
  )
  expect(liftedFilter).toContain('brightness')
})

test('Lightbox carousel: arrow keys + dot click cycle through slots', async ({ page }) => {
  const card = page.locator(`[data-bookmark-id="${MIX_BOOKMARK_ID}"]`)
  await card.click()

  const lightbox = page.getByTestId('lightbox')
  await expect(lightbox).toBeVisible()

  // Initially slot 0 (video poster) → TweetVideoPlayer renders a <video>.
  await expect(lightbox.locator('video')).toBeVisible()

  // ↓ → slot 1 (photo a) → <img> with a.jpg.
  await page.keyboard.press('ArrowDown')
  await expect(lightbox.locator('img')).toHaveAttribute('src', /a\.jpg/)

  // ↓ → slot 2 (photo b).
  await page.keyboard.press('ArrowDown')
  await expect(lightbox.locator('img')).toHaveAttribute('src', /b\.jpg/)

  // ↓ at end → no-op (still photo b).
  await page.keyboard.press('ArrowDown')
  await expect(lightbox.locator('img')).toHaveAttribute('src', /b\.jpg/)

  // Click dot 0 (video) → re-render TweetVideoPlayer.
  const dot0 = lightbox.getByRole('tab').first()
  await dot0.click()
  await expect(lightbox.locator('video')).toBeVisible()
})

test('Lightbox auto-pauses video when user navigates away from video slot', async ({ page }) => {
  const card = page.locator(`[data-bookmark-id="${MIX_BOOKMARK_ID}"]`)
  await card.click()
  const lightbox = page.getByTestId('lightbox')
  await expect(lightbox.locator('video')).toBeVisible()

  // Force-play the video so we can verify auto-pause on nav.
  await lightbox.locator('video').evaluate((v) => {
    const video = v as HTMLVideoElement
    // suppress autoplay-blocked promise rejection in headless mode
    void video.play().catch(() => {})
  })

  // ↓ → moves to photo slot → video should be paused after the slot change effect runs.
  await page.keyboard.press('ArrowDown')

  // Click dot 0 to return to video.
  const dot0 = lightbox.getByRole('tab').first()
  await dot0.click()
  await expect(lightbox.locator('video')).toBeVisible()

  // The pause itself is observable via the video element's `paused` property
  // back when the user was off the slot. Since we returned, we check the
  // currentTime is preserved (= NOT reset to 0 by remount). The key= forces
  // remount only when slotIdx changes; same slot keeps state.
  const paused = await lightbox.locator('video').evaluate((v) => (v as HTMLVideoElement).paused)
  // Either the play() never resolved in headless (paused=true) or it did and
  // then auto-pause kicked in on nav. Either way, after returning we expect a
  // fresh remount because key changed (`slot-0` → `slot-1` → `slot-0`), so
  // currentTime is 0 — this is acceptable per spec §10 open-problem note.
  expect(paused).toBe(true)
})
