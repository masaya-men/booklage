'use client'

import { useCallback, useRef } from 'react'
import styles from './ResizeHandle.module.css'

type ResizeHandleProps = {
  /** ID of the card being resized */
  cardId: string
  /** Current card width in pixels */
  currentWidth: number
  /** Current card height in pixels */
  currentHeight: number
  /** Current canvas zoom factor */
  zoom: number
  /** Called when resize interaction ends with the final dimensions */
  onResizeEnd: (cardId: string, width: number, height: number) => void
}

/**
 * A drag handle rendered at the bottom-right corner of a card.
 * Dragging adjusts the card's --card-width CSS variable in real-time
 * and calls onResizeEnd with the final width and height on pointer up.
 */
export function ResizeHandle({
  cardId,
  currentWidth,
  currentHeight,
  zoom,
  onResizeEnd,
}: ResizeHandleProps): React.ReactElement {
  const startRef = useRef({ x: 0, y: 0, w: 0, h: 0 })

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      e.preventDefault()

      const cardEl = (e.target as HTMLElement).closest('[data-card-wrapper]') as HTMLElement | null

      startRef.current = {
        x: e.clientX,
        y: e.clientY,
        w: currentWidth,
        h: currentHeight,
      }

      const handlePointerMove = (moveEvent: PointerEvent): void => {
        const dx = (moveEvent.clientX - startRef.current.x) / zoom
        const newWidth = Math.max(120, Math.round(startRef.current.w + dx))

        if (cardEl) {
          const inner = cardEl.firstElementChild as HTMLElement | null
          if (inner) {
            inner.style.setProperty('--card-width', `${newWidth}px`)
          }
        }
      }

      const handlePointerUp = (upEvent: PointerEvent): void => {
        document.removeEventListener('pointermove', handlePointerMove)
        document.removeEventListener('pointerup', handlePointerUp)

        const dx = (upEvent.clientX - startRef.current.x) / zoom
        const dy = (upEvent.clientY - startRef.current.y) / zoom
        const finalWidth = Math.max(120, Math.round(startRef.current.w + dx))
        const finalHeight = Math.max(80, Math.round(startRef.current.h + dy))

        onResizeEnd(cardId, finalWidth, finalHeight)
      }

      document.addEventListener('pointermove', handlePointerMove)
      document.addEventListener('pointerup', handlePointerUp)
    },
    [cardId, currentWidth, currentHeight, zoom, onResizeEnd],
  )

  return (
    <div
      className={styles.handle}
      onPointerDown={handlePointerDown}
    />
  )
}
