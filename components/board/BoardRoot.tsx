'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { computeAutoLayout } from '@/lib/board/auto-layout'
import { alignAllToGrid } from '@/lib/board/align'
import {
  DEFAULT_THEME_ID,
  getThemeMeta,
  listThemeIds,
} from '@/lib/board/theme-registry'
import { BOARD_INNER, LAYOUT_CONFIG } from '@/lib/board/constants'
import type { CardPosition, LayoutCard, ThemeId } from '@/lib/board/types'
import { useBoardData, type BoardItem } from '@/lib/storage/use-board-data'
import { initDB } from '@/lib/storage/indexeddb'
import { loadBoardConfig } from '@/lib/storage/board-config'
import { ThemeLayer } from './ThemeLayer'
import { CardsLayer } from './CardsLayer'
import { InteractionLayer } from './InteractionLayer'
import { Toolbar } from './Toolbar'
import { Sidebar } from './Sidebar'
import { useCardDrag } from './use-card-drag'

const THEME_LS_KEY = 'booklage.board.themeId'

function loadSavedTheme(): ThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME_ID
  const saved = window.localStorage.getItem(THEME_LS_KEY)
  if (saved && listThemeIds().includes(saved as ThemeId)) return saved as ThemeId
  return DEFAULT_THEME_ID
}

