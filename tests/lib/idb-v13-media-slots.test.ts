import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { type IDBPDatabase } from 'idb'
import { initDB, persistMediaSlots, type BookmarkRecord } from '@/lib/storage/indexeddb'
import { DB_NAME, DB_VERSION } from '@/lib/constants'

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

describe('IDB v13: mediaSlots field on BookmarkRecord', () => {
  it('DB_VERSION is 13', () => {
    expect(DB_VERSION).toBe(13)
  })

  it('initDB opens at v13 and bookmarks store accepts mediaSlots field', async () => {
    db = await initDB() as unknown as IDBPDatabase<unknown>
    expect(db.version).toBe(13)
    expect(DB_NAME).toBe('booklage-db')

    const bookmark: BookmarkRecord = {
      id: 'b1',
      url: 'https://x.com/u/status/1',
      title: 't',
      description: '',
      thumbnail: '',
      favicon: '',
      siteName: 'X',
      type: 'tweet',
      savedAt: new Date().toISOString(),
      ogpStatus: 'fetched',
      tags: [],
      mediaSlots: [
        { type: 'video', url: 'https://x/p.jpg', videoUrl: 'https://x/v.mp4', aspect: 1.77 },
        { type: 'photo', url: 'https://x/a.jpg' },
        { type: 'photo', url: 'https://x/b.jpg' },
      ],
    }
    await db.put('bookmarks', bookmark)
    const got = (await db.get('bookmarks', 'b1')) as BookmarkRecord | undefined
    expect(got?.mediaSlots?.length).toBe(3)
    expect(got?.mediaSlots?.[0].type).toBe('video')
    expect(got?.mediaSlots?.[1].type).toBe('photo')
  })

  it('persistMediaSlots writes mediaSlots and is idempotent (no-op for deep-equal)', async () => {
    db = await initDB() as unknown as IDBPDatabase<unknown>
    const base: BookmarkRecord = {
      id: 'b2', url: 'u', title: 't', description: '', thumbnail: '',
      favicon: '', siteName: '', type: 'tweet',
      savedAt: new Date().toISOString(), ogpStatus: 'fetched', tags: [],
    }
    await db.put('bookmarks', base)

    const slots = [
      { type: 'photo' as const, url: 'https://x/a.jpg' },
      { type: 'photo' as const, url: 'https://x/b.jpg' },
    ]
    await persistMediaSlots(db as Parameters<typeof persistMediaSlots>[0], 'b2', slots)
    const after1 = (await db.get('bookmarks', 'b2')) as BookmarkRecord
    expect(after1.mediaSlots?.length).toBe(2)

    // Idempotent: writing same slots again does not change the record.
    await persistMediaSlots(db as Parameters<typeof persistMediaSlots>[0], 'b2', slots)
    const after2 = (await db.get('bookmarks', 'b2')) as BookmarkRecord
    expect(after2.mediaSlots).toEqual(after1.mediaSlots)
  })

  it('persistMediaSlots with empty array clears the field', async () => {
    db = await initDB() as unknown as IDBPDatabase<unknown>
    const base: BookmarkRecord = {
      id: 'b3', url: 'u', title: 't', description: '', thumbnail: '',
      favicon: '', siteName: '', type: 'tweet',
      savedAt: new Date().toISOString(), ogpStatus: 'fetched', tags: [],
      mediaSlots: [{ type: 'photo', url: 'https://x/a.jpg' }],
    }
    await db.put('bookmarks', base)
    await persistMediaSlots(db as Parameters<typeof persistMediaSlots>[0], 'b3', [])
    const after = (await db.get('bookmarks', 'b3')) as BookmarkRecord
    expect(after.mediaSlots).toBeUndefined()
  })

  it('upgrade from v12 (with photos[]) preserves photos field as read fallback', async () => {
    // First seed at v12 by opening with version 12 explicitly using the bare idb API.
    const { openDB } = await import('idb')
    const v12 = await openDB(DB_NAME, 12, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('bookmarks')) {
          db.createObjectStore('bookmarks', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('cards')) db.createObjectStore('cards', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' })
        if (!db.objectStoreNames.contains('preferences')) db.createObjectStore('preferences', { keyPath: 'key' })
        if (!db.objectStoreNames.contains('moods')) db.createObjectStore('moods', { keyPath: 'id' })
      },
    })
    await v12.put('bookmarks', {
      id: 'old', url: 'https://x.com/u/status/1', title: 't',
      description: '', thumbnail: '', favicon: '', siteName: '',
      type: 'tweet', savedAt: new Date().toISOString(),
      ogpStatus: 'fetched', tags: [],
      photos: ['https://x/a.jpg', 'https://x/b.jpg'],
    })
    v12.close()

    // Reopen via initDB → triggers v12 → v13 upgrade.
    db = await initDB() as unknown as IDBPDatabase<unknown>
    const got = (await db.get('bookmarks', 'old')) as BookmarkRecord
    expect(got.photos).toEqual(['https://x/a.jpg', 'https://x/b.jpg'])
    expect(got.mediaSlots).toBeUndefined()
  })
})
