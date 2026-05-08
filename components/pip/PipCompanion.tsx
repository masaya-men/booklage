'use client'

import { useEffect, useState, useCallback, type ReactElement } from 'react'
import { initDB, getRecentBookmarks } from '@/lib/storage/indexeddb'
import { subscribeBookmarkSaved } from '@/lib/board/channel'
import { PipEmptyState } from './PipEmptyState'
import { PipStack, type PipStackCard } from './PipStack'
import styles from './PipCompanion.module.css'

export interface PipCompanionProps {
  readonly onClose: () => void
  readonly onCardClick?: (cardId: string) => void
}

export function PipCompanion({ onClose, onCardClick }: PipCompanionProps): ReactElement {
  const [cards, setCards] = useState<PipStackCard[]>([])
  const [loaded, setLoaded] = useState(false)

  // Initial load from IDB.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const db = await initDB()
      const recent = await getRecentBookmarks(db, 5)
      if (cancelled) return
      setCards(recent.map((b) => ({
        id: b.id,
        title: b.title,
        thumbnail: b.thumbnail ?? '',
        favicon: b.favicon ?? '',
      })))
      setLoaded(true)
    })()
    return () => { cancelled = true }
  }, [])

  // Subscribe to BroadcastChannel for new saves.
  useEffect(() => {
    const unsub = subscribeBookmarkSaved(async () => {
      const db = await initDB()
      const recent = await getRecentBookmarks(db, 5)
      setCards(recent.map((b) => ({
        id: b.id,
        title: b.title,
        thumbnail: b.thumbnail ?? '',
        favicon: b.favicon ?? '',
      })))
    })
    return unsub
  }, [])

  const handleCardClick = useCallback((cardId: string) => {
    if (onCardClick) onCardClick(cardId)
  }, [onCardClick])

  if (!loaded) {
    return (
      <div className={styles.host}>
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
