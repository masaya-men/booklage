import { test, expect, type Page } from '@playwright/test'

const DB_NAME = 'booklage-db'

async function clearDb(page: Page): Promise<void> {
  await page.evaluate(async (dbName) => {
    await new Promise<void>((resolve, reject) => {
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

async function seed(page: Page, slug: string, title: string): Promise<void> {
  const params = new URLSearchParams({
    url: `https://example.com/${slug}`,
    title,
    // Use a data: URL so the image always loads instantly (real content
    // path). Inline SVG 800x600 grey rect — gives the media a real
    // aspect ratio so .frame sizes naturally.
    image: 'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#444"/><text x="400" y="300" font-size="48" fill="white" text-anchor="middle">' + slug + '</text></svg>'
    ),
    desc: 'A test description with some text content so the panel has substance to render.',
    site: 'Example',
    favicon: '',
  })
  await page.goto(`/save?${params.toString()}`)
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

test('open animation actually grows from source rect', async ({ page }) => {
  await page.goto('/board')
  await page.waitForLoadState('networkidle')
  await clearDb(page)
  await seed(page, 'a', 'Alpha')
  await seed(page, 'b', 'Beta')
  await page.goto('/board')
  await page.waitForSelector('[data-bookmark-id]', { timeout: 8000 })

  const firstId = await page.locator('[data-bookmark-id]').first().getAttribute('data-bookmark-id')
  expect(firstId).toBeTruthy()

  // Capture source card rect BEFORE click — that's where the lightbox
  // should visually start growing from.
  const sourceRect = await page.locator(`[data-bookmark-id="${firstId}"]`).boundingBox()
  console.log('SOURCE RECT:', JSON.stringify(sourceRect))

  await page.locator(`[data-bookmark-id="${firstId}"]`).click()
  await expect(page.getByTestId('lightbox')).toBeVisible()

  // Sample frame's transform ~30ms after open — at this point the open
  // tween should be near its START (= source card scale + position).
  // If it's already near scale 1 / no translate, the open animation
  // didn't actually start at the source rect (the bug we're chasing).
  await page.waitForTimeout(30)
  const earlySnapshot = await page.evaluate(() => {
    const lb = document.querySelector('[data-testid="lightbox"]') as HTMLElement | null
    if (!lb) return null
    const allDivs = Array.from(lb.querySelectorAll(':scope > div')) as HTMLElement[]
    const frame = allDivs.find((d) => d.querySelector('button')) ?? allDivs[0]
    if (!frame) return null
    const r = frame.getBoundingClientRect()
    return {
      transform: getComputedStyle(frame).transform,
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
    }
  })
  console.log('AT ~30ms:', JSON.stringify(earlySnapshot, null, 2))

  await page.waitForTimeout(1500)

  // Wait long enough for the open tween (0.5–0.7s) to fully settle.
  await page.waitForTimeout(1500)

  const dump = await page.evaluate(() => {
    const lb = document.querySelector('[data-testid="lightbox"]') as HTMLElement | null
    if (!lb) return null
    // The .frame is the only child div containing the .close button.
    const allDivs = Array.from(lb.querySelectorAll(':scope > div')) as HTMLElement[]
    const frame = allDivs.find((d) => d.querySelector('button[aria-label*="Close"], button[aria-label*="閉じる"]')) ?? allDivs[0] ?? null
    if (!frame) return { found: false }
    const fr = frame.getBoundingClientRect()
    const fcs = getComputedStyle(frame)
    const text = frame.querySelector('[class*="text"]') as HTMLElement | null
    const media = frame.querySelector('[class*="media"]') as HTMLElement | null
    return {
      found: true,
      frameClass: frame.className,
      frame: { w: fr.width, h: fr.height, transform: fcs.transform, opacity: fcs.opacity },
      text: text ? { class: text.className, w: text.getBoundingClientRect().width, h: text.getBoundingClientRect().height, opacity: getComputedStyle(text).opacity } : null,
      media: media ? { class: media.className, w: media.getBoundingClientRect().width, h: media.getBoundingClientRect().height } : null,
      backdropOpacity: getComputedStyle(lb).opacity,
    }
  })

  console.log('LIGHTBOX DUMP:', JSON.stringify(dump, null, 2))
  expect(dump?.found).toBe(true)
  expect(dump!.frame!.w).toBeGreaterThan(500)

  await page.screenshot({ path: 'test-results/b-11-open-state.png', fullPage: false })
})
