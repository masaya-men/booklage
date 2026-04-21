'use client'

import type { ReactElement } from 'react'
import { t } from '@/lib/i18n/t'
import styles from './EmptyStateWelcome.module.css'

type Props = {
  readonly onOpenModal: () => void
}

export function EmptyStateWelcome({ onOpenModal }: Props): ReactElement {
  return (
    <div className={styles.wrap} data-testid="empty-state-welcome">
      <div className={styles.icon}>📌</div>
      <h2 className={styles.title}>{t('board.empty.title')}</h2>
      <p className={styles.description}>{t('board.empty.description')}</p>
      <button type="button" className={styles.installBtn} onClick={onOpenModal}>
        {t('board.empty.installButton')}
      </button>
      <p className={styles.hint}>{t('board.empty.alreadyInstalled')}</p>
    </div>
  )
}
