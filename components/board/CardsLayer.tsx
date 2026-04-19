'use client'

import { useMemo, type PointerEvent, type ReactNode } from 'react'
import type { CardPosition, LayoutCard } from '@/lib/board/types'
import { CULLING, BOARD_Z_INDEX } from '@/lib/board/constants'
import { CardNode } from './CardNode'
import { ResizeHandle } from './ResizeHandle'

type CardData = LayoutCard & {
  readonly title: string
  readonly thumbnailUrl?: string
  readonly children?: ReactNode
}

type Viewport = {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

type CardsLayerProps = {
  readonly cards: ReadonlyArray<CardData>
  readonly positions: Readonly<Record<string, CardPosition>>
  readonly viewport: Viewport
  readonly onCardPointerDown: (e: PointerEvent<HTMLDivElement>, cardId: string) => void
  readonly onCardResize: (cardId: string, w: number, h: number) => void
  readonly onCardResizeEnd?: (cardId: string, w: number, h: number) => void
}

export function CardsLayer({
  cards,
  positions,
  viewport,
  onCardPointerDown,
  onCardResize,
  onCardResizeEnd,
}: CardsLayerProps) {
  const visibleCards = useMemo(() => {
    const bufferX = viewport.w * CULLING.BUFFER_SCREENS
    const bufferY = viewport.h * CULLING.BUFFER_SCREENS
    const minX = viewport.x - bufferX
    const maxX = viewport.x + viewport.w + bufferX
    const minY = viewport.y - bufferY
    const maxY = viewport.y + viewport.h + bufferY

    return cards.filter((c) => {
      const p = positions[c.id]
      if (!p) return false
      return !(p.x + p.w < minX || p.x > maxX || p.y + p.h < minY || p.y > maxY)
    })
  }, [cards, positions, viewport])

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
      {visibleCards.map((c) => {
        const p = positions[c.id]
        if (!p) return null
        return (
          <div
            key={c.id}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              transform: `translate3d(${p.x}px, ${p.y}px, 0)`,
              width: `${p.w}px`,
              height: `${p.h}px`,
              pointerEvents: 'auto',
            }}
          >
            <CardNode
              id={c.id}
              position={{ x: 0, y: 0, w: p.w, h: p.h }}
              title={c.title}
              thumbnailUrl={c.thumbnailUrl}
              onPointerDown={onCardPointerDown}
            >
              {c.children}
            </CardNode>
            <ResizeHandle
              cardId={c.id}
              initialW={p.w}
              initialH={p.h}
              onResize={onCardResize}
              onResizeEnd={onCardResizeEnd}
            />
          </div>
        )
      })}
    </div>
  )
}
