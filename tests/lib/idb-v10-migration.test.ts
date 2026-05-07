import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { openDB, type IDBPDatabase } from 'idb'
import { initDB } from '@/lib/storage/indexeddb'
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

function seedV9Upgrade(d: IDBPDatabase<unknown>): void {
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

describe('IDB v10 migration', () => {
  it('seeds cardWidth=240 for a bookmark with sizePreset M', async () => {
    const v9 = await openDB(DB_NAME, 9, {
      upgrade(d, _old, _new, tx) {
        seedV9Upgrade(d)
        void tx
      },
    })
    await v9.put('bookmarks', {
      id: 'b1', url: 'https://example.com', title: 'E', description: '', thumbnail: '',
      favicon: '', siteName: '', type: 'website', savedAt: '2026-04-02T00:00:00Z',
      ogpStatus: 'fetched', sizePreset: 'M', tags: [], displayMode: null,
    })
    v9.close()

    const v10 = await initDB()
    db = v10 as unknown as IDBPDatabase<unknown>

    const bm = (await (v10 as unknown as IDBPDatabase<unknown>).get('bookmarks', 'b1')) as Record<string, unknown>
    expect(bm.cardWidth).toBe(240)
  })

  it('seeds cardWidth=240 (DEFAULT) for a bookmark with no sizePreset', async () => {
    const v9 = await openDB(DB_NAME, 9, {
      upgrade(d, _old, _new, tx) {
        seedV9Upgrade(d)
        void tx
      },
    })
    await v9.put('bookmarks', {
      id: 'b2', url: 'https://x.com', title: 'X', description: '', thumbnail: '',
      favicon: '', siteName: '', type: 'website', savedAt: '2026-04-02T00:00:00Z',
      ogpStatus: 'fetched', tags: [], displayMode: null,
    })
    v9.close()

    const v10 = await initDB()
    db = v10 as unknown as IDBPDatabase<unknown>

    const bm = (await (v10 as unknown as IDBPDatabase<unknown>).get('bookmarks', 'b2')) as Record<string, unknown>
    expect(bm.cardWidth).toBe(240)
  })

  it('does not overwrite an existing cardWidth value', async () => {
    const v9 = await openDB(DB_NAME, 9, {
      upgrade(d, _old, _new, tx) {
        seedV9Upgrade(d)
        void tx
      },
    })
    await v9.put('bookmarks', {
      id: 'b3', url: 'https://youtube.com', title: 'Y', description: '', thumbnail: '',
      favicon: '', siteName: '', type: 'youtube', savedAt: '2026-04-02T00:00:00Z',
      ogpStatus: 'fetched', sizePreset: 'L', cardWidth: 999, tags: [], displayMode: null,
    })
    v9.close()

    const v10 = await initDB()
    db = v10 as unknown as IDBPDatabase<unknown>

    const bm = (await (v10 as unknown as IDBPDatabase<unknown>).get('bookmarks', 'b3')) as Record<string, unknown>
    expect(bm.cardWidth).toBe(999)
  })

  it('v8→v10 single-hop: tags[] and cardWidth both correct, folderId deleted', async () => {
    // Seed a v8 database (same store layout as idb-v9-migration.test.ts)
    const v8 = await openDB(DB_NAME, 8, {
      upgrade(d, _old, _new, tx) {
        if (!d.objectStoreNames.contains('bookmarks')) {
          const bm = d.createObjectStore('bookmarks', { keyPath: 'id' })
          bm.createIndex('by-folder', 'folderId')
          bm.createIndex('by-date', 'savedAt')
          bm.createIndex('by-ogp-status', 'ogpStatus')
        }
        if (!d.objectStoreNames.contains('folders')) d.createObjectStore('folders', { keyPath: 'id' })
        if (!d.objectStoreNames.contains('cards')) {
          const c = d.createObjectStore('cards', { keyPath: 'id' })
          c.createIndex('by-folder', 'folderId')
          c.createIndex('by-bookmark', 'bookmarkId')
        }
        if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings', { keyPath: 'key' })
        if (!d.objectStoreNames.contains('preferences')) d.createObjectStore('preferences', { keyPath: 'key' })
        void tx
      },
    })

    // Seed a folder so v9 has something to migrate into moods
    await v8.put('folders', { id: 'f1', name: 'Design', color: '#ff6b6b', order: 0, createdAt: '2026-04-01T00:00:00Z' })
    // Seed a bookmark with folderId and sizePreset — no tags, no cardWidth
    await v8.put('bookmarks', {
      id: 'b4', url: 'https://example.com', title: 'E', description: '', thumbnail: '',
      favicon: '', siteName: '', type: 'website', savedAt: '2026-04-02T00:00:00Z',
      folderId: 'f1', sizePreset: 'L', ogpStatus: 'fetched',
    })
    v8.close()

    // initDB() triggers v8→v10 single-hop: v9 rewrite (tags) must finish before v10 (cardWidth)
    const v10 = await initDB()
    db = v10 as unknown as IDBPDatabase<unknown>

    const raw = v10 as unknown as IDBPDatabase<unknown>
    const bm = (await raw.get('bookmarks', 'b4')) as Record<string, unknown>

    // v9 migration: folderId → tags[], folderId deleted
    expect(bm.tags).toEqual(['f1'])
    expect(bm.folderId).toBeUndefined()

    // v10 migration: sizePreset 'L' → cardWidth 320
    expect(bm.cardWidth).toBe(320)

    // v9 migration: folder → moods store
    const moods = await raw.getAll('moods')
    expect(moods).toHaveLength(1)
    expect(moods[0]).toMatchObject({ id: 'f1', name: 'Design', color: '#ff6b6b', order: 0 })
  })
})
