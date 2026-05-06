// components/share/ShareSourceList.tsx
'use client'

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
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
  readonly onClearAll: () => void
  readonly onAddVisible: () => void
}

type FadeState = { top: boolean; bottom: boolean }

export function ShareSourceList({ items, selectedIds, onToggle, onAddAll, onClearAll, onAddVisible }: Props): ReactElement {
  const allSelected = items.length > 0 && items.every((i) => selectedIds.has(i.bookmarkId))
  const scrollRef = useRef<HTMLDivElement>(null)
  const [fade, setFade] = useState<FadeState>({ top: false, bottom: false })

  const recomputeFade = useCallback((): void => {
    const el = scrollRef.current
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    const top = scrollTop > 1
    const bottom = scrollTop + clientHeight < scrollHeight - 1
    setFade((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }))
  }, [])

  useEffect((): undefined | (() => void) => {
    const el = scrollRef.current
    if (!el) return undefined
    recomputeFade()
    const ro = new ResizeObserver(() => recomputeFade())
    ro.observe(el)
    return (): void => ro.disconnect()
  }, [recomputeFade, items.length])

  return (
    <aside className={styles.panel} data-testid="share-source-list">
      <div className={styles.shortcuts}>
        <button
          type="button"
          className={styles.shortcutBtn}
          onClick={allSelected ? onClearAll : onAddAll}
          data-testid="share-add-all-toggle"
        >
          {allSelected ? '全部外す' : '全部入れる'}
        </button>
        <button type="button" className={styles.shortcutBtn} onClick={onAddVisible}>
          表示中のみ
        </button>
      </div>
      <div className={styles.scrollWrap}>
        <div
          ref={scrollRef}
          className={styles.scroll}
          onScroll={recomputeFade}
        >
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
        <div
          className={`${styles.fade} ${styles.fadeTop}`}
          aria-hidden="true"
          data-visible={fade.top ? 'true' : 'false'}
        />
        <div
          className={`${styles.fade} ${styles.fadeBottom}`}
          aria-hidden="true"
          data-visible={fade.bottom ? 'true' : 'false'}
        />
      </div>
    </aside>
  )
}
