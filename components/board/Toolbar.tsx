'use client'

import type { ReactElement } from 'react'
import { t } from '@/lib/i18n/t'
import styles from './Toolbar.module.css'

type Props = {
  readonly onAlign: () => void
  readonly onShare: () => void
}

/**
 * Top-center floating pill: two actions — 整列 (re-grid all cards) and シェア
 * (open ShareModal — stubbed until Plan B lands). Theme switcher lives in the
 * sidebar; frame-ratio selection moves into ShareModal.
 */
export function Toolbar({ onAlign, onShare }: Props): ReactElement {
  return (
    <div className={styles.container} data-testid="board-toolbar">
      <button
        type="button"
        className={styles.button}
        onClick={onAlign}
        data-toolbar-button="align"
      >
        ⚡ {t('board.toolbar.align')}
      </button>
      <div className={styles.sep} role="separator" aria-orientation="vertical" />
      <button
        type="button"
        className={`${styles.button} ${styles.primary}`.trim()}
        onClick={onShare}
        data-toolbar-button="share"
      >
        📤 {t('board.toolbar.share')}
      </button>
    </div>
  )
}
