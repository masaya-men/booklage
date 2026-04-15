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
 * Dragging adjusts the card's --card-width and --card-height CSS variables
 * in real-time and calls onResizeEnd with the final dimensions on pointer up.
 *
 * During resize, the card's float animation is paused to prevent position drift.
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

      const handle = e.target as HTMLElement
      const cardEl = handle.closest('[data-card-wrapper]') as HTMLElement | null
      const inner = cardEl?.firstElementChild as HTMLElement | null

      startRef.current = {
        x: e.clientX,
        y: e.clientY,
        w: currentWidth,
        h: currentHeight,
      }

      // Pause float animation during resize to prevent position drift
      if (inner) {
        inner.style.animationPlayState = 'paused'
      }
      // Add resizing state for visual feedback
      handle.classList.add(styles.active)

      const handlePointerMove = (moveEvent: PointerEvent): void => {
        const dx = (moveEvent.clientX - startRef.current.x) / zoom
        const dy = (moveEvent.clientY - startRef.current.y) / zoom
        const newWidth = Math.max(120, Math.round(startRef.current.w + dx))
        const newHeight = Math.max(80, Math.round(startRef.current.h + dy))

        if (inner) {
          inner.style.setProperty('--card-width', `${newWidth}px`)
          inner.style.setProperty('--card-height', `${newHeight}px`)
        }
      }

      const handlePointerUp = (upEvent: PointerEvent): void => {
        document.removeEventListener('pointermove', handlePointerMove)
        document.removeEventListener('pointerup', handlePointerUp)

        // Resume float animation
        if (inner) {
          inner.style.animationPlayState = ''
        }
        handle.classList.remove(styles.active)

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
