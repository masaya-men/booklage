'use client'

import { useEffect, useState, useCallback, type ReactElement } from 'react'
import { initDB } from '@/lib/storage/indexeddb'
import { subscribeBookmarkSaved } from '@/lib/board/channel'
import { resolveThumbnail } from '@/lib/pip/resolve-thumbnail'
import { PipEmptyState } from './PipEmptyState'
import { PipStack, type PipStackCard } from './PipStack'
import styles from './PipCompanion.module.css'

export interface PipCompanionProps {
  /** Reserved for any future programmatic close path. The Document PiP
   *  window's title bar already provides Chrome's native × close, so we
   *  no longer render an in-page close button. */
  readonly onClose?: () => void
  readonly onCardClick?: (cardId: string) => void
}

export function PipCompanion({ onCardClick }: PipCompanionProps): ReactElement {
  // Per-session card buffer — starts empty every time PiP opens. Cards
  // accumulate without a cap so the user sees every bookmark they saved
  // while the companion was visible (a "look how many you grabbed today"
  // feel). Closing the PiP loses this buffer; reopening starts fresh.
  const [cards, setCards] = useState<PipStackCard[]>([])

  useEffect(() => {
    const unsub = subscribeBookmarkSaved(async ({ bookmarkId }) => {
      const db = await initDB()
      const bm = await db.get('bookmarks', bookmarkId)
      if (!bm) return
      // Optimistic insert: slide-in immediately with whatever thumb is in
      // IDB (real og:image for Apple/news, X default or empty for tweets).
      // Then upgrade asynchronously via the resolver — the syndication /
      // oEmbed / CDN derive that the board does for non-OG sources.
      const initial: PipStackCard = {
        id: bm.id,
        title: bm.title,
        thumbnail: bm.thumbnail ?? '',
        favicon: bm.favicon ?? '',
      }
      // Append chronologically: 1, 2, 3, … each new bookmark lands on the
      // right end of the carousel and the auto-scroll inside PipStack
      // glides over to it. Re-saving an existing URL still moves it to
      // the right end (we filter the prior copy out first).
      setCards((prev) => [...prev.filter((c) => c.id !== initial.id), initial])

      const resolved = await resolveThumbnail(bm)
      if (resolved && resolved !== initial.thumbnail) {
        setCards((prev) => prev.map((c) => (c.id === bm.id ? { ...c, thumbnail: resolved } : c)))
      }
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
    </div>
  )
}
