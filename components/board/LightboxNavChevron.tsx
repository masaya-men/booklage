'use client'

import type { ReactElement } from 'react'
import styles from './Lightbox.module.css'

type Props = {
  readonly dir: 'prev' | 'next'
  readonly onClick: () => void
}

/** Session 33: 円グレー背景を廃止し、 button 自体を viewport 左右 7vw の
 *  hit zone (.navHotzone) に拡大。 chevron 本体は .navChevronIcon で装飾扱い、
 *  hover 時に D 案 pulse loop でアニメ。 click は hit zone 全体で受け取る。 */
export function LightboxNavChevron({ dir, onClick }: Props): ReactElement {
  const label = dir === 'prev' ? '前のカード' : '次のカード'
  return (
    <button
      type="button"
      className={`${styles.navHotzone} ${dir === 'prev' ? styles.navHotzonePrev : styles.navHotzoneNext}`}
      onClick={onClick}
      aria-label={label}
    >
      <span className={styles.navChevronIcon} aria-hidden="true">
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {dir === 'prev'
            ? <polyline points="9 2, 3 7, 9 12" />
            : <polyline points="5 2, 11 7, 5 12" />}
        </svg>
      </span>
    </button>
  )
}
