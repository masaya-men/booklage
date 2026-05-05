'use client'

import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { DisplayMode } from '@/lib/board/types'
import { t } from '@/lib/i18n/t'
import styles from './DisplayModeSwitch.module.css'

type Props = {
  readonly value: DisplayMode
  readonly onChange: (m: DisplayMode) => void
}

export function DisplayModeSwitch({ value, onChange }: Props): ReactElement {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent): void => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return (): void => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const label = (m: DisplayMode): string => t(`board.display.${m}`)
  const select = (m: DisplayMode): void => {
    onChange(m)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <button
        type="button"
        className={styles.pill}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="display-mode-pill"
      >
        {t('board.display.label')}: {label(value)} ▾
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          {(['visual', 'editorial', 'native'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`${styles.item} ${value === m ? styles.active : ''}`.trim()}
              onClick={() => select(m)}
            >
              {label(m)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
