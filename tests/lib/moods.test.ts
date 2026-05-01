import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import type { IDBPDatabase } from 'idb'
import { initDB } from '@/lib/storage/indexeddb'
import { addMood, getAllMoods, updateMood, deleteMood, reorderMoods } from '@/lib/storage/moods'

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

describe('moods CRUD', () => {
  it('addMood creates a mood with generated id + createdAt', async () => {
    const d = await initDB()
    db = d as unknown as IDBPDatabase<unknown>
    const m = await addMood(d, { name: 'design', color: '#7c5cfc', order: 0 })
    expect(m.id).toMatch(/[-0-9a-f]+/)
    expect(typeof m.createdAt).toBe('number')
    expect(m.name).toBe('design')
  })

  it('getAllMoods returns moods sorted by order', async () => {
    const d = await initDB()
    db = d as unknown as IDBPDatabase<unknown>
    await addMood(d, { name: 'b', color: '#aaa', order: 1 })
    await addMood(d, { name: 'a', color: '#bbb', order: 0 })
    const moods = await getAllMoods(d)
    expect(moods.map((m) => m.name)).toEqual(['a', 'b'])
  })

  it('updateMood merges fields', async () => {
    const d = await initDB()
    db = d as unknown as IDBPDatabase<unknown>
    const m = await addMood(d, { name: 'design', color: '#aaa', order: 0 })
    await updateMood(d, m.id, { name: 'Design' })
    const [updated] = await getAllMoods(d)
    expect(updated.name).toBe('Design')
    expect(updated.color).toBe('#aaa')
  })

  it('deleteMood removes the record', async () => {
    const d = await initDB()
    db = d as unknown as IDBPDatabase<unknown>
    const m = await addMood(d, { name: 'tmp', color: '#aaa', order: 0 })
    await deleteMood(d, m.id)
    expect(await getAllMoods(d)).toHaveLength(0)
  })

  it('reorderMoods rewrites order atomically', async () => {
    const d = await initDB()
    db = d as unknown as IDBPDatabase<unknown>
    const a = await addMood(d, { name: 'a', color: '#aaa', order: 0 })
    const b = await addMood(d, { name: 'b', color: '#bbb', order: 1 })
    const c = await addMood(d, { name: 'c', color: '#ccc', order: 2 })
    await reorderMoods(d, [c.id, a.id, b.id])
    const moods = await getAllMoods(d)
    expect(moods.map((m) => m.name)).toEqual(['c', 'a', 'b'])
  })
})
