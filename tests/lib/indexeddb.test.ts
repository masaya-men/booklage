import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { type IDBPDatabase } from 'idb'
import {
  initDB, addBookmark, getAllBookmarks, deleteBookmark, updateCard,
  updateBookmarkOrderIndex, updateBookmarkOrderBatch,
} from '@/lib/storage/indexeddb'

let db: IDBPDatabase<unknown> | null = null

beforeEach(async () => {
  // Reset fake-indexeddb global state
  const fakeIndexedDB = globalThis.indexedDB
  const databases = await fakeIndexedDB.databases()
  for (const dbInfo of databases) {
    if (dbInfo.name) {
      fakeIndexedDB.deleteDatabase(dbInfo.name)
    }
  }
})

afterEach(() => {
  // Close the database connection so deleteDatabase doesn't block
  if (db) {
    (db as IDBPDatabase<unknown>).close()
    db = null
  }
})

describe('bookmarks', () => {
  it('adds and retrieves bookmarks', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>
    await addBookmark(database, {
      url: 'https://example.com', title: 'Example', description: 'A test site',
      thumbnail: '', favicon: '', siteName: 'Example', type: 'website', tags: [],
    })
    const bookmarks = await getAllBookmarks(database)
    expect(bookmarks).toHaveLength(1)
    expect(bookmarks[0].url).toBe('https://example.com')
    expect(bookmarks[0].tags).toEqual([])
  })

  it('deletes a bookmark and its card', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>
    const bookmark = await addBookmark(database, {
      url: 'https://example.com', title: 'Example', description: '',
      thumbnail: '', favicon: '', siteName: '', type: 'website', tags: [],
    })
    await deleteBookmark(database, bookmark.id)
    expect(await getAllBookmarks(database)).toHaveLength(0)
    const cards = await database.getAll('cards')
    expect(cards.filter((c) => c.bookmarkId === bookmark.id)).toHaveLength(0)
  })
})

describe('cards', () => {
  it('creates card when bookmark is added', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>
    const bookmark = await addBookmark(database, {
      url: 'https://example.com', title: 'Example', description: '',
      thumbnail: '', favicon: '', siteName: '', type: 'website', tags: [],
    })
    const cards = (await database.getAll('cards')).filter((c) => c.bookmarkId === bookmark.id)
    expect(cards).toHaveLength(1)
    expect(cards[0].x).toBeTypeOf('number')
    expect(cards[0].rotation).toBeTypeOf('number')
  })

  it('updates card position', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>
    const bookmark = await addBookmark(database, {
      url: 'https://example.com', title: 'Example', description: '',
      thumbnail: '', favicon: '', siteName: '', type: 'website', tags: [],
    })
    const [card] = (await database.getAll('cards')).filter((c) => c.bookmarkId === bookmark.id)
    await updateCard(database, card.id, { x: 100, y: 200 })
    const updated = await database.get('cards', card.id)
    expect(updated?.x).toBe(100)
    expect(updated?.y).toBe(200)
  })
})

describe('v8 migration', () => {
  it('assigns orderIndex + sizePreset defaults to existing bookmarks', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>
    await addBookmark(database, {
      url: 'https://a.com', title: 'A', description: '',
      thumbnail: '', favicon: '', siteName: '', type: 'website', tags: [],
    })
    await addBookmark(database, {
      url: 'https://b.com', title: 'B', description: '',
      thumbnail: '', favicon: '', siteName: '', type: 'website', tags: [],
    })
    const bookmarks = await getAllBookmarks(database)
    expect(bookmarks).toHaveLength(2)
    for (const b of bookmarks) {
      expect(typeof b.orderIndex).toBe('number')
      expect(b.sizePreset).toBe('S')
    }
    // orderIndex values should be unique
    const orders = bookmarks.map((b) => b.orderIndex).sort((x, y) => (x ?? 0) - (y ?? 0))
    expect(orders[0]).not.toBe(orders[1])
  })

  it('updateBookmarkOrderIndex changes the orderIndex', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>
    const bm = await addBookmark(database, {
      url: 'https://a.com', title: 'A', description: '',
      thumbnail: '', favicon: '', siteName: '', type: 'website', tags: [],
    })
    await updateBookmarkOrderIndex(database, bm.id, 42)
    const [updated] = await getAllBookmarks(database)
    expect(updated.orderIndex).toBe(42)
  })

  it('updateBookmarkOrderBatch rewrites orderIndex atomically', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>
    const bm1 = await addBookmark(database, {
      url: 'https://a.com', title: 'A', description: '',
      thumbnail: '', favicon: '', siteName: '', type: 'website', tags: [],
    })
    const bm2 = await addBookmark(database, {
      url: 'https://b.com', title: 'B', description: '',
      thumbnail: '', favicon: '', siteName: '', type: 'website', tags: [],
    })
    // Reverse the order
    await updateBookmarkOrderBatch(database, [bm2.id, bm1.id])
    const bookmarks = await getAllBookmarks(database)
    const byId = Object.fromEntries(bookmarks.map((b) => [b.id, b]))
    expect(byId[bm2.id].orderIndex).toBe(0)
    expect(byId[bm1.id].orderIndex).toBe(1)
  })
})
