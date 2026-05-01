import { test, expect, type Page } from '@playwright/test'

const DB_NAME = 'booklage-db'

async function seedBoard(page: Page, seedCount: number): Promise<void> {
  page.on('pageerror', (err) => console.log(`[browser] pageerror: ${err.message}`))

  await page.goto('/board')
  await page.locator('[data-theme-id]').first().waitFor({ timeout: 15_000 })
  await page.waitForTimeout(500)

  await page.evaluate(
    async ({ dbName, count }) => {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName, 9)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction(['bookmarks', 'cards'], 'readwrite')
          const bStore = tx.objectStore('bookmarks')
          const cStore = tx.objectStore('cards')
          const now = new Date().toISOString()
          for (let i = 0; i < count; i++) {
            const aspect = 0.5 + Math.random() * 2.5
            const h = 180
            const w = Math.round(h * aspect)
            bStore.put({
              id: `perf-b-${i}`,
              url: `https://example.com/${i}`,
              title: `Perf card ${i}`,
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
              id: `perf-c-${i}`,
              bookmarkId: `perf-b-${i}`,
              folderId: '',
              x: 0,
              y: 0,
              rotation: 0,
              scale: 1,
              zIndex: 0,
              gridIndex: i,
              isManuallyPlaced: false,
              width: w,
              height: h,
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
        req.onerror = () => reject(req.error)
        req.onblocked = () => reject(new Error('seed open blocked'))
      })
    },
    { dbName: DB_NAME, count: seedCount },
  )

  await page.reload()
  await page.locator('[data-card-id]').first().waitFor({ timeout: 20_000 })
}

test.describe('B0 perf on 1000 cards', () => {
  test('layout renders + wheel scroll holds 60fps + culling keeps DOM small', async ({ page }) => {
    const seedStart = Date.now()
    await seedBoard(page, 1000)
    const seedToFirstCardMs = Date.now() - seedStart

    const visibleCardCount = await page.locator('[data-card-id]').count()

    const fpsResult = await page.evaluate(async () => {
      await new Promise((r) => window.setTimeout(r, 200))

      const durationMs = 3000
      const stepPxPerFrame = 50
      const startT = performance.now()
      let frameCount = 0
      let lastT = startT

      return await new Promise<{ fps: number; frames: number; minFrame: number; maxFrame: number }>(
        (resolve) => {
          let minFrame = Infinity
          let maxFrame = 0
          const tick = (t: number): void => {
            const delta = t - lastT
            if (delta > 0) {
              if (delta < minFrame) minFrame = delta
              if (delta > maxFrame) maxFrame = delta
            }
            lastT = t
            frameCount++
            window.dispatchEvent(new WheelEvent('wheel', { deltaY: stepPxPerFrame, bubbles: true }))
            const layer = document.querySelector('[data-interaction-layer]')
            if (layer) {
              layer.dispatchEvent(
                new WheelEvent('wheel', {
                  deltaY: stepPxPerFrame,
                  bubbles: true,
                }),
              )
            }
            if (t - startT < durationMs) {
              requestAnimationFrame(tick)
            } else {
              const totalMs = t - startT
              const fps = (frameCount / totalMs) * 1000
              resolve({ fps, frames: frameCount, minFrame, maxFrame })
            }
          }
          requestAnimationFrame(tick)
        },
      )
    })

    const domCardCount = await page.locator('[data-card-id]').count()

    // eslint-disable-next-line no-console
    console.log(
      '[perf] ' +
        JSON.stringify({
          seedToFirstCardMs,
          initialVisibleCardCount: visibleCardCount,
          fps: Math.round(fpsResult.fps * 10) / 10,
          frames: fpsResult.frames,
          minFrameMs: Math.round(fpsResult.minFrame * 10) / 10,
          maxFrameMs: Math.round(fpsResult.maxFrame * 10) / 10,
          domCardCountAfterScroll: domCardCount,
        }),
    )

    expect(fpsResult.fps).toBeGreaterThan(45)
    expect(domCardCount).toBeLessThan(300)
  })
})
