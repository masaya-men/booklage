'use client'

import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent,
  type ReactNode,
  type WheelEvent,
} from 'react'
import { BOARD_Z_INDEX, INTERACTION } from '@/lib/board/constants'
import type { ScrollDirection } from '@/lib/board/types'

type InteractionLayerProps = {
  readonly direction: ScrollDirection
  readonly onScroll: (deltaX: number, deltaY: number) => void
  /**
   * Whether the Space key is currently held. Owned by BoardRoot so CardsLayer
   * can also observe it and bail card-pointerdown handlers — letting the
   * event bubble up to InteractionLayer for pan engagement.
   */
  readonly spaceHeld: boolean
  readonly children?: ReactNode
}

export function InteractionLayer({
  direction,
  onScroll,
  spaceHeld,
  children,
}: InteractionLayerProps) {
  const dragRef = useRef<{ lastX: number; lastY: number } | null>(null)
  // Mirror prop in a ref so the pointerdown handler reads the latest value
  // without forcing useCallback to re-bind every time spaceHeld toggles.
  const spaceHeldRef = useRef<boolean>(spaceHeld)
  spaceHeldRef.current = spaceHeld

  const isHorizontal = direction === 'horizontal'

  // ---- Smooth-scroll wheel integration ----
  //
  // The raw wheel event arrives as a discrete impulse (one per detent on a
  // mouse wheel, ≈100–200 units per notch). Applying it directly to viewport
  // produces a stair-step feel. Instead we accumulate the impulse into a
  // remaining-distance target and ease that target down each frame with an
  // exponential decay (current frame consumes ALPHA of the remaining
  // distance). Multiple wheel events naturally compose — they just add to
  // the same target, which keeps gliding to the new total.
  //
  // ALPHA controls the "weight" of the deceleration:
  //   0.10 → settles in ~600ms (heavy / floaty)
  //   0.16 → settles in ~330ms (smooth, escalator-ish)
  //   0.25 → settles in ~190ms (quick, less obvious smoothing)
  const wheelTargetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 })
  const wheelRafRef = useRef<number | null>(null)

  const stepWheel = useCallback((): void => {
    const target = wheelTargetRef.current
    const ALPHA = 0.16
    const stepX = target.dx * ALPHA
    const stepY = target.dy * ALPHA
    target.dx -= stepX
    target.dy -= stepY

    // Sub-pixel residue → declare done. Resets target so the next wheel
    // event starts from zero accumulator and the animation is re-armed.
    if (Math.abs(target.dx) < 0.5 && Math.abs(target.dy) < 0.5) {
      target.dx = 0
      target.dy = 0
      wheelRafRef.current = null
      return
    }

    onScroll(stepX, stepY)
    wheelRafRef.current = requestAnimationFrame(stepWheel)
  }, [onScroll])

  const handleWheel = useCallback(
    (e: WheelEvent<HTMLDivElement>): void => {
      const m = INTERACTION.WHEEL_SCROLL_MULTIPLIER
      const delta = e.deltaY * m
      if (isHorizontal) {
        wheelTargetRef.current.dx += delta
      } else {
        wheelTargetRef.current.dy += delta
      }
      if (wheelRafRef.current === null) {
        wheelRafRef.current = requestAnimationFrame(stepWheel)
      }
    },
    [isHorizontal, stepWheel],
  )

  // Cancel any in-flight wheel animation when the layer unmounts so we don't
  // leak rAFs after navigating away from /board.
  useEffect(() => (): void => {
    if (wheelRafRef.current !== null) {
      cancelAnimationFrame(wheelRafRef.current)
      wheelRafRef.current = null
    }
  }, [])

  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>): void => {
      // Pan-mode triggers (engage even when the pointer is over a card):
      //   - middle button (button === 1)
      //   - left button + Space held
      // Otherwise fall back to the original behavior: pan only when clicking
      // the bare interaction layer (no card under pointer).
      const isPanModifier =
        e.button === 1 || (e.button === 0 && spaceHeldRef.current)
      if (!isPanModifier && e.target !== e.currentTarget) return
      // Suppress the browser's native dragstart + text/element selection that
      // would otherwise fire when a Space+drag pan starts on a card (event
      // bubbles up here from CardsLayer's bailed pointerdown). Also covers
      // middle-button click which would trigger scroll-with-autoscroll on some
      // browsers — keeps our drag logic in sole control.
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      dragRef.current = { lastX: e.clientX, lastY: e.clientY }
    },
    [],
  )

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>): void => {
      const d = dragRef.current
      if (!d) return
      const dx = e.clientX - d.lastX
      const dy = e.clientY - d.lastY
      if (
        Math.abs(dx) < INTERACTION.DRAG_THRESHOLD_PX &&
        Math.abs(dy) < INTERACTION.DRAG_THRESHOLD_PX
      ) {
        return
      }
      const m = INTERACTION.EMPTY_DRAG_SCROLL_MULTIPLIER
      if (isHorizontal) {
        onScroll(-dx * m, 0)
      } else {
        onScroll(0, -dy * m)
      }
      d.lastX = e.clientX
      d.lastY = e.clientY
    },
    [isHorizontal, onScroll],
  )

  const handlePointerUp = useCallback(
    (e: PointerEvent<HTMLDivElement>): void => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
      dragRef.current = null
    },
    [],
  )

  return (
    <div
      data-interaction-layer
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: BOARD_Z_INDEX.INTERACTION_OVERLAY,
        touchAction: 'none',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  )
}
