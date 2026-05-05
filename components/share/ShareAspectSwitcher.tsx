// components/share/ShareAspectSwitcher.tsx
'use client'

import type { ReactElement } from 'react'
import { ASPECT_PRESETS } from '@/lib/share/aspect-presets'
import type { ShareAspect } from '@/lib/share/types'
import styles from './ShareAspectSwitcher.module.css'

type Props = {
  readonly value: ShareAspect
  readonly onChange: (next: ShareAspect) => void
}

export function ShareAspectSwitcher({ value, onChange }: Props): ReactElement {
  return (
    <div className={styles.row} role="radiogroup" aria-label="Aspect ratio">
      {ASPECT_PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          role="radio"
          aria-checked={value === p.id}
          className={value === p.id ? `${styles.pill} ${styles.active}` : styles.pill}
          onClick={(): void => onChange(p.id)}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
