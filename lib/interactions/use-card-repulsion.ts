'use client'

import { useCallback, useRef } from 'react'
import { gsap } from 'gsap'

/** Card position data used for repulsion calculations */
type CardPosition = {
  id: string
  x: number
  y: number
}

/** Options for useCardRepulsion */
type UseCardRepulsionOptions = {
  /** Maximum push distance in pixels (default 40) */
  maxForce?: number
  /** Radius within which repulsion applies in pixels (default 300) */
  radius?: number
  /** Whether repulsion is active (default true) */
  enabled?: boolean
}

/**
 * Hook that applies distance-based repulsion to nearby cards while dragging.
 *
 * Cards within `radius` pixels of the dragged card's center are pushed
 * outward proportionally to how close they are. When dragging stops,
 * all cards spring back to their natural positions.
 */
export function useCardRepulsion({
  maxForce = 40,
  radius = 300,
  enabled = true,
}: UseCardRepulsionOptions = {}) {
  const rafRef = useRef<number>(0)
  const originalPositions = useRef<Map<string, { x: number; y: number }>>(new Map())

  const applyRepulsion = useCallback(
    (draggedId: string, dragX: number, dragY: number, allCards: CardPosition[]): void => {
      if (!enabled) return
      if (rafRef.current) cancelAnimationFrame(rafRef.current)

      rafRef.current = requestAnimationFrame(() => {
        for (const card of allCards) {
          if (card.id === draggedId) continue
          const el = document.querySelector<HTMLElement>(`[data-card-wrapper="${card.id}"]`)
          if (!el) continue

          if (!originalPositions.current.has(card.id)) {
            originalPositions.current.set(card.id, { x: card.x, y: card.y })
          }

          const dx = card.x - dragX
          const dy = card.y - dragY
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance > radius || distance < 1) {
            gsap.to(el, { x: 0, y: 0, duration: 0.3, ease: 'power2.out', overwrite: 'auto' })
            continue
          }

          const strength = maxForce * Math.pow(1 - distance / radius, 2)
          const angle = Math.atan2(dy, dx)
          const pushX = Math.cos(angle) * strength
          const pushY = Math.sin(angle) * strength

          gsap.to(el, { x: pushX, y: pushY, duration: 0.2, ease: 'power2.out', overwrite: 'auto' })
        }
      })
    },
    [enabled, maxForce, radius],
  )

  const resetRepulsion = useCallback((): void => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const wrappers = document.querySelectorAll<HTMLElement>('[data-card-wrapper]')
    wrappers.forEach((el) => {
      gsap.to(el, { x: 0, y: 0, duration: 0.5, ease: 'back.out(1.4)', overwrite: 'auto' })
    })
    originalPositions.current.clear()
  }, [])

  return { applyRepulsion, resetRepulsion }
}
