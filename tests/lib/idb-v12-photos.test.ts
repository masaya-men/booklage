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
  it('DB_VERSION is 12', () => {
    expect(DB_VERSION).toBe(12)
  })

  it('initDB opens at v12 and bookmarks store accepts photos field', async () => {
    const opened = await initDB()
    db = opened as unknown as IDBPDatabase<unknown>
    expect(opened.version).toBe(12)

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
    expect(opened.version).toBe(12)
    const read = (await (db as IDBPDatabase<unknown>).get('bookmarks', 'b-legacy')) as
      | Record<string, unknown>
      | undefined
    expect(read?.photos).toBeUndefined()
  })
})
