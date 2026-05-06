// components/share/use-share-reorder-drag.ts
'use client'

import { useCallback, useRef, useState, type PointerEvent } from 'react'

const CLICK_THRESHOLD_PX = 5

export type ShareDragState = {
  readonly bookmarkId: string
  readonly currentX: number
  readonly currentY: number
}

type CardLocalRect = {
  readonly id: string
  readonly cx: number  // center x in frame-local coords
  readonly cy: number  // center y in frame-local coords
}

export type UseShareReorderDragParams = {
  readonly cardIds: ReadonlyArray<string>
  /** Frame-local center positions for every card. Used to find drop target. */
  readonly cardCenters: ReadonlyArray<CardLocalRect>
  readonly onReorder: (orderedIds: readonly string[]) => void
}

export function useShareReorderDrag(params: UseShareReorderDragParams): {
  dragState: ShareDragState | null
  handleCardPointerDown: (e: PointerEvent<HTMLDivElement>, bookmarkId: string) => void
} {
  const { cardIds, cardCenters, onReorder } = params
  const [dragState, setDragState] = useState<ShareDragState | null>(null)
  const stateRef = useRef({ cardIds, cardCenters, onReorder })
  stateRef.current = { cardIds, cardCenters, onReorder }

  const handleCardPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>, bookmarkId: string): void => {
      // Only primary button initiates drag. Right-click must pass through to onContextMenu.
      if (e.button > 0) return
      e.stopPropagation()
      const el = e.currentTarget
      const pointerId = e.pointerId
      el.setPointerCapture(pointerId)

      const startClientX = e.clientX
      const startClientY = e.clientY
      let dragStarted = false

      const move = (ev: globalThis.PointerEvent): void => {
        const dx = ev.clientX - startClientX
        const dy = ev.clientY - startClientY
        if (!dragStarted) {
          if (Math.hypot(dx, dy) < CLICK_THRESHOLD_PX) return
          dragStarted = true
        }
        setDragState({ bookmarkId, currentX: dx, currentY: dy })
      }

      const up = (ev: globalThis.PointerEvent): void => {
        el.removeEventListener('pointermove', move)
        el.removeEventListener('pointerup', up)
        el.removeEventListener('pointercancel', up)
        if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId)

        if (!dragStarted) {
          setDragState(null)
          return
        }

        // Lazy-resolve the frame element from the dragged card's DOM ancestry
        // (avoids React ref timing issues — refs are populated after render,
        // and stateRef captured at first render would still be null).
        const frame = el.closest('[data-testid="share-frame"]') as HTMLElement | null
        if (!frame) {
          setDragState(null)
          return
        }
        const rect = frame.getBoundingClientRect()
        const pointerLocalX = ev.clientX - rect.left
        const pointerLocalY = ev.clientY - rect.top

        let bestId: string | null = null
        let bestDist = Infinity
        for (const c of stateRef.current.cardCenters) {
          const dxc = c.cx - pointerLocalX
          const dyc = c.cy - pointerLocalY
          const d = dxc * dxc + dyc * dyc
          if (d < bestDist) {
            bestDist = d
            bestId = c.id
          }
        }

        setDragState(null)
        if (!bestId || bestId === bookmarkId) {
          // Pointer didn't land on another card — leave order unchanged.
          return
        }

        // Move dragged id to the position of bestId
        const ids = stateRef.current.cardIds.slice()
        const fromIdx = ids.indexOf(bookmarkId)
        const toIdx = ids.indexOf(bestId)
        if (fromIdx < 0 || toIdx < 0) return
        ids.splice(fromIdx, 1)
        ids.splice(toIdx, 0, bookmarkId)
        stateRef.current.onReorder(ids)
      }

      el.addEventListener('pointermove', move)
      el.addEventListener('pointerup', up)
      el.addEventListener('pointercancel', up)
    },
    [],
  )

  return { dragState, handleCardPointerDown }
}
