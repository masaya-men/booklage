'use client'

import type { ReactElement } from 'react'
import styles from './ResetAllButton.module.css'

type Props = {
  /** Number of cards currently in the customCardWidth=true state. The
   *  button is hidden entirely when this is 0; otherwise it renders a
   *  count badge so the user knows the scope of the reset. */
  readonly count: number
  readonly onClick: () => void
}

/**
 * Header pill that drops the manual-resize override on every card at
 * once. Sized to match the SizePicker chrome (22px tall cells, monospace
 * label) so the action group reads as a coherent row.
 */
export function ResetAllButton({ count, onClick }: Props): ReactElement | null {
  if (count <= 0) return null
  return (
    <button
      type="button"
      className={styles.button}
      onClick={onClick}
      data-testid="reset-all-button"
      aria-label={`Reset size on ${count} cards`}
    >
      <span className={styles.icon} aria-hidden="true">
        {/* Counter-clockwise arrow — universal "undo / reset" glyph. */}
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8a5 5 0 1 0 1.5-3.5" />
          <path d="M3 3.5V6h2.5" />
        </svg>
      </span>
      <span className={styles.label}>RESET</span>
      <span className={styles.count}>{count}</span>
    </button>
  )
}
