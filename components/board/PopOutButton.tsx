'use client'

import type { ReactElement } from 'react'
import styles from './PopOutButton.module.css'

export interface PopOutButtonProps {
  readonly onClick: () => void
  readonly disabled: boolean
}

export function PopOutButton({ onClick, disabled }: PopOutButtonProps): ReactElement {
  return (
    <button
      type="button"
      className={styles.button}
      onClick={onClick}
      disabled={disabled}
      title={disabled ? 'PiP not supported in this browser' : 'Open Booklage Companion'}
      aria-label="Open Booklage Companion"
      data-testid="pip-popout"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="2" y="3" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="7" y="7" width="6" height="4" rx="0.5" fill="currentColor" />
      </svg>
    </button>
  )
}
