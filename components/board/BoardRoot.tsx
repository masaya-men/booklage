'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { useMoods } from '@/lib/storage/use-moods'
import { initDB } from '@/lib/storage/indexeddb'
import { loadBoardConfig, saveBoardConfig } from '@/lib/storage/board-config'
import { ThemeLayer } from './ThemeLayer'
import { CardsLayer } from './CardsLayer'
import { InteractionLayer } from './InteractionLayer'
import { Toolbar } from './Toolbar'
import { Sidebar } from './Sidebar'
import { BookmarkletInstallModal } from '@/components/bookmarklet/BookmarkletInstallModal'
import { EmptyStateWelcome } from '@/components/bookmarklet/EmptyStateWelcome'
import { Lightbox } from './Lightbox'

// Visible breathing room above the board's first card, in CSS pixels.
// Cards' world coords start at y=0 (masonry cursor); this offset is applied
// in the cards wrapper's transform so the first row never kisses the Toolbar
// pill. Extends the scroll range via contentBounds.height.
const BOARD_TOP_PAD_PX = 120

const DEFAULT_MOOD_COLORS = ['#7c5cfc', '#e066d7', '#4ecdc4', '#f5a623', '#ff6b6b'] as const

export function BoardRoot() {
  const { items, loading, persistSizePreset, persistOrderBatch, persistMeasuredAspect, reload } = useBoardData()
  const { moods, create: createMood } = useMoods()
  const router = useRouter()
  const [activeFilter, setActiveFilter] = useState<BoardFilter>('all')
  const [displayMode, setDisplayMode] = useState<DisplayMode>('visual')
  const [viewport, setViewport] = useState({ x: 0, y: 0, w: 1200, h: 800 })
  // Lifted from InteractionLayer so CardsLayer can also observe Space-held
  // state and bail its pointerdown handler — letting the event bubble up to
  // InteractionLayer where pan engagement lives.
  const [spaceHeld, setSpaceHeld] = useState<boolean>(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false)
  const [bookmarkletModalOpen, setBookmarkletModalOpen] = useState<boolean>(false)
  const [hoveredBookmarkId, setHoveredBookmarkId] = useState<string | null>(null)
  const [lightboxItemId, setLightboxItemId] = useState<string | null>(null)
  const [newlyAddedIds, setNewlyAddedIds] = useState<ReadonlySet<string>>(new Set())
  const containerRef = useRef<HTMLDivElement>(null)

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
      const el = containerRef.current
      if (!el) return
      setViewport((v) => ({ ...v, w: el.clientWidth, h: el.clientHeight }))
    }
    update()
    window.addEventListener('resize', update)
    return (): void => window.removeEventListener('resize', update)
  }, [])

  const moodCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const it of items) {
      if (it.isDeleted) continue
      for (const tag of it.tags) counts[tag] = (counts[tag] ?? 0) + 1
    }
    return counts
  }, [items])

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

  // Cap layout width at MAX_WIDTH_PX and reserve SIDE_PADDING_PX of gutter on
  // each side so the background remains visible. Cards center in the space to
  // the right of the sidebar; the background still spans the full viewport so
  // the theme pattern shows through the liquid-glass sidebar panel.
  // NOTE: sidebar widths below mirror --sidebar-width / --sidebar-collapsed in
  // app/globals.css. Moving them to lib/board/constants.ts is a small cleanup
  // for a follow-up pass.
  const sidebarReservedPx = sidebarCollapsed ? 52 : 240
  const availableWidth = Math.max(0, viewport.w - sidebarReservedPx)
  const effectiveLayoutWidth = Math.max(
    0,
    Math.min(availableWidth, BOARD_INNER.MAX_WIDTH_PX) - 2 * BOARD_INNER.SIDE_PADDING_PX,
  )
  const horizontalOffset = sidebarReservedPx + (availableWidth - effectiveLayoutWidth) / 2

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

  const handleCardClick = useCallback((bookmarkId: string): void => {
    setLightboxItemId(bookmarkId)
  }, [])

  const handleLightboxClose = useCallback((): void => {
    setLightboxItemId(null)
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

  const handleCreateMood = useCallback((): void => {
    const name = window.prompt('mood 名を入力')
    if (!name?.trim()) return
    const color = DEFAULT_MOOD_COLORS[moods.length % DEFAULT_MOOD_COLORS.length]
    void createMood({ name: name.trim(), color, order: moods.length })
  }, [moods.length, createMood])

  const handleTriageStart = useCallback((): void => {
    router.push('/triage')
  }, [router])

  const handleSidebarToggle = useCallback((): void => {
    setSidebarCollapsed((prev) => !prev)
  }, [])

  const handleOpenBookmarkletModal = useCallback((): void => {
    setBookmarkletModalOpen(true)
  }, [])
  const handleCloseBookmarkletModal = useCallback((): void => {
    setBookmarkletModalOpen(false)
  }, [])

  // F key toggles sidebar collapse (ignored while typing in an input/textarea)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'f' && e.key !== 'F') return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      )
        return
      e.preventDefault()
      setSidebarCollapsed((prev) => !prev)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [])

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
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}
    >
      <InteractionLayer
        direction={themeMeta.direction}
        onScroll={handleScroll}
        spaceHeld={spaceHeld}
      >
        {/* Background — full viewport coverage, follows scroll, NO horizontal
            centering offset. Splitting this from the cards wrapper means the
            dotted/notebook pattern stays anchored to the visible viewport on
            wide screens (cards center while background fills). */}
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
        {/* Cards — centered with horizontalOffset so the cluster sits in the
            middle of wide viewports while the background above keeps full
            coverage. Vertical transform adds BOARD_TOP_PAD_PX so the first
            row gets breathing room below the toolbar; the ThemeLayer wrapper
            stays at world y=0 so the pattern is still visible in that gap. */}
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
      <Toolbar
        activeFilter={activeFilter}
        onFilterChange={handleFilterChange}
        displayMode={displayMode}
        onDisplayModeChange={handleDisplayModeChange}
        moods={moods}
        counts={sidebarCounts}
      />
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={handleSidebarToggle}
        counts={sidebarCounts}
        activeFilter={activeFilter}
        onFilterChange={handleFilterChange}
        moods={moods}
        moodCounts={moodCounts}
        onCreateMood={handleCreateMood}
        onOpenBookmarkletModal={handleOpenBookmarkletModal}
        onTriageStart={handleTriageStart}
      />
      <BookmarkletInstallModal
        isOpen={bookmarkletModalOpen}
        onClose={handleCloseBookmarkletModal}
        appUrl={typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL ?? 'https://booklage.pages.dev')}
      />
      {!loading && items.length === 0 && (
        <EmptyStateWelcome onOpenModal={handleOpenBookmarkletModal} />
      )}
      <Lightbox item={lightboxItem} onClose={handleLightboxClose} />
    </div>
  )
}
