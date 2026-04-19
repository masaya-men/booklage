'use client'

import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { CardPosition } from '@/lib/board/types'

type StartPosResolver = (cardId: string) => CardPosition | undefined

type CardDragOptions = {
  readonly resolveStartPos: StartPosResolver
  readonly onDrag: (cardId: string, pos: CardPosition) => void
  readonly onDragEnd?: (cardId: string, pos: CardPosition) => void
}

export function useCardDrag({ resolveStartPos, onDrag, onDragEnd }: CardDragOptions) {
  const latestRef = useRef<{ cardId: string; pos: CardPosition } | null>(null)

  return useCallback(
    (e: ReactPointerEvent<HTMLDivElement>, cardId: string): void => {
      const start = resolveStartPos(cardId)
      if (!start) return
      e.stopPropagation()
      const el = e.currentTarget
      const pointerStart = { x: e.clientX, y: e.clientY }
      const pointerId = e.pointerId
      el.setPointerCapture(pointerId)
      latestRef.current = { cardId, pos: start }

      const move = (ev: PointerEvent): void => {
        const next: CardPosition = {
          x: start.x + (ev.clientX - pointerStart.x),
          y: start.y + (ev.clientY - pointerStart.y),
          w: start.w,
          h: start.h,
        }
        latestRef.current = { cardId, pos: next }
        onDrag(cardId, next)
      }
      const up = (): void => {
        el.removeEventListener('pointermove', move)
        el.removeEventListener('pointerup', up)
        el.removeEventListener('pointercancel', up)
        if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId)
        const final = latestRef.current
        latestRef.current = null
        if (final && onDragEnd) onDragEnd(final.cardId, final.pos)
      }
      el.addEventListener('pointermove', move)
      el.addEventListener('pointerup', up)
      el.addEventListener('pointercancel', up)
    },
    [resolveStartPos, onDrag, onDragEnd],
  )
}
