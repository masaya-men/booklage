'use client'

import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { CardPosition } from '@/lib/board/types'
import { INTERACTION } from '@/lib/board/constants'

type StartPosResolver = (cardId: string) => CardPosition | undefined

type CardDragOptions = {
  readonly resolveStartPos: StartPosResolver
  readonly onDrag: (cardId: string, pos: CardPosition) => void
  readonly onDragEnd?: (cardId: string, pos: CardPosition) => void
  readonly onClick?: (cardId: string) => void
}

export function useCardDrag({
  resolveStartPos,
  onDrag,
  onDragEnd,
  onClick,
}: CardDragOptions) {
  const latestRef = useRef<{ cardId: string; pos: CardPosition; dragged: boolean } | null>(
    null,
  )

  return useCallback(
    (e: ReactPointerEvent<HTMLDivElement>, cardId: string): void => {
      const start = resolveStartPos(cardId)
      if (!start) return
      e.stopPropagation()
      const el = e.currentTarget
      const pointerStart = { x: e.clientX, y: e.clientY }
      const pointerId = e.pointerId
      el.setPointerCapture(pointerId)
      latestRef.current = { cardId, pos: start, dragged: false }

      const move = (ev: PointerEvent): void => {
        const dx = ev.clientX - pointerStart.x
        const dy = ev.clientY - pointerStart.y
        const state = latestRef.current
        if (!state) return
        if (
          !state.dragged &&
          Math.abs(dx) < INTERACTION.DRAG_THRESHOLD_PX &&
          Math.abs(dy) < INTERACTION.DRAG_THRESHOLD_PX
        ) {
          return
        }
        const next: CardPosition = { x: start.x + dx, y: start.y + dy, w: start.w, h: start.h }
        state.pos = next
        state.dragged = true
        onDrag(cardId, next)
      }
      const up = (): void => {
        el.removeEventListener('pointermove', move)
        el.removeEventListener('pointerup', up)
        el.removeEventListener('pointercancel', up)
        if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId)
        const final = latestRef.current
        latestRef.current = null
        if (!final) return
        if (final.dragged) {
          if (onDragEnd) onDragEnd(final.cardId, final.pos)
        } else if (onClick) {
          onClick(final.cardId)
        }
      }
      el.addEventListener('pointermove', move)
      el.addEventListener('pointerup', up)
      el.addEventListener('pointercancel', up)
    },
    [resolveStartPos, onDrag, onDragEnd, onClick],
  )
}
