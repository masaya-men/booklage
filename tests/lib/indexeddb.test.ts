import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { type IDBPDatabase } from 'idb'
import {
  initDB, addBookmark, getBookmarksByFolder, addFolder, getAllFolders,
  updateCard, getCardsByFolder, deleteBookmark,
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

describe('folders', () => {
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

describe('bookmarks', () => {
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

describe('cards', () => {
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
