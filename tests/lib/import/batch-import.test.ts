import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { type IDBPDatabase } from 'idb'
import { formatImportFolderName, findImportFolder } from '@/lib/import/batch-import'
import { initDB, addFolder, type FolderRecord } from '@/lib/storage/indexeddb'

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
    const result = await findImportFolder(database, new Date(2026, 3, 18, 12, 0, 0))
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
    const result = await findImportFolder(database, new Date(2026, 3, 18, 12, 0, 0))
    expect(result?.id).toBe(created.id)
  })

  it('ignores folders with similar but non-matching names', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>
    await addFolder(database, { name: 'インポート', color: '#ff6b6b', order: 0 })
    await addFolder(database, { name: 'インポート 2026-04-17', color: '#339af0', order: 1 })
    const result = await findImportFolder(database, new Date(2026, 3, 18, 12, 0, 0))
    expect(result).toBeNull()
  })
})
