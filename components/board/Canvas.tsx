'use client'

import {
  useCallback,
  useEffect,
  useRef,
  type RefObject,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react'
import { CANVAS_ZOOM_SENSITIVITY } from '@/lib/constants'
import type { InfiniteCanvasControls } from '@/lib/canvas/use-infinite-canvas'
import { LiquidGlassProvider } from '@/lib/glass/LiquidGlassProvider'
import styles from './Canvas.module.css'

/** Props for the Canvas component */
type CanvasProps = {
  /** Child elements rendered inside the world container */
  children: React.ReactNode
  /** Infinite canvas controls from useInfiniteCanvas hook */
  canvas: InfiniteCanvasControls
  /** Ref to the world container, used for image export */
  worldRef?: RefObject<HTMLDivElement | null>
  /** Background theme name (matches [data-bg-theme] in globals.css) */
  bgTheme?: string
}

/**
 * Infinite canvas viewport with pan/zoom support.
 *
 * - Mouse wheel: zoom at cursor position
 * - Middle-click drag OR Space+click drag: pan
 * - Two-finger touch: pan + pinch-to-zoom
 * - Left-click on cards: handled by DraggableCard (not this component)
 */
export function Canvas({
  children,
  canvas,
  worldRef,
  bgTheme = 'dark',
}: CanvasProps): React.ReactElement {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const panStartRef = useRef<{ x: number; y: number } | null>(null)
  const lastTouchDistRef = useRef<number | null>(null)
  const lastTouchCenterRef = useRef<{ x: number; y: number } | null>(null)
  const spaceHeldRef = useRef(false)

  // Store canvas controls in ref so native event listeners read latest values
  const canvasRef = useRef(canvas)
  canvasRef.current = canvas

  // ── Keyboard + Wheel: managed via useEffect with cleanup ────
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        spaceHeldRef.current = true
      }
    }

    const handleKeyUp = (e: KeyboardEvent): void => {
      if (e.code === 'Space') {
        spaceHeldRef.current = false
        canvasRef.current.setIsPanning(false)
        panStartRef.current = null
      }
    }

    // Native wheel listener with { passive: false } so preventDefault() works.
    // React's onWheel is passive in React 19 and cannot call preventDefault().
    const handleWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const rect = viewport.getBoundingClientRect()
      const screenX = e.clientX - rect.left
      const screenY = e.clientY - rect.top
      const delta = -e.deltaY * CANVAS_ZOOM_SENSITIVITY
      const newZoom = canvasRef.current.state.zoom * (1 + delta)
      canvasRef.current.zoomAtPoint(newZoom, screenX, screenY)
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)
    viewport.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
      viewport.removeEventListener('wheel', handleWheel)
    }
  }, []) // Empty deps — uses refs for latest values

  // ── Pointer events: pan (middle button or Space+left) ───────
  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const isMiddle = e.button === 1
      const isSpaceLeft = spaceHeldRef.current && e.button === 0

      if (isMiddle || isSpaceLeft) {
        e.preventDefault()
        canvas.setIsPanning(true)
        panStartRef.current = { x: e.clientX, y: e.clientY }
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      }
    },
    [canvas],
  )

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!panStartRef.current) return

      const dx = e.clientX - panStartRef.current.x
      const dy = e.clientY - panStartRef.current.y
      panStartRef.current = { x: e.clientX, y: e.clientY }

      canvas.pan(dx, dy)
    },
    [canvas],
  )

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (panStartRef.current) {
        panStartRef.current = null
        if (!spaceHeldRef.current) {
          canvas.setIsPanning(false)
        }
        ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
      }
    },
    [canvas],
  )

  // ── Touch events: 2-finger pan + pinch-to-zoom ──────────────
  const getTouchDistance = (t1: React.Touch, t2: React.Touch): number => {
    const dx = t1.clientX - t2.clientX
    const dy = t1.clientY - t2.clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  const getTouchCenter = (t1: React.Touch, t2: React.Touch): { x: number; y: number } => ({
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2,
  })

  const handleTouchStart = useCallback(
    (e: ReactTouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        const t1 = e.touches[0]
        const t2 = e.touches[1]
        lastTouchDistRef.current = getTouchDistance(t1, t2)
        lastTouchCenterRef.current = getTouchCenter(t1, t2)
        canvas.setIsPanning(true)
      }
    },
    [canvas],
  )

  const handleTouchMove = useCallback(
    (e: ReactTouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 2 && lastTouchDistRef.current !== null && lastTouchCenterRef.current !== null) {
        e.preventDefault()
        const t1 = e.touches[0]
        const t2 = e.touches[1]

        const newDist = getTouchDistance(t1, t2)
        const scale = newDist / lastTouchDistRef.current

        const rect = viewportRef.current?.getBoundingClientRect()
        if (!rect) return

        const center = getTouchCenter(t1, t2)
        const screenX = center.x - rect.left
        const screenY = center.y - rect.top

        const newZoom = canvas.state.zoom * scale
        canvas.zoomAtPoint(newZoom, screenX, screenY)

        const dx = center.x - lastTouchCenterRef.current.x
        const dy = center.y - lastTouchCenterRef.current.y
        canvas.pan(dx, dy)

        lastTouchDistRef.current = newDist
        lastTouchCenterRef.current = center
      }
    },
    [canvas],
  )

  const handleTouchEnd = useCallback(
    (e: ReactTouchEvent<HTMLDivElement>) => {
      if (e.touches.length < 2) {
        lastTouchDistRef.current = null
        lastTouchCenterRef.current = null
        canvas.setIsPanning(false)
      }
    },
    [canvas],
  )

  return (
    <LiquidGlassProvider>
      <div
        ref={viewportRef}
        className={styles.viewport}
        data-bg-theme={bgTheme}
        data-panning={canvas.isPanning}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          ref={worldRef}
          className={styles.world}
          style={{ transform: canvas.worldTransform }}
        >
          {children}
        </div>
      </div>
    </LiquidGlassProvider>
  )
}
