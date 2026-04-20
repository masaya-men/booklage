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

        // Drag end — compute new order using the pointer's world coords
        const pointerWorldX = ev.clientX + deltaClientToWorldX
        const pointerWorldY = ev.clientY + deltaClientToWorldY
        const newOrder = computeVirtualOrder({
          items: stateRef.current.items,
          positions: stateRef.current.positions,
          draggedId: bookmarkId,
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
 * the current pointer world position. Called on every pointermove for live
 * reflow preview, and also on drop to finalize the order.
 *
 * Strategy: find the non-dragged card whose center is closest to the pointer;
 * if the pointer is to the left of that center, insert before; otherwise after.
 */
export function computeVirtualOrder(params: {
  items: ReadonlyArray<BoardItem>
  positions: Readonly<Record<string, CardPosition>>
  draggedId: string
  pointerWorldX: number
  pointerWorldY: number
}): readonly string[] {
  const { items, positions, draggedId, pointerWorldX, pointerWorldY } = params

  let bestId: string | null = null
  let bestDistSq = Infinity
  let bestCenter = { cx: 0, cy: 0 }
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

  const ordered = items.slice().sort((a, b) => a.orderIndex - b.orderIndex)
  const withoutDragged = ordered.filter((it) => it.bookmarkId !== draggedId)

  if (!bestId) {
    // Drop below all cards — append
    return [...withoutDragged.map((it) => it.bookmarkId), draggedId]
  }

  const insertBefore = pointerWorldX < bestCenter.cx
  const targetIdx = withoutDragged.findIndex((it) => it.bookmarkId === bestId)
  const insertIdx = insertBefore ? targetIdx : targetIdx + 1

  const ids = withoutDragged.map((it) => it.bookmarkId)
  ids.splice(insertIdx, 0, draggedId)
  return ids
}
