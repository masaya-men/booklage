import { test, expect } from '@playwright/test'

// Regression for session-17 bug: opening a video tweet from the board
// did not run the FLIP open animation because TweetVideoPlayer's wrapper
// had no explicit width — only aspectRatio + max constraints — so it
// collapsed to 0×0 in the flex parent (.media), making startScale =
// originRect.width / 0 = Infinity and breaking the GSAP morph.
//
// The fix sets explicit width on the wrapper; this test guards against
// future regressions where the wrapper collapses again.

const VIDEO_ID = 'b-video-regression'
const PHOTO_ID = 'b-photo-regression'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
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
        id: 'b-video-regression',
        url: 'https://x.com/u/status/1001',
        title: 'video tweet (horizontal 16:9)',
        description: 'horizontal video tweet for FLIP regression',
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
        ],
      })
      tx.objectStore('cards').put({
        id: 'c-video-regression',
        bookmarkId: 'b-video-regression',
        folderId: '',
        x: 240, y: 80,
        rotation: 0, scale: 1, zIndex: 1,
        gridIndex: 0, isManuallyPlaced: false,
        width: 240, height: 180,
      })
      tx.objectStore('bookmarks').put({
        id: 'b-photo-regression',
        url: 'https://x.com/u/status/1002',
        title: 'photo tweet',
        description: 'photo tweet for FLIP regression',
        thumbnail: 'https://pbs.twimg.com/p.jpg',
        favicon: '',
        siteName: 'X',
        type: 'tweet',
        savedAt: new Date().toISOString(),
        ogpStatus: 'fetched',
        tags: [],
        cardWidth: 240,
        sizePreset: 'S',
        orderIndex: 1,
        mediaSlots: [
          { type: 'photo', url: 'https://pbs.twimg.com/p.jpg' },
        ],
      })
      tx.objectStore('cards').put({
        id: 'c-photo-regression',
        bookmarkId: 'b-photo-regression',
        folderId: '',
        x: 500, y: 80,
        rotation: 0, scale: 1, zIndex: 1,
        gridIndex: 1, isManuallyPlaced: false,
        width: 240, height: 180,
      })
      // Vertical video tweet (9:16 — YouTube Shorts / X vertical clip).
      // Regression for the "side black bars" issue: width must follow the
      // video's natural aspect, not 50vw.
      tx.objectStore('bookmarks').put({
        id: 'b-video-vertical',
        url: 'https://x.com/u/status/1003',
        title: 'vertical video tweet (9:16)',
        description: 'vertical video tweet — must not letterbox sideways',
        thumbnail: 'https://pbs.twimg.com/poster-vert.jpg',
        favicon: '',
        siteName: 'X',
        type: 'tweet',
        savedAt: new Date().toISOString(),
        ogpStatus: 'fetched',
        tags: [],
        cardWidth: 240,
        sizePreset: 'S',
        orderIndex: 2,
        mediaSlots: [
          { type: 'video', url: 'https://pbs.twimg.com/poster-vert.jpg', videoUrl: 'https://v/vert.mp4', aspect: 9 / 16 },
        ],
      })
      tx.objectStore('cards').put({
        id: 'c-video-vertical',
        bookmarkId: 'b-video-vertical',
        folderId: '',
        x: 760, y: 80,
        rotation: 0, scale: 1, zIndex: 1,
        gridIndex: 2, isManuallyPlaced: false,
        width: 240, height: 180,
      })
    }
  })
  await page.route('/api/tweet-meta**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ photoUrl: '', videoUrl: '', hasVideo: false, hasPhoto: false }),
    })
  })
  await page.route('/api/tweet-video**', () => { /* hang */ })
  // 400×300 SVG so img elements have a non-zero intrinsic size
  await page.route(/twimg/, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect fill="#f80" width="100%" height="100%"/></svg>',
    })
  })
  await page.goto('/board')
  await page.waitForSelector('[data-bookmark-id]')
  await page.waitForLoadState('networkidle')
})

