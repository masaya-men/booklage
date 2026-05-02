'use client'

import { useMemo, useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { useBoardData } from '@/lib/storage/use-board-data'
import { useMoods } from '@/lib/storage/use-moods'
import { t } from '@/lib/i18n/t'
import { TriageCard } from './TriageCard'
import { TagPicker } from './TagPicker'
import styles from './TriagePage.module.css'

export function TriagePage(): ReactElement {
  const router = useRouter()
  const { items, persistTags, loading } = useBoardData()
  const { moods, create } = useMoods()
  const queue = useMemo(() => items.filter((it) => !it.isDeleted && it.tags.length === 0), [items])
  const [index, setIndex] = useState(0)
  const [lastAction, setLastAction] = useState<{ bookmarkId: string; prev: readonly string[] } | null>(null)

  const current = queue[index] ?? null
  const total = queue.length

  const advance = (): void => setIndex((i) => i + 1)

  const handleTag = async (moodId: string): Promise<void> => {
    if (!current) return
    setLastAction({ bookmarkId: current.bookmarkId, prev: [...current.tags] })
    await persistTags(current.bookmarkId, [moodId])
    advance()
  }

  const handleSkip = (): void => {
    if (!current) return
    // Skip: do not tag; just advance
    advance()
  }

  const handleUndo = async (): Promise<void> => {
    if (!lastAction) return
    await persistTags(lastAction.bookmarkId, lastAction.prev)
    setLastAction(null)
    setIndex((i) => Math.max(0, i - 1))
  }

  const handleNewMood = async (name: string): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed) return
    const colors = ['#7c5cfc', '#e066d7', '#4ecdc4', '#f5a623', '#ff6b6b']
    const color = colors[moods.length % colors.length]
    const created = await create({ name: trimmed, color, order: moods.length })
    await handleTag(created.id)
  }

  const exit = (): void => router.push('/board')

  if (loading) return <div className={styles.root}><div>Loading…</div></div>

  if (!current) {
    return (
      <div className={styles.root}>
        <div className={styles.main}>
          <div className={styles.empty}>
            <div style={{ fontSize: 20, fontFamily: "'Noto Serif JP', serif" }}>
              {total === 0 ? t('triage.empty') : t('triage.done_title')}
            </div>
            <button type="button" className={styles.backBtn} onClick={exit}>
              {total === 0 ? t('triage.empty_cta') : t('triage.done_back')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.root} data-testid="triage-page">
      <div className={styles.header}>
        <span>{t('triage.progress').replace('{current}', String(index + 1)).replace('{total}', String(total))}</span>
        <button type="button" className={styles.backBtn} onClick={exit}>Esc</button>
      </div>
      <div className={styles.main}>
        <TriageCard key={current.bookmarkId} item={current} />
      </div>
      <TagPicker
        moods={moods}
        onTag={handleTag}
        onSkip={handleSkip}
        onUndo={lastAction ? handleUndo : null}
        onCreateMood={handleNewMood}
      />
      <div className={styles.footer}>{t('triage.hint')}</div>
    </div>
  )
}
