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
  readonly onDragMove: (bookmarkId: string, x: number, y: number) => void
  readonly onDrop: (orderedBookmarkIds: readonly string[]) => void
}

export function useCardReorderDrag(params: UseReorderDragParams): {
  dragState: ReorderDragState | null
  handleCardPointerDown: (e: PointerEvent<HTMLDivElement>, bookmarkId: string) => void
} {
  const { items, positions, spaceHeld, onClick, onDragMove, onDrop } = params
  const [dragState, setDragState] = useState<ReorderDragState | null>(null)
  // Mirror latest state + params in a ref so handlers registered on window
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

      const startX = e.clientX
      const startY = e.clientY
      const startTime = performance.now()
      let dragStarted = false

      const move = (ev: globalThis.PointerEvent): void => {
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY
        const distance = Math.hypot(dx, dy)
        const elapsed = performance.now() - startTime

        if (!dragStarted) {
          if (distance < CLICK_THRESHOLD_PX && elapsed < CLICK_MAX_MS) return
          dragStarted = true
          setDragState({ bookmarkId, currentX: ev.clientX, currentY: ev.clientY })
          stateRef.current.onDragMove(bookmarkId, ev.clientX, ev.clientY)
          return
        }
        setDragState({ bookmarkId, currentX: ev.clientX, currentY: ev.clientY })
        stateRef.current.onDragMove(bookmarkId, ev.clientX, ev.clientY)
      }

      const up = (ev: globalThis.PointerEvent): void => {
        el.removeEventListener('pointermove', move)
        el.removeEventListener('pointerup', up)
        el.removeEventListener('pointercancel', up)
        if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId)

        const dx = ev.clientX - startX
        const dy = ev.clientY - startY
        const distance = Math.hypot(dx, dy)

        if (!dragStarted || distance < CLICK_THRESHOLD_PX) {
          setDragState(null)
          stateRef.current.onClick(bookmarkId)
          return
        }

        // Drag end — compute new order
        const newOrder = computeNewOrder({
          items: stateRef.current.items,
          positions: stateRef.current.positions,
          draggedId: bookmarkId,
          pointerClientX: ev.clientX,
          pointerClientY: ev.clientY,
          dropTarget: el,
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
 * Compute the new ordered bookmarkId list after a drop.
 *
 * Strategy: find the non-dragged card whose center is closest to the pointer;
 * if the pointer is to the left/above the center, insert before; otherwise,
 * after.
 */
function computeNewOrder(params: {
  items: ReadonlyArray<BoardItem>
  positions: Readonly<Record<string, CardPosition>>
  draggedId: string
  pointerClientX: number
  pointerClientY: number
  dropTarget: HTMLElement
}): readonly string[] {
  const { items, positions, draggedId, pointerClientX, pointerClientY, dropTarget } = params

  // Convert pointer clientX/Y into the cards' coord space. dropTarget is the
  // dragged card element; its getBoundingClientRect tells us where it is on
  // screen, and its inline transform gives us its world-space pos.
  const rect = dropTarget.getBoundingClientRect()
  const worldPos = positions[draggedId]
  if (!worldPos) return items.map((it) => it.bookmarkId)
  const deltaClientToWorldX = worldPos.x - rect.left
  const deltaClientToWorldY = worldPos.y - rect.top
  const pointerWorldX = pointerClientX + deltaClientToWorldX
  const pointerWorldY = pointerClientY + deltaClientToWorldY

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
