'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { computeColumnMasonry } from '@/lib/board/column-masonry'
import type { MasonryCard } from '@/lib/board/column-masonry'
import {
  DEFAULT_THEME_ID,
  getThemeMeta,
} from '@/lib/board/theme-registry'
import { BOARD_INNER, COLUMN_MASONRY, SIZE_PRESET_SPAN } from '@/lib/board/constants'
import type { BoardFilter, DisplayMode } from '@/lib/board/types'
import { applyFilter } from '@/lib/board/filter'
import { useBoardData } from '@/lib/storage/use-board-data'
import { subscribeBookmarkSaved } from '@/lib/board/channel'
import { detectUrlType, extractTweetId } from '@/lib/utils/url'
import { fetchTweetMeta } from '@/lib/embed/tweet-meta'
import { useMoods } from '@/lib/storage/use-moods'
import { initDB } from '@/lib/storage/indexeddb'
import { loadBoardConfig, saveBoardConfig } from '@/lib/storage/board-config'
import { ThemeLayer } from './ThemeLayer'
import { CardsLayer } from './CardsLayer'
import { InteractionLayer } from './InteractionLayer'
import { Toolbar } from './Toolbar'
import { BookmarkletInstallModal } from '@/components/bookmarklet/BookmarkletInstallModal'
import { EmptyStateWelcome } from '@/components/bookmarklet/EmptyStateWelcome'
import { Lightbox } from './Lightbox'
import styles from './BoardRoot.module.css'

// Visible breathing room above the board's first card, in CSS pixels.
// Cards' world coords start at y=0 (masonry cursor); this offset is applied
// in the cards wrapper's transform so the first row never kisses the Toolbar
// pill. Extends the scroll range via contentBounds.height.
const BOARD_TOP_PAD_PX = 80

