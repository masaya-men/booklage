'use client'

import type { ReactElement } from 'react'
import { BOARD_SLIDERS } from '@/lib/board/constants'
import { PrecisionSlider } from './PrecisionSlider'

type Props = {
  readonly value: number
  readonly onChange: (next: number) => void
}

export function SizeSlider({ value, onChange }: Props): ReactElement {
  return (
    <PrecisionSlider
      label="W"
      ariaLabel="Card width"
      min={BOARD_SLIDERS.CARD_WIDTH_MIN_PX}
      max={BOARD_SLIDERS.CARD_WIDTH_MAX_PX}
      value={value}
      onChange={onChange}
      testId="size-slider"
    />
  )
}
