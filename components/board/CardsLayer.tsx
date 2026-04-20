'use client'

import {
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import { gsap } from 'gsap'
import { computeColumnMasonry, type MasonryCard } from '@/lib/board/column-masonry'
import type { CardPosition } from '@/lib/board/types'
import {
  BOARD_Z_INDEX,
  COLUMN_MASONRY,
  CULLING,
  SIZE_PRESET_SPAN,
} from '@/lib/board/constants'
import type { BoardItem } from '@/lib/storage/use-board-data'
import { CardNode } from './CardNode'

type Viewport = {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

type CardsLayerProps = {
  readonly items: ReadonlyArray<BoardItem>
  readonly viewport: Viewport
  readonly viewportWidth: number
  /** Live overrides — used by reorder drag in a later task to pin a card to
   *  pointer coords while dragging. Keyed by bookmarkId. */
  readonly overrides?: Readonly<Record<string, CardPosition>>
}

export function CardsLayer({
  items,
  viewport,
  viewportWidth,
  overrides,
}: CardsLayerProps): ReactNode {
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const masonryCards = useMemo<MasonryCard[]>(
    () =>
      items.map((it) => ({
        id: it.bookmarkId,
        aspectRatio: it.aspectRatio,
        columnSpan: SIZE_PRESET_SPAN[it.sizePreset],
      })),
    [items],
  )

  const masonryLayout = useMemo(
    () =>
      computeColumnMasonry({
        cards: masonryCards,
        containerWidth: viewportWidth,
        gap: COLUMN_MASONRY.GAP_PX,
        targetColumnUnit: COLUMN_MASONRY.TARGET_COLUMN_UNIT_PX,
      }),
    [masonryCards, viewportWidth],
  )

  const displayedPositions = useMemo<Readonly<Record<string, CardPosition>>>(() => {
    if (!overrides) return masonryLayout.positions
    return { ...masonryLayout.positions, ...overrides }
  }, [masonryLayout.positions, overrides])

  const visibleItems = useMemo(() => {
    const bufferX = viewport.w * CULLING.BUFFER_SCREENS
    const bufferY = viewport.h * CULLING.BUFFER_SCREENS
    const minX = viewport.x - bufferX
    const maxX = viewport.x + viewport.w + bufferX
    const minY = viewport.y - bufferY
    const maxY = viewport.y + viewport.h + bufferY

    return items.filter((it) => {
      const p = displayedPositions[it.bookmarkId]
      if (!p) return false
      return !(p.x + p.w < minX || p.x > maxX || p.y + p.h < minY || p.y > maxY)
    })
  }, [items, displayedPositions, viewport])

  useLayoutEffect(() => {
    for (const it of visibleItems) {
      const el = cardRefs.current[it.bookmarkId]
      if (!el) continue
      const p = displayedPositions[it.bookmarkId]
      if (!p) continue
      gsap.set(el, { x: p.x, y: p.y, width: p.w, height: p.h })
    }
  }, [visibleItems, displayedPositions])

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        zIndex: BOARD_Z_INDEX.CARDS,
        pointerEvents: 'none',
      }}
    >
      {visibleItems.map((it) => {
        const p = displayedPositions[it.bookmarkId]
        if (!p) return null
        return (
          <div
            key={it.bookmarkId}
            ref={(el): void => {
              cardRefs.current[it.bookmarkId] = el
            }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: `${p.w}px`,
              height: `${p.h}px`,
              transform: `translate3d(${p.x}px, ${p.y}px, 0)`,
              pointerEvents: 'auto',
            }}
          >
            <CardNode
              id={it.bookmarkId}
              title={it.title}
              thumbnailUrl={it.thumbnail}
            />
          </div>
        )
      })}
    </div>
  )
}
