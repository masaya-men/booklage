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

describe('IDB v9 migration', () => {
  it('converts folders → moods and bookmarks.folderId → tags[moodId]', async () => {
    // Seed a v8 database manually
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
    await v8.put('folders', { id: 'f1', name: 'Design', color: '#ff6b6b', order: 0, createdAt: '2026-04-01T00:00:00Z' })
    await v8.put('bookmarks', {
      id: 'b1', url: 'https://example.com', title: 'E', description: '', thumbnail: '',
      favicon: '', siteName: '', type: 'website', savedAt: '2026-04-02T00:00:00Z',
      folderId: 'f1', ogpStatus: 'fetched',
    })
    v8.close()

    // Open at v9 — triggers migration
    const v9 = await initDB()
    db = v9 as unknown as IDBPDatabase<unknown>

    // moods store exists with migrated folder
    const moods = await (v9 as unknown as IDBPDatabase<unknown>).getAll('moods')
    expect(moods).toHaveLength(1)
    expect(moods[0]).toMatchObject({ id: 'f1', name: 'Design', color: '#ff6b6b', order: 0 })

    // bookmark.folderId replaced with tags[]
    const bm = (await (v9 as unknown as IDBPDatabase<unknown>).get('bookmarks', 'b1')) as Record<string, unknown>
    expect(bm.tags).toEqual(['f1'])
    expect(bm.folderId).toBeUndefined()
    expect(bm.displayMode).toBeNull()

    // folders store removed
    expect((v9 as unknown as IDBPDatabase<unknown>).objectStoreNames.contains('folders')).toBe(false)
  })

  it('leaves bookmark with empty tags if folderId missing (Inbox default)', async () => {
    const v8 = await openDB(DB_NAME, 8, {
      upgrade(d) {
        if (!d.objectStoreNames.contains('bookmarks')) d.createObjectStore('bookmarks', { keyPath: 'id' })
        if (!d.objectStoreNames.contains('folders')) d.createObjectStore('folders', { keyPath: 'id' })
        if (!d.objectStoreNames.contains('cards')) d.createObjectStore('cards', { keyPath: 'id' })
        if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings', { keyPath: 'key' })
        if (!d.objectStoreNames.contains('preferences')) d.createObjectStore('preferences', { keyPath: 'key' })
      },
    })
    await v8.put('bookmarks', {
      id: 'b2', url: 'https://x.com', title: 'X', description: '', thumbnail: '',
      favicon: '', siteName: '', type: 'website', savedAt: '2026-04-02T00:00:00Z',
      folderId: '', ogpStatus: 'fetched',
    })
    v8.close()
    const v9 = await initDB()
    db = v9 as unknown as IDBPDatabase<unknown>
    const bm = (await (v9 as unknown as IDBPDatabase<unknown>).get('bookmarks', 'b2')) as Record<string, unknown>
    expect(bm.tags).toEqual([])
  })
})
