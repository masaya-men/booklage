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
  // Three-layer model designed to feel as smooth as a system-level
  // touchpad-style scroll on any refresh rate:
  //
  // 1. deltaMode normalization
  //    Firefox occasionally sends DOM_DELTA_LINE (deltaY ≈ 3 per notch)
  //    instead of pixels — translate to pixels so the multiplier behaves
  //    the same across browsers.
  //
  // 2. Wheel events accumulate into a "remaining distance" target rather
  //    than firing the scroll synchronously. New events stack additively.
  //
  // 3. Spring physics with critical damping
  //    Each frame integrates F = k·target − c·v − dt-scaled — a damped
  //    spring chasing the target. With c = 2√k (critical damping) the
  //    motion never overshoots while feeling physically natural. dt is
  //    measured per-frame so the spring behaves identically at 60, 90,
  //    120, 144, 240 Hz monitors (frame-rate independent).
  //
  // STIFFNESS controls the chase speed; DAMPING is locked to critical so
  // a tweak to STIFFNESS automatically rebalances. Settling time ≈
  // 4/√k seconds — at k=200 that's ≈283 ms, the sweet spot between
  // "snappy" and "drifty" for board scrolling.
  const WHEEL_STIFFNESS = 200
  const WHEEL_DAMPING = 2 * Math.sqrt(WHEEL_STIFFNESS) // critical
  // Cap dt so a tab-switch or main-thread stall (huge dt) doesn't fling
  // the spring across the whole canvas in one frame.
  const MAX_DT_S = 0.05

  const wheelStateRef = useRef<{
    targetDx: number
    targetDy: number
    velX: number
    velY: number
    lastTime: number
  }>({
    targetDx: 0,
    targetDy: 0,
    velX: 0,
    velY: 0,
    lastTime: 0,
  })
  const wheelRafRef = useRef<number | null>(null)

  const stepWheel = useCallback((now: number): void => {
    const s = wheelStateRef.current
    const dt = s.lastTime === 0
      ? 1 / 60
      : Math.min(MAX_DT_S, (now - s.lastTime) / 1000)
    s.lastTime = now

    // Spring force: F = k·(remaining distance) − c·velocity. target is the
    // signed remaining distance, so F has the same sign as target and
    // drives velocity toward depleting it.
    const ax = WHEEL_STIFFNESS * s.targetDx - WHEEL_DAMPING * s.velX
    const ay = WHEEL_STIFFNESS * s.targetDy - WHEEL_DAMPING * s.velY
    s.velX += ax * dt
    s.velY += ay * dt

    const stepX = s.velX * dt
    const stepY = s.velY * dt
    s.targetDx -= stepX
    s.targetDy -= stepY

    const stillEnough = (
      Math.abs(s.targetDx) < 0.05 &&
      Math.abs(s.targetDy) < 0.05 &&
      Math.abs(s.velX) < 0.5 &&
      Math.abs(s.velY) < 0.5
    )
    if (stillEnough) {
      s.targetDx = 0
      s.targetDy = 0
      s.velX = 0
      s.velY = 0
      s.lastTime = 0
      wheelRafRef.current = null
      return
    }

    if (stepX !== 0 || stepY !== 0) onScroll(stepX, stepY)
    wheelRafRef.current = requestAnimationFrame(stepWheel)
  }, [onScroll])

  const handleWheel = useCallback(
    (e: WheelEvent<HTMLDivElement>): void => {
      const m = INTERACTION.WHEEL_SCROLL_MULTIPLIER
      // Normalize deltaMode so all browsers contribute pixel-equivalent
      // deltas. Most send DOM_DELTA_PIXEL (=0); Firefox may send
      // DOM_DELTA_LINE (=1) at ≈3 lines per notch.
      let dy = e.deltaY
      if (e.deltaMode === 1) dy *= 16
      else if (e.deltaMode === 2) dy *= window.innerHeight
      const delta = dy * m

      const s = wheelStateRef.current
      if (isHorizontal) {
        s.targetDx += delta
      } else {
        s.targetDy += delta
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