export function BoardRoot() {
  const { items, persistCardPosition, persistFreePosition } = useBoardData()
  const [themeId, setThemeId] = useState<ThemeId>(DEFAULT_THEME_ID)
  const [overrides, setOverrides] = useState<Record<string, CardPosition>>({})
  // Monotonic counter bumped on Align; CardsLayer watches this to run a morph
  // timeline instead of snapping cards to their new positions.
  const [alignKey, setAlignKey] = useState<number>(0)
  const [viewport, setViewport] = useState({ x: 0, y: 0, w: 1200, h: 800 })
  // Lifted from InteractionLayer so CardsLayer can also observe Space-held
  // state and bail its pointerdown handler — letting the event bubble up to
  // InteractionLayer where pan engagement lives.
  const [spaceHeld, setSpaceHeld] = useState<boolean>(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => setThemeId(loadSavedTheme()), [])

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

  // Hydration of saved BoardConfig kept as a side effect so any future config
  // fields (frameRatio for Plan B ShareModal, etc.) stay warm in IDB; no local
  // state is bound until a surface actually surfaces them.
  useEffect(() => {
    let cancelled = false
    void (async (): Promise<void> => {
      const db = await initDB()
      if (cancelled) return
      await loadBoardConfig(db)
    })()
    return (): void => { cancelled = true }
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_LS_KEY, themeId)
    }
  }, [themeId])

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

  const layoutCards = useMemo<LayoutCard[]>(
    () =>
      items.map((it) => ({
        id: it.bookmarkId,
        aspectRatio: it.aspectRatio,
        userOverridePos: overrides[it.bookmarkId] ?? it.userOverridePos,
      })),
    [items, overrides],
  )

  const themeMeta = getThemeMeta(themeId)

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
      computeAutoLayout({
        cards: layoutCards,
        viewportWidth: effectiveLayoutWidth,
        targetRowHeight:
          themeMeta.layoutParams?.targetRowHeight ?? LAYOUT_CONFIG.TARGET_ROW_HEIGHT_PX,
        gap: themeMeta.layoutParams?.gap ?? LAYOUT_CONFIG.GAP_PX,
        direction: themeMeta.direction,
      }),
    [layoutCards, effectiveLayoutWidth, themeMeta],
  )

  const itemByBookmark = useMemo(() => {
    const m = new Map<string, BoardItem>()
    for (const it of items) m.set(it.bookmarkId, it)
    return m
  }, [items])

  // Actual content bounds — tracks the furthest right/bottom any card reaches,
  // whether it's in a grid fallback, persisted freePos, or mid-resize override.
  // Added 600px margin so the user can scroll past the last card (room to drag
  // new cards further / add content). Without this, free-dragged cards below
  // the grid footprint become unreachable via scroll.
  const contentBounds = useMemo(() => {
    let maxRight = 0
    let maxBottom = 0
    for (const it of items) {
      const override = overrides[it.bookmarkId]
      const p = override
        ?? (it.freePos
          ? { x: it.freePos.x, y: it.freePos.y, w: it.freePos.w, h: it.freePos.h }
          : layout.positions[it.bookmarkId])
      if (!p) continue
      const right = p.x + p.w
      const bottom = p.y + p.h
      if (right > maxRight) maxRight = right
      if (bottom > maxBottom) maxBottom = bottom
    }
    const SCROLL_OVERFLOW_MARGIN = 600
    return {
      width: Math.max(layout.totalWidth, maxRight + SCROLL_OVERFLOW_MARGIN),
      height: Math.max(layout.totalHeight, maxBottom + SCROLL_OVERFLOW_MARGIN),
    }
  }, [items, overrides, layout.positions, layout.totalWidth, layout.totalHeight])

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

  const resolveStart = useCallback(
    (cardId: string) => layout.positions[cardId],
    [layout.positions],
  )
  const onDrag = useCallback((cardId: string, pos: CardPosition): void => {
    setOverrides((prev) => ({ ...prev, [cardId]: pos }))
  }, [])
  const onDragEnd = useCallback(
    (cardId: string, pos: CardPosition): void => {
      const item = itemByBookmark.get(cardId)
      if (item?.cardId) void persistCardPosition(item.cardId, pos)
    },
    [itemByBookmark, persistCardPosition],
  )
  const onCardClick = useCallback(
    (cardId: string): void => {
      const item = itemByBookmark.get(cardId)
      if (!item?.url) return
      window.open(item.url, '_blank', 'noopener,noreferrer')
    },
    [itemByBookmark],
  )
  const handleCardPointerDown = useCardDrag({
    resolveStartPos: resolveStart,
    onDrag,
    onDragEnd,
    onClick: onCardClick,
  })

  // Resize live tick: fires on every pointer move during a resize drag.
  // Visual-only — updates the local `overrides` map so the card follows the
  // pointer in real time. IDB persistence is deferred to `handleCardResizeEnd`
  // so we don't write 60×/sec (which would also re-trigger persistFreePosition's
  // optimistic setItems and run computeAutoLayout on every tick — see code
  // review I1).
  const handleCardResize = useCallback(
    (bookmarkId: string, w: number, h: number): void => {
      const current = overrides[bookmarkId] ?? layout.positions[bookmarkId]
      if (!current) return
      const next: CardPosition = { ...current, w, h }
      setOverrides((prev) => ({ ...prev, [bookmarkId]: next }))
    },
    [overrides, layout.positions],
  )
  // Resize commit: fires once when the resize drag ends. Persists the final
  // size to IDB. Mirrors the persistence pattern used by handleCardResetToNative.
  const handleCardResizeEnd = useCallback(
    (bookmarkId: string, w: number, h: number): void => {
      const item = itemByBookmark.get(bookmarkId)
      if (!item?.cardId) return
      const current = overrides[bookmarkId] ?? layout.positions[bookmarkId]
      if (!current) return
      const next: CardPosition = { ...current, w, h }
      void persistCardPosition(item.cardId, next)
    },
    [overrides, layout.positions, itemByBookmark, persistCardPosition],
  )
  // Double-click on any resize handle: snap card height back to native
  // aspect ratio while keeping current width. Per plan §Task 18 Step 3.
  const handleCardResetToNative = useCallback(
    (bookmarkId: string): void => {
      const item = itemByBookmark.get(bookmarkId)
      if (!item) return
      const current = overrides[bookmarkId] ?? layout.positions[bookmarkId]
      if (!current) return
      const next: CardPosition = { ...current, h: current.w / item.aspectRatio }
      setOverrides((prev) => ({ ...prev, [bookmarkId]: next }))
      if (item.cardId) void persistCardPosition(item.cardId, next)
    },
    [overrides, layout.positions, itemByBookmark, persistCardPosition],
  )

  // Align: snap every card into a justified masonry grid via alignAllToGrid,
  // then fire N optimistic setItems + IDB writes via persistFreePosition.
  // Bumping `alignKey` signals CardsLayer to run a morph timeline on the next
  // render (cards glide from their current positions to the newly computed
  // grid positions instead of snapping).
  const handleAlign = useCallback((): void => {
    if (items.length === 0) return

    const sidebarReservedPx = sidebarCollapsed ? 52 : 240
    const availableWidth = Math.max(0, viewport.w - sidebarReservedPx)
    const containerWidth = Math.max(
      0,
      Math.min(availableWidth, BOARD_INNER.MAX_WIDTH_PX) - 2 * BOARD_INNER.SIDE_PADDING_PX,
    )

    const aligned = alignAllToGrid(
      items.map((it) => ({
        id: it.bookmarkId,
        aspectRatio: it.aspectRatio,
        freePos: it.freePos ?? null,
      })),
      {
        containerWidth,
        targetRowHeight: LAYOUT_CONFIG.TARGET_ROW_HEIGHT_PX,
        gap: LAYOUT_CONFIG.GAP_PX,
      },
    )

    const itemByBookmark = new Map(items.map((it) => [it.bookmarkId, it]))
    for (const a of aligned) {
      if (!a.freePos) continue
      const source = itemByBookmark.get(a.id)
      if (!source?.cardId) continue
      void persistFreePosition(source.cardId, a.freePos)
    }
    setAlignKey((k) => k + 1)
  }, [items, persistFreePosition, sidebarCollapsed, viewport.w])

  const handleShare = useCallback((): void => {
    // Plan B (ShareModal) ships the full flow — frame preset picker, PNG
    // export, SNS Web Intents. For Plan A the button is present so the final
    // toolbar shape is observable end-to-end; clicking is a no-op in dev.
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[Booklage] Share modal coming in Plan B')
    }
  }, [])

  // TODO: unify theme persistence — currently localStorage drives hydration; IDB themeId is write-only dead state.
  const handleThemeClick = useCallback((): void => {
    const ids = listThemeIds()
    const idx = ids.indexOf(themeId)
    const next = ids[(idx + 1) % ids.length] ?? DEFAULT_THEME_ID
    setThemeId(next)
  }, [themeId])

  const handleSidebarToggle = useCallback((): void => {
    setSidebarCollapsed((prev) => !prev)
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

  const sidebarCounts = useMemo(() => {
    const active = items.filter((i) => !i.isDeleted)
    return {
      all: active.length,
      unread: active.filter((i) => !i.isRead).length,
      read: active.filter((i) => i.isRead).length,
    }
  }, [items])

  const contentWidth = Math.max(viewport.w, contentBounds.width)
  const contentHeight = Math.max(viewport.h, contentBounds.height)

  const targetRowHeight =
    themeMeta.layoutParams?.targetRowHeight ?? LAYOUT_CONFIG.TARGET_ROW_HEIGHT_PX
  const layoutGap = themeMeta.layoutParams?.gap ?? LAYOUT_CONFIG.GAP_PX

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
            themeId={themeId}
            totalWidth={contentWidth}
            totalHeight={contentHeight}
          />
        </div>
        {/* Cards — centered with horizontalOffset so the cluster sits in the
            middle of wide viewports while the background above keeps full
            coverage. */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            transform: `translate3d(${horizontalOffset - viewport.x}px, ${-viewport.y}px, 0)`,
            willChange: 'transform',
            pointerEvents: 'none',
          }}
        >
          <CardsLayer
            items={items}
            viewport={viewport}
            viewportWidth={effectiveLayoutWidth}
            targetRowHeight={targetRowHeight}
            gap={layoutGap}
            direction={themeMeta.direction}
            overrides={overrides}
            spaceHeld={spaceHeld}
            alignKey={alignKey}
            onCardPointerDown={handleCardPointerDown}
            onCardResize={handleCardResize}
            onCardResizeEnd={handleCardResizeEnd}
            onCardResetToNative={handleCardResetToNative}
            onPersistFreePos={persistFreePosition}
          />
        </div>
      </InteractionLayer>
      <Toolbar onAlign={handleAlign} onShare={handleShare} />
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={handleSidebarToggle}
        counts={sidebarCounts}
        onThemeClick={handleThemeClick}
      />
    </div>
  )
}
