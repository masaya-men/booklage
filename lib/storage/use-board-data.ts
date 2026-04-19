'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { IDBPDatabase } from 'idb'
import type { CardPosition } from '@/lib/board/types'
import { extractYoutubeId } from '@/lib/utils/url'
import {
  initDB,
  getAllBookmarks,
  updateCard,
  type BookmarkRecord,
  type CardRecord,
} from './indexeddb'

export type BoardItem = {
  readonly bookmarkId: string
  readonly cardId: string
  readonly title: string
  readonly thumbnail?: string
  readonly url: string
  readonly aspectRatio: number
  readonly userOverridePos?: CardPosition
}

type DbLike = IDBPDatabase<unknown>

function deriveThumbnail(b: BookmarkRecord): string | undefined {
  if (b.thumbnail) return b.thumbnail
  const youtubeId = extractYoutubeId(b.url)
  if (youtubeId) return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`
  return undefined
}

function toItem(b: BookmarkRecord, c: CardRecord | undefined): BoardItem {
  const w = c?.width ?? 240
  const h = c?.height ?? 180
  const hasPlacement = c?.isManuallyPlaced === true
  return {
    bookmarkId: b.id,
    cardId: c?.id ?? '',
    title: b.title || b.url,
    thumbnail: deriveThumbnail(b),
    url: b.url,
    aspectRatio: w / h,
    userOverridePos: hasPlacement ? { x: c.x, y: c.y, w, h } : undefined,
  }
}

export function useBoardData() {
  const [items, setItems] = useState<BoardItem[]>([])
  const [loading, setLoading] = useState(true)
  const dbRef = useRef<DbLike | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async (): Promise<void> => {
      const db = (await initDB()) as unknown as DbLike
      if (cancelled) return
      dbRef.current = db
      const bookmarks = await getAllBookmarks(db as Parameters<typeof getAllBookmarks>[0])
      const cards = (await db.getAll('cards')) as CardRecord[]
      const cardByBookmark = new Map<string, CardRecord>()
      for (const c of cards) cardByBookmark.set(c.bookmarkId, c)
      if (cancelled) return
      setItems(bookmarks.map((b) => toItem(b, cardByBookmark.get(b.id))))
      setLoading(false)
    })().catch(() => {
      if (!cancelled) setLoading(false)
    })
    return (): void => {
      cancelled = true
    }
  }, [])

  const persistCardPosition = useCallback(
    async (cardId: string, pos: CardPosition): Promise<void> => {
      const db = dbRef.current
      if (!db || !cardId) return
      await updateCard(db as Parameters<typeof updateCard>[0], cardId, {
        x: pos.x,
        y: pos.y,
        width: pos.w,
        height: pos.h,
        isManuallyPlaced: true,
      })
    },
    [],
  )

  return { items, loading, persistCardPosition }
}
