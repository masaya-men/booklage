'use client'

import type { ReactElement } from 'react'
import { t } from '@/lib/i18n/t'
import styles from './Toolbar.module.css'

type Props = {
  readonly onShare: () => void
}

/**
 * Top-center floating pill: a single Share action. Align was removed when the
 * Board switched to always-masonry (no mode to return to).
 */
export function Toolbar({ onShare }: Props): ReactElement {
  return (
    <div className={styles.container} data-testid="board-toolbar">
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
