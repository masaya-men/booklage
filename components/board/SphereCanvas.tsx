'use client'

import { type ReactElement, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useSphereCanvas } from '@/lib/sphere/use-sphere-canvas'
import { worldToUv } from '@/lib/sphere/sphere-projection'
import { type CardRecord } from '@/lib/storage/indexeddb'
import type { SphereCard } from '@/lib/sphere/sphere-culling'
import styles from './SphereCanvas.module.css'

interface SphereCanvasProps {
  cards: ReadonlyArray<CardRecord>
  worldSpan: number
  renderCard: (cardId: string, lod: 'full' | 'reduced' | 'dot') => ReactElement | null
  bgTheme?: string
}

/**
 * 3D sphere canvas. Cards live as CSS3DObjects managed by SphereRenderer;
 * this component renders their React content into the managed wrappers
 * via createPortal (same pattern as the 2D canvas uses for GSAP Draggable).
 */
export function SphereCanvas({
  cards,
  worldSpan,
  renderCard,
  bgTheme,
}: SphereCanvasProps): ReactElement {
  const sphereCards: SphereCard[] = useMemo(() =>
    cards.map(card => {
      const uv = worldToUv(card.x, card.y, worldSpan, worldSpan)
      return {
        id: card.id,
        u: uv.u,
        v: uv.v,
        width: card.width,
        height: card.height,
      }
    }),
    [cards, worldSpan],
  )

  const sphere = useSphereCanvas(sphereCards)

  const lodById = useMemo(() => {
    const m = new Map<string, 'full' | 'reduced' | 'dot'>()
    sphere.visibleCards.forEach(v => m.set(v.id, v.lod))
    return m
  }, [sphere.visibleCards])

  return (
    <div
      ref={sphere.containerRef}
      className={styles.sphereViewport}
      data-bg-theme={bgTheme}
    >
      {cards.map(card => {
        const target = sphere.portalTargets.get(card.id)
        if (!target) return null
        const lod = lodById.get(card.id)
        if (!lod || lod === 'dot') return null
        const content = renderCard(card.id, lod)
        if (!content) return null
        return createPortal(content, target, card.id)
      })}
    </div>
  )
}
