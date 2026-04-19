'use client'

import { useRef, type PointerEvent } from 'react'
import { CARD_SIZE_LIMITS } from '@/lib/board/constants'
import styles from './ResizeHandle.module.css'

type ResizeHandleProps = {
  readonly cardId: string
  readonly initialW: number
  readonly initialH: number
  readonly onResize: (cardId: string, w: number, h: number) => void
  readonly onResizeEnd?: (cardId: string, w: number, h: number) => void
}

const clamp = (v: number): number =>
  Math.min(Math.max(v, CARD_SIZE_LIMITS.MIN_PX), CARD_SIZE_LIMITS.MAX_PX)

export function ResizeHandle({
  cardId,
  initialW,
  initialH,
  onResize,
  onResizeEnd,
}: ResizeHandleProps) {
  const startRef = useRef<{
    x: number
    y: number
    w: number
    h: number
    lastW: number
    lastH: number
  } | null>(null)

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    startRef.current = {
      x: e.clientX,
      y: e.clientY,
      w: initialW,
      h: initialH,
      lastW: initialW,
      lastH: initialH,
    }
  }

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    const s = startRef.current
    if (!s) return
    const nextW = clamp(s.w + (e.clientX - s.x))
    const nextH = clamp(s.h + (e.clientY - s.y))
    s.lastW = nextW
    s.lastH = nextH
    onResize(cardId, nextW, nextH)
  }

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>): void => {
    const s = startRef.current
    e.currentTarget.releasePointerCapture(e.pointerId)
    startRef.current = null
    if (s && onResizeEnd) onResizeEnd(cardId, s.lastW, s.lastH)
  }

  return (
    <div
      className={styles.handle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      role="slider"
      aria-label="Resize card"
      aria-valuenow={initialW}
    />
  )
}
