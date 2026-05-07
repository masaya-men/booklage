import { test, expect, type Page } from '@playwright/test'

const DB_NAME = 'booklage-db'
const SEED_COUNT = 80

async function seedBoard(page: Page): Promise<void> {
  page.on('pageerror', (err) => console.log(`[browser] pageerror: ${err.message}`))

  await page.goto('/board')
  await page.locator('[data-theme-id]').first().waitFor({ timeout: 15_000 })
  await page.waitForTimeout(500)

  await page.evaluate(
    async ({ dbName, seedCount }) => {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName, 9)
        const timer = window.setTimeout(() => reject(new Error('seed open timeout 10s')), 10_000)
        req.onsuccess = () => {
          window.clearTimeout(timer)
          const db = req.result
          const tx = db.transaction(['bookmarks', 'cards'], 'readwrite')
          const bStore = tx.objectStore('bookmarks')
          const cStore = tx.objectStore('cards')
          const now = new Date().toISOString()
          for (let i = 0; i < seedCount; i++) {
            bStore.put({
              id: `seed-b-${i}`,
              url: `https://example.com/${i}`,
              title: `Seed card ${i}`,
              description: '',
              thumbnail: '',
              favicon: '',
              siteName: '',
              type: 'website',
              savedAt: now,
              tags: [],
              displayMode: null,
              ogpStatus: 'fetched',
              sizePreset: 'S',
              orderIndex: i,
            })
            cStore.put({
              id: `seed-c-${i}`,
              bookmarkId: `seed-b-${i}`,
              folderId: '',
              x: 0,
              y: 0,
              rotation: 0,
              scale: 1,
              zIndex: 0,
              gridIndex: i,
              isManuallyPlaced: false,
              width: 240,
              height: 180,
            })
          }
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
          reject(new Error('seed open blocked'))
        }
      })
    },
    { dbName: DB_NAME, seedCount: SEED_COUNT },
  )

  await page.reload()
  await page.locator('[data-card-id]').first().waitFor({ timeout: 10_000 })
}

test.describe('B0 board skeleton', () => {
  test.beforeEach(async ({ page }) => {
    await seedBoard(page)
  })

  test('renders theme background', async ({ page }) => {
    await expect(page.locator('[data-theme-id="dotted-notebook"]').first()).toBeVisible()
  })

  test('cards render with non-zero size', async ({ page }) => {
    const card = page.locator('[data-card-id]').first()
    await expect(card).toBeVisible()
    const box = await card.boundingBox()
    expect(box?.width ?? 0).toBeGreaterThan(0)
    expect(box?.height ?? 0).toBeGreaterThan(0)
  })

  test('wheel scroll moves cards up', async ({ page }) => {
    const card = page.locator('[data-card-id]').first()
    const before = await card.boundingBox()
    await page.mouse.move(640, 400)
    await page.mouse.wheel(0, 400)
    await page.waitForTimeout(200)
    const after = await card.boundingBox()
    expect(after?.y ?? 0).toBeLessThan(before?.y ?? 0)
  })

  test('empty-area drag scrolls like wheel', async ({ page }) => {
    const card = page.locator('[data-card-id]').first()
    const before = await card.boundingBox()
    await page.evaluate(() => {
      const layer = document.querySelector('[data-interaction-layer]') as HTMLElement | null
      if (!layer) throw new Error('interaction layer not found')
      const dispatch = (type: string, y: number): void => {
        layer.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            pointerType: 'mouse',
            clientX: 40,
            clientY: y,
            buttons: type === 'pointerup' ? 0 : 1,
          }),
        )
      }
      dispatch('pointerdown', 600)
      for (let y = 590; y >= 200; y -= 20) dispatch('pointermove', y)
      dispatch('pointerup', 200)
    })
    await page.waitForTimeout(150)
    const after = await card.boundingBox()
    expect(after?.y ?? 0).toBeLessThan(before?.y ?? 0)
  })

  // TODO Task 7/9: restore once [data-theme-button] attribute is wired up on Sidebar theme buttons
  test.skip('theme switch toggles background', async ({ page }) => {
    await page.locator('[data-theme-button="grid-paper"]').click()
    await expect(page.locator('[data-theme-id="grid-paper"]').first()).toBeVisible()
  })

  // Task 12 DONE — drag-to-reorder changes order (orderIndex), not XY position.
  // This test asserted free-drag XY change which is obsolete. Reorder E2E deferred.
  test.skip('card drag updates its position', async ({ page }) => {
    const card = page.locator('[data-card-id]').first()
    const before = await card.boundingBox()
    if (!before) throw new Error('card has no bounding box')
    const startX = before.x + before.width / 2
    const startY = before.y + before.height / 2
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 200, startY + 150, { steps: 12 })
    await page.mouse.up()
    await page.waitForTimeout(150)
    const after = await card.boundingBox()
    expect(Math.abs((after?.x ?? 0) - before.x)).toBeGreaterThan(50)
  })

  test('top header renders with the 3 expected slots', async ({ page }) => {
    await expect(page.locator('[data-testid="board-top-header"]')).toBeVisible()
    await expect(page.locator('[data-testid="filter-pill"]')).toBeVisible()
    await expect(page.locator('[data-testid="share-pill"]')).toBeVisible()
  })
})
