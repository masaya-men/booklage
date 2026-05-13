'use client'

import type { ChangeEvent, ReactElement } from 'react'
import { BOARD_SLIDERS } from '@/lib/board/constants'
import styles from './SliderControl.module.css'

type Props = {
  readonly value: number
  readonly onChange: (next: number) => void
}

export function SizeSlider({ value, onChange }: Props): ReactElement {
  const handle = (e: ChangeEvent<HTMLInputElement>): void => {
    const next = Number(e.target.value)
    if (Number.isFinite(next)) onChange(next)
  }
  return (
    <label className={styles.row} aria-label="Card width">
      <span className={styles.label}>W</span>
      <input
        type="range"
        className={styles.range}
        min={BOARD_SLIDERS.CARD_WIDTH_MIN_PX}
        max={BOARD_SLIDERS.CARD_WIDTH_MAX_PX}
        step={10}
        value={value}
        onChange={handle}
        data-testid="size-slider"
      />
      <span className={styles.value}>{Math.round(value)}</span>
    </label>
  )
}
