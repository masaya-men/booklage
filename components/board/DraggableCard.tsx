'use client'

import { useCallback, useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { Draggable } from 'gsap/Draggable'
import styles from './DraggableCard.module.css'
import { useCardTilt } from '@/lib/interactions/use-card-tilt'

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
  /** Whether drag is enabled (false in grid mode) */
  draggable?: boolean
  /** Whether 3D tilt + spotlight effect is enabled on hover (default true) */
  enableTilt?: boolean
}

/**
 * Wraps card content in an absolutely positioned container.
 *
 * - When draggable=true (default): GSAP Draggable is created.
 * - When draggable=false: positioned statically, no drag interaction.
 * - GSAP Draggable tracks pixel deltas; we divide by zoom to get world deltas.
 */
export function DraggableCard({
  children,
  cardId,
  initialX,
  initialY,
  zoom,
  onDragEnd,
  draggable = true,
  enableTilt = true,
}: DraggableCardProps): React.ReactElement {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const draggableRef = useRef<Draggable[]>([])

  const tilt = useCardTilt({ enabled: draggable && enableTilt })

  const combinedRef = useCallback(
    (el: HTMLDivElement | null) => {
      wrapperRef.current = el
      tilt.ref(el)
    },
    [tilt],
  )

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
    if (!el || !draggable) return

    const instances = Draggable.create(el, {
      type: 'x,y',
      zIndexBoost: false,
      onDragStart() {
        el.classList.add(styles.dragging)
        // Reset tilt during drag
        el.style.setProperty('--spotlight-opacity', '0')
        gsap.to(el, { scale: 1.05, duration: 0.2, ease: 'power2.out' })
      },
      onDragEnd() {
        el.classList.remove(styles.dragging)
        gsap.to(el, {
          scale: 1.0,
          duration: 0.4,
          ease: 'back.out(1.7)',
        })

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
      draggableRef.current = []
    }
  }, [cardId, draggable])

  return (
    <div
      ref={combinedRef}
      className={draggable ? styles.wrapper : styles.wrapperStatic}
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
