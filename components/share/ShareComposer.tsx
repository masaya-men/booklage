// components/share/ShareComposer.tsx
'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { ShareAspect, ShareCard, ShareData } from '@/lib/share/types'
import { SHARE_SCHEMA_VERSION } from '@/lib/share/types'
import { computeAspectFrameSize } from '@/lib/share/aspect-presets'
import { boardItemsToShareCards, filterByViewport } from '@/lib/share/board-to-cards'
import { ShareAspectSwitcher } from './ShareAspectSwitcher'
import { ShareFrame } from './ShareFrame'
import { ShareSourceList } from './ShareSourceList'
import styles from './ShareComposer.module.css'

type BoardItemLite = {
  readonly bookmarkId: string
  readonly url: string
  readonly title: string
  readonly description?: string
  readonly thumbnail: string
  readonly type: ShareCard['ty']
  readonly sizePreset: 'S' | 'M' | 'L'
}

type Pos = { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
type Viewport = { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

type Props = {
  readonly open: boolean
  readonly onClose: () => void
  readonly items: ReadonlyArray<BoardItemLite>
  readonly positions: Readonly<Record<string, Pos>>
  readonly viewport: Viewport
  readonly onConfirm: (data: ShareData, frameRef: HTMLElement | null) => void
}

const FRAME_VIEWPORT = { width: 1080, height: 720 } as const

export function ShareComposer({ open, onClose, items, positions, viewport, onConfirm }: Props): ReactElement | null {
  const [aspect, setAspect] = useState<ShareAspect>('free')
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => {
    const visible = filterByViewport(items, positions, viewport)
    return new Set(visible.map((i) => i.bookmarkId))
  })

  const frameRef = useRef<HTMLDivElement>(null)

  // Close on ESC
  useEffect((): undefined | (() => void) => {
    if (!open) return undefined
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return (): void => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Body scroll lock
  useEffect((): undefined | (() => void) => {
    if (!open) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return (): void => { document.body.style.overflow = prev }
  }, [open])

  const frameSize = computeAspectFrameSize(aspect, FRAME_VIEWPORT.width, FRAME_VIEWPORT.height)

  const selectedItems = useMemo(
    () => items.filter((i) => selectedIds.has(i.bookmarkId)),
    [items, selectedIds],
  )

  const cards = useMemo<ShareCard[]>(
    () => boardItemsToShareCards(selectedItems, positions, frameSize),
    [selectedItems, positions, frameSize],
  )

  const onToggle = useCallback((id: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const onAddAll = useCallback((): void => {
    setSelectedIds(new Set(items.map((i) => i.bookmarkId)))
  }, [items])

  const onAddVisible = useCallback((): void => {
    const v = filterByViewport(items, positions, viewport)
    setSelectedIds(new Set(v.map((i) => i.bookmarkId)))
  }, [items, positions, viewport])

  const onConfirmClick = useCallback((): void => {
    const data: ShareData = {
      v: SHARE_SCHEMA_VERSION,
      aspect,
      cards,
    }
    onConfirm(data, frameRef.current)
  }, [aspect, cards, onConfirm])

  if (!open) return null

  return (
    <div
      className={styles.backdrop}
      onClick={(e): void => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-label="Share composer"
        data-testid="share-composer"
      >
        <header className={styles.header}>
          <h2 className={styles.title}>シェア用ボードを組む</h2>
          <ShareAspectSwitcher value={aspect} onChange={setAspect} />
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className={styles.canvasArea}>
          <div ref={frameRef} className={styles.frameWrap}>
            <ShareFrame cards={cards} width={frameSize.width} height={frameSize.height} editable={true} />
          </div>
        </div>

        <ShareSourceList
          items={items.map((i) => ({ bookmarkId: i.bookmarkId, thumbnail: i.thumbnail, title: i.title }))}
          selectedIds={selectedIds}
          onToggle={onToggle}
          onAddAll={onAddAll}
          onAddVisible={onAddVisible}
        />

        <footer className={styles.footer}>
          <button type="button" className={styles.confirmBtn} onClick={onConfirmClick}>
            画像 + URL でシェア →
          </button>
        </footer>
      </div>
    </div>
  )
}
