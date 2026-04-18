'use client'

import { type ReactElement, useMemo } from 'react'
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

  return (
    <div
      ref={sphere.containerRef}
      className={styles.sphereViewport}
      data-bg-theme={bgTheme}
    >
      {sphere.visibleCards.map(vc => {
        if (vc.lod === 'dot') return null
        return (
          <div
            key={vc.id}
            className={`${styles.cardWrapper} ${vc.lod === 'reduced' ? styles.cardReduced : ''}`}
            style={{ opacity: vc.opacity }}
          >
            {renderCard(vc.id, vc.lod)}
          </div>
        )
      })}
    </div>
  )
}
