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

type FadeState = { left: boolean; right: boolean }

export function ShareSourceList({ items, selectedIds, onToggle, onAddAll, onClearAll, onAddVisible }: Props): ReactElement {
  const allSelected = items.length > 0 && items.every((i) => selectedIds.has(i.bookmarkId))
  const scrollRef = useRef<HTMLDivElement>(null)
  const [fade, setFade] = useState<FadeState>({ left: false, right: false })

  const recomputeFade = useCallback((): void => {
    const el = scrollRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    const left = scrollLeft > 1
    const right = scrollLeft + clientWidth < scrollWidth - 1
    setFade((prev) => (prev.left === left && prev.right === right ? prev : { left, right }))
  }, [])

  // Recompute on size changes (modal resize, items change)
  useEffect((): undefined | (() => void) => {
    const el = scrollRef.current
    if (!el) return undefined
    recomputeFade()
    const ro = new ResizeObserver(() => recomputeFade())
    ro.observe(el)
    return (): void => ro.disconnect()
  }, [recomputeFade, items.length])

  // Wheel: vertical wheel deltaY → horizontal scroll. Attached natively
  // because React's onWheel is passive by default and can't preventDefault.
  useEffect((): undefined | (() => void) => {
    const el = scrollRef.current
    if (!el) return undefined
    const onWheel = (e: WheelEvent): void => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      const canScrollH = el.scrollWidth > el.clientWidth
      if (!canScrollH) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return (): void => el.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <div className={styles.row} data-testid="share-source-list">
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
          className={`${styles.fade} ${styles.fadeLeft}`}
          aria-hidden="true"
          data-visible={fade.left ? 'true' : 'false'}
        />
        <div
          className={`${styles.fade} ${styles.fadeRight}`}
          aria-hidden="true"
          data-visible={fade.right ? 'true' : 'false'}
        />
      </div>
    </div>
  )
}
