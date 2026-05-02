'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { IDBPDatabase } from 'idb'
import type { FreePosition, CardPosition } from '@/lib/board/types'
import { extractYoutubeId, detectUrlType, isXDefaultThumbnail } from '@/lib/utils/url'
import { detectAspectRatioSource, estimateAspectRatio } from '@/lib/board/aspect-ratio'
import {
  initDB,
  getAllBookmarks,
  updateCard,
  updateBookmarkOrderIndex,
  updateBookmarkSizePreset,
  updateBookmarkOrderBatch,
  type BookmarkRecord,
  type CardRecord,
} from './indexeddb'

export type BoardItem = {
  readonly bookmarkId: string
  readonly cardId: string
  readonly title: string
  readonly description?: string
  readonly thumbnail?: string
  readonly url: string
  readonly aspectRatio: number
  readonly gridIndex: number
  readonly orderIndex: number
  readonly sizePreset: 'S' | 'M' | 'L'
  readonly freePos?: FreePosition
  readonly userOverridePos?: CardPosition  // legacy compat: same data as freePos for grid-side consumers
  readonly isRead: boolean
  readonly isDeleted: boolean
  readonly tags: readonly string[]
  readonly displayMode: 'visual' | 'editorial' | 'native' | null
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
    description: b.description || undefined,
    thumbnail: deriveThumbnail(b),
    url: b.url,
    aspectRatio,
    gridIndex: c?.gridIndex ?? 0,
    orderIndex: b.orderIndex ?? 0,
    sizePreset: b.sizePreset ?? 'S',
    freePos,
    userOverridePos: hasPlacement ? { x: c.x, y: c.y, w, h } : undefined,
    isRead: b.isRead ?? false,
    isDeleted: b.isDeleted ?? false,
    tags: b.tags ?? [],
    displayMode: b.displayMode ?? null,
  }
}

