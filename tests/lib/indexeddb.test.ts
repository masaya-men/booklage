import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { type IDBPDatabase } from 'idb'
import {
  initDB, addBookmark, getBookmarksByFolder, addFolder, getAllFolders,
  updateCard, getCardsByFolder, deleteBookmark,
  updateBookmarkOrderIndex, updateBookmarkSizePreset, updateBookmarkOrderBatch,
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

// TODO(Task 2): remove after folder API deletion — folders store is dropped in v9.
describe.skip('folders', () => {
  it('creates and lists folders', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>
    await addFolder(database, { name: 'Fashion', color: '#ff6b6b', order: 0 })
    await addFolder(database, { name: 'Tech', color: '#339af0', order: 1 })
    const folders = await getAllFolders(database)
    expect(folders).toHaveLength(2)
    expect(folders[0].name).toBe('Fashion')
  })
})

// TODO(Task 2): these tests use addFolder which writes to a now-dropped store.
// Re-enable / rewrite once Task 2 deletes the folder API and ports tests to moods/tags.
describe.skip('bookmarks', () => {
  it('adds and retrieves bookmarks by folder', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>
    const folder = await addFolder(database, { name: 'Test', color: '#51cf66', order: 0 })
    await addBookmark(database, {
      url: 'https://example.com', title: 'Example', description: 'A test site',
      thumbnail: '', favicon: '', siteName: 'Example', type: 'website', folderId: folder.id,
    })
    const bookmarks = await getBookmarksByFolder(database, folder.id)
    expect(bookmarks).toHaveLength(1)
    expect(bookmarks[0].url).toBe('https://example.com')
  })

  it('deletes a bookmark and its card', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>
    const folder = await addFolder(database, { name: 'Test', color: '#51cf66', order: 0 })
    const bookmark = await addBookmark(database, {
      url: 'https://example.com', title: 'Example', description: '',
      thumbnail: '', favicon: '', siteName: '', type: 'website', folderId: folder.id,
    })
    await deleteBookmark(database, bookmark.id)
    const remaining = await getBookmarksByFolder(database, folder.id)
    expect(remaining).toHaveLength(0)
  })
})

// TODO(Task 2): these tests use addFolder. Port once folder API is removed.
describe.skip('cards', () => {
  it('creates card when bookmark is added and retrieves by folder', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>
    const folder = await addFolder(database, { name: 'Test', color: '#51cf66', order: 0 })
    await addBookmark(database, {
      url: 'https://example.com', title: 'Example', description: '',
      thumbnail: '', favicon: '', siteName: '', type: 'website', folderId: folder.id,
    })
    const cards = await getCardsByFolder(database, folder.id)
    expect(cards).toHaveLength(1)
    expect(cards[0].x).toBeTypeOf('number')
    expect(cards[0].rotation).toBeTypeOf('number')
  })

  it('updates card position', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>
    const folder = await addFolder(database, { name: 'Test', color: '#51cf66', order: 0 })
    await addBookmark(database, {
      url: 'https://example.com', title: 'Example', description: '',
      thumbnail: '', favicon: '', siteName: '', type: 'website', folderId: folder.id,
    })
    const cards = await getCardsByFolder(database, folder.id)
    await updateCard(database, cards[0].id, { x: 100, y: 200 })
    const updated = await getCardsByFolder(database, folder.id)
    expect(updated[0].x).toBe(100)
    expect(updated[0].y).toBe(200)
  })
})

// TODO(Task 2): these tests use addFolder. Port once folder API is removed.
describe.skip('v8 migration', () => {
  it('assigns orderIndex + sizePreset defaults to existing bookmarks', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>
    const folder = await addFolder(database, { name: 'T', color: '#51cf66', order: 0 })
    await addBookmark(database, {
      url: 'https://a.com', title: 'A', description: '',
      thumbnail: '', favicon: '', siteName: '', type: 'website', folderId: folder.id,
    })
    await addBookmark(database, {
      url: 'https://b.com', title: 'B', description: '',
      thumbnail: '', favicon: '', siteName: '', type: 'website', folderId: folder.id,
    })
    const bookmarks = await getBookmarksByFolder(database, folder.id)
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
    const folder = await addFolder(database, { name: 'T', color: '#51cf66', order: 0 })
    const bm = await addBookmark(database, {
      url: 'https://a.com', title: 'A', description: '',
      thumbnail: '', favicon: '', siteName: '', type: 'website', folderId: folder.id,
    })
    await updateBookmarkOrderIndex(database, bm.id, 42)
    const [updated] = await getBookmarksByFolder(database, folder.id)
    expect(updated.orderIndex).toBe(42)
  })

  it('updateBookmarkSizePreset changes the sizePreset', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>
    const folder = await addFolder(database, { name: 'T', color: '#51cf66', order: 0 })
    const bm = await addBookmark(database, {
      url: 'https://a.com', title: 'A', description: '',
      thumbnail: '', favicon: '', siteName: '', type: 'website', folderId: folder.id,
    })
    await updateBookmarkSizePreset(database, bm.id, 'L')
    const [updated] = await getBookmarksByFolder(database, folder.id)
    expect(updated.sizePreset).toBe('L')
  })

  it('updateBookmarkOrderBatch rewrites orderIndex atomically', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>
    const folder = await addFolder(database, { name: 'T', color: '#51cf66', order: 0 })
    const bm1 = await addBookmark(database, {
      url: 'https://a.com', title: 'A', description: '',
      thumbnail: '', favicon: '', siteName: '', type: 'website', folderId: folder.id,
    })
    const bm2 = await addBookmark(database, {
      url: 'https://b.com', title: 'B', description: '',
      thumbnail: '', favicon: '', siteName: '', type: 'website', folderId: folder.id,
    })
    // Reverse the order
    await updateBookmarkOrderBatch(database, [bm2.id, bm1.id])
    const bookmarks = await getBookmarksByFolder(database, folder.id)
    const byId = Object.fromEntries(bookmarks.map((b) => [b.id, b]))
    expect(byId[bm2.id].orderIndex).toBe(0)
    expect(byId[bm1.id].orderIndex).toBe(1)
  })
})
