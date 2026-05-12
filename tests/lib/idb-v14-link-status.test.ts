import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { openDB } from 'idb'
import { initDB } from '@/lib/storage/indexeddb'
import { DB_NAME, DB_VERSION } from '@/lib/constants'

describe('IDB v14 migration', () => {
  beforeEach(async () => {
    const databases = await indexedDB.databases()
    for (const dbInfo of databases) {
      if (dbInfo.name) indexedDB.deleteDatabase(dbInfo.name)
    }
  })

  it('bumps DB_VERSION to 14', () => {
    expect(DB_VERSION).toBe(14)
  })

  it('opens cleanly on cold start', async () => {
    const db = await initDB()
    expect(db.version).toBe(14)
    db.close()
  })

  it('upgrades v13 → v14 preserving existing bookmarks', async () => {
    // Seed v13 with minimal stores
    const v13 = await openDB(DB_NAME, 13, {
      upgrade(db) {
        db.createObjectStore('bookmarks', { keyPath: 'id' })
        db.createObjectStore('moods', { keyPath: 'id' })
        db.createObjectStore('cards', { keyPath: 'id' })
        db.createObjectStore('settings', { keyPath: 'key' })
        db.createObjectStore('preferences', { keyPath: 'key' })
      },
    })
    await v13.put('bookmarks', {
      id: 'b1',
      url: 'https://example.com',
      title: 't',
      description: '',
      thumbnail: '',
      favicon: '',
      siteName: '',
      type: 'website',
      savedAt: new Date().toISOString(),
      ogpStatus: 'fetched',
      tags: [],
    })
    v13.close()

    // Now open at v14 — should migrate cleanly
    const v14 = await initDB()
    const rec = await v14.get('bookmarks', 'b1')
    expect(rec).toBeDefined()
    expect(rec?.id).toBe('b1')
    // linkStatus and lastCheckedAt should be undefined on legacy records
    expect((rec as { linkStatus?: string }).linkStatus).toBeUndefined()
    expect((rec as { lastCheckedAt?: number }).lastCheckedAt).toBeUndefined()
    v14.close()
  })

  it('persists linkStatus and lastCheckedAt on new write', async () => {
    const db = await initDB()
    await db.put('bookmarks', {
      id: 'b2',
      url: 'https://example.com/dead',
      title: 'dead',
      description: '', thumbnail: '', favicon: '', siteName: '',
      type: 'website',
      savedAt: new Date().toISOString(),
      ogpStatus: 'fetched',
      tags: [],
      linkStatus: 'gone',
      lastCheckedAt: 1715000000000,
    })
    const back = await db.get('bookmarks', 'b2')
    expect((back as { linkStatus?: string }).linkStatus).toBe('gone')
    expect((back as { lastCheckedAt?: number }).lastCheckedAt).toBe(1715000000000)
    db.close()
  })
})
