'use client'

import type { ReactElement } from 'react'
import styles from './Lightbox.module.css'

type Props = {
  readonly dir: 'prev' | 'next'
  readonly onClick: () => void
}

export function LightboxNavChevron({ dir, onClick }: Props): ReactElement {
  const label = dir === 'prev' ? '前のカード' : '次のカード'
  return (
    <button
      type="button"
      className={`${styles.navChevron} ${dir === 'prev' ? styles.navChevronPrev : styles.navChevronNext}`}
      onClick={onClick}
      aria-label={label}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {dir === 'prev'
          ? <polyline points="9 2, 3 7, 9 12" />
          : <polyline points="5 2, 11 7, 5 12" />}
      </svg>
    </button>
  )
}
