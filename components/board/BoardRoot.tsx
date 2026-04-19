'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { computeAutoLayout } from '@/lib/board/auto-layout'
import {
  DEFAULT_THEME_ID,
  getThemeMeta,
  listThemeIds,
} from '@/lib/board/theme-registry'
import { LAYOUT_CONFIG } from '@/lib/board/constants'
import type { CardPosition, LayoutCard, ThemeId } from '@/lib/board/types'
import { useBoardData, type BoardItem } from '@/lib/storage/use-board-data'
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
  const { items, persistCardPosition } = useBoardData()
  const [themeId, setThemeId] = useState<ThemeId>(DEFAULT_THEME_ID)
  const [overrides, setOverrides] = useState<Record<string, CardPosition>>({})
  const [viewport, setViewport] = useState({ x: 0, y: 0, w: 1200, h: 800 })
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => setThemeId(loadSavedTheme()), [])
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
  const handleCardPointerDown = useCardDrag({
    resolveStartPos: resolveStart,
    onDrag,
    onDragEnd,
  })

  const handleCardResize = useCallback(
    (bookmarkId: string, w: number, h: number): void => {
      const current = overrides[bookmarkId] ?? layout.positions[bookmarkId]
      if (!current) return
      setOverrides((prev) => ({ ...prev, [bookmarkId]: { ...current, w, h } }))
    },
    [overrides, layout.positions],
  )
  const handleCardResizeEnd = useCallback(
    (bookmarkId: string, w: number, h: number): void => {
      const current = overrides[bookmarkId] ?? layout.positions[bookmarkId]
      if (!current) return
      const item = itemByBookmark.get(bookmarkId)
      if (item?.cardId) {
        void persistCardPosition(item.cardId, { ...current, w, h })
      }
    },
    [overrides, layout.positions, itemByBookmark, persistCardPosition],
  )

  const cardsForLayer = useMemo(
    () =>
      items.map((it) => ({
        id: it.bookmarkId,
        aspectRatio: it.aspectRatio,
        title: it.title,
        thumbnailUrl: it.thumbnail,
      })),
    [items],
  )

  const contentWidth = Math.max(viewport.w, layout.totalWidth)
  const contentHeight = Math.max(viewport.h, layout.totalHeight)

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
            cards={cardsForLayer}
            positions={layout.positions}
            viewport={viewport}
            onCardPointerDown={handleCardPointerDown}
            onCardResize={handleCardResize}
            onCardResizeEnd={handleCardResizeEnd}
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
