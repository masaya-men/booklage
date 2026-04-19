'use client'

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { gsap } from 'gsap'
import { computeAutoLayout } from '@/lib/board/auto-layout'
import { applySnapToPosition, computeSnapGuides } from '@/lib/board/free-layout'
import type {
  CardPosition,
  FreePosition,
  LayoutCard,
  LayoutMode,
  ScrollDirection,
  SnapGuideLine,
} from '@/lib/board/types'
import {
  BOARD_Z_INDEX,
  CULLING,
  MODE_TRANSITION,
} from '@/lib/board/constants'
import type { BoardItem } from '@/lib/storage/use-board-data'
import { CardNode } from './CardNode'
import { ResizeHandle } from './ResizeHandle'
import { SnapGuides } from './SnapGuides'

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
  /**
   * Resize live tick: fires on every pointer move during a resize drag.
   * Consumers should ONLY do cheap local-state updates here (e.g. visual
   * overrides). Persistence belongs in `onCardResizeEnd`.
   */
  readonly onCardResize: (cardId: string, w: number, h: number) => void
  /**
   * Resize commit: fires once when a resize drag ends. Use this for
   * IDB persistence so writes are batched at drag-end instead of running
   * at pointer-move frequency.
   */
  readonly onCardResizeEnd: (bookmarkId: string, w: number, h: number) => void
  /**
   * Reset a card's height to native aspect ratio (handle double-click).
   * Receives bookmarkId; BoardRoot resolves the cardId for IDB persistence.
   */
  readonly onCardResetToNative: (bookmarkId: string) => void
  /**
   * Persist a card's free-mode position to IDB. Receives the IDB cardId
   * (NOT bookmarkId). CardsLayer's free-drag state machine looks up the
   * cardId from the BoardItem and skips persistence when cardId is empty
   * (no IDB record yet).
   */
  readonly onPersistFreePos: (cardId: string, pos: FreePosition) => Promise<void>
}

/**
 * Inline grid→free conversion: kept inside CardsLayer because it's only
 * used here (Task 16 free-drag start, when an item has no `freePos` yet).
 * The `_item` slot mirrors the original plan's signature for forward-compat
 * with future helpers that may need the BoardItem context.
 */
function gridToFreePosition(_item: BoardItem, gridPos: CardPosition): FreePosition {
  return {
    x: gridPos.x,
    y: gridPos.y,
    w: gridPos.w,
    h: gridPos.h,
    rotation: 0,
    zIndex: 0,
    locked: false,
    isUserResized: false,
  }
}

