'use client'

import { useEffect, useRef, type RefObject } from 'react'

type Options = {
  /** Spring stiffness — higher = snappier chase. Default 200. */
  readonly stiffness?: number
  /**
   * Disable the hook (e.g. when an unrelated overlay is open). The wheel
   * listener is detached and any in-flight animation is cancelled.
   */
  readonly disabled?: boolean
}

/**
 * Replace native wheel scrolling on the referenced element with damped-
 * spring smooth scrolling. Uses the same physics as the board's wheel
 * scroller: target accumulator + critical-damped spring + dt-aware
 * integration so the feel is consistent across 60/120/144 Hz displays.
 *
 * Lets the wheel event propagate (no `preventDefault`) when the element
 * is already at a scroll boundary in the wheel direction — that way an
 * outer scroll surface (or, in a modal, the keyboard-arrow card nav) can
 * keep responding once the inner panel runs out of room.
 */
export function useSmoothWheelScroll(
  ref: RefObject<HTMLElement | null>,
  options: Options = {},
): void {
  const { stiffness = 200, disabled = false } = options
  const stateRef = useRef<{
    targetDy: number
    velY: number
    lastTime: number
  }>({ targetDy: 0, velY: 0, lastTime: 0 })
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (disabled) return
    const el = ref.current
    if (!el) return

    const damping = 2 * Math.sqrt(stiffness) // critical
    const MAX_DT = 0.05

    const step = (now: number): void => {
      const s = stateRef.current
      const dt = s.lastTime === 0
        ? 1 / 60
        : Math.min(MAX_DT, (now - s.lastTime) / 1000)
      s.lastTime = now

      const a = stiffness * s.targetDy - damping * s.velY
      s.velY += a * dt
      const stepY = s.velY * dt
      s.targetDy -= stepY

      if (Math.abs(s.targetDy) < 0.05 && Math.abs(s.velY) < 0.5) {
        s.targetDy = 0
        s.velY = 0
        s.lastTime = 0
        rafRef.current = null
        return
      }

      // Apply to scrollTop, clamped to scrollable range. Hitting a
      // boundary mid-flight kills the spring so we don't keep nudging
      // against it (which would feel like a stuck pulse).
      const max = el.scrollHeight - el.clientHeight
      const next = el.scrollTop + stepY
      if (next <= 0) {
        el.scrollTop = 0
        s.targetDy = 0
        s.velY = 0
        s.lastTime = 0
        rafRef.current = null
        return
      }
      if (next >= max) {
        el.scrollTop = max
        s.targetDy = 0
        s.velY = 0
        s.lastTime = 0
        rafRef.current = null
        return
      }
      el.scrollTop = next

      rafRef.current = requestAnimationFrame(step)
    }

    const onWheel = (e: WheelEvent): void => {
      let dy = e.deltaY
      if (e.deltaMode === 1) dy *= 16
      else if (e.deltaMode === 2) dy *= window.innerHeight
      if (dy === 0) return

      // At the appropriate boundary already? Let the event propagate so
      // outer surfaces (modal nav, parent scroll) still receive it.
      const max = el.scrollHeight - el.clientHeight
      const atTop = el.scrollTop <= 0
      const atBottom = el.scrollTop >= max - 1
      if (max <= 0) return // not scrollable
      if ((atTop && dy < 0) || (atBottom && dy > 0)) return

      e.preventDefault()
      stateRef.current.targetDy += dy

      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(step)
      }
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return (): void => {
      el.removeEventListener('wheel', onWheel)
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      stateRef.current.targetDy = 0
      stateRef.current.velY = 0
      stateRef.current.lastTime = 0
    }
  }, [ref, stiffness, disabled])
}
