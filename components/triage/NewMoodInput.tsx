'use client'

import { useState, type ReactElement } from 'react'
import { t } from '@/lib/i18n/t'

type Props = {
  readonly onCreate: (name: string) => void
}

export function NewMoodInput({ onCreate }: Props): ReactElement {
  const [active, setActive] = useState(false)
  const [value, setValue] = useState('')
  if (!active) {
    return (
      <button type="button" onClick={() => setActive(true)} data-testid="new-mood-chip"
        style={{
          border: '1px dashed rgba(255,255,255,0.2)',
          background: 'transparent',
          color: 'var(--text-meta)',
          padding: '8px 14px',
          borderRadius: 100,
          cursor: 'pointer',
          fontSize: 13,
        }}>
        {t('triage.newMood')}
      </button>
    )
  }
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => { setActive(false); setValue('') }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { onCreate(value); setValue(''); setActive(false) }
        if (e.key === 'Escape') { setActive(false); setValue('') }
      }}
      placeholder={t('triage.moodNamePlaceholder')}
      data-testid="new-mood-input"
      style={{
        background: 'rgba(255,255,255,0.06)',
        color: 'var(--text-primary)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 100,
        padding: '8px 14px',
        fontSize: 13,
        outline: 'none',
      }}
    />
  )
}
