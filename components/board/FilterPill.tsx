'use client'

import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { BoardFilter } from '@/lib/board/types'
import type { MoodRecord } from '@/lib/storage/indexeddb'
import { t } from '@/lib/i18n/t'
import styles from './FilterPill.module.css'

type Props = {
  readonly value: BoardFilter
  readonly onChange: (f: BoardFilter) => void
  readonly moods: ReadonlyArray<MoodRecord>
  readonly counts: { readonly all: number; readonly inbox: number; readonly archive: number }
}

function label(f: BoardFilter, moods: ReadonlyArray<MoodRecord>): string {
  if (f === 'all') return t('board.filter.all')
  if (f === 'inbox') return t('board.filter.inbox')
  if (f === 'archive') return t('board.filter.archive')
  const moodId = f.slice(5)
  return moods.find((m) => m.id === moodId)?.name ?? '—'
}

export function FilterPill({ value, onChange, moods, counts }: Props): ReactElement {
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

  const select = (f: BoardFilter): void => {
    onChange(f)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <button
        type="button"
        className={styles.pill}
        onClick={() => setOpen((v) => !v)}
        data-testid="filter-pill"
      >
        {label(value, moods)} ▾
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <button
            type="button"
            className={`${styles.item} ${value === 'all' ? styles.active : ''}`.trim()}
            onClick={() => select('all')}
          >
            {t('board.filter.all')}
            <span style={{ marginLeft: 'auto', color: 'var(--text-meta)' }}>{counts.all}</span>
          </button>
          <button
            type="button"
            className={`${styles.item} ${value === 'inbox' ? styles.active : ''}`.trim()}
            onClick={() => select('inbox')}
          >
            {t('board.filter.inbox')}
            <span style={{ marginLeft: 'auto', color: 'var(--text-meta)' }}>{counts.inbox}</span>
          </button>
          <button
            type="button"
            className={`${styles.item} ${value === 'archive' ? styles.active : ''}`.trim()}
            onClick={() => select('archive')}
          >
            {t('board.filter.archive')}
            <span style={{ marginLeft: 'auto', color: 'var(--text-meta)' }}>{counts.archive}</span>
          </button>
          {moods.length > 0 && (
            <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '6px 4px' }} />
          )}
          {moods.map((m) => {
            const f: BoardFilter = `mood:${m.id}`
            return (
              <button
                key={m.id}
                type="button"
                className={`${styles.item} ${value === f ? styles.active : ''}`.trim()}
                onClick={() => select(f)}
              >
                <span className={styles.dot} style={{ background: m.color }} />
                {m.name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
