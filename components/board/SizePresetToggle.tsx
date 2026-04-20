'use client'

import type { PointerEvent, ReactElement } from 'react'
import styles from './SizePresetToggle.module.css'

type Preset = 'S' | 'M' | 'L'

export const NEXT_PRESET: Readonly<Record<Preset, Preset>> = {
  S: 'M',
  M: 'L',
  L: 'S',
}

type Props = {
  readonly preset: Preset
  readonly visible: boolean
  readonly onCycle: (next: Preset) => void
}

/**
 * Hover-revealed button on each card's bottom-right. Click cycles
 * S → M → L → S. The parent is responsible for managing `visible` via
 * hoveredCardId state.
 */
export function SizePresetToggle({ preset, visible, onCycle }: Props): ReactElement {
  const handleClick = (e: PointerEvent<HTMLButtonElement>): void => {
    // Prevent the pointerdown from kicking off a reorder drag.
    e.stopPropagation()
    onCycle(NEXT_PRESET[preset])
  }
  const dots: Array<boolean> = [
    true,
    preset === 'M' || preset === 'L',
    preset === 'L',
  ]
  return (
    <button
      type="button"
      className={styles.toggle}
      data-visible={visible}
      data-preset={preset}
      onPointerDown={handleClick}
      aria-label={`サイズを切り替え (現在: ${preset})`}
    >
      {dots.map((on, idx) => (
        <span key={idx} className={styles.dot} data-on={on} />
      ))}
      <span className={styles.label}>{preset}</span>
    </button>
  )
}
