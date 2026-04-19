'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { computeAutoLayout } from '@/lib/board/auto-layout'
import {
  DEFAULT_THEME_ID,
  getThemeMeta,
  listThemeIds,
} from '@/lib/board/theme-registry'
import { LAYOUT_CONFIG } from '@/lib/board/constants'
import type { CardPosition, FrameRatio, LayoutCard, LayoutMode, ThemeId } from '@/lib/board/types'
import { useBoardData, type BoardItem } from '@/lib/storage/use-board-data'
import { initDB } from '@/lib/storage/indexeddb'
import {
  DEFAULT_BOARD_CONFIG,
  loadBoardConfig,
  saveBoardConfig,
} from '@/lib/storage/board-config'
import { ThemeLayer } from './ThemeLayer'
import { CardsLayer } from './CardsLayer'
import { InteractionLayer } from './InteractionLayer'
import { Toolbar } from './Toolbar'
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
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(DEFAULT_BOARD_CONFIG.layoutMode)
  const [frameRatio, setFrameRatio] = useState<FrameRatio>(DEFAULT_BOARD_CONFIG.frameRatio)
  const [overrides, setOverrides] = useState<Record<string, CardPosition>>({})
  const [viewport, setViewport] = useState({ x: 0, y: 0, w: 1200, h: 800 })
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => setThemeId(loadSavedTheme()), [])

  // Hydrate layoutMode + frameRatio from IndexedDB on mount
  useEffect(() => {
    let cancelled = false
    void (async (): Promise<void> => {
      const db = await initDB()
      if (cancelled) return
      const cfg = await loadBoardConfig(db)
      setLayoutMode(cfg.layoutMode)
      setFrameRatio(cfg.frameRatio)
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

  const layout = useMemo(
    () =>
      computeAutoLayout({
        cards: layoutCards,
        viewportWidth: viewport.w,
        targetRowHeight:
          themeMeta.layoutParams?.targetRowHeight ?? LAYOUT_CONFIG.TARGET_ROW_HEIGHT_PX,
        gap: themeMeta.layoutParams?.gap ?? LAYOUT_CONFIG.GAP_PX,
        direction: themeMeta.direction,
      }),
    [layoutCards, viewport.w, themeMeta],
  )

  const itemByBookmark = useMemo(() => {
    const m = new Map<string, BoardItem>()
    for (const it of items) m.set(it.bookmarkId, it)
    return m
  }, [items])

  const handleScroll = useCallback(
    (dx: number, dy: number): void => {
      setViewport((v) => {
        const maxX = Math.max(0, layout.totalWidth - v.w)
        const maxY = Math.max(0, layout.totalHeight - v.h)
        return {
          ...v,
          x: Math.min(Math.max(v.x + dx, 0), maxX),
          y: Math.min(Math.max(v.y + dy, 0), maxY),
        }
      })
    },
    [layout.totalHeight, layout.totalWidth],
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

  const handleModeChange = useCallback(
    (next: LayoutMode): void => {
      setLayoutMode(next)
      void (async (): Promise<void> => {
        try {
          const db = await initDB()
          await saveBoardConfig(db, { layoutMode: next, frameRatio, themeId })
        } catch (err) {
          if (process.env.NODE_ENV !== 'production') {
            console.error('[BoardRoot] saveBoardConfig failed', err)
          }
        }
      })()
    },
    [frameRatio, themeId],
  )

  const handleFrameRatioChange = useCallback(
    (next: FrameRatio): void => {
      setFrameRatio(next)
      void (async (): Promise<void> => {
        try {
          const db = await initDB()
          await saveBoardConfig(db, { layoutMode, frameRatio: next, themeId })
        } catch (err) {
          if (process.env.NODE_ENV !== 'production') {
            console.error('[BoardRoot] saveBoardConfig failed', err)
          }
        }
      })()
    },
    [layoutMode, themeId],
  )

  // TODO: unify theme persistence — currently localStorage drives hydration; IDB themeId is write-only dead state.
  const handleThemeClick = useCallback((): void => {
    const ids = listThemeIds()
    const idx = ids.indexOf(themeId)
    const next = ids[(idx + 1) % ids.length] ?? DEFAULT_THEME_ID
    setThemeId(next)
  }, [themeId])

  const contentWidth = Math.max(viewport.w, layout.totalWidth)
  const contentHeight = Math.max(viewport.h, layout.totalHeight)

  const targetRowHeight =
    themeMeta.layoutParams?.targetRowHeight ?? LAYOUT_CONFIG.TARGET_ROW_HEIGHT_PX
  const layoutGap = themeMeta.layoutParams?.gap ?? LAYOUT_CONFIG.GAP_PX

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}
    >
      <InteractionLayer direction={themeMeta.direction} onScroll={handleScroll}>
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
          <CardsLayer
            items={items}
            layoutMode={layoutMode}
            viewport={viewport}
            viewportWidth={viewport.w}
            targetRowHeight={targetRowHeight}
            gap={layoutGap}
            direction={themeMeta.direction}
            overrides={overrides}
            onCardPointerDown={handleCardPointerDown}
            onCardResize={handleCardResize}
            onCardResizeEnd={handleCardResizeEnd}
            onCardResetToNative={handleCardResetToNative}
            onPersistFreePos={persistFreePosition}
          />
        </div>
      </InteractionLayer>
      <Toolbar
        layoutMode={layoutMode}
        onModeChange={handleModeChange}
        frameRatio={frameRatio}
        onFrameRatioChange={handleFrameRatioChange}
        themeId={themeId}
        onThemeClick={handleThemeClick}
      />
    </div>
  )
}
