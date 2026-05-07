'use client'

import type { ReactElement } from 'react'
import { SIZE_LEVELS, type SizeLevel } from '@/lib/board/size-levels'
import styles from './SizePicker.module.css'

type Props = {
  readonly value: SizeLevel
  readonly onChange: (next: SizeLevel) => void
}

export function SizePicker({ value, onChange }: Props): ReactElement {
  return (
    <div className={styles.row} role="radiogroup" aria-label="Card size">
      <span className={styles.label}>SIZE</span>
      <div className={styles.cells}>
        {SIZE_LEVELS.map((lvl) => {
          const active = lvl === value
          return (
            <button
              key={lvl}
              type="button"
              role="radio"
              className={styles.cell}
              data-active={active}
              aria-checked={active}
              aria-label={`Size ${lvl}`}
              onClick={(): void => onChange(lvl)}
            >
              <span className={styles.cellInner}>{lvl}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