export function useBoardData(): {
  items: BoardItem[]
  loading: boolean
  persistFreePosition: (cardId: string, pos: FreePosition) => Promise<void>
  persistGridIndex: (cardId: string, gridIndex: number) => Promise<void>
  persistOrderIndex: (bookmarkId: string, orderIndex: number) => Promise<void>
  persistSizePreset: (bookmarkId: string, sizePreset: 'S' | 'M' | 'L') => Promise<void>
  persistOrderBatch: (orderedBookmarkIds: readonly string[]) => Promise<void>
  persistReadFlag: (bookmarkId: string, isRead: boolean) => Promise<void>
  persistSoftDelete: (bookmarkId: string, isDeleted: boolean) => Promise<void>
  persistMeasuredAspect: (cardId: string, aspectRatio: number) => Promise<void>
  /** Backfill bookmark.thumbnail. By default no-op when a "real" thumbnail is
   *  already present (so we never destroy a good og:image the bookmarklet
   *  picked up). Pass force=true to overwrite — used by the tweet syndication
   *  pipeline because the existing value is usually X's generic placeholder
   *  ("SEE WHAT'S HAPPENING") and needs to be replaced with the per-tweet
   *  photo URL. force=true with empty thumbnail clears the field, which flips
   *  the card from ImageCard back to TextCard (text-only tweets). */
  persistThumbnail: (bookmarkId: string, thumbnail: string, force?: boolean) => Promise<void>
  persistTags: (bookmarkId: string, tags: readonly string[]) => Promise<void>
  persistDisplayMode: (bookmarkId: string, displayMode: BoardItem['displayMode']) => Promise<void>
  reload: () => Promise<void>
  /** @deprecated Use persistFreePosition instead. Will be removed after full pivot. */
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
        .sort((a, b) => a.orderIndex - b.orderIndex)
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
      // Optimistic local update first — keeps UI in sync with the freshly-released drag
      // before the IDB round-trip completes (eliminates one-frame snap-back).
      setItems((prev) =>
        prev.map((it) =>
          it.cardId === cardId
            ? { ...it, freePos: { ...pos } }
            : it,
        ),
      )
      await updateCard(db as Parameters<typeof updateCard>[0], cardId, {
        x: pos.x, y: pos.y,
        width: pos.w, height: pos.h,
        rotation: pos.rotation,
        zIndex: pos.zIndex,
        locked: pos.locked,
        isUserResized: pos.isUserResized,
        isManuallyPlaced: true,
      })
    },
    [],
  )

  const persistMeasuredAspect = useCallback(
    async (cardId: string, aspectRatio: number): Promise<void> => {
      const db = dbRef.current
      if (!db || !cardId || !Number.isFinite(aspectRatio) || aspectRatio <= 0) return
      setItems((prev) =>
        prev.map((it) =>
          it.cardId === cardId && !it.freePos?.isUserResized
            ? { ...it, aspectRatio }
            : it,
        ),
      )
      await updateCard(db as Parameters<typeof updateCard>[0], cardId, { aspectRatio })
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

  const persistOrderIndex = useCallback(
    async (bookmarkId: string, orderIndex: number): Promise<void> => {
      const db = dbRef.current
      if (!db || !bookmarkId) return
      setItems((prev) =>
        prev.map((it) => (it.bookmarkId === bookmarkId ? { ...it, orderIndex } : it)),
      )
      await updateBookmarkOrderIndex(db as Parameters<typeof updateBookmarkOrderIndex>[0], bookmarkId, orderIndex)
    },
    [],
  )

  const persistSizePreset = useCallback(
    async (bookmarkId: string, sizePreset: 'S' | 'M' | 'L'): Promise<void> => {
      const db = dbRef.current
      if (!db || !bookmarkId) return
      setItems((prev) =>
        prev.map((it) => (it.bookmarkId === bookmarkId ? { ...it, sizePreset } : it)),
      )
      await updateBookmarkSizePreset(db as Parameters<typeof updateBookmarkSizePreset>[0], bookmarkId, sizePreset)
    },
    [],
  )

  const persistOrderBatch = useCallback(
    async (orderedBookmarkIds: readonly string[]): Promise<void> => {
      const db = dbRef.current
      if (!db) return
      // Optimistic local update — produce items array in the new order with
      // refreshed orderIndex fields, preserving other fields.
      setItems((prev) => {
        const byId = new Map<string, BoardItem>()
        for (const it of prev) byId.set(it.bookmarkId, it)
        const reordered: BoardItem[] = []
        for (let i = 0; i < orderedBookmarkIds.length; i++) {
          const it = byId.get(orderedBookmarkIds[i])
          if (!it) continue
          reordered.push({ ...it, orderIndex: i })
        }
        // Append items not mentioned (defensive) — preserve their current orderIndex
        for (const it of prev) {
          if (!orderedBookmarkIds.includes(it.bookmarkId)) reordered.push(it)
        }
        return reordered
      })
      await updateBookmarkOrderBatch(db as Parameters<typeof updateBookmarkOrderBatch>[0], orderedBookmarkIds)
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

  /** Backfill the bookmark's thumbnail. See type docs for force semantics. */
  const persistThumbnail = useCallback(
    async (bookmarkId: string, thumbnail: string, force = false): Promise<void> => {
      const db = dbRef.current
      if (!db || !bookmarkId) return
      // Without force, only a missing-or-X-default thumbnail can be filled —
      // never overwrite a good og:image. The empty-thumbnail clear path is
      // gated behind force=true so the default no-op contract is preserved.
      if (!force && !thumbnail) return
      const existing = (await db.get('bookmarks', bookmarkId)) as BookmarkRecord | undefined
      if (!existing) return
      if (!force && existing.thumbnail && !isXDefaultThumbnail(existing.thumbnail)) return
      await db.put('bookmarks', { ...existing, thumbnail })
      setItems((prev) =>
        prev.map((it) =>
          it.bookmarkId === bookmarkId
            ? { ...it, thumbnail: thumbnail || undefined }
            : it,
        ),
      )
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

  const persistTags = useCallback(
    async (bookmarkId: string, tags: readonly string[]): Promise<void> => {
      const db = dbRef.current
      if (!db || !bookmarkId) return
      const existing = (await db.get('bookmarks', bookmarkId)) as BookmarkRecord | undefined
      if (!existing) return
      await db.put('bookmarks', { ...existing, tags: [...tags] })
      setItems((prev) => prev.map((it) => (it.bookmarkId === bookmarkId ? { ...it, tags: [...tags] } : it)))
    },
    [],
  )

  const persistDisplayMode = useCallback(
    async (bookmarkId: string, displayMode: BoardItem['displayMode']): Promise<void> => {
      const db = dbRef.current
      if (!db || !bookmarkId) return
      const existing = (await db.get('bookmarks', bookmarkId)) as BookmarkRecord | undefined
      if (!existing) return
      await db.put('bookmarks', { ...existing, displayMode })
      setItems((prev) =>
        prev.map((it) => (it.bookmarkId === bookmarkId ? { ...it, displayMode } : it)),
      )
    },
    [],
  )

  const reload = useCallback(async (): Promise<void> => {
    const db = dbRef.current
    if (!db) return
    const bookmarks = await getAllBookmarks(db as Parameters<typeof getAllBookmarks>[0])
    const cards = (await db.getAll('cards')) as CardRecord[]
    const cardByBookmark = new Map<string, CardRecord>()
    for (const c of cards) cardByBookmark.set(c.bookmarkId, c)
    const all = bookmarks
      .filter((b) => !b.isDeleted)
      .map((b) => toItem(b, cardByBookmark.get(b.id)))
      .sort((a, b) => a.orderIndex - b.orderIndex)
    setItems(all)
  }, [])

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

  return {
    items,
    loading,
    persistFreePosition,
    persistGridIndex,
    persistOrderIndex,
    persistSizePreset,
    persistOrderBatch,
    persistReadFlag,
    persistSoftDelete,
    persistMeasuredAspect,
    persistThumbnail,
    persistTags,
    persistDisplayMode,
    reload,
    persistCardPosition,
  }
}
