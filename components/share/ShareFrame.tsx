// components/share/ShareFrame.tsx
'use client'

import { useMemo, useRef, useState, type ReactElement } from 'react'
import type { ShareCard, ShareSize } from '@/lib/share/types'
import { CardNode } from '@/components/board/CardNode'
import { SizePresetToggle } from '@/components/board/SizePresetToggle'
import { useShareReorderDrag } from './use-share-reorder-drag'
import styles from './ShareFrame.module.css'

type Props = {
  readonly cards: ReadonlyArray<ShareCard>
  /** bookmarkIds aligned with `cards` — required when editable. */
  readonly cardIds?: ReadonlyArray<string>
  readonly width: number
  readonly height: number
  readonly editable: boolean
  readonly onReorder?: (orderedIds: readonly string[]) => void
  readonly onCycleSize?: (id: string, next: ShareSize) => void
  readonly onDelete?: (id: string) => void
  /** Receiving-side click target: opens c.u in a new tab. */
  readonly onCardOpen?: (i: number) => void
}

export function ShareFrame({
  cards,
  cardIds,
  width,
  height,
  editable,
  onReorder,
  onCycleSize,
  onDelete,
  onCardOpen,
}: Props): ReactElement {
  const frameRef = useRef<HTMLDivElement>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Card centers in frame-local coords for drop-target detection.
  const cardCenters = useMemo(() => {
    if (!cardIds) return []
    return cards.map((c, i) => ({
      id: cardIds[i] ?? '',
      cx: (c.x + c.w / 2) * width,
      cy: (c.y + c.h / 2) * height,
    }))
  }, [cards, cardIds, width, height])

  const { dragState, handleCardPointerDown } = useShareReorderDrag({
    cardIds: cardIds ?? [],
    cardCenters,
    onReorder: onReorder ?? ((): void => undefined),
  })

  return (
    <div
      ref={frameRef}
      className={styles.frame}
      style={{ width, height }}
      data-testid="share-frame"
    >
      {cards.map((c, i) => {
        const id = cardIds?.[i] ?? `share-${i}`
        const isDragging = editable && dragState?.bookmarkId === id
        const dragOffsetX = isDragging ? (dragState?.currentX ?? 0) : 0
        const dragOffsetY = isDragging ? (dragState?.currentY ?? 0) : 0
        return (
          <div
            key={id}
            className={styles.cardWrap}
            data-card-id={id}
            data-dragging={isDragging || undefined}
            style={{
              left: `${c.x * width}px`,
              top: `${c.y * height}px`,
              width: `${c.w * width}px`,
              height: `${c.h * height}px`,
              transform: isDragging ? `translate(${dragOffsetX}px, ${dragOffsetY}px)` : undefined,
              cursor: editable ? 'grab' : (onCardOpen ? 'pointer' : 'default'),
              zIndex: isDragging ? 50 : undefined,
            }}
            onPointerDown={(e): void => {
              if (editable && cardIds) handleCardPointerDown(e, id)
            }}
            onClick={(): void => { if (!editable && onCardOpen) onCardOpen(i) }}
            onContextMenu={(e): void => {
              if (!editable) return
              e.preventDefault()
              if (cardIds && onDelete) onDelete(id)
            }}
            onMouseEnter={(): void => { if (editable) setHoveredId(id) }}
            onMouseLeave={(): void => { if (editable) setHoveredId((prev) => (prev === id ? null : prev)) }}
          >
            <CardNode
              id={`share-${i}`}
              title={c.t}
              thumbnailUrl={c.th}
              rotation={c.r}
            >
              {c.th
                ? <img className={styles.thumbOnly} src={c.th} alt="" draggable={false} />
                : <div className={styles.thumbPlaceholder}>{c.t.slice(0, 24)}</div>}
            </CardNode>
            {editable && (
              <SizePresetToggle
                preset={c.s}
                visible={hoveredId === id}
                onCycle={(next): void => {
                  if (onCycleSize) onCycleSize(id, next)
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
