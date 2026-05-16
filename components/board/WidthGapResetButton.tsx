'use client'

import type { ReactElement } from 'react'
import { BOARD_SLIDERS } from '@/lib/board/constants'
import styles from './WidthGapResetButton.module.css'

type Props = {
  readonly widthPx: number
  readonly gapPx: number
  readonly onReset: () => void
}

/** Float sliders never land on the exact default integer, so a strict `===`
 *  check would never re-disable the button. 0.5 EPSILON = "any value that
 *  would round to the default counts as default". */
const DEFAULT_EPSILON = 0.5

export function WidthGapResetButton({ widthPx, gapPx, onReset }: Props): ReactElement {
  const atDefault =
    Math.abs(widthPx - BOARD_SLIDERS.CARD_WIDTH_DEFAULT_PX) < DEFAULT_EPSILON &&
    Math.abs(gapPx - BOARD_SLIDERS.CARD_GAP_DEFAULT_PX) < DEFAULT_EPSILON
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
