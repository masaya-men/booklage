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
  updateBookmarkOrderBatch,
  persistCustomCardWidth,
  clearCustomCardWidth,
  clearAllCustomCardWidths,
  persistPhotos as persistPhotosDb,
  type BookmarkRecord,
  type CardRecord,
} from './indexeddb'
import { presetToCardWidth } from '@/lib/board/size-migration'

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
  readonly cardWidth: number
  /** v11: true when the user has manually resized this card via the
   *  corner ResizeHandle. The header SizePicker no longer affects it,
   *  and a "reset size" affordance is shown on the card. */
  readonly customCardWidth: boolean
  readonly freePos?: FreePosition
  readonly userOverridePos?: CardPosition  // legacy compat: same data as freePos for grid-side consumers
  readonly isRead: boolean
  readonly isDeleted: boolean
  readonly tags: readonly string[]
  readonly displayMode: 'visual' | 'editorial' | 'native' | null
  /** True when the bookmark's source is known to be a video. Drives the
   *  small play-overlay badge on the board grid. undefined = unknown,
   *  treated as "do not show overlay" so we don't put a play icon on a
   *  still photo. */
  readonly hasVideo?: boolean
  /** All photo URLs for multi-image posts (X tweets with up to 4 images,
   *  Bluesky posts with up to 4 images). photos[0] equals thumbnail. Empty
   *  / undefined → single-image card with no hover swap. I-07 Phase 1. */
  readonly photos?: readonly string[]
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
    cardWidth: typeof b.cardWidth === 'number' ? b.cardWidth : presetToCardWidth(b.sizePreset),
    customCardWidth: b.customCardWidth === true,
    freePos,
    userOverridePos: hasPlacement ? { x: c.x, y: c.y, w, h } : undefined,
    isRead: b.isRead ?? false,
    isDeleted: b.isDeleted ?? false,
    tags: b.tags ?? [],
    displayMode: b.displayMode ?? null,
    hasVideo: b.hasVideo,
    photos: b.photos,
  }
}

