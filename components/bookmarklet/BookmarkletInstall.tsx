'use client'

import type { ReactElement } from 'react'
import { t } from '@/lib/i18n/t'
import styles from './BookmarkletInstall.module.css'

type Props = {
  readonly onClick: () => void
}

export function BookmarkletInstall({ onClick }: Props): ReactElement {
  return (
    <button type="button" className={styles.row} onClick={onClick}>
      <span className={styles.icon}>📌</span>
      <span className={styles.label}>{t('board.sidebar.bookmarklet')}</span>
      <span className={styles.chevron} aria-hidden="true">→</span>
    </button>
  )
}