export function BoardRoot() {
  const { items, loading, persistSizePreset, persistOrderBatch, persistMeasuredAspect, persistThumbnail, reload } = useBoardData()
  const { moods } = useMoods()
  const [activeFilter, setActiveFilter] = useState<BoardFilter>('all')
  const [displayMode, setDisplayMode] = useState<DisplayMode>('visual')
  const [viewport, setViewport] = useState({ x: 0, y: 0, w: 1200, h: 800 })
  // Lifted from InteractionLayer so CardsLayer can also observe Space-held
  // state and bail its pointerdown handler — letting the event bubble up to
  // InteractionLayer where pan engagement lives.
  const [spaceHeld, setSpaceHeld] = useState<boolean>(false)
  const [bookmarkletModalOpen, setBookmarkletModalOpen] = useState<boolean>(false)
  const [hoveredBookmarkId, setHoveredBookmarkId] = useState<string | null>(null)
  const [lightboxItemId, setLightboxItemId] = useState<string | null>(null)
  // Captured at click time so Lightbox can grow from the card's exact screen
  // position (FLIP). Cleared on close. Plain DOMRect — never reactive past
  // open, so a stale rect after pan/scroll is fine: it only seeds the open
  // animation, the close animation does not use it.
  const [lightboxOriginRect, setLightboxOriginRect] = useState<DOMRect | null>(null)
  const [newlyAddedIds, setNewlyAddedIds] = useState<ReadonlySet<string>>(new Set())
  // Ref points at the inner dark canvas — viewport.w/h reflect the canvas's
  // inner dimensions (window minus the outer-frame margin), so masonry layout
  // and culling all work in canvas-local coordinates.
  const canvasRef = useRef<HTMLDivElement>(null)

  // destefanis 流: ページ自体スクロールしない (overflow:hidden)。
  // pan は内部 InteractionLayer のみで担う。board ページから抜けたら復元。
  useEffect(() => {
    if (typeof document === 'undefined') return
    const html = document.documentElement
    const body = document.body
    const prevHtmlOverflow = html.style.overflow
    const prevBodyOverflow = body.style.overflow
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    return (): void => {
      html.style.overflow = prevHtmlOverflow
      body.style.overflow = prevBodyOverflow
    }
  }, [])

  // Window-level Space-key tracking for hold-to-pan. Lifted here from
  // InteractionLayer so both InteractionLayer (engagement) and CardsLayer
  // (early-bail in card pointerdown) can read the same state.
  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if (target.isContentEditable) return true
      return false
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.code !== 'Space') return
      if (isEditableTarget(e.target)) return
      // Prevent default page scroll while Space is held for pan-mode.
      e.preventDefault()
      setSpaceHeld(true)
    }
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.code !== 'Space') return
      setSpaceHeld(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return (): void => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  // Cursor hint while Space is held. Owned here (not InteractionLayer) so the
  // hint matches the lifted state. Always restores on unmount.
  // Also disables native text/element selection on the body so that Space+drag
  // pan never triggers the browser's blue selection rectangle when the drag
  // starts on a card. Uses setProperty/removeProperty to keep types clean and
  // to cover the -webkit- prefixed variant for Safari/older Chrome.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const body = document.body
    if (spaceHeld) {
      body.style.cursor = 'grab'
      body.style.setProperty('user-select', 'none')
      body.style.setProperty('-webkit-user-select', 'none')
    } else {
      body.style.cursor = ''
      body.style.removeProperty('user-select')
      body.style.removeProperty('-webkit-user-select')
    }
    return (): void => {
      body.style.cursor = ''
      body.style.removeProperty('user-select')
      body.style.removeProperty('-webkit-user-select')
    }
  }, [spaceHeld])

  // Hydrate activeFilter and displayMode from persisted BoardConfig.
  useEffect(() => {
    let cancelled = false
    void (async (): Promise<void> => {
      const db = await initDB()
      if (cancelled) return
      const cfg = await loadBoardConfig(db)
      if (cancelled) return
      setActiveFilter(cfg.activeFilter)
      setDisplayMode(cfg.displayMode)
    })()
    return (): void => { cancelled = true }
  }, [])

  useEffect(() => {
    const update = (): void => {
      const el = canvasRef.current
      if (!el) return
      setViewport((v) => ({ ...v, w: el.clientWidth, h: el.clientHeight }))
    }
    update()
    window.addEventListener('resize', update)
    return (): void => window.removeEventListener('resize', update)
  }, [])

  const filteredItems = useMemo(() => applyFilter(items, activeFilter), [items, activeFilter])

  const masonryCards = useMemo<MasonryCard[]>(
    () =>
      filteredItems.map((it) => ({
        id: it.bookmarkId,
        aspectRatio: it.aspectRatio,
        columnSpan: SIZE_PRESET_SPAN[it.sizePreset],
      })),
    [filteredItems],
  )

  const themeMeta = getThemeMeta(DEFAULT_THEME_ID)

  // Cards span the full width of the inner dark canvas with a destefanis-
  // style half-gap on each side (SIDE_PADDING_PX = COLUMN_MASONRY.GAP_PX / 2).
  // No sidebar reservation, no max-width cap — the canvas is the whole stage.
  const effectiveLayoutWidth = Math.max(0, viewport.w - 2 * BOARD_INNER.SIDE_PADDING_PX)
  const horizontalOffset = BOARD_INNER.SIDE_PADDING_PX

  const layout = useMemo(
    () =>
      computeColumnMasonry({
        cards: masonryCards,
        containerWidth: effectiveLayoutWidth,
        gap: COLUMN_MASONRY.GAP_PX,
        targetColumnUnit: COLUMN_MASONRY.TARGET_COLUMN_UNIT_PX,
      }),
    [masonryCards, effectiveLayoutWidth],
  )

  // Actual content bounds — tracks the furthest right/bottom any card reaches,
  // using masonry positions (freePos not used in masonry mode) plus overrides
  // that Task 12 will populate during drag-to-reorder.
  // BOARD_TOP_PAD_PX gives the board breathing room at the top so the first
  // row does not collide with the toolbar pill; added to the total so scroll
  // range still reaches cards after the shift in the cards wrapper transform.
  // SCROLL_OVERFLOW_MARGIN adds room below the last card so a user can scroll
  // further down.
  const contentBounds = useMemo(() => {
    let maxRight = 0
    let maxBottom = 0
    for (const it of filteredItems) {
      const p = layout.positions[it.bookmarkId]
      if (!p) continue
      const right = p.x + p.w
      const bottom = p.y + p.h
      if (right > maxRight) maxRight = right
      if (bottom > maxBottom) maxBottom = bottom
    }
    const SCROLL_OVERFLOW_MARGIN = 600
    return {
      width: Math.max(layout.totalWidth, maxRight + SCROLL_OVERFLOW_MARGIN),
      height: Math.max(
        layout.totalHeight + BOARD_TOP_PAD_PX,
        maxBottom + BOARD_TOP_PAD_PX + SCROLL_OVERFLOW_MARGIN,
      ),
    }
  }, [filteredItems, layout.positions, layout.totalWidth, layout.totalHeight])

  const handleScroll = useCallback(
    (dx: number, dy: number): void => {
      setViewport((v) => {
        const maxX = Math.max(0, contentBounds.width - v.w)
        const maxY = Math.max(0, contentBounds.height - v.h)
        return {
          ...v,
          x: Math.min(Math.max(v.x + dx, 0), maxX),
          y: Math.min(Math.max(v.y + dy, 0), maxY),
        }
      })
    },
    [contentBounds.width, contentBounds.height],
  )

  const handleCyclePreset = useCallback(
    (bookmarkId: string, next: 'S' | 'M' | 'L'): void => {
      void persistSizePreset(bookmarkId, next)
    },
    [persistSizePreset],
  )

  const handleCardClick = useCallback((bookmarkId: string, originRect: DOMRect): void => {
    setLightboxOriginRect(originRect)
    setLightboxItemId(bookmarkId)
  }, [])

  const handleLightboxClose = useCallback((): void => {
    setLightboxItemId(null)
    setLightboxOriginRect(null)
  }, [])

  const lightboxItem = useMemo(
    () => items.find((it) => it.bookmarkId === lightboxItemId) ?? null,
    [items, lightboxItemId],
  )

  const handleDropOrder = useCallback(
    (orderedBookmarkIds: readonly string[]): void => {
      void persistOrderBatch(orderedBookmarkIds)
    },
    [persistOrderBatch],
  )

  const handleDisplayModeChange = useCallback((m: DisplayMode): void => {
    setDisplayMode(m)
    void (async (): Promise<void> => {
      const db = await initDB()
      const cfg = await loadBoardConfig(db)
      await saveBoardConfig(db, { ...cfg, displayMode: m })
    })()
  }, [])

  const handleFilterChange = useCallback((f: BoardFilter): void => {
    setActiveFilter(f)
    void (async (): Promise<void> => {
      const db = await initDB()
      const cfg = await loadBoardConfig(db)
      await saveBoardConfig(db, { ...cfg, activeFilter: f })
    })()
  }, [])

  const handleOpenBookmarkletModal = useCallback((): void => {
    setBookmarkletModalOpen(true)
  }, [])
  const handleCloseBookmarkletModal = useCallback((): void => {
    setBookmarkletModalOpen(false)
  }, [])

  // Tweet thumbnail backfill via Cloudflare Pages Function proxy (the
  // syndication CDN itself is CORS-locked to platform.twitter.com, so we
  // can't call it from the browser directly — see functions/api/tweet-meta.ts).
  //
  // For every tweet bookmark we hit /api/tweet-meta?id=<id> once, then write
  // the resulting photoUrl / videoPosterUrl into bookmark.thumbnail with
  // force=true. The bookmarklet captures X's generic "SEE WHAT'S HAPPENING"
  // placeholder for every tweet because X is a SPA, so unconditional
  // overwrite is correct: the syndication response is the only source of
  // truth for per-tweet media.
  //
  // processedTweetIdsRef dedupes across re-renders — the effect re-runs
  // whenever items.length changes (e.g. a new bookmark arrives), and we
  // don't want to re-fetch tweets we've already filled.
  //
  // photoUrl AND videoPosterUrl missing → empty string forced into thumbnail,
  // which flips pickCard to TextCard for genuine text-only tweets.
  const processedTweetIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (loading || items.length === 0) return
    let cancelled = false
    const sleep = (ms: number): Promise<void> =>
      new Promise((resolve) => setTimeout(resolve, ms))
    void (async (): Promise<void> => {
      for (const it of items) {
        if (cancelled) return
        if (detectUrlType(it.url) !== 'tweet') continue
        const tweetId = extractTweetId(it.url)
        if (!tweetId) continue
        if (processedTweetIdsRef.current.has(tweetId)) continue
        processedTweetIdsRef.current.add(tweetId)
        try {
          const meta = await fetchTweetMeta(tweetId)
          if (cancelled) return
          if (!meta) continue
          const url = meta.photoUrl ?? meta.videoPosterUrl ?? ''
          await persistThumbnail(it.bookmarkId, url, true)
        } catch {
          /* swallow per-tweet failures so the loop keeps draining the queue */
        }
        if (cancelled) return
        await sleep(200)
      }
    })()
    return (): void => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, items.length, persistThumbnail])

  // BroadcastChannel: reload board and trigger entrance animation when a new
  // bookmark is saved via the bookmarklet popup (/save route).
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    const unsub = subscribeBookmarkSaved(async ({ bookmarkId }) => {
      await reload()
      setNewlyAddedIds((prev) => {
        const next = new Set(prev)
        next.add(bookmarkId)
        return next
      })
      // Clear the "new" flag after entrance animation completes
      const id = setTimeout(() => {
        setNewlyAddedIds((prev) => {
          const next = new Set(prev)
          next.delete(bookmarkId)
          return next
        })
      }, 800)
      timers.push(id)
    })
    return (): void => {
      unsub()
      for (const t of timers) clearTimeout(t)
    }
  }, [reload])

  // 1/2/3 keys cycle hovered card's size preset (S/M/L)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== '1' && e.key !== '2' && e.key !== '3') return
      if (!hoveredBookmarkId) return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      )
        return
      e.preventDefault()
      const preset = e.key === '1' ? 'S' : e.key === '2' ? 'M' : 'L'
      void persistSizePreset(hoveredBookmarkId, preset)
    }
    window.addEventListener('keydown', onKey)
    return (): void => {
      window.removeEventListener('keydown', onKey)
    }
  }, [hoveredBookmarkId, persistSizePreset])

  const sidebarCounts = useMemo(() => {
    const active = items.filter((i) => !i.isDeleted)
    const deleted = items.filter((i) => i.isDeleted)
    return {
      all: active.length,
      inbox: active.filter((i) => i.tags.length === 0).length,
      archive: deleted.length,
    }
  }, [items])

  const contentWidth = Math.max(viewport.w, contentBounds.width)
  const contentHeight = Math.max(viewport.h, contentBounds.height)

  return (
    <div className={styles.outerFrame}>
      {/* Inner dark canvas — destefanis-style stage. The whole pan/cards/
          toolbar live inside, so cursor pan never escapes the rounded frame. */}
      <div ref={canvasRef} className={styles.canvas}>
        <InteractionLayer
          direction={themeMeta.direction}
          onScroll={handleScroll}
          spaceHeld={spaceHeld}
        >
          {/* Background — full canvas coverage, follows scroll. */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              transform: `translate3d(${-viewport.x}px, ${-viewport.y}px, 0)`,
              willChange: 'transform',
              pointerEvents: 'none',
            }}
          >
            <ThemeLayer
              themeId={DEFAULT_THEME_ID}
              totalWidth={contentWidth}
              totalHeight={contentHeight}
            />
          </div>
          {/* Cards — full-canvas-width with destefanis half-gap padding.
              Vertical transform adds BOARD_TOP_PAD_PX so the first row gets
              breathing room below the canvas top edge / toolbar pill. */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              transform: `translate3d(${horizontalOffset - viewport.x}px, ${BOARD_TOP_PAD_PX - viewport.y}px, 0)`,
              willChange: 'transform',
              pointerEvents: 'none',
            }}
          >
            <CardsLayer
              items={filteredItems}
              viewport={viewport}
              viewportWidth={effectiveLayoutWidth}
              hoveredBookmarkId={hoveredBookmarkId}
              spaceHeld={spaceHeld}
              onHoverChange={setHoveredBookmarkId}
              onCyclePreset={handleCyclePreset}
              onClick={handleCardClick}
              onDrop={handleDropOrder}
              persistMeasuredAspect={persistMeasuredAspect}
              displayMode={displayMode}
              newlyAddedIds={newlyAddedIds}
            />
          </div>
        </InteractionLayer>
        {/* Soft fade at canvas top/bottom edges — scroll affordance. */}
        <div className={styles.fadeTop} aria-hidden="true" />
        <div className={styles.fadeBottom} aria-hidden="true" />
        <Toolbar
          activeFilter={activeFilter}
          onFilterChange={handleFilterChange}
          displayMode={displayMode}
          onDisplayModeChange={handleDisplayModeChange}
          moods={moods}
          counts={sidebarCounts}
        />
        {!loading && items.length === 0 && (
          <EmptyStateWelcome onOpenModal={handleOpenBookmarkletModal} />
        )}
      </div>
      {/* Modals + Lightbox sit outside the canvas so they cover the whole
          viewport (including the white outer margin). */}
      <BookmarkletInstallModal
        isOpen={bookmarkletModalOpen}
        onClose={handleCloseBookmarkletModal}
        appUrl={typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL ?? 'https://booklage.pages.dev')}
      />
      <Lightbox
        item={lightboxItem}
        originRect={lightboxOriginRect}
        onClose={handleLightboxClose}
      />
    </div>
  )
}