export function useBoardData(): {
  items: BoardItem[]
  loading: boolean
  persistFreePosition: (cardId: string, pos: FreePosition) => Promise<void>
  persistGridIndex: (cardId: string, gridIndex: number) => Promise<void>
  persistOrderIndex: (bookmarkId: string, orderIndex: number) => Promise<void>
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
  /** Mark a bookmark as a video source. Called by the tweet-meta backfill
   *  in BoardRoot when meta.hasVideo is true; written through to IDB so
   *  the play-overlay badge survives reloads. No-op when the value is
   *  already what we'd write (avoids a setItems re-render storm).
   */
  persistVideoFlag: (bookmarkId: string, hasVideo: boolean) => Promise<void>
  /** Persist the multi-image photo URL array for a bookmark. Pass an empty
   *  array to clear back to single-image. I-07 Phase 1. */
  persistPhotos: (bookmarkId: string, photos: readonly string[]) => Promise<void>
  persistTags: (bookmarkId: string, tags: readonly string[]) => Promise<void>
  persistDisplayMode: (bookmarkId: string, displayMode: BoardItem['displayMode']) => Promise<void>
  reload: () => Promise<void>
  /** Write a manual resize: stores the new width AND flips
   *  `customCardWidth` to true so the header SizePicker stops touching
   *  this card. Called from ResizeHandle pointerup. */
  persistCustomWidth: (bookmarkId: string, width: number) => Promise<void>
  /** Drop a single bookmark's `customCardWidth` flag back to false.
   *  The card immediately follows the global SizePicker again. */
  resetCustomWidth: (bookmarkId: string) => Promise<void>
  /** Bulk drop the `customCardWidth` flag on every bookmark that had
   *  it set. Returns the ids that were actually reset so callers can
   *  prune their in-memory override map cheaply. */
  resetAllCustomWidths: () => Promise<readonly string[]>
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
      // No-op when the value is already what we'd write. Without this guard,
      // force=true callers can spin React: setItems creates a fresh array
      // even when the underlying data is unchanged, which invalidates any
      // useMemo([items, ...]) downstream and can re-trigger effects that
      // call back into persistThumbnail. Cheap O(1) check, defense in depth.
      const normalized = thumbnail || undefined
      if ((existing.thumbnail ?? undefined) === normalized) return
      await db.put('bookmarks', { ...existing, thumbnail })
      setItems((prev) =>
        prev.map((it) =>
          it.bookmarkId === bookmarkId
            ? { ...it, thumbnail: normalized }
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

  const persistVideoFlag = useCallback(
    async (bookmarkId: string, hasVideo: boolean): Promise<void> => {
      const db = dbRef.current
      if (!db || !bookmarkId) return
      const existing = (await db.get('bookmarks', bookmarkId)) as BookmarkRecord | undefined
      if (!existing) return
      // No-op when already at the desired value. Defense against the
      // backfill loop firing repeatedly on items.length changes — without
      // this guard each "true" call would invalidate items reference and
      // re-trigger every effect that depends on it.
      if ((existing.hasVideo ?? false) === hasVideo) return
      await db.put('bookmarks', { ...existing, hasVideo })
      setItems((prev) =>
        prev.map((it) =>
          it.bookmarkId === bookmarkId ? { ...it, hasVideo } : it,
        ),
      )
    },
    [],
  )

  const persistPhotos = useCallback(
    async (bookmarkId: string, photos: readonly string[]): Promise<void> => {
      const db = dbRef.current
      if (!db || !bookmarkId) return
      await persistPhotosDb(
        db as Parameters<typeof persistPhotosDb>[0],
        bookmarkId,
        photos,
      )
      const next = photos.length === 0 ? undefined : photos
      setItems((prev) =>
        prev.map((it) =>
          it.bookmarkId === bookmarkId ? { ...it, photos: next } : it,
        ),
      )
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

  const persistCustomWidth = useCallback(
    async (bookmarkId: string, width: number): Promise<void> => {
      const db = dbRef.current
      if (!db || !bookmarkId) return
      // Optimistic local update first — keeps the resize handle's
      // pointerup feel snappy even before the IDB round-trip lands.
      setItems((prev) =>
        prev.map((it) =>
          it.bookmarkId === bookmarkId
            ? { ...it, cardWidth: width, customCardWidth: true }
            : it,
        ),
      )
      await persistCustomCardWidth(
        db as Parameters<typeof persistCustomCardWidth>[0],
        bookmarkId,
        width,
      )
    },
    [],
  )

  const resetCustomWidth = useCallback(
    async (bookmarkId: string): Promise<void> => {
      const db = dbRef.current
      if (!db || !bookmarkId) return
      setItems((prev) =>
        prev.map((it) =>
          it.bookmarkId === bookmarkId ? { ...it, customCardWidth: false } : it,
        ),
      )
      await clearCustomCardWidth(
        db as Parameters<typeof clearCustomCardWidth>[0],
        bookmarkId,
      )
    },
    [],
  )

  const resetAllCustomWidths = useCallback(async (): Promise<readonly string[]> => {
    const db = dbRef.current
    if (!db) return []
    setItems((prev) =>
      prev.map((it) => (it.customCardWidth ? { ...it, customCardWidth: false } : it)),
    )
    return clearAllCustomCardWidths(
      db as Parameters<typeof clearAllCustomCardWidths>[0],
    )
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
    persistOrderBatch,
    persistReadFlag,
    persistSoftDelete,
    persistMeasuredAspect,
    persistThumbnail,
    persistVideoFlag,
    persistPhotos,
    persistTags,
    persistDisplayMode,
    reload,
    persistCustomWidth,
    resetCustomWidth,
    resetAllCustomWidths,
    persistCardPosition,
  }
}
