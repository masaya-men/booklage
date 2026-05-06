// components/share/ShareComposer.tsx
'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { ShareAspect, ShareCard, ShareData, ShareSize } from '@/lib/share/types'
import { SHARE_SCHEMA_VERSION } from '@/lib/share/types'
import { composeShareLayout, type ComposerItem } from '@/lib/share/composer-layout'
import { filterByViewport } from '@/lib/share/board-to-cards'
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
  readonly sizePreset: ShareSize
  readonly aspectRatio: number
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

const FALLBACK_FRAME_SIZE = { w: 1440, h: 900 } as const

function sortByBoardPosition(
  ids: ReadonlyArray<string>,
  positions: Readonly<Record<string, Pos>>,
): string[] {
  return ids.slice().sort((a, b) => {
    const pa = positions[a]
    const pb = positions[b]
    if (!pa || !pb) return 0
    if (pa.y !== pb.y) return pa.y - pb.y
    return pa.x - pb.x
  })
}

export function ShareComposer({ open, onClose, items, positions, viewport, onConfirm }: Props): ReactElement | null {
  const [aspect, setAspect] = useState<ShareAspect>('free')
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => {
    const visible = filterByViewport(items, positions, viewport)
    return new Set(visible.map((i) => i.bookmarkId))
  })
  const [cardOrder, setCardOrder] = useState<readonly string[]>(() => {
    const visible = filterByViewport(items, positions, viewport)
    return sortByBoardPosition(visible.map((i) => i.bookmarkId), positions)
  })
  const [sizeOverrides, setSizeOverrides] = useState<ReadonlyMap<string, ShareSize>>(new Map())

  const frameRef = useRef<HTMLDivElement>(null)
  const canvasAreaRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number } | null>(null)

  // Track the canvas area's actual rendered size — the share frame matches
  // it 1:1 so masonry uses the live width (board-equivalent behavior).
  useEffect((): undefined | (() => void) => {
    if (!open) return undefined
    const el = canvasAreaRef.current
    if (!el) return undefined
    const ro = new ResizeObserver((entries) => {
      const e = entries[0]
      if (!e) return
      const { width, height } = e.contentRect
      setCanvasSize({ w: width, h: height })
    })
    ro.observe(el)
    return (): void => ro.disconnect()
  }, [open])

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

  // Keep cardOrder in sync with selectedIds: drop removed, append new at tail.
  useEffect(() => {
    setCardOrder((prev) => {
      const filtered = prev.filter((id) => selectedIds.has(id))
      const prevSet = new Set(filtered)
      const additions: string[] = []
      for (const id of selectedIds) if (!prevSet.has(id)) additions.push(id)
      if (additions.length === 0 && filtered.length === prev.length) return prev
      const sortedAdditions = sortByBoardPosition(additions, positions)
      return [...filtered, ...sortedAdditions]
    })
  }, [selectedIds, positions])

  const composerItems = useMemo<ComposerItem[]>(
    () =>
      items
        .filter((i) => selectedIds.has(i.bookmarkId))
        .map((i) => ({
          bookmarkId: i.bookmarkId,
          url: i.url,
          title: i.title,
          description: i.description,
          thumbnail: i.thumbnail,
          type: i.type,
          sizePreset: i.sizePreset,
          aspectRatio: i.aspectRatio,
        })),
    [items, selectedIds],
  )

  // The frame size IS the canvas area size — masonry runs on the live
  // canvas width, mirroring the board's behavior. PNG export captures
  // the frame at this CSS-pixel size; dom-to-image's `scale: 2` upgrades
  // resolution at export time.
  const frameViewport = useMemo((): { width: number; height: number } => {
    if (!canvasSize || canvasSize.w <= 0 || canvasSize.h <= 0) {
      return { width: FALLBACK_FRAME_SIZE.w, height: FALLBACK_FRAME_SIZE.h }
    }
    return { width: canvasSize.w, height: canvasSize.h }
  }, [canvasSize])

  const layout = useMemo(
    () =>
      composeShareLayout({
        items: composerItems,
        order: cardOrder,
        sizeOverrides,
        aspect,
        viewport: frameViewport,
      }),
    [composerItems, cardOrder, sizeOverrides, aspect, frameViewport],
  )

  const cardIds = layout.cardIds

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

  const onClearAll = useCallback((): void => {
    setSelectedIds(new Set())
  }, [])

  const onAddVisible = useCallback((): void => {
    const v = filterByViewport(items, positions, viewport)
    setSelectedIds(new Set(v.map((i) => i.bookmarkId)))
  }, [items, positions, viewport])

  const handleReorder = useCallback((orderedIds: readonly string[]): void => {
    setCardOrder(orderedIds)
  }, [])

  const handleCycleSize = useCallback((id: string, next: ShareSize): void => {
    setSizeOverrides((prev) => {
      const m = new Map(prev)
      m.set(id, next)
      return m
    })
  }, [])

  const handleDelete = useCallback((id: string): void => {
    onToggle(id)
  }, [onToggle])

  const onConfirmClick = useCallback((): void => {
    const data: ShareData = {
      v: SHARE_SCHEMA_VERSION,
      aspect,
      cards: layout.cards,
    }
    onConfirm(data, frameRef.current)
  }, [aspect, layout.cards, onConfirm])

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

        <div ref={canvasAreaRef} className={styles.canvasArea}>
          <div
            ref={frameRef}
            className={styles.frameWrap}
            style={{
              width: layout.frameSize.width,
              height: layout.frameSize.height,
            }}
          >
            <ShareFrame
              cards={layout.cards}
              cardIds={cardIds}
              width={layout.frameSize.width}
              height={layout.frameSize.height}
              editable={true}
              onReorder={handleReorder}
              onCycleSize={handleCycleSize}
              onDelete={handleDelete}
            />
          </div>
        </div>

        <ShareSourceList
          items={items.map((i) => ({ bookmarkId: i.bookmarkId, thumbnail: i.thumbnail, title: i.title }))}
          selectedIds={selectedIds}
          onToggle={onToggle}
          onAddAll={onAddAll}
          onClearAll={onClearAll}
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
