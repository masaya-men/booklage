'use client'

import { useEffect, useState, useCallback, type ReactElement } from 'react'
import { initDB } from '@/lib/storage/indexeddb'
import { subscribeBookmarkSaved } from '@/lib/board/channel'
import { PipEmptyState } from './PipEmptyState'
import { PipStack, type PipStackCard } from './PipStack'
import styles from './PipCompanion.module.css'

export interface PipCompanionProps {
  readonly onClose: () => void
  readonly onCardClick?: (cardId: string) => void
}

const MAX_VISIBLE = 5

export function PipCompanion({ onClose, onCardClick }: PipCompanionProps): ReactElement {
  // Per-session card buffer — starts empty every time PiP opens, so the
  // first-save "Empty → Stack" transition is always visible. Closing the
  // PiP loses this buffer; reopening starts fresh.
  const [cards, setCards] = useState<PipStackCard[]>([])

  useEffect(() => {
    const unsub = subscribeBookmarkSaved(async ({ bookmarkId }) => {
      const db = await initDB()
      const bm = await db.get('bookmarks', bookmarkId)
      if (!bm) return
      const next: PipStackCard = {
        id: bm.id,
        title: bm.title,
        thumbnail: bm.thumbnail ?? '',
        favicon: bm.favicon ?? '',
      }
      setCards((prev) => [next, ...prev.filter((c) => c.id !== next.id)].slice(0, MAX_VISIBLE))
    })
    return unsub
  }, [])

  const handleCardClick = useCallback((cardId: string) => {
    if (onCardClick) onCardClick(cardId)
  }, [onCardClick])

  return (
    <div className={styles.host}>
      {cards.length === 0 ? (
        <PipEmptyState />
      ) : (
        <PipStack cards={cards} onCardClick={handleCardClick} />
      )}
      <button
        type="button"
        className={styles.close}
        onClick={onClose}
        data-testid="pip-close"
        aria-label="Close Booklage Companion"
      >×</button>
    </div>
  )
}
