'use client'

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { gsap } from 'gsap'
import { computeAutoLayout } from '@/lib/board/auto-layout'
import type {
  CardPosition,
  LayoutCard,
  LayoutMode,
  ScrollDirection,
} from '@/lib/board/types'
import {
  BOARD_Z_INDEX,
  CULLING,
  MODE_TRANSITION,
} from '@/lib/board/constants'
import type { BoardItem } from '@/lib/storage/use-board-data'
import { CardNode } from './CardNode'
import { ResizeHandle } from './ResizeHandle'

type Viewport = {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

type CardsLayerProps = {
  readonly items: ReadonlyArray<BoardItem>
  readonly layoutMode: LayoutMode
  readonly viewport: Viewport
  readonly viewportWidth: number
  readonly targetRowHeight: number
  readonly gap: number
  readonly direction: ScrollDirection
  /**
   * Optional per-card user override (e.g. while dragging in grid mode).
   * Keyed by bookmarkId. Takes precedence over computed grid position.
   */
  readonly overrides?: Readonly<Record<string, CardPosition>>
  readonly onCardPointerDown: (e: PointerEvent<HTMLDivElement>, cardId: string) => void
  readonly onCardResize: (cardId: string, w: number, h: number) => void
  readonly onCardResizeEnd?: (cardId: string, w: number, h: number) => void
}

export function CardsLayer({
  items,
  layoutMode,
  viewport,
  viewportWidth,
  targetRowHeight,
  gap,
  direction,
  overrides,
  onCardPointerDown,
  onCardResize,
  onCardResizeEnd,
}: CardsLayerProps): ReactNode {
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const prevModeRef = useRef<LayoutMode>(layoutMode)
  const morphTimelineRef = useRef<gsap.core.Timeline | null>(null)

  // Build LayoutCard[] from items, applying any overrides as userOverridePos
  // so computeAutoLayout will respect drag positions in grid mode too.
  const layoutCards = useMemo<LayoutCard[]>(
    () =>
      items.map((it) => ({
        id: it.bookmarkId,
        aspectRatio: it.aspectRatio,
        userOverridePos: overrides?.[it.bookmarkId] ?? it.userOverridePos,
      })),
    [items, overrides],
  )

  const gridLayout = useMemo(
    () =>
      computeAutoLayout({
        cards: layoutCards,
        viewportWidth,
        targetRowHeight,
        gap,
        direction,
      }),
    [layoutCards, viewportWidth, targetRowHeight, gap, direction],
  )

  const freeLayoutPositions = useMemo<Readonly<Record<string, CardPosition>>>(() => {
    const result: Record<string, CardPosition> = {}
    for (const it of items) {
      if (it.freePos) {
        result[it.bookmarkId] = {
          x: it.freePos.x,
          y: it.freePos.y,
          w: it.freePos.w,
          h: it.freePos.h,
        }
      } else {
        // Fallback to grid position so newly-added cards have a home when mode=free.
        const gridPos = gridLayout.positions[it.bookmarkId]
        if (gridPos) result[it.bookmarkId] = gridPos
      }
    }
    return result
  }, [items, gridLayout])

  const activePositions: Readonly<Record<string, CardPosition>> =
    layoutMode === 'grid' ? gridLayout.positions : freeLayoutPositions

  const visibleItems = useMemo(() => {
    const bufferX = viewport.w * CULLING.BUFFER_SCREENS
    const bufferY = viewport.h * CULLING.BUFFER_SCREENS
    const minX = viewport.x - bufferX
    const maxX = viewport.x + viewport.w + bufferX
    const minY = viewport.y - bufferY
    const maxY = viewport.y + viewport.h + bufferY

    return items.filter((it) => {
      const p = activePositions[it.bookmarkId]
      if (!p) return false
      return !(p.x + p.w < minX || p.x > maxX || p.y + p.h < minY || p.y > maxY)
    })
  }, [items, activePositions, viewport])

  // Initial / non-mode-change positioning: GSAP owns the transform.
  // Use useLayoutEffect to set position before paint so the card never
  // flashes at the wrong spot.
  //
  // Two bail conditions guard against races with the morph effect below:
  //   1. If layoutMode just changed, the morph effect (useEffect) is about
  //      to take over this transition — do not snap to the final position
  //      synchronously, or the user never sees the animation (C1).
  //   2. If a morph timeline is currently in flight, an unrelated re-render
  //      (viewport scroll, parent state change) must not snap cards to the
  //      end state and kill the running tween (C2).
  useLayoutEffect(() => {
    if (prevModeRef.current !== layoutMode) return
    if (morphTimelineRef.current?.isActive()) return
    for (const it of visibleItems) {
      const el = cardRefs.current[it.bookmarkId]
      if (!el) continue
      const p = activePositions[it.bookmarkId]
      if (!p) continue
      gsap.set(el, { x: p.x, y: p.y, width: p.w, height: p.h })
    }
  }, [visibleItems, activePositions, layoutMode])

  // Animated morph when layoutMode toggles. Owns transforms for the
  // duration of the tween; the useLayoutEffect above bails while this
  // timeline is active so it does not get snapped to the end state.
  useEffect(() => {
    if (prevModeRef.current === layoutMode) return
    morphTimelineRef.current?.kill()
    const tl = gsap.timeline()
    for (const it of items) {
      const el = cardRefs.current[it.bookmarkId]
      if (!el) continue
      const p = activePositions[it.bookmarkId]
      if (!p) continue
      tl.to(
        el,
        {
          x: p.x,
          y: p.y,
          width: p.w,
          height: p.h,
          duration: MODE_TRANSITION.MORPH_MS / 1000,
          ease: MODE_TRANSITION.EASING,
        },
        0,
      )
    }
    morphTimelineRef.current = tl
    prevModeRef.current = layoutMode
    return (): void => {
      tl.kill()
    }
  }, [layoutMode, items, activePositions])

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
        const p = activePositions[it.bookmarkId]
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
              // Initial inline values match what GSAP will set; useLayoutEffect
              // overwrites these via the matrix transform before paint.
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
              onPointerDown={onCardPointerDown}
            />
            <ResizeHandle
              cardId={it.bookmarkId}
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
