import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import type { IDBPDatabase } from 'idb'
import { initDB, addBookmark } from '@/lib/storage/indexeddb'

let db: IDBPDatabase<unknown> | null = null

beforeEach(async () => {
  const databases = await indexedDB.databases()
  for (const info of databases) {
    if (info.name) indexedDB.deleteDatabase(info.name)
  }
})

afterEach(() => {
  if (db) {
    db.close()
    db = null
  }
})

describe('BoardItem shape after pivot', () => {
  it('addBookmark persists tags and displayMode defaults', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>
    const bm = await addBookmark(database, {
      url: 'https://example.com', title: 'E', description: '',
      thumbnail: '', favicon: '', siteName: '', type: 'website',
    })
    expect(bm.tags).toEqual([])
    expect(bm.displayMode).toBeNull()
  })

  it('addBookmark accepts explicit tags', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>
    const bm = await addBookmark(database, {
      url: 'https://example.com', title: 'E', description: '',
      thumbnail: '', favicon: '', siteName: '', type: 'website',
      tags: ['design'],
    })
    expect(bm.tags).toEqual(['design'])
  })
})
