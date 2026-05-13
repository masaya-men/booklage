'use client'

import type { ReactElement } from 'react'
import { BOARD_SLIDERS } from '@/lib/board/constants'
import styles from './WidthGapResetButton.module.css'

type Props = {
  readonly widthPx: number
  readonly gapPx: number
  readonly onReset: () => void
}

export function WidthGapResetButton({ widthPx, gapPx, onReset }: Props): ReactElement {
  const atDefault =
    widthPx === BOARD_SLIDERS.CARD_WIDTH_DEFAULT_PX &&
    gapPx === BOARD_SLIDERS.CARD_GAP_DEFAULT_PX
  return (
    <button
      type="button"
      className={styles.button}
      onClick={onReset}
      disabled={atDefault}
      data-testid="width-gap-reset-button"
      aria-label="Reset width and gap to default"
    >
      DEFAULT
    </button>
  )
}
