import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { openDB, type IDBPDatabase } from 'idb'
import { initDB } from '@/lib/storage/indexeddb'
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

describe('IDB v12: photos field on BookmarkRecord', () => {
  it('DB_VERSION is at least 12 (photos feature introduced at v12)', () => {
    expect(DB_VERSION).toBeGreaterThanOrEqual(12)
  })

  it('initDB opens at current version and bookmarks store accepts photos field', async () => {
    const opened = await initDB()
    db = opened as unknown as IDBPDatabase<unknown>
    expect(opened.version).toBe(DB_VERSION)

    const bookmark = {
      id: 'b1',
      url: 'https://x.com/u/status/1',
      title: 'Test tweet',
      savedAt: Date.now(),
      orderIndex: 0,
      cardWidth: 240,
      tags: [],
      photos: ['https://pbs.twimg.com/a.jpg', 'https://pbs.twimg.com/b.jpg'],
    }
    await (db as IDBPDatabase<unknown>).put('bookmarks', bookmark)
    const read = (await (db as IDBPDatabase<unknown>).get('bookmarks', 'b1')) as
      | Record<string, unknown>
      | undefined
    expect(read?.photos).toEqual([
      'https://pbs.twimg.com/a.jpg',
      'https://pbs.twimg.com/b.jpg',
    ])
  })

  it('existing v11 records with no photos field read as undefined', async () => {
    // Seed a v11-shaped row via low-level openDB (no photos field)
    const seedDb = await openDB(DB_NAME, 11, {
      upgrade(d) {
        if (!d.objectStoreNames.contains('bookmarks')) {
          d.createObjectStore('bookmarks', { keyPath: 'id' })
        }
      },
    })
    await seedDb.put('bookmarks', {
      id: 'b-legacy',
      url: 'https://x.com/u/status/2',
      title: 'Legacy',
      savedAt: Date.now(),
      orderIndex: 0,
      cardWidth: 240,
      tags: [],
    })
    seedDb.close()

    const opened = await initDB()
    db = opened as unknown as IDBPDatabase<unknown>
    expect(opened.version).toBe(DB_VERSION)
    const read = (await (db as IDBPDatabase<unknown>).get('bookmarks', 'b-legacy')) as
      | Record<string, unknown>
      | undefined
    expect(read?.photos).toBeUndefined()
  })
})

describe('persistPhotos', () => {
  it('writes photos to bookmark and skips when array deep-equals existing', async () => {
    const { persistPhotos } = await import('@/lib/storage/indexeddb')
    const opened = await initDB()
    db = opened as unknown as IDBPDatabase<unknown>

    await opened.put('bookmarks', {
      id: 'b-photos',
      url: 'https://x.com/u/status/1',
      title: 'T',
      savedAt: Date.now(),
      orderIndex: 0,
      cardWidth: 240,
      tags: [],
    })

    await persistPhotos(opened, 'b-photos', [
      'https://pbs.twimg.com/a.jpg',
      'https://pbs.twimg.com/b.jpg',
    ])
    let r = await opened.get('bookmarks', 'b-photos')
    expect(r?.photos).toEqual([
      'https://pbs.twimg.com/a.jpg',
      'https://pbs.twimg.com/b.jpg',
    ])

    // Idempotent: same array should not re-write (read-modify-write skips)
    const writeBefore = JSON.stringify(r)
    await persistPhotos(opened, 'b-photos', [
      'https://pbs.twimg.com/a.jpg',
      'https://pbs.twimg.com/b.jpg',
    ])
    r = await opened.get('bookmarks', 'b-photos')
    expect(JSON.stringify(r)).toBe(writeBefore)
  })

  it('clears photos when passed empty array', async () => {
    const { persistPhotos } = await import('@/lib/storage/indexeddb')
    const opened = await initDB()
    db = opened as unknown as IDBPDatabase<unknown>

    await opened.put('bookmarks', {
      id: 'b-clear',
      url: 'https://x.com/u/status/1',
      title: 'T',
      savedAt: Date.now(),
      orderIndex: 0,
      cardWidth: 240,
      tags: [],
      photos: ['x'],
    })

    await persistPhotos(opened, 'b-clear', [])
    const r = await opened.get('bookmarks', 'b-clear')
    expect(r?.photos).toBeUndefined()
  })

  it('no-ops for non-existent bookmark', async () => {
    const { persistPhotos } = await import('@/lib/storage/indexeddb')
    const opened = await initDB()
    db = opened as unknown as IDBPDatabase<unknown>
    await expect(persistPhotos(opened, 'no-such-id', ['x'])).resolves.toBeUndefined()
  })
})
