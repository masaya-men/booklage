'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { IDBPDatabase } from 'idb'
import type { FreePosition, CardPosition } from '@/lib/board/types'
import { extractYoutubeId, detectUrlType } from '@/lib/utils/url'
import { detectAspectRatioSource, estimateAspectRatio } from '@/lib/board/aspect-ratio'
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
  readonly gridIndex: number
  readonly freePos?: FreePosition
  readonly userOverridePos?: CardPosition  // legacy compat: same data as freePos for grid-side consumers
  readonly isRead: boolean
  readonly isDeleted: boolean
}

type DbLike = IDBPDatabase<unknown>

function deriveThumbnail(b: BookmarkRecord): string | undefined {
  if (b.thumbnail) return b.thumbnail
  const youtubeId = extractYoutubeId(b.url)
  if (youtubeId) return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`
  return undefined
}

export function computeAspectRatio(b: BookmarkRecord, c: CardRecord | undefined): number {
  // Respect user-resized cards — never recompute
  if (c?.isUserResized && c.width > 0 && c.height > 0) return c.width / c.height
  // Use cached aspectRatio if present
  if (c?.aspectRatio && c.aspectRatio > 0) return c.aspectRatio
  // Else estimate from URL + OGP metadata
  const source = detectAspectRatioSource({
    url: b.url,
    urlType: detectUrlType(b.url),
    title: b.title,
    description: b.description,
    ogImage: b.thumbnail,
  })
  return estimateAspectRatio(source)
}

function toItem(b: BookmarkRecord, c: CardRecord | undefined): BoardItem {
  const aspectRatio = computeAspectRatio(b, c)
  const hasPlacement = c?.isManuallyPlaced === true
  const w = c?.width ?? 240
  const h = c?.height ?? (w / aspectRatio)

  const freePos: FreePosition | undefined = hasPlacement && c
    ? {
        x: c.x,
        y: c.y,
        w,
        h,
        rotation: c.rotation ?? 0,
        zIndex: c.zIndex ?? 0,
        locked: c.locked ?? false,
        isUserResized: c.isUserResized ?? false,
      }
    : undefined

  return {
    bookmarkId: b.id,
    cardId: c?.id ?? '',
    title: b.title || b.url,
    thumbnail: deriveThumbnail(b),
    url: b.url,
    aspectRatio,
    gridIndex: c?.gridIndex ?? 0,
    freePos,
    userOverridePos: hasPlacement ? { x: c.x, y: c.y, w, h } : undefined,
    isRead: b.isRead ?? false,
    isDeleted: b.isDeleted ?? false,
  }
}

export function useBoardData(): {
  items: BoardItem[]
  loading: boolean
  persistFreePosition: (cardId: string, pos: FreePosition) => Promise<void>
  persistGridIndex: (cardId: string, gridIndex: number) => Promise<void>
  persistReadFlag: (bookmarkId: string, isRead: boolean) => Promise<void>
  persistSoftDelete: (bookmarkId: string, isDeleted: boolean) => Promise<void>
  /** @deprecated Use persistFreePosition instead. Removed in Task 13. */
  persistCardPosition: (cardId: string, pos: CardPosition) => Promise<void>
} {
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
      const all = bookmarks
        .filter(b => !b.isDeleted)
        .map((b) => toItem(b, cardByBookmark.get(b.id)))
      setItems(all)
      setLoading(false)
    })().catch(() => {
      if (!cancelled) setLoading(false)
    })
    return (): void => {
      cancelled = true
    }
  }, [])

  const persistFreePosition = useCallback(
    async (cardId: string, pos: FreePosition): Promise<void> => {
      const db = dbRef.current
      if (!db || !cardId) return
      await updateCard(db as Parameters<typeof updateCard>[0], cardId, {
        x: pos.x, y: pos.y,
        width: pos.w, height: pos.h,
        rotation: pos.rotation,
        zIndex: pos.zIndex,
        locked: pos.locked,
        isUserResized: pos.isUserResized,
        isManuallyPlaced: true,
      })
      // Sync local state so freeLayoutPositions sees the persisted position
      // immediately when displayedPositions clears its drag override.
      // Without this, the card snaps back to its old freePos on drag end.
      setItems((prev) =>
        prev.map((it) =>
          it.cardId === cardId
            ? { ...it, freePos: { ...pos } }
            : it,
        ),
      )
    },
    [],
  )

  const persistGridIndex = useCallback(
    async (cardId: string, gridIndex: number): Promise<void> => {
      const db = dbRef.current
      if (!db || !cardId) return
      await updateCard(db as Parameters<typeof updateCard>[0], cardId, { gridIndex })
    },
    [],
  )

  const persistReadFlag = useCallback(
    async (bookmarkId: string, isRead: boolean): Promise<void> => {
      const db = dbRef.current
      if (!db || !bookmarkId) return
      const existing = (await db.get('bookmarks', bookmarkId)) as BookmarkRecord | undefined
      if (!existing) return
      await db.put('bookmarks', { ...existing, isRead })
    },
    [],
  )

  const persistSoftDelete = useCallback(
    async (bookmarkId: string, isDeleted: boolean): Promise<void> => {
      const db = dbRef.current
      if (!db || !bookmarkId) return
      const existing = (await db.get('bookmarks', bookmarkId)) as BookmarkRecord | undefined
      if (!existing) return
      await db.put('bookmarks', {
        ...existing,
        isDeleted,
        deletedAt: isDeleted ? new Date().toISOString() : undefined,
      })
      // Remove from live items immediately when deleted.
      // Restore is NOT reflected in the current session; the item only
      // reappears after the next hook mount (page reload or remount).
      setItems((prev) => {
        if (isDeleted) return prev.filter(it => it.bookmarkId !== bookmarkId)
        return prev
      })
    },
    [],
  )

  // Temporary shim, removed in Task 13 (updates BoardRoot.tsx callsites at lines ~109 and ~142).
  // Maps CardPosition to FreePosition defaults so BoardRoot keeps compiling.
  const persistCardPosition = useCallback(
    async (cardId: string, pos: CardPosition): Promise<void> => {
      const freePos: FreePosition = {
        x: pos.x,
        y: pos.y,
        w: pos.w,
        h: pos.h,
        rotation: 0,
        zIndex: 0,
        locked: false,
        isUserResized: true,
      }
      await persistFreePosition(cardId, freePos)
    },
    [persistFreePosition],
  )

  return { items, loading, persistFreePosition, persistGridIndex, persistReadFlag, persistSoftDelete, persistCardPosition }
}
