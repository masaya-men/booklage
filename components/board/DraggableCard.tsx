'use client'

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { Draggable } from 'gsap/Draggable'
import styles from './DraggableCard.module.css'

gsap.registerPlugin(Draggable)

/** Props for the DraggableCard wrapper */
type DraggableCardProps = {
  /** Card content to render inside the draggable wrapper */
  children: React.ReactNode
  /** Unique card identifier */
  cardId: string
  /** X position in world coordinates */
  initialX: number
  /** Y position in world coordinates */
  initialY: number
  /** Current canvas zoom factor (used to convert pixel deltas to world coords) */
  zoom: number
  /** Called when drag finishes with the new world-space position */
  onDragEnd: (cardId: string, x: number, y: number) => void
}

/**
 * Wraps card content in a GSAP Draggable container.
 *
 * - Positioned absolutely in world space (left/top = world coords).
 * - GSAP Draggable tracks pixel deltas; we divide by zoom to get world deltas.
 * - Drag start: deeper shadow, slight scale up.
 * - Drag end: restore shadow, persist new world position.
 */
export function DraggableCard({
  children,
  cardId,
  initialX,
  initialY,
  zoom,
  onDragEnd,
}: DraggableCardProps): React.ReactElement {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const draggableRef = useRef<Draggable[]>([])

  // Store latest values in refs so GSAP callbacks can read them
  // without re-creating the Draggable instance.
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const initialXRef = useRef(initialX)
  initialXRef.current = initialX
  const initialYRef = useRef(initialY)
  initialYRef.current = initialY
  const onDragEndRef = useRef(onDragEnd)
  onDragEndRef.current = onDragEnd

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return

    const instances = Draggable.create(el, {
      type: 'x,y',
      zIndexBoost: false,
      onDragStart() {
        el.classList.add(styles.dragging)
        gsap.to(el, { scale: 1.05, duration: 0.2, ease: 'power2.out' })
      },
      onDragEnd() {
        el.classList.remove(styles.dragging)
        gsap.to(el, {
          scale: 1.0,
          duration: 0.4,
          ease: 'back.out(1.7)',
        })

        // GSAP reports pixel deltas; divide by zoom for world-space delta
        const pixelDeltaX = this.endX ?? 0
        const pixelDeltaY = this.endY ?? 0
        const worldDeltaX = pixelDeltaX / zoomRef.current
        const worldDeltaY = pixelDeltaY / zoomRef.current
        const finalX = initialXRef.current + worldDeltaX
        const finalY = initialYRef.current + worldDeltaY

        onDragEndRef.current(cardId, finalX, finalY)
      },
    })

    draggableRef.current = instances

    return () => {
      for (const instance of instances) {
        instance.kill()
      }
    }
  }, [cardId])

  return (
    <div
      ref={wrapperRef}
      className={styles.wrapper}
      data-card-wrapper={cardId}
      style={{
        left: initialX,
        top: initialY,
      }}
    >
      {children}
    </div>
  )
}
