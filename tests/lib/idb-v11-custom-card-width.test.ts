import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { openDB, type IDBPDatabase } from 'idb'
import {
  initDB,
  persistCustomCardWidth,
  clearCustomCardWidth,
  clearAllCustomCardWidths,
} from '@/lib/storage/indexeddb'
import { DB_NAME } from '@/lib/constants'

let db: IDBPDatabase<unknown> | null = null

beforeEach(async () => {
  const databases = await indexedDB.databases()
  for (const info of databases) {
    if (info.name) indexedDB.deleteDatabase(info.name)
  }
})

afterEach(() => {
  if (db) { db.close(); db = null }
})

function seedV10Stores(d: IDBPDatabase<unknown>): void {
  if (!d.objectStoreNames.contains('bookmarks')) {
    const bm = d.createObjectStore('bookmarks', { keyPath: 'id' })
    bm.createIndex('by-folder', 'folderId')
    bm.createIndex('by-date', 'savedAt')
    bm.createIndex('by-ogp-status', 'ogpStatus')
  }
  if (!d.objectStoreNames.contains('moods')) d.createObjectStore('moods', { keyPath: 'id' })
  if (!d.objectStoreNames.contains('cards')) {
    const c = d.createObjectStore('cards', { keyPath: 'id' })
    c.createIndex('by-folder', 'folderId')
    c.createIndex('by-bookmark', 'bookmarkId')
  }
  if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings', { keyPath: 'key' })
  if (!d.objectStoreNames.contains('preferences')) d.createObjectStore('preferences', { keyPath: 'key' })
}

describe('IDB v11 customCardWidth', () => {
  it('v10 → v11 migration leaves existing rows intact (no field rewrite)', async () => {
    const v10 = await openDB(DB_NAME, 10, {
      upgrade(d, _old, _new, tx) {
        seedV10Stores(d)
        void tx
      },
    })
    await v10.put('bookmarks', {
      id: 'b1', url: 'https://example.com', title: 'E', description: '', thumbnail: '',
      favicon: '', siteName: '', type: 'website', savedAt: '2026-04-02T00:00:00Z',
      ogpStatus: 'fetched', sizePreset: 'M', cardWidth: 240, tags: [], displayMode: null,
    })
    v10.close()

    const v11 = await initDB()
    db = v11 as unknown as IDBPDatabase<unknown>

    const bm = (await (v11 as unknown as IDBPDatabase<unknown>).get('bookmarks', 'b1')) as Record<string, unknown>
    // Field is undefined post-migration — read path treats this as `false`.
    expect(bm.customCardWidth).toBeUndefined()
    // Other fields untouched.
    expect(bm.cardWidth).toBe(240)
  })

  it('persistCustomCardWidth flips customCardWidth=true and stores the width', async () => {
    const v11 = await initDB()
    db = v11 as unknown as IDBPDatabase<unknown>
    await v11.put('bookmarks', {
      id: 'b2', url: 'https://x.com', title: 'X', description: '', thumbnail: '',
      favicon: '', siteName: '', type: 'website', savedAt: '2026-04-02T00:00:00Z',
      ogpStatus: 'fetched', cardWidth: 240, tags: [], displayMode: null,
    })

    await persistCustomCardWidth(v11, 'b2', 360)

    const bm = (await (v11 as unknown as IDBPDatabase<unknown>).get('bookmarks', 'b2')) as Record<string, unknown>
    expect(bm.customCardWidth).toBe(true)
    expect(bm.cardWidth).toBe(360)
  })

  it('persistCustomCardWidth clamps the width to MIN/MAX', async () => {
    const v11 = await initDB()
    db = v11 as unknown as IDBPDatabase<unknown>
    await v11.put('bookmarks', {
      id: 'b3', url: 'https://x.com', title: 'X', description: '', thumbnail: '',
      favicon: '', siteName: '', type: 'website', savedAt: '2026-04-02T00:00:00Z',
      ogpStatus: 'fetched', cardWidth: 240, tags: [], displayMode: null,
    })

    await persistCustomCardWidth(v11, 'b3', 9999)

    const bm = (await (v11 as unknown as IDBPDatabase<unknown>).get('bookmarks', 'b3')) as Record<string, unknown>
    // clampCardWidth caps at MAX_CARD_WIDTH = 480
    expect(bm.cardWidth).toBe(480)
    expect(bm.customCardWidth).toBe(true)
  })

  it('clearCustomCardWidth flips the flag back to false but leaves cardWidth intact', async () => {
    const v11 = await initDB()
    db = v11 as unknown as IDBPDatabase<unknown>
    await v11.put('bookmarks', {
      id: 'b4', url: 'https://x.com', title: 'X', description: '', thumbnail: '',
      favicon: '', siteName: '', type: 'website', savedAt: '2026-04-02T00:00:00Z',
      ogpStatus: 'fetched', cardWidth: 320, customCardWidth: true, tags: [], displayMode: null,
    })

    await clearCustomCardWidth(v11, 'b4')

    const bm = (await (v11 as unknown as IDBPDatabase<unknown>).get('bookmarks', 'b4')) as Record<string, unknown>
    expect(bm.customCardWidth).toBe(false)
    expect(bm.cardWidth).toBe(320)
  })

  it('clearAllCustomCardWidths resets every flagged row and returns their ids', async () => {
    const v11 = await initDB()
    db = v11 as unknown as IDBPDatabase<unknown>
    const baseFields = {
      url: 'https://x.com', title: 'X', description: '', thumbnail: '',
      favicon: '', siteName: '', type: 'website', savedAt: '2026-04-02T00:00:00Z',
      ogpStatus: 'fetched', cardWidth: 240, tags: [], displayMode: null,
    } as const

    await v11.put('bookmarks', { id: 'b5', ...baseFields, customCardWidth: true })
    await v11.put('bookmarks', { id: 'b6', ...baseFields, customCardWidth: false })
    await v11.put('bookmarks', { id: 'b7', ...baseFields, customCardWidth: true })

    const cleared = await clearAllCustomCardWidths(v11)
    expect(cleared.sort()).toEqual(['b5', 'b7'])

    const after5 = (await (v11 as unknown as IDBPDatabase<unknown>).get('bookmarks', 'b5')) as Record<string, unknown>
    const after6 = (await (v11 as unknown as IDBPDatabase<unknown>).get('bookmarks', 'b6')) as Record<string, unknown>
    const after7 = (await (v11 as unknown as IDBPDatabase<unknown>).get('bookmarks', 'b7')) as Record<string, unknown>
    expect(after5.customCardWidth).toBe(false)
    expect(after6.customCardWidth).toBe(false)
    expect(after7.customCardWidth).toBe(false)
  })

  it('clearAllCustomCardWidths returns an empty array when no rows are flagged', async () => {
    const v11 = await initDB()
    db = v11 as unknown as IDBPDatabase<unknown>
    await v11.put('bookmarks', {
      id: 'b8', url: 'https://x.com', title: 'X', description: '', thumbnail: '',
      favicon: '', siteName: '', type: 'website', savedAt: '2026-04-02T00:00:00Z',
      ogpStatus: 'fetched', cardWidth: 240, tags: [], displayMode: null,
    })
    const cleared = await clearAllCustomCardWidths(v11)
    expect(cleared).toEqual([])
  })
})
