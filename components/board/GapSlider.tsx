'use client'

import type { ReactElement } from 'react'
import { BOARD_SLIDERS } from '@/lib/board/constants'
import { PrecisionSlider } from './PrecisionSlider'

type Props = {
  readonly value: number
  readonly onChange: (next: number) => void
}

export function GapSlider({ value, onChange }: Props): ReactElement {
  return (
    <PrecisionSlider
      label="G"
      ariaLabel="Card gap"
      min={BOARD_SLIDERS.CARD_GAP_MIN_PX}
      max={BOARD_SLIDERS.CARD_GAP_MAX_PX}
      value={value}
      onChange={onChange}
      testId="gap-slider"
    />
  )
}
