'use client'

import type { ChangeEvent, ReactElement } from 'react'
import { MIN_CARD_WIDTH, MAX_CARD_WIDTH, clampCardWidth } from '@/lib/board/size-migration'
import { WaveformTrack } from './WaveformTrack'
import styles from './SizeSlider.module.css'

type Props = {
  readonly value: number
  readonly onChange: (next: number) => void
}

function pad4(n: number): string {
  return Math.max(0, Math.min(9999, Math.floor(n))).toString().padStart(4, '0')
}

export function SizeSlider({ value, onChange }: Props): ReactElement {
  const progress = (value - MIN_CARD_WIDTH) / (MAX_CARD_WIDTH - MIN_CARD_WIDTH)
  const handleChange = (e: ChangeEvent<HTMLInputElement>): void => {
    onChange(clampCardWidth(Number(e.target.value)))
  }
  return (
    <label className={styles.wrap}>
      <span className={styles.label}>SIZE</span>
      <div className={styles.trackHost}>
        <WaveformTrack barCount={40} progress={progress} seed={2} />
        <input
          type="range"
          min={MIN_CARD_WIDTH}
          max={MAX_CARD_WIDTH}
          step={1}
          value={value}
          onChange={handleChange}
          className={styles.range}
          aria-label="Card size"
        />
      </div>
      <span className={styles.readout} data-testid="size-slider-readout">
        [ {pad4(value)}px ]
      </span>
    </label>
  )
}
