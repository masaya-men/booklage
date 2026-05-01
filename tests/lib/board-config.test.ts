import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import type { IDBPDatabase } from 'idb'
import { initDB } from '@/lib/storage/indexeddb'
import { DEFAULT_BOARD_CONFIG, loadBoardConfig, saveBoardConfig } from '@/lib/storage/board-config'

let db: IDBPDatabase<unknown> | null = null

beforeEach(async () => {
  const databases = await indexedDB.databases()
  for (const info of databases) {
    if (info.name) indexedDB.deleteDatabase(info.name)
  }
})
afterEach(() => { if (db) { db.close(); db = null } })

describe('BoardConfig v9 extensions', () => {
  it('defaults include displayMode=visual and activeFilter=all', () => {
    expect(DEFAULT_BOARD_CONFIG.displayMode).toBe('visual')
    expect(DEFAULT_BOARD_CONFIG.activeFilter).toBe('all')
  })

  it('round-trips displayMode and activeFilter', async () => {
    const d = await initDB()
    db = d as unknown as IDBPDatabase<unknown>
    await saveBoardConfig(d, {
      ...DEFAULT_BOARD_CONFIG,
      displayMode: 'editorial',
      activeFilter: 'inbox',
    })
    const loaded = await loadBoardConfig(d)
    expect(loaded.displayMode).toBe('editorial')
    expect(loaded.activeFilter).toBe('inbox')
  })

  it('round-trips mood filter', async () => {
    const d = await initDB()
    db = d as unknown as IDBPDatabase<unknown>
    await saveBoardConfig(d, {
      ...DEFAULT_BOARD_CONFIG,
      activeFilter: 'mood:abc123',
    })
    const loaded = await loadBoardConfig(d)
    expect(loaded.activeFilter).toBe('mood:abc123')
  })
})
