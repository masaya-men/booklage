// components/share/ShareSourceList.tsx
'use client'

import type { ReactElement } from 'react'
import styles from './ShareSourceList.module.css'

type SourceItem = {
  readonly bookmarkId: string
  readonly thumbnail: string
  readonly title: string
}

type Props = {
  readonly items: ReadonlyArray<SourceItem>
  readonly selectedIds: ReadonlySet<string>
  readonly onToggle: (id: string) => void
  readonly onAddAll: () => void
  readonly onAddVisible: () => void
}

export function ShareSourceList({ items, selectedIds, onToggle, onAddAll, onAddVisible }: Props): ReactElement {
  return (
    <div className={styles.row} data-testid="share-source-list">
      <div className={styles.shortcuts}>
        <button type="button" className={styles.shortcutBtn} onClick={onAddAll}>
          全部入れる
        </button>
        <button type="button" className={styles.shortcutBtn} onClick={onAddVisible}>
          表示中のみ
        </button>
      </div>
      <div className={styles.scroll}>
        {items.map((it) => {
          const isSelected = selectedIds.has(it.bookmarkId)
          return (
            <button
              key={it.bookmarkId}
              type="button"
              className={isSelected ? `${styles.thumb} ${styles.selected}` : styles.thumb}
              onClick={(): void => onToggle(it.bookmarkId)}
              aria-pressed={isSelected}
              title={it.title}
            >
              {it.thumbnail
                ? <img src={it.thumbnail} alt="" loading="lazy" />
                : <span className={styles.placeholder}>{it.title.slice(0, 2)}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
