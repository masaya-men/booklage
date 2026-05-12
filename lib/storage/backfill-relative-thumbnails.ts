import type { IDBPDatabase } from 'idb'
import { resolveMaybeRelative } from '@/lib/utils/url-resolve'

// Heals records saved before scraper paths were patched to absolutize
// relative og:image. Idempotent — subsequent calls find no work.
// Returns the count of records actually rewritten.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function backfillRelativeThumbnails(db: IDBPDatabase<any>): Promise<number> {
  let fixed = 0
  const tx = db.transaction('bookmarks', 'readwrite')
  const store = tx.objectStore('bookmarks')
  let cursor = await store.openCursor()
  while (cursor) {
    const rec = cursor.value as { thumbnail?: string; url?: string }
    const thumb = rec.thumbnail ?? ''
    if (thumb && (thumb.startsWith('/') || thumb.startsWith('./') || thumb.startsWith('//')) && rec.url) {
      const absolute = resolveMaybeRelative(thumb, rec.url)
      if (absolute && absolute !== thumb) {
        await cursor.update({ ...rec, thumbnail: absolute })
        fixed++
      }
    }
    cursor = await cursor.continue()
  }
  await tx.done
  return fixed
}
