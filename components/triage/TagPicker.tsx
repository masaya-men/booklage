'use client'

import { useEffect, type ReactElement } from 'react'
import type { MoodRecord } from '@/lib/storage/indexeddb'
import { t } from '@/lib/i18n/t'
import { NewMoodInput } from './NewMoodInput'
import styles from './TagPicker.module.css'

type Props = {
  readonly moods: ReadonlyArray<MoodRecord>
  readonly onTag: (moodId: string) => void
  readonly onSkip: () => void
  readonly onUndo: (() => void) | null
  readonly onCreateMood: (name: string) => void
}

export function TagPicker({ moods, onTag, onSkip, onUndo, onCreateMood }: Props): ReactElement {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (e.key >= '1' && e.key <= '9') {
        const idx = Number(e.key) - 1
        const mood = moods[idx]
        if (mood) { e.preventDefault(); onTag(mood.id) }
        return
      }
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); onSkip(); return }
      if ((e.key === 'z' || e.key === 'Z') && onUndo) { e.preventDefault(); onUndo(); return }
    }
    window.addEventListener('keydown', onKey)
    return (): void => window.removeEventListener('keydown', onKey)
  }, [moods, onTag, onSkip, onUndo])

  return (
    <div className={styles.row} data-testid="tag-picker">
      {moods.slice(0, 9).map((m, i) => (
        <button key={m.id} type="button" className={styles.chip}
          onClick={() => onTag(m.id)}
          data-testid={`mood-chip-${m.id}`}>
          <span className={styles.num}>{i + 1}</span>
          <span className={styles.dot} style={{ background: m.color }} />
          <span>{m.name}</span>
        </button>
      ))}
      <NewMoodInput onCreate={onCreateMood} />
      <button type="button" className={styles.util} onClick={onSkip}>{t('triage.skip')}</button>
      {onUndo && <button type="button" className={styles.util} onClick={onUndo}>{t('triage.undo')}</button>}
    </div>
  )
}