type FreeDragState = {
  readonly bookmarkId: string
  readonly startPos: FreePosition
  readonly startClientX: number
  readonly startClientY: number
  readonly currentPos: FreePosition
  readonly shift: boolean
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
  onCardResetToNative,
  onPersistFreePos,
}: CardsLayerProps): ReactNode {
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const prevModeRef = useRef<LayoutMode>(layoutMode)
  const morphTimelineRef = useRef<gsap.core.Timeline | null>(null)

  // Free-mode drag state (only meaningful when layoutMode === 'free').
  // NOTE: selectedIds intentionally not added here — see plan §Task 23/24 (selection consumers).
  const [freeDragState, setFreeDragState] = useState<FreeDragState | null>(null)
  const [snapGuides, setSnapGuides] = useState<ReadonlyArray<SnapGuideLine>>([])
  // Ref mirror so async drag-end can read the latest state synchronously
  // without depending on the closure captured at handler creation time.
  const freeDragStateRef = useRef<FreeDragState | null>(null)
  freeDragStateRef.current = freeDragState

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

  // While free-dragging, override the dragged card's position so render +
  // GSAP follow the pointer in real time (persistence happens on drag end).
  // Other cards continue to use activePositions unchanged.
  const displayedPositions = useMemo<Readonly<Record<string, CardPosition>>>(() => {
    if (!freeDragState) return activePositions
    return {
      ...activePositions,
      [freeDragState.bookmarkId]: {
        x: freeDragState.currentPos.x,
        y: freeDragState.currentPos.y,
        w: freeDragState.currentPos.w,
        h: freeDragState.currentPos.h,
      },
    }
  }, [activePositions, freeDragState])

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
      const p = displayedPositions[it.bookmarkId]
      if (!p) continue
      gsap.set(el, { x: p.x, y: p.y, width: p.w, height: p.h })
    }
  }, [visibleItems, displayedPositions, layoutMode])

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

  // Track Shift while dragging so the user can toggle snap on/off mid-drag
  // without releasing the pointer. No-op when not dragging.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      setFreeDragState((prev) => (prev ? { ...prev, shift: e.shiftKey } : prev))
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    return (): void => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    }
  }, [])

  const handleFreeDragStart = (
    bookmarkId: string,
    clientX: number,
    clientY: number,
  ): void => {
    const item = items.find((it) => it.bookmarkId === bookmarkId)
    if (!item) return
    const gridPos = gridLayout.positions[bookmarkId]
    const pos: FreePosition =
      item.freePos ?? (gridPos ? gridToFreePosition(item, gridPos) : null) ?? {
        x: 0, y: 0, w: 240, h: 180,
        rotation: 0, zIndex: 0, locked: false, isUserResized: false,
      }
    setFreeDragState({
      bookmarkId,
      startPos: pos,
      startClientX: clientX,
      startClientY: clientY,
      currentPos: pos,
      shift: false,
    })
  }

  const handleFreeDragMove = (
    bookmarkId: string,
    clientX: number,
    clientY: number,
    shift: boolean,
  ): void => {
    // Read latest state via ref (mirrored every render at line ~117) so the
    // updater stays pure — Strict Mode double-invokes setter callbacks, and
    // calling setSnapGuides inside one would fire twice.
    const prev = freeDragStateRef.current
    if (!prev || prev.bookmarkId !== bookmarkId) return
    const dx = clientX - prev.startClientX
    const dy = clientY - prev.startClientY
    let newPos: FreePosition = {
      ...prev.startPos,
      x: prev.startPos.x + dx,
      y: prev.startPos.y + dy,
    }
    let nextGuides: ReadonlyArray<SnapGuideLine> = []
    if (!shift) {
      const others = items
        .filter((it) => it.bookmarkId !== bookmarkId && it.freePos)
        .map((it) => it.freePos as FreePosition)
      newPos = applySnapToPosition(newPos, others)
      nextGuides = computeSnapGuides(newPos, others)
    }
    setFreeDragState({ ...prev, currentPos: newPos, shift })
    setSnapGuides(nextGuides)
  }

  const handleFreeDragEnd = async (bookmarkId: string): Promise<void> => {
    const state = freeDragStateRef.current
    setFreeDragState(null)
    setSnapGuides([])
    if (!state || state.bookmarkId !== bookmarkId) return
    const item = items.find((it) => it.bookmarkId === bookmarkId)
    if (!item || !item.cardId) return // no IDB record yet — skip persist
    await onPersistFreePos(item.cardId, state.currentPos)
  }

  // Branched pointer-down: free mode runs an internal drag state machine,
  // grid mode delegates to the prop (BoardRoot's useCardDrag).
  const handleCardPointerDown = (
    e: PointerEvent<HTMLDivElement>,
    bookmarkId: string,
  ): void => {
    if (layoutMode === 'grid') {
      onCardPointerDown(e, bookmarkId)
      return
    }
    e.stopPropagation()
    const el = e.currentTarget
    const pointerId = e.pointerId
    el.setPointerCapture(pointerId)
    handleFreeDragStart(bookmarkId, e.clientX, e.clientY)

    const move = (ev: globalThis.PointerEvent): void => {
      handleFreeDragMove(bookmarkId, ev.clientX, ev.clientY, ev.shiftKey)
    }
    const up = (): void => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId)
      void handleFreeDragEnd(bookmarkId)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

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
      {layoutMode === 'free' && <SnapGuides guides={snapGuides} />}
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
              onPointerDown={handleCardPointerDown}
            />
            <ResizeHandle
              currentW={p.w}
              currentH={p.h}
              aspectRatio={it.aspectRatio}
              onResize={(w, h): void => onCardResize(it.bookmarkId, w, h)}
              onResizeEnd={(w, h): void => onCardResizeEnd(it.bookmarkId, w, h)}
              onResetToNative={(): void => onCardResetToNative(it.bookmarkId)}
            />
          </div>
        )
      })}
    </div>
  )
}
