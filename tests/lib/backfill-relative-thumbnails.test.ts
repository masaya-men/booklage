import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { initDB } from '@/lib/storage/indexeddb'
import { backfillRelativeThumbnails } from '@/lib/storage/backfill-relative-thumbnails'

describe('backfillRelativeThumbnails', () => {
  beforeEach(async () => {
    const dbs = await indexedDB.databases()
    for (const d of dbs) if (d.name) indexedDB.deleteDatabase(d.name)
  })

  it('rewrites /relative.jpg to absolute against bookmark URL origin', async () => {
    const db = await initDB()
    await db.put('bookmarks', {
      id: 'b1',
      url: 'https://labs.noomoagency.com/foo',
      title: 'Noomo', description: '',
      thumbnail: '/OpenGraph.jpg',
      favicon: '', siteName: '', type: 'website',
      savedAt: new Date().toISOString(), ogpStatus: 'fetched', tags: [],
    })
    const fixed = await backfillRelativeThumbnails(db)
    expect(fixed).toBe(1)
    const rec = await db.get('bookmarks', 'b1')
    expect(rec?.thumbnail).toBe('https://labs.noomoagency.com/OpenGraph.jpg')
    db.close()
  })

  it('leaves absolute thumbnails unchanged', async () => {
    const db = await initDB()
    await db.put('bookmarks', {
      id: 'b2',
      url: 'https://example.com/',
      title: '', description: '',
      thumbnail: 'https://cdn.example.com/img.jpg',
      favicon: '', siteName: '', type: 'website',
      savedAt: new Date().toISOString(), ogpStatus: 'fetched', tags: [],
    })
    const fixed = await backfillRelativeThumbnails(db)
    expect(fixed).toBe(0)
    const rec = await db.get('bookmarks', 'b2')
    expect(rec?.thumbnail).toBe('https://cdn.example.com/img.jpg')
    db.close()
  })

  it('leaves empty thumbnails unchanged', async () => {
    const db = await initDB()
    await db.put('bookmarks', {
      id: 'b3',
      url: 'https://example.com/',
      title: 'no-thumb', description: '',
      thumbnail: '', favicon: '', siteName: '', type: 'website',
      savedAt: new Date().toISOString(), ogpStatus: 'fetched', tags: [],
    })
    const fixed = await backfillRelativeThumbnails(db)
    expect(fixed).toBe(0)
    db.close()
  })

  it('handles protocol-relative //cdn/img.jpg', async () => {
    const db = await initDB()
    await db.put('bookmarks', {
      id: 'b4',
      url: 'https://example.com/page',
      title: '', description: '',
      thumbnail: '//cdn.example.com/img.jpg',
      favicon: '', siteName: '', type: 'website',
      savedAt: new Date().toISOString(), ogpStatus: 'fetched', tags: [],
    })
    const fixed = await backfillRelativeThumbnails(db)
    expect(fixed).toBe(1)
    const rec = await db.get('bookmarks', 'b4')
    expect(rec?.thumbnail).toBe('https://cdn.example.com/img.jpg')
    db.close()
  })

  it('is idempotent — second call finds nothing to fix', async () => {
    const db = await initDB()
    await db.put('bookmarks', {
      id: 'b5',
      url: 'https://example.com/',
      title: '', description: '',
      thumbnail: '/og.jpg',
      favicon: '', siteName: '', type: 'website',
      savedAt: new Date().toISOString(), ogpStatus: 'fetched', tags: [],
    })
    expect(await backfillRelativeThumbnails(db)).toBe(1)
    expect(await backfillRelativeThumbnails(db)).toBe(0)
    db.close()
  })
})
