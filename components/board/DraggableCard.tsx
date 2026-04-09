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
  /** Initial X position on the canvas */
  initialX: number
  /** Initial Y position on the canvas */
  initialY: number
  /** Called when drag finishes with the new position */
  onDragEnd: (cardId: string, x: number, y: number) => void
}

/**
 * Wraps card content in a GSAP Draggable container.
 *
 * - Applies position: absolute with initialX / initialY.
 * - On drag start: adds shadow, scales up.
 * - On drag end: removes shadow, scales back, persists position via onDragEnd.
 * - Cleans up the Draggable instance on unmount.
 */
export function DraggableCard({
  children,
  cardId,
  initialX,
  initialY,
  onDragEnd,
}: DraggableCardProps): React.ReactElement {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const draggableRef = useRef<Draggable[]>([])

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

        // Calculate final position: initial offset + GSAP transform delta
        const deltaX = this.endX ?? 0
        const deltaY = this.endY ?? 0
        const finalX = initialX + deltaX
        const finalY = initialY + deltaY

        onDragEnd(cardId, finalX, finalY)
      },
    })

    draggableRef.current = instances

    return () => {
      for (const instance of instances) {
        instance.kill()
      }
    }
    // We intentionally omit onDragEnd / initialX / initialY from deps
    // to avoid re-creating Draggable on every render.
    // Position updates happen through re-mount when items reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
