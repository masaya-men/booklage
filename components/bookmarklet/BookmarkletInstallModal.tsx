'use client'

import { useEffect, useRef } from 'react'
import type { ReactElement } from 'react'
import { generateBookmarkletUri } from '@/lib/utils/bookmarklet'
import { t } from '@/lib/i18n/t'
import styles from './BookmarkletInstallModal.module.css'

type Props = {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly appUrl: string
}

export function BookmarkletInstallModal({ isOpen, onClose, appUrl }: Props): ReactElement | null {
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  // Focus close button only when transitioning to open
  useEffect(() => {
    if (isOpen) closeBtnRef.current?.focus()
  }, [isOpen])

  // ESC listener
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const uri = generateBookmarkletUri(appUrl)

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bookmarklet-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id="bookmarklet-modal-title" className={styles.title}>
            📌 {t('board.bookmarkletModal.title')}
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label={t('board.bookmarkletModal.closeLabel')}
          >
            ×
          </button>
        </div>

        <div className={styles.dragLinkWrap}>
          <a
            data-testid="bookmarklet-drag-link"
            className={styles.dragLink}
            href={uri}
            draggable="true"
            onClick={(e) => e.preventDefault()}
          >
            {t('board.bookmarkletModal.linkLabel')}
          </a>
        </div>

        <p className={styles.dragInstruction}>
          {t('board.bookmarkletModal.dragInstruction')}
        </p>

        <hr className={styles.divider} />

        <p className={styles.barHint}>{t('board.bookmarkletModal.barHint')}</p>
        <p className={styles.shortcuts}>
          {t('board.bookmarkletModal.barShortcutWindows')}<br />
          {t('board.bookmarkletModal.barShortcutMac')}
        </p>

        <hr className={styles.divider} />

        <h3 className={styles.usageTitle}>{t('board.bookmarkletModal.usageTitle')}</h3>
        <ul className={styles.usageList}>
          <li>{t('board.bookmarkletModal.usageStep1')}</li>
          <li>{t('board.bookmarkletModal.usageStep2')}</li>
          <li>{t('board.bookmarkletModal.usageStep3')}</li>
        </ul>
      </div>
    </div>
  )
}
