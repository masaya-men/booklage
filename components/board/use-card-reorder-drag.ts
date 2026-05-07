'use client'

import { useCallback, useRef, useState, type PointerEvent } from 'react'
import { computeSkylineLayout, type SkylineCard } from '@/lib/board/skyline-layout'
import type { BoardItem } from '@/lib/storage/use-board-data'
import type { CardPosition } from '@/lib/board/types'

const CLICK_THRESHOLD_PX = 5
const CLICK_MAX_MS = 200

export type ReorderDragState = {
  readonly bookmarkId: string
  readonly currentX: number
  readonly currentY: number
}

export type UseReorderDragParams = {
  readonly items: ReadonlyArray<BoardItem>
  readonly positions: Readonly<Record<string, CardPosition>>
  readonly spaceHeld: boolean
  /** Called on a tap (no drag). originRect is the clicked card's
   *  getBoundingClientRect() at the moment of pointer-up — used by the
   *  Lightbox to grow from the card's position (FLIP). */
  readonly onClick: (bookmarkId: string, originRect: DOMRect) => void
  readonly onDragMove: (
    bookmarkId: string,
    cardWorldX: number,
    cardWorldY: number,
    pointerWorldX: number,
    pointerWorldY: number,
  ) => void
  readonly onDrop: (orderedBookmarkIds: readonly string[]) => void
}

export function useCardReorderDrag(params: UseReorderDragParams): {
  dragState: ReorderDragState | null
  handleCardPointerDown: (e: PointerEvent<HTMLDivElement>, bookmarkId: string) => void
} {
  const { items, positions, spaceHeld, onClick, onDragMove, onDrop } = params
  const [dragState, setDragState] = useState<ReorderDragState | null>(null)
  // Mirror latest state + params in a ref so handlers registered on the element
  // see the latest values without rebinding every render.
  const stateRef = useRef<{
    state: ReorderDragState | null
    items: ReadonlyArray<BoardItem>
    positions: Readonly<Record<string, CardPosition>>
    onDrop: typeof onDrop
    onClick: typeof onClick
    onDragMove: typeof onDragMove
  }>({ state: null, items, positions, onDrop, onClick, onDragMove })
  stateRef.current = { state: dragState, items, positions, onDrop, onClick, onDragMove }

  const handleCardPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>, bookmarkId: string): void => {
      // Only the primary (left) button initiates a drag/click. Right
      // clicks (button 2) and middle clicks (button 1) must pass
      // straight through so onContextMenu can fire on the card div —
      // we used to setPointerCapture for ALL buttons, which silently
      // broke right-click delete because the captured pointer
      // suppressed the contextmenu event from reaching the React
      // synthetic handler. button === -1 means an unknown / synthetic
      // pointer (e.g. some test runners) which we treat as primary.
      if (e.button > 0) return
      if (spaceHeld) return
      e.stopPropagation()
      const el = e.currentTarget
      const pointerId = e.pointerId
      el.setPointerCapture(pointerId)

      const startClientX = e.clientX
      const startClientY = e.clientY
      const startTime = performance.now()
      let dragStarted = false

      // Compute delta from client space to world space once on pointerdown.
      // This delta is constant throughout the drag (we don't support panning
      // while dragging).
      const startPos = stateRef.current.positions[bookmarkId]
      const rect = el.getBoundingClientRect()

      // Fallback: if we can't find world pos, use client coords as world coords
      const deltaClientToWorldX = startPos ? startPos.x - rect.left : 0
      const deltaClientToWorldY = startPos ? startPos.y - rect.top : 0

      const move = (ev: globalThis.PointerEvent): void => {
        const dx = ev.clientX - startClientX
        const dy = ev.clientY - startClientY
        const distance = Math.hypot(dx, dy)
        const elapsed = performance.now() - startTime

        if (!dragStarted) {
          if (distance < CLICK_THRESHOLD_PX && elapsed < CLICK_MAX_MS) return
          dragStarted = true
        }

        // Compute card's new world-space top-left:
        // startPos (world) + delta from original pointer position
        const cardWorldX = (startPos?.x ?? 0) + (ev.clientX - startClientX)
        const cardWorldY = (startPos?.y ?? 0) + (ev.clientY - startClientY)

        // Pointer's world position
        const pointerWorldX = ev.clientX + deltaClientToWorldX
        const pointerWorldY = ev.clientY + deltaClientToWorldY

        setDragState({ bookmarkId, currentX: ev.clientX, currentY: ev.clientY })
        stateRef.current.onDragMove(bookmarkId, cardWorldX, cardWorldY, pointerWorldX, pointerWorldY)
      }

      const up = (ev: globalThis.PointerEvent): void => {
        el.removeEventListener('pointermove', move)
        el.removeEventListener('pointerup', up)
        el.removeEventListener('pointercancel', up)
        if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId)

        const dx = ev.clientX - startClientX
        const dy = ev.clientY - startClientY
        const distance = Math.hypot(dx, dy)

        if (!dragStarted || distance < CLICK_THRESHOLD_PX) {
          setDragState(null)
          // Capture the card's screen rect right now so Lightbox can
          // grow visually from this position (FLIP). Re-querying here
          // (vs. using the saved startPos) is correct: pan/scroll may
          // have shifted the card between pointerdown and pointerup.
          const originRect = el.getBoundingClientRect()
          stateRef.current.onClick(bookmarkId, originRect)
          return
        }

        // Drag end — CardsLayer's virtualOrderedIds (updated on every
        // pointermove) is the single source of truth for the final drop order.
        // Pass [] as a no-op placeholder; CardsLayer.onDrop ignores the arg.
        setDragState(null)
        stateRef.current.onDrop([])
      }

      el.addEventListener('pointermove', move)
      el.addEventListener('pointerup', up)
      el.addEventListener('pointercancel', up)
    },
    [spaceHeld],
  )

  return { dragState, handleCardPointerDown }
}

