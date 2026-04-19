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
import { t } from '@/lib/i18n/t'
import { ThemeLayer } from './ThemeLayer'
import { CardsLayer } from './CardsLayer'
import { InteractionLayer } from './InteractionLayer'
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

  // Resize: every pointer move from the 8-handle ResizeHandle fires this.
  // No separate end-signal in the new API, so we update local state AND
  // persist to IDB on each call. (Future perf TODO: debounce the persist
  // path — IDB writes are async/cheap but not free.)
  const handleCardResize = useCallback(
    (bookmarkId: string, w: number, h: number): void => {
      const current = overrides[bookmarkId] ?? layout.positions[bookmarkId]
      if (!current) return
      const next: CardPosition = { ...current, w, h }
      setOverrides((prev) => ({ ...prev, [bookmarkId]: next }))
      const item = itemByBookmark.get(bookmarkId)
      if (item?.cardId) void persistCardPosition(item.cardId, next)
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

  // TODO(Task 19): wire into Toolbar — eslint suppressed until then
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleModeChange = useCallback(
    async (next: LayoutMode): Promise<void> => {
      setLayoutMode(next)
      const db = await initDB()
      await saveBoardConfig(db, { layoutMode: next, frameRatio, themeId })
    },
    [frameRatio, themeId],
  )

  // TODO(Task 19): wire into Toolbar — eslint suppressed until then
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleFrameRatioChange = useCallback(
    async (next: FrameRatio): Promise<void> => {
      setFrameRatio(next)
      const db = await initDB()
      await saveBoardConfig(db, { layoutMode, frameRatio: next, themeId })
    },
    [layoutMode, themeId],
  )

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
            onCardResetToNative={handleCardResetToNative}
            onPersistFreePos={persistFreePosition}
          />
        </div>
      </InteractionLayer>
      <div
        style={{ position: 'fixed', top: 16, right: 16, display: 'flex', gap: 8, zIndex: 1000 }}
      >
        {listThemeIds().map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setThemeId(id)}
            data-active={themeId === id}
            data-theme-button={id}
          >
            {t(getThemeMeta(id).labelKey)}
          </button>
        ))}
      </div>
    </div>
  )
}
