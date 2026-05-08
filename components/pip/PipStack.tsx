'use client'

import { useState, useCallback, type ReactElement } from 'react'
import { PipCard } from './PipCard'
import styles from './PipStack.module.css'

export interface PipStackCard {
  readonly id: string
  readonly title: string
  readonly thumbnail: string
  readonly favicon: string
}

export interface PipStackProps {
  readonly cards: ReadonlyArray<PipStackCard>
  readonly onCardClick: (cardId: string) => void
}

const MAX_VISIBLE = 5

export function PipStack({ cards, onCardClick }: PipStackProps): ReactElement {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const visible = cards.slice(0, MAX_VISIBLE)

  const handleEnter = useCallback((id: string) => () => setHoveredId(id), [])
  const handleLeave = useCallback(() => setHoveredId(null), [])

  return (
    <div
      className={styles.stage}
      data-testid="pip-stack"
      data-hovered-id={hoveredId ?? ''}
    >
      <div className={styles.stack}>
        {visible.map((card, idx) => {
          const positionClass = styles[`pos${idx}`]
          const hoveredClass = hoveredId === card.id ? styles.hovered : ''
          return (
            <div
              key={card.id}
              className={`${styles.slot} ${positionClass} ${hoveredClass}`.trim()}
              onMouseEnter={handleEnter(card.id)}
              onMouseLeave={handleLeave}
              onClick={() => onCardClick(card.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') onCardClick(card.id) }}
            >
              <PipCard {...card} />
            </div>
          )
        })}
      </div>
      <div className={styles.wordmark}>Booklage</div>
    </div>
  )
}