// --------------------------------------------------------------------------
// Position-preserving insertion algorithm
// --------------------------------------------------------------------------

/**
 * Build skyline input cards from ordered items. Width is resolved by the
 * caller-supplied lookup so the simulator honours per-card resize
 * overrides; height comes from the per-card intrinsic height when
 * present (text cards) or from `width / aspectRatio` otherwise (image /
 * video cards).
 */
function buildSkylineCards(
  items: ReadonlyArray<BoardItem>,
  resolveWidth: (bookmarkId: string) => number,
  intrinsicHeights: Readonly<Record<string, number>>,
): SkylineCard[] {
  return items.map((it) => {
    const intrinsic = intrinsicHeights[it.bookmarkId]
    const w = resolveWidth(it.bookmarkId)
    const h =
      intrinsic && intrinsic > 0
        ? intrinsic
        : it.aspectRatio > 0
          ? w / it.aspectRatio
          : w
    return { id: it.bookmarkId, width: w, height: h }
  })
}

/** Layout simulator the caller provides — runs whatever engine fits its
 *  context (board uses skyline, share uses column-masonry). Must return
 *  positions keyed by bookmarkId for the items that were laid out. */
type SimulateLayout = (
  orderedItems: ReadonlyArray<BoardItem>,
) => Readonly<Record<string, CardPosition>>

/**
 * Compute what the card order WOULD BE if the dragged card were dropped at
 * the current position. Called on every pointermove for live reflow preview.
 *
 * Strategy (position-preserving):
 *   For each candidate insertion index (0 … withoutDragged.length), simulate
 *   the layout with the dragged card inserted at that index. Record where
 *   the dragged card lands in the simulation. Pick the index whose simulated
 *   position is closest to the card's current visual top-left
 *   (cardWorldX, cardWorldY). This ensures the drop location matches the
 *   user's spatial intent rather than just a relative order change.
 *
 * The caller injects the layout engine via `simulateLayout` so this works
 * for both the board (skyline) and the share composer (column-masonry).
 *
 * Complexity: O(N) calls to `simulateLayout`; each call is O(N) to O(N²)
 * depending on the chosen engine. With the 8px movement throttle applied
 * in CardsLayer this stays under a frame for boards up to a few hundred
 * cards.
 */
export function computeVirtualOrder(params: {
  items: ReadonlyArray<BoardItem>
  draggedId: string
  /** Dragged card's current world-space top-left (pointer-driven transform). */
  cardWorldX: number
  cardWorldY: number
  /** Caller-supplied layout simulator. Receives the simulated ordered items
   *  and must return positions for all of them. */
  simulateLayout: SimulateLayout
}): readonly string[] {
  const { items, draggedId, cardWorldX, cardWorldY, simulateLayout } = params

  const ordered = items.slice().sort((a, b) => a.orderIndex - b.orderIndex)
  const withoutDragged = ordered.filter((it) => it.bookmarkId !== draggedId)

  // Defensive: if dragged isn't in items, return unchanged order.
  const draggedItem = items.find((it) => it.bookmarkId === draggedId)
  if (!draggedItem) return ordered.map((it) => it.bookmarkId)

  let bestIdx = 0
  let bestDist = Infinity

  for (let idx = 0; idx <= withoutDragged.length; idx++) {
    // Build simulated items array with dragged inserted at idx.
    const simulatedItems: BoardItem[] = withoutDragged.slice()
    simulatedItems.splice(idx, 0, draggedItem)

    const positions = simulateLayout(simulatedItems)
    const simPos = positions[draggedId]
    if (!simPos) continue

    // Squared distance between simulated position and current visual top-left.
    const dx = simPos.x - cardWorldX
    const dy = simPos.y - cardWorldY
    const dist = dx * dx + dy * dy

    if (dist < bestDist) {
      bestDist = dist
      bestIdx = idx
    }
  }

  const ids = withoutDragged.map((it) => it.bookmarkId)
  ids.splice(bestIdx, 0, draggedId)
  return ids
}

/**
 * Convenience helper that builds a `SimulateLayout` callback wired to the
 * skyline engine — the board's standard configuration. `resolveWidth`
 * returns the desired width for a given bookmarkId so the simulator
 * stays consistent with whatever per-card override the caller is
 * tracking (e.g. resize-handle local state).
 */
export function makeSkylineSimulator(params: {
  containerWidth: number
  gap: number
  resolveWidth: (bookmarkId: string) => number
  intrinsicHeights: Readonly<Record<string, number>>
}): SimulateLayout {
  const { containerWidth, gap, resolveWidth, intrinsicHeights } = params
  return (orderedItems): Readonly<Record<string, CardPosition>> => {
    const cards = buildSkylineCards(orderedItems, resolveWidth, intrinsicHeights)
    return computeSkylineLayout({ cards, containerWidth, gap }).positions
  }
}
