'use client'

import type { ReactElement } from 'react'
import type { BoardItem } from '@/lib/storage/use-board-data'
import styles from './TriageCard.module.css'

export function TriageCard({ item }: { item: BoardItem }): ReactElement {
  let host = ''
  try { host = new URL(item.url).hostname.replace(/^www\./, '') } catch { /* ignore */ }
  return (
    <div className={styles.card} data-testid="triage-card">
      {item.thumbnail && (
        <div className={styles.image} style={{ backgroundImage: `url(${JSON.stringify(item.thumbnail).slice(1, -1)})` }} />
      )}
      <div className={styles.body}>
        <div className={styles.title}>{item.title}</div>
        <div className={styles.meta}><span>{host}</span></div>
      </div>
    </div>
  )
}
