'use client'

import { useEffect, useRef, type ReactElement } from 'react'
import { gsap } from 'gsap'
import type { BoardItem } from '@/lib/storage/use-board-data'
import { t } from '@/lib/i18n/t'
import styles from './Lightbox.module.css'

type Props = {
  readonly item: BoardItem | null
  readonly onClose: () => void
}

export function Lightbox({ item, onClose }: Props): ReactElement | null {
  const backdropRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // Escape key closes
  useEffect(() => {
    if (!item) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return (): void => window.removeEventListener('keydown', onKey)
  }, [item, onClose])

  // Open animation: spring scale-in from 0.86 + fade
  useEffect(() => {
    if (!item || !frameRef.current) return
    const tween = gsap.fromTo(
      frameRef.current,
      { scale: 0.86, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.42, ease: 'back.out(1.3)' },
    )
    return (): void => { tween.kill() }
  }, [item])

  // Focus close button when lightbox opens
  useEffect(() => {
    if (item) closeButtonRef.current?.focus()
  }, [item])

  if (!item) return null

  return (
    <div
      ref={backdropRef}
      className={`${styles.backdrop} ${styles.open}`.trim()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lightbox-title"
      onClick={(e) => { if (e.target === backdropRef.current) onClose() }}
      data-testid="lightbox"
    >
      <div ref={frameRef} className={styles.frame}>
        <div className={styles.media}>
          {item.thumbnail
            ? <img src={item.thumbnail} alt={item.title} />
            : <div style={{ padding: 32, color: 'var(--text-body)' }}>{item.title}</div>}
        </div>
        <div className={styles.text}>
          <h1 id="lightbox-title" style={{ fontSize: 28, margin: 0, color: 'var(--text-primary)' }}>{item.title}</h1>
          <div className={styles.meta}>
            {(() => {
              try {
                const host = new URL(item.url).hostname.replace(/^www\./, '')
                return <span>{host}</span>
              } catch { return <span /> }
            })()}
          </div>
          <a href={item.url} target="_blank" rel="noopener noreferrer" className={styles.sourceLink}>
            {t('board.lightbox.openSource')} →
          </a>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className={styles.close}
          aria-label={t('board.lightbox.close')}
        >✕</button>
      </div>
    </div>
  )
}