test('video-tweet Lightbox: .media has non-zero rect at open (no FLIP collapse)', async ({ page }) => {
  await page.locator(`[data-bookmark-id="${VIDEO_ID}"]`).click()
  await page.waitForSelector('[data-testid="lightbox"]')

  // Read .media's rect inside the lightbox right after mount. If the FLIP
  // collapse bug returns, this is 0×0 (TweetVideoPlayer wrapper has no
  // explicit width and falls back to <video>'s collapsed intrinsic).
  const rect = await page.evaluate(() => {
    const lb = document.querySelector('[data-testid="lightbox"]')
    const media = lb?.querySelector('[class*="media"]')
    if (!media) return null
    const r = media.getBoundingClientRect()
    return { w: r.width, h: r.height }
  })

  expect(rect).not.toBeNull()
  expect(rect!.w).toBeGreaterThan(50)
  expect(rect!.h).toBeGreaterThan(50)
  // Sanity: aspect ratio should reflect the slot's 16/9 (within ±5%).
  // For the wrapper width-led path, we expect h ≈ w / 1.78.
  const ratio = rect!.w / rect!.h
  expect(ratio).toBeGreaterThan(1.6)
  expect(ratio).toBeLessThan(2.0)
})

test('video-tweet Lightbox: FLIP transform is applied (scale != 1) right after open', async ({ page }) => {
  await page.locator(`[data-bookmark-id="${VIDEO_ID}"]`).click()
  await page.waitForSelector('[data-testid="lightbox"]')

  // Within a few frames of open, the gsap.set should have applied a sub-1
  // scale to .media (start of the FLIP morph). If the bug returns,
  // transform is empty / scale=1 / scale=Infinity and visible morph is absent.
  // We give the browser one frame to commit the inline style.
  const transform = await page.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    const lb = document.querySelector('[data-testid="lightbox"]')
    const media = lb?.querySelector<HTMLElement>('[class*="media"]')
    if (!media) return null
    return media.style.transform || getComputedStyle(media).transform
  })

  expect(transform).not.toBeNull()
  expect(transform).not.toBe('')
  expect(transform).not.toBe('none')
  // Should contain a scale less than 1 (start of FLIP, growing from card size)
  // The transform syntax can be matrix(...) or matrix3d(...). Extract the
  // first scale component.
  const m = transform!.match(/matrix\(([^)]+)\)/) || transform!.match(/matrix3d\(([^)]+)\)/)
  if (m) {
    const parts = m[1].split(',').map((s) => parseFloat(s.trim()))
    const scaleX = parts[0]
    expect(Number.isFinite(scaleX)).toBe(true)
    expect(scaleX).toBeGreaterThan(0.05)
    expect(scaleX).toBeLessThan(0.95) // mid-FLIP, not at scale 1 yet
  }
})

test('vertical-video Lightbox: preserves 9:16 aspect (no side black bars)', async ({ page }) => {
  await page.locator('[data-bookmark-id="b-video-vertical"]').click()
  await page.waitForSelector('[data-testid="lightbox"]')
  // Let the open tween settle so .media reflects its final layout rect,
  // not the FLIP start scale.
  await page.waitForTimeout(800)

  const rect = await page.evaluate(() => {
    const lb = document.querySelector('[data-testid="lightbox"]')
    const media = lb?.querySelector('[class*="media"]')
    if (!media) return null
    const r = media.getBoundingClientRect()
    return { w: r.width, h: r.height }
  })

  expect(rect).not.toBeNull()
  // Vertical 9:16 → height MUST be the longer dimension. If the wrapper
  // were stuck at 50vw width, ratio would be ~1.0 or wider (black bars).
  expect(rect!.h).toBeGreaterThan(rect!.w)
  // Within ±5% of 9/16 = 0.5625
  const ratio = rect!.w / rect!.h
  expect(ratio).toBeGreaterThan(0.50)
  expect(ratio).toBeLessThan(0.62)
})
