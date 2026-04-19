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
  readonly children?: ReactNode
}

export function InteractionLayer({
  direction,
  onScroll,
  children,
}: InteractionLayerProps) {
  const dragRef = useRef<{ lastX: number; lastY: number } | null>(null)
  // Window-level Space-key state for hold-to-pan. Refs (not state) so the
  // pointerdown handler reads the latest value without re-creating callbacks
  // on every key press.
  const spaceHeldRef = useRef<boolean>(false)

  const isHorizontal = direction === 'horizontal'

  // Track Space key globally so the user can engage pan-mode by holding Space
  // and dragging anywhere on the board, including over cards. Setting
  // body.style.cursor gives an immediate visual cue. We ignore key events that
  // originate inside form fields so typing in inputs doesn't accidentally
  // trigger pan-cursor.
  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target.isContentEditable
      )
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.code !== 'Space') return
      if (isEditableTarget(e.target)) return
      // Prevent default page scroll while Space is held for pan-mode.
      e.preventDefault()
      if (spaceHeldRef.current) return
      spaceHeldRef.current = true
      document.body.style.cursor = 'grab'
    }
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.code !== 'Space') return
      spaceHeldRef.current = false
      document.body.style.cursor = ''
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return (): void => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      // Always restore cursor on unmount in case Space was held.
      document.body.style.cursor = ''
    }
  }, [])

  const handleWheel = useCallback(
    (e: WheelEvent<HTMLDivElement>): void => {
      const m = INTERACTION.WHEEL_SCROLL_MULTIPLIER
      if (isHorizontal) {
        onScroll(e.deltaY * m, 0)
      } else {
        onScroll(0, e.deltaY * m)
      }
    },
    [isHorizontal, onScroll],
  )

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
      // Middle-button click would otherwise scroll-with-autoscroll on some
      // browsers; preventDefault keeps our drag logic in sole control.
      if (e.button === 1) e.preventDefault()
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
