import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { type IDBPDatabase } from 'idb'
import { formatImportFolderName, findImportFolder } from '@/lib/import/batch-import'
import { initDB, addFolder, getAllFolders, getAllBookmarks, getBookmarksByFolder, type FolderRecord } from '@/lib/storage/indexeddb'

describe('formatImportFolderName', () => {
  it('returns インポート YYYY-MM-DD in local date', () => {
    const date = new Date(2026, 3, 18, 12, 0, 0) // 2026-04-18 local
    expect(formatImportFolderName(date)).toBe('インポート 2026-04-18')
  })

  it('zero-pads month and day', () => {
    const date = new Date(2026, 0, 5, 12, 0, 0) // 2026-01-05 local
    expect(formatImportFolderName(date)).toBe('インポート 2026-01-05')
  })
})

describe('findImportFolder', () => {
  let db: IDBPDatabase<unknown> | null = null

  beforeEach(async () => {
    const databases = await globalThis.indexedDB.databases()
    for (const info of databases) {
      if (info.name) globalThis.indexedDB.deleteDatabase(info.name)
    }
  })

  afterEach(() => {
    if (db) {
      db.close()
      db = null
    }
  })

  it('returns null when no folder matches today', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>
    const result = await findImportFolder(db!, new Date(2026, 3, 18, 12, 0, 0))
    expect(result).toBeNull()
  })

  it('returns the folder record when a matching folder exists', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>
    const created: FolderRecord = await addFolder(database, {
      name: 'インポート 2026-04-18',
      color: '#ff6b6b',
      order: 0,
    })
    const result = await findImportFolder(db!, new Date(2026, 3, 18, 12, 0, 0))
    expect(result?.id).toBe(created.id)
  })

  it('ignores folders with similar but non-matching names', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>
    await addFolder(database, { name: 'インポート', color: '#ff6b6b', order: 0 })
    await addFolder(database, { name: 'インポート 2026-04-17', color: '#339af0', order: 1 })
    const result = await findImportFolder(db!, new Date(2026, 3, 18, 12, 0, 0))
    expect(result).toBeNull()
  })
})

import { executeImport } from '@/lib/import/batch-import'
import type { ImportedBookmark } from '@/lib/import/types'

describe('executeImport (single-folder)', () => {
  let db: IDBPDatabase<unknown> | null = null

  beforeEach(async () => {
    const databases = await globalThis.indexedDB.databases()
    for (const info of databases) {
      if (info.name) globalThis.indexedDB.deleteDatabase(info.name)
    }
  })

  afterEach(() => {
    if (db) {
      db.close()
      db = null
    }
  })

  const bookmarks: ImportedBookmark[] = [
    { url: 'https://a.example.com', title: 'A', source: 'browser', folder: 'Work' },
    { url: 'https://b.example.com', title: 'B', source: 'browser', folder: 'Recipe' },
    { url: 'https://c.example.com', title: 'C', source: 'browser' },
  ]

  it('creates インポート YYYY-MM-DD folder on first run and puts all bookmarks there', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>

    const result = await executeImport(db!, bookmarks, new Date(2026, 3, 18, 12, 0, 0))

    expect(result.saved).toBe(3)
    expect(result.importFolderId).toBeTruthy()

    const folders = await getAllFolders(database)
    const importFolder = folders.find((f) => f.name === 'インポート 2026-04-18')
    expect(importFolder?.id).toBe(result.importFolderId)

    const inFolder = await getBookmarksByFolder(database, result.importFolderId)
    expect(inFolder).toHaveLength(3)
  })

  it('ignores the parser-provided folder field entirely', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>

    await executeImport(db!, bookmarks, new Date(2026, 3, 18, 12, 0, 0))

    const folders = await getAllFolders(database)
    const names = folders.map((f) => f.name)
    expect(names).not.toContain('Work')
    expect(names).not.toContain('Recipe')
  })

  it('reuses the same folder for same-day re-import', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>
    const date = new Date(2026, 3, 18, 12, 0, 0)

    const first = await executeImport(db!, bookmarks, date)
    const more: ImportedBookmark[] = [
      { url: 'https://d.example.com', title: 'D', source: 'browser' },
      { url: 'https://e.example.com', title: 'E', source: 'browser' },
    ]
    const second = await executeImport(db!, more, date)

    expect(second.importFolderId).toBe(first.importFolderId)

    const inFolder = await getBookmarksByFolder(database, first.importFolderId)
    expect(inFolder).toHaveLength(5)

    const folders = await getAllFolders(database)
    const importFolders = folders.filter((f) => f.name.startsWith('インポート'))
    expect(importFolders).toHaveLength(1)
  })

  it('creates a new folder when importing on a different date', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>

    const r1 = await executeImport(db!, bookmarks, new Date(2026, 3, 18, 12, 0, 0))
    const r2 = await executeImport(
      db!,
      [{ url: 'https://z.example.com', title: 'Z', source: 'browser' }],
      new Date(2026, 3, 19, 12, 0, 0),
    )

    expect(r2.importFolderId).not.toBe(r1.importFolderId)

    const folders = await getAllFolders(database)
    const importFolders = folders.filter((f) => f.name.startsWith('インポート'))
    expect(importFolders.map((f) => f.name).sort()).toEqual([
      'インポート 2026-04-18',
      'インポート 2026-04-19',
    ])
  })

  it('still skips duplicates within the same import', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>
    const withDup: ImportedBookmark[] = [
      ...bookmarks,
      { url: 'https://a.example.com', title: 'Dup A', source: 'browser' },
    ]

    const result = await executeImport(db!, withDup, new Date(2026, 3, 18, 12, 0, 0))

    expect(result.saved).toBe(3)
    expect(result.skipped).toBe(1)

    const all = await getAllBookmarks(database)
    expect(all).toHaveLength(3)
  })
})
