'use client'

import { useCallback, useRef, useState, type PointerEvent } from 'react'
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
  readonly onClick: (bookmarkId: string) => void
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
          stateRef.current.onClick(bookmarkId)
          return
        }

        // Drag end — compute new order using the card's final world position.
        const cardWorldX = (startPos?.x ?? 0) + (ev.clientX - startClientX)
        const cardWorldY = (startPos?.y ?? 0) + (ev.clientY - startClientY)
        const pointerWorldX = ev.clientX + deltaClientToWorldX
        const pointerWorldY = ev.clientY + deltaClientToWorldY
        const newOrder = computeVirtualOrder({
          items: stateRef.current.items,
          positions: stateRef.current.positions,
          draggedId: bookmarkId,
          cardWorldX,
          cardWorldY,
          pointerWorldX,
          pointerWorldY,
        })
        setDragState(null)
        stateRef.current.onDrop(newOrder)
      }

      el.addEventListener('pointermove', move)
      el.addEventListener('pointerup', up)
      el.addEventListener('pointercancel', up)
    },
    [spaceHeld],
  )

  return { dragState, handleCardPointerDown }
}

/**
 * Compute what the card order WOULD BE if the dragged card were dropped at
 * the current position. Called on every pointermove for live reflow preview,
 * and also on drop to finalize the order.
 *
 * Strategy:
 *  Phase 1 — Primary: find the non-dragged card with the MAX bounding-box
 *    overlap area with the dragged card.
 *  Phase 2 — Fallback: if no overlap (dragged card hovering in a gap), use
 *    nearest-center from the pointer position.
 *
 * Insert direction uses Y-first comparison (reading order for column masonry)
 * with X as tiebreaker. This ensures that a card dragged directly over another
 * triggers a reorder from any approach angle, not just horizontal.
 */
export function computeVirtualOrder(params: {
  items: ReadonlyArray<BoardItem>
  positions: Readonly<Record<string, CardPosition>>
  draggedId: string
  /** Dragged card's current world-space top-left (at the pointer-follow transform). */
  cardWorldX: number
  cardWorldY: number
  /** Pointer world coords — used only as fallback (when card bbox has no overlap). */
  pointerWorldX: number
  pointerWorldY: number
}): readonly string[] {
  const { items, positions, draggedId, cardWorldX, cardWorldY, pointerWorldX, pointerWorldY } =
    params
  const draggedPos = positions[draggedId]

  const ordered = items.slice().sort((a, b) => a.orderIndex - b.orderIndex)
  const withoutDragged = ordered.filter((it) => it.bookmarkId !== draggedId)

  if (!draggedPos) {
    // Defensive: without the dragged card's size, fall back to no-op order.
    return ordered.map((it) => it.bookmarkId)
  }

  // Dragged card's bbox at its current pointer-driven world position.
  const dBox = { x: cardWorldX, y: cardWorldY, w: draggedPos.w, h: draggedPos.h }
  const draggedCenterX = cardWorldX + draggedPos.w / 2
  const draggedCenterY = cardWorldY + draggedPos.h / 2

  // Phase 1: find the non-dragged card with MAX bounding-box overlap.
  let bestId: string | null = null
  let bestOverlap = 0
  let bestCenter = { cx: 0, cy: 0 }
  for (const it of items) {
    if (it.bookmarkId === draggedId) continue
    const p = positions[it.bookmarkId]
    if (!p) continue
    const overlapW = Math.max(0, Math.min(dBox.x + dBox.w, p.x + p.w) - Math.max(dBox.x, p.x))
    const overlapH = Math.max(0, Math.min(dBox.y + dBox.h, p.y + p.h) - Math.max(dBox.y, p.y))
    const area = overlapW * overlapH
    if (area > bestOverlap) {
      bestOverlap = area
      bestId = it.bookmarkId
      bestCenter = { cx: p.x + p.w / 2, cy: p.y + p.h / 2 }
    }
  }

  // Phase 2: fallback to nearest-center if the dragged card isn't overlapping anyone
  // (e.g., user hovering in a gap or outside the grid).
  if (!bestId) {
    let bestDistSq = Infinity
    for (const it of items) {
      if (it.bookmarkId === draggedId) continue
      const p = positions[it.bookmarkId]
      if (!p) continue
      const cx = p.x + p.w / 2
      const cy = p.y + p.h / 2
      const dx = pointerWorldX - cx
      const dy = pointerWorldY - cy
      const d = dx * dx + dy * dy
      if (d < bestDistSq) {
        bestDistSq = d
        bestId = it.bookmarkId
        bestCenter = { cx, cy }
      }
    }
  }

  if (!bestId) {
    // No other cards at all — append dragged at end.
    return [...withoutDragged.map((it) => it.bookmarkId), draggedId]
  }

  // Insert direction: Y-first with X tiebreaker (reading order for column masonry).
  // This ensures overlapping at a target's exact center still changes order.
  const Y_SAME_THRESHOLD_PX = 2
  let insertBefore: boolean
  if (draggedCenterY < bestCenter.cy - Y_SAME_THRESHOLD_PX) {
    insertBefore = true
  } else if (draggedCenterY > bestCenter.cy + Y_SAME_THRESHOLD_PX) {
    insertBefore = false
  } else {
    // Same row (roughly): use X.
    insertBefore = draggedCenterX < bestCenter.cx
  }

  const targetIdx = withoutDragged.findIndex((it) => it.bookmarkId === bestId)
  const insertIdx = insertBefore ? targetIdx : targetIdx + 1

  const ids = withoutDragged.map((it) => it.bookmarkId)
  ids.splice(insertIdx, 0, draggedId)
  return ids
}
