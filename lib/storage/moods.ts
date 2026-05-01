import type { IDBPDatabase } from 'idb'
import type { MoodRecord, MoodInput } from './indexeddb'

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbLike = IDBPDatabase<any>

/** Generate a UUID v4 */
function uuid(): string {
  return crypto.randomUUID()
}

/**
 * Create a new mood.
 * @param db - The database instance
 * @param input - Mood data (name, color, order)
 * @returns The created MoodRecord
 */
export async function addMood(db: DbLike, input: MoodInput): Promise<MoodRecord> {
  const mood: MoodRecord = {
    id: uuid(),
    name: input.name,
    color: input.color,
    order: input.order,
    createdAt: Date.now(),
  }
  await db.put('moods', mood)
  return mood
}

/**
 * Get all moods sorted by their order field (ascending).
 * @param db - The database instance
 * @returns Array of MoodRecord
 */
export async function getAllMoods(db: DbLike): Promise<MoodRecord[]> {
  const list = (await db.getAll('moods')) as MoodRecord[]
  return list.sort((a, b) => a.order - b.order)
}

/**
 * Update specific fields of a mood (id and createdAt are immutable).
 * @param db - The database instance
 * @param id - The mood ID to update
 * @param updates - Partial mood fields to merge
 */
export async function updateMood(
  db: DbLike,
  id: string,
  updates: Partial<Omit<MoodRecord, 'id' | 'createdAt'>>,
): Promise<void> {
  const existing = (await db.get('moods', id)) as MoodRecord | undefined
  if (!existing) return
  await db.put('moods', { ...existing, ...updates })
}

/**
 * Delete a mood by id. No-op if it doesn't exist.
 * @param db - The database instance
 * @param id - The mood ID to delete
 */
export async function deleteMood(db: DbLike, id: string): Promise<void> {
  await db.delete('moods', id)
}

/**
 * Atomically rewrite mood order based on the supplied id sequence.
 * Each id receives its array index as its new order. Missing ids are skipped.
 * @param db - The database instance
 * @param orderedIds - The new complete order by id
 */
export async function reorderMoods(db: DbLike, orderedIds: readonly string[]): Promise<void> {
  const tx = db.transaction('moods', 'readwrite')
  const store = tx.objectStore('moods')
  for (let i = 0; i < orderedIds.length; i++) {
    const existing = (await store.get(orderedIds[i])) as MoodRecord | undefined
    if (!existing) continue
    await store.put({ ...existing, order: i })
  }
  await tx.done
}
