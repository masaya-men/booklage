'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type PointerEvent,
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
import { SizePresetToggle } from './SizePresetToggle'
import { useCardReorderDrag } from './use-card-reorder-drag'

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
  readonly hoveredBookmarkId: string | null
  readonly spaceHeld: boolean
  readonly onHoverChange: (id: string | null) => void
  readonly onCyclePreset: (bookmarkId: string, next: 'S' | 'M' | 'L') => void
  readonly onClick: (bookmarkId: string) => void
  readonly onDrop: (orderedBookmarkIds: readonly string[]) => void
}

export function CardsLayer({
  items,
  viewport,
  viewportWidth,
  hoveredBookmarkId,
  spaceHeld,
  onHoverChange,
  onCyclePreset,
  onClick,
  onDrop,
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

  const displayedPositions = masonryLayout.positions

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

  // Previous-position ledger used to animate masonry reflows via FLIP.
  // Updated at the end of every effect run.
  const prevPositionsRef = useRef<Record<string, { x: number; y: number }>>({})

  useLayoutEffect(() => {
    for (const it of visibleItems) {
      const el = cardRefs.current[it.bookmarkId]
      if (!el) continue
      const p = displayedPositions[it.bookmarkId]
      if (!p) continue

      const prev = prevPositionsRef.current[it.bookmarkId]
      if (prev && (prev.x !== p.x || prev.y !== p.y)) {
        // FLIP: invert from previous pos, tween to new pos
        gsap.fromTo(
          el,
          { x: prev.x, y: prev.y, width: p.w, height: p.h },
          {
            x: p.x,
            y: p.y,
            width: p.w,
            height: p.h,
            duration: 0.26,
            ease: 'power2.out',
            overwrite: 'auto',
          },
        )
      } else {
        gsap.set(el, { x: p.x, y: p.y, width: p.w, height: p.h })
      }
      prevPositionsRef.current[it.bookmarkId] = { x: p.x, y: p.y }
    }
    // Garbage-collect stale entries (cards unmounted due to culling)
    const liveIds = new Set(visibleItems.map((it) => it.bookmarkId))
    for (const id of Object.keys(prevPositionsRef.current)) {
      if (!liveIds.has(id)) delete prevPositionsRef.current[id]
    }
  }, [visibleItems, displayedPositions])

  const {
    dragState,
    handleCardPointerDown: handleReorderPointerDown,
  } = useCardReorderDrag({
    items,
    positions: masonryLayout.positions,
    spaceHeld,
    onClick,
    onDragMove: useCallback((id: string, clientX: number, clientY: number): void => {
      const el = cardRefs.current[id]
      if (!el) return
      const rect = el.getBoundingClientRect()
      const p = masonryLayout.positions[id]
      if (!p) return
      // Convert client coords to world coords relative to the card's current
      // on-screen position, centering the card on the pointer.
      const worldTargetX = p.x + (clientX - rect.left) - p.w / 2
      const worldTargetY = p.y + (clientY - rect.top) - p.h / 2
      gsap.to(el, {
        x: worldTargetX,
        y: worldTargetY,
        scale: 1.03,
        duration: 0.12,
        ease: 'power2.out',
        overwrite: 'auto',
      })
    }, [masonryLayout.positions]),
    onDrop: useCallback((orderedIds: readonly string[]): void => {
      // dragState is read from ref via closure in the hook; we use a local
      // variable here since dragState React state will still be set at this
      // point (setDragState(null) happens inside the hook after onDrop call).
      // We access the dragged card by scanning refs for any card at scale 1.03.
      // Simpler: iterate all refs and snap scale back.
      for (const [id, el] of Object.entries(cardRefs.current)) {
        if (!el) continue
        const p = masonryLayout.positions[id]
        if (!p) continue
        gsap.to(el, { scale: 1, duration: 0.18, ease: 'power2.out' })
      }
      onDrop(orderedIds)
    }, [masonryLayout.positions, onDrop]),
  })

  // Esc during drag → restore dragged card to its pre-drag slot (FLIP handles it).
  useEffect(() => {
    if (!dragState) return
    const onEsc = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      const el = cardRefs.current[dragState.bookmarkId]
      const p = masonryLayout.positions[dragState.bookmarkId]
      if (el && p) {
        gsap.to(el, {
          x: p.x, y: p.y, scale: 1, duration: 0.22, ease: 'power2.out', overwrite: 'auto',
        })
      }
    }
    window.addEventListener('keydown', onEsc)
    return (): void => {
      window.removeEventListener('keydown', onEsc)
    }
  }, [dragState, masonryLayout.positions])

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
            onPointerDown={(e: PointerEvent<HTMLDivElement>): void => handleReorderPointerDown(e, it.bookmarkId)}
            onPointerEnter={(): void => onHoverChange(it.bookmarkId)}
            onPointerLeave={(): void => onHoverChange(null)}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: `${p.w}px`,
              height: `${p.h}px`,
              transform: `translate3d(${p.x}px, ${p.y}px, 0)`,
              pointerEvents: 'auto',
              zIndex: dragState?.bookmarkId === it.bookmarkId ? 1000 : undefined,
            }}
          >
            <CardNode
              id={it.bookmarkId}
              title={it.title}
              thumbnailUrl={it.thumbnail}
            />
            <SizePresetToggle
              preset={it.sizePreset}
              visible={hoveredBookmarkId === it.bookmarkId}
              onCycle={(next): void => onCyclePreset(it.bookmarkId, next)}
            />
          </div>
        )
      })}
    </div>
  )
}
