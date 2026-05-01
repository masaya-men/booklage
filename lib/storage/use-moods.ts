'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { IDBPDatabase } from 'idb'
import type { MoodRecord, MoodInput } from './indexeddb'
import { initDB } from './indexeddb'
import { addMood, getAllMoods, updateMood as updMood, deleteMood as delMood } from './moods'

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbLike = IDBPDatabase<any>

export function useMoods(): {
  moods: MoodRecord[]
  loading: boolean
  create: (input: MoodInput) => Promise<MoodRecord>
  rename: (id: string, name: string) => Promise<void>
  remove: (id: string) => Promise<void>
  reload: () => Promise<void>
} {
  const [moods, setMoods] = useState<MoodRecord[]>([])
  const [loading, setLoading] = useState(true)
  const dbRef = useRef<DbLike | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    const db = dbRef.current
    if (!db) return
    const list = await getAllMoods(db)
    setMoods(list)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async (): Promise<void> => {
      const db = (await initDB()) as unknown as DbLike
      if (cancelled) return
      dbRef.current = db
      const list = await getAllMoods(db)
      if (cancelled) return
      setMoods(list)
      setLoading(false)
    })().catch(() => {
      if (!cancelled) setLoading(false)
    })
    return (): void => { cancelled = true }
  }, [])

  const create = useCallback(async (input: MoodInput): Promise<MoodRecord> => {
    const db = dbRef.current
    if (!db) throw new Error('moods db not ready')
    const created = await addMood(db, input)
    setMoods((prev) => [...prev, created].sort((a, b) => a.order - b.order))
    return created
  }, [])

  const rename = useCallback(async (id: string, name: string): Promise<void> => {
    const db = dbRef.current
    if (!db) return
    await updMood(db, id, { name })
    setMoods((prev) => prev.map((m) => (m.id === id ? { ...m, name } : m)))
  }, [])

  const remove = useCallback(async (id: string): Promise<void> => {
    const db = dbRef.current
    if (!db) return
    await delMood(db, id)
    setMoods((prev) => prev.filter((m) => m.id !== id))
  }, [])

  return { moods, loading, create, rename, remove, reload }
}
