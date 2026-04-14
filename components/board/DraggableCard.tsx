'use client'

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { Draggable } from 'gsap/Draggable'
import styles from './DraggableCard.module.css'
import { createRipple } from '@/lib/interactions/ripple'
import { ResizeHandle } from './ResizeHandle'

gsap.registerPlugin(Draggable)

/** Props for the DraggableCard wrapper */
type DraggableCardProps = {
  children: React.ReactNode
  cardId: string
  initialX: number
  initialY: number
  zoom: number
  onDrag?: (cardId: string, x: number, y: number) => void
  onDragEnd: (cardId: string, x: number, y: number) => void
  draggable?: boolean
  enableTilt?: boolean
  cardWidth?: number
  cardHeight?: number
  onResizeEnd?: (cardId: string, width: number, height: number) => void
}

/**
 * Wraps card content in an absolutely positioned container.
 *
 * Architecture: OUTER div = drag target (GSAP Draggable controls transform)
 *               INNER div = tilt target (CSS transform for 3D tilt + spotlight)
 * This separation prevents GSAP Draggable and tilt from fighting over transform.
 */
export function DraggableCard({
  children,
  cardId,
  initialX,
  initialY,
  zoom,
  onDrag,
  onDragEnd,
  draggable = true,
  enableTilt = true,
  cardWidth,
  cardHeight,
  onResizeEnd,
}: DraggableCardProps): React.ReactElement {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const tiltRef = useRef<HTMLDivElement | null>(null)
  const draggableRef = useRef<Draggable[]>([])

  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const initialXRef = useRef(initialX)
  initialXRef.current = initialX
  const initialYRef = useRef(initialY)
  initialYRef.current = initialY
  const onDragEndRef = useRef(onDragEnd)
  onDragEndRef.current = onDragEnd
  const onDragRef = useRef(onDrag)
  onDragRef.current = onDrag

  // ── GSAP Draggable on OUTER wrapper ─────────────────────────
  useEffect(() => {
    const el = wrapperRef.current
    if (!el || !draggable) return
    const instances = Draggable.create(el, {
      type: 'x,y',
      zIndexBoost: false,
      onDragStart() {
        el.classList.add(styles.dragging)
        const tiltEl = tiltRef.current
        if (tiltEl) {
          tiltEl.style.transform = ''
          tiltEl.style.setProperty('--spotlight-opacity', '0')
        }
      },
      onDrag() {
        const pixelDeltaX = this.x ?? 0
        const pixelDeltaY = this.y ?? 0
        const worldDeltaX = pixelDeltaX / zoomRef.current
        const worldDeltaY = pixelDeltaY / zoomRef.current
        const currentX = initialXRef.current + worldDeltaX
        const currentY = initialYRef.current + worldDeltaY
        onDragRef.current?.(cardId, currentX, currentY)
      },
      onDragEnd() {
        el.classList.remove(styles.dragging)
        gsap.to(el, {
          scale: 1.0,
          duration: 0.4,
          ease: 'back.out(1.7)',
        })

        const worldEl = el.closest('[class*="world"]') as HTMLElement | null
        if (worldEl) {
          const rect = el.getBoundingClientRect()
          const worldRect = worldEl.getBoundingClientRect()
          createRipple(
            rect.left - worldRect.left + rect.width / 2,
            rect.top - worldRect.top + rect.height / 2,
            worldEl,
          )
        }

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
      for (const instance of draggableRef.current) {
        instance.kill()
      }
      draggableRef.current = []
      // Reset GSAP internal state so a fresh Draggable can take over (React Strict Mode workaround)
      gsap.set(el, { clearProps: 'transform' })
    }
  }, [cardId, draggable])

  // ── Tilt + Spotlight on INNER div ───────────────────────────
  useEffect(() => {
    const el = tiltRef.current
    const dragEl = wrapperRef.current
    if (!el || !dragEl || !draggable || !enableTilt) return

    let rafId = 0
    let isHovering = false
    let isDragging = false

    const onMouseEnter = (): void => { isHovering = true }

    const onMouseLeave = (): void => {
      isHovering = false
      if (rafId) cancelAnimationFrame(rafId)
      el.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
      el.style.transform = ''
      el.style.setProperty('--spotlight-opacity', '0')
      el.style.setProperty('--tilt-shadow', '')
      setTimeout(() => { if (el) el.style.transition = '' }, 400)
    }

    const onMouseDown = (): void => { isDragging = true }
    const onMouseUp = (): void => {
      setTimeout(() => { isDragging = false }, 100)
    }

    const onMouseMove = (e: MouseEvent): void => {
      if (!isHovering || isDragging) return
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        if (!el || isDragging) return
        const rect = el.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        const nx = Math.max(-1, Math.min(1, (e.clientX - cx) / (rect.width / 2)))
        const ny = Math.max(-1, Math.min(1, (e.clientY - cy) / (rect.height / 2)))
        const rx = -ny * 5
        const ry = nx * 5
        el.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg) scale(1.03)`
        el.style.setProperty('--spotlight-x', `${((nx + 1) / 2) * 100}%`)
        el.style.setProperty('--spotlight-y', `${((ny + 1) / 2) * 100}%`)
        el.style.setProperty('--spotlight-opacity', '1')
        el.style.setProperty('--tilt-shadow', `${nx * 8}px ${ny * 8 + 12}px 24px rgba(0,0,0,0.3)`)
      })
    }

    // Listen on the outer drag wrapper for hover/move, apply to inner tilt div
    dragEl.addEventListener('mouseenter', onMouseEnter, { passive: true })
    dragEl.addEventListener('mouseleave', onMouseLeave, { passive: true })
    dragEl.addEventListener('mousemove', onMouseMove, { passive: true })
    dragEl.addEventListener('mousedown', onMouseDown, { passive: true })
    document.addEventListener('mouseup', onMouseUp, { passive: true })

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      dragEl.removeEventListener('mouseenter', onMouseEnter)
      dragEl.removeEventListener('mouseleave', onMouseLeave)
      dragEl.removeEventListener('mousemove', onMouseMove)
      dragEl.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [draggable, enableTilt])

  return (
    <div
      ref={wrapperRef}
      className={draggable ? styles.wrapper : styles.wrapperStatic}
      data-card-wrapper={cardId}
      style={{ left: initialX, top: initialY }}
    >
      <div ref={tiltRef} className={styles.tiltInner}>
        {children}
      </div>
      {draggable && onResizeEnd !== undefined && cardWidth !== undefined && cardHeight !== undefined && (
        <ResizeHandle
          cardId={cardId}
          currentWidth={cardWidth}
          currentHeight={cardHeight}
          zoom={zoom}
          onResizeEnd={onResizeEnd}
        />
      )}
    </div>
  )
}
