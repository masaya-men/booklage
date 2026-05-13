// components/share/ShareFrame.tsx
'use client'

import { useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import type { ShareCard } from '@/lib/share/types'
import type { CardPosition } from '@/lib/board/types'
import type { BoardItem } from '@/lib/storage/use-board-data'
import { CardNode } from '@/components/board/CardNode'
import { useCardReorderDrag, computeVirtualOrder } from '@/components/board/use-card-reorder-drag'
import { computeColumnMasonry, type MasonryCard } from '@/lib/board/column-masonry'
import { COLUMN_MASONRY, BOARD_INNER } from '@/lib/board/constants'
import { presetToCardWidth } from '@/lib/board/size-migration'
import styles from './ShareFrame.module.css'

type Props = {
  readonly cards: ReadonlyArray<ShareCard>
  /** bookmarkIds aligned with `cards` — required when editable. */
  readonly cardIds?: ReadonlyArray<string>
  readonly width: number
  readonly height: number
  readonly editable: boolean
  readonly onReorder?: (orderedIds: readonly string[]) => void
  readonly onDelete?: (id: string) => void
  /** Receiving-side click target. rect is the clicked card's screen
   *  position so the parent can seed the Lightbox FLIP open animation. */
  readonly onCardOpen?: (i: number, rect: DOMRect | null) => void
}

/**
 * Adapt ShareCards to the BoardItem shape that use-card-reorder-drag
 * expects. Only bookmarkId / aspectRatio / cardWidth / orderIndex carry
 * meaningful data — the rest are filler to satisfy the type. The wire
 * byte `c.s` (S/M/L) is decoded into a continuous cardWidth here so the
 * receiving side runs the same masonry as the board.
 */
function buildAdapterItems(
  cards: ReadonlyArray<ShareCard>,
  cardIds: ReadonlyArray<string> | undefined,
): BoardItem[] {
  return cards.map((c, i) => ({
    bookmarkId: cardIds?.[i] ?? `share-${i}`,
    cardId: '',
    title: c.t,
    description: c.d,
    thumbnail: c.th,
    url: c.u,
    aspectRatio: typeof c.a === 'number' && c.a > 0 ? c.a : 1,
    gridIndex: i,
    orderIndex: i,
    cardWidth: presetToCardWidth(c.s),
    customCardWidth: false,
    isRead: false,
    isDeleted: false,
    tags: [] as readonly string[],
    displayMode: null,
  }))
}

export function ShareFrame({
  cards,
  cardIds,
  width,
  height,
  editable,
  onReorder,
  onDelete,
  onCardOpen,
}: Props): ReactElement {
  const frameRef = useRef<HTMLDivElement>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [virtualOrder, setVirtualOrder] = useState<readonly string[] | null>(null)

  const adaptedItems = useMemo(() => buildAdapterItems(cards, cardIds), [cards, cardIds])

  // Frame-local pixel positions, source of truth for the drag hook.
  const positions = useMemo<Readonly<Record<string, CardPosition>>>(() => {
    const out: Record<string, CardPosition> = {}
    cards.forEach((c, i) => {
      const id = cardIds?.[i] ?? `share-${i}`
      out[id] = {
        x: c.x * width,
        y: c.y * height,
        w: c.w * width,
        h: c.h * height,
      }
    })
    return out
  }, [cards, cardIds, width, height])

  // Preview masonry: while a card is dragged, recompute positions for the
  // non-dragged cards so they reflow live into the current virtual order.
  // Mirrors CardsLayer's preview behavior on the board.
  const previewPositions = useMemo<Readonly<Record<string, CardPosition>> | null>(() => {
    if (!virtualOrder || virtualOrder.length === 0) return null
    const idToItem = new Map(adaptedItems.map((it) => [it.bookmarkId, it]))
    const orderedCards: MasonryCard[] = []
    for (const id of virtualOrder) {
      const it = idToItem.get(id)
      if (!it) continue
      orderedCards.push({
        id: it.bookmarkId,
        aspectRatio: it.aspectRatio,
        columnSpan: 1,
        targetWidth: it.cardWidth,
      })
    }
    const innerW = Math.max(60, width - 2 * BOARD_INNER.SIDE_PADDING_PX)
    const m = computeColumnMasonry({
      cards: orderedCards,
      containerWidth: innerW,
      gap: COLUMN_MASONRY.GAP_PX,
      targetColumnUnit: COLUMN_MASONRY.TARGET_COLUMN_UNIT_PX,
    })
    const out: Record<string, CardPosition> = {}
    for (const id of Object.keys(m.positions)) {
      const p = m.positions[id]
      out[id] = {
        x: p.x + BOARD_INNER.SIDE_PADDING_PX,
        y: p.y + BOARD_INNER.SIDE_PADDING_PX,
        w: p.w,
        h: p.h,
      }
    }
    return out
  }, [virtualOrder, adaptedItems, width])

  const { dragState, handleCardPointerDown } = useCardReorderDrag({
    items: adaptedItems,
    positions,
    spaceHeld: false,
    onClick: (): void => {
      // No click action in editor.
    },
    onDragMove: (id, cardWorldX, cardWorldY): void => {
      if (!editable) return
      const containerWidth = Math.max(60, width - 2 * BOARD_INNER.SIDE_PADDING_PX)
      const newOrder = computeVirtualOrder({
        items: adaptedItems,
        draggedId: id,
        cardWorldX,
        cardWorldY,
        simulateLayout: (orderedItems) => {
          const orderedCards: MasonryCard[] = orderedItems.map((it) => ({
            id: it.bookmarkId,
            aspectRatio: it.aspectRatio,
            columnSpan: 1,
            targetWidth: it.cardWidth,
          }))
          return computeColumnMasonry({
            cards: orderedCards,
            containerWidth,
            gap: COLUMN_MASONRY.GAP_PX,
            targetColumnUnit: COLUMN_MASONRY.TARGET_COLUMN_UNIT_PX,
          }).positions
        },
      })
      setVirtualOrder(newOrder)
    },
    onDrop: (): void => {
      if (virtualOrder && onReorder) onReorder(virtualOrder)
      setVirtualOrder(null)
    },
  })

  return (
    <div
      ref={frameRef}
      className={styles.frame}
      style={{ width, height }}
      data-testid="share-frame"
      data-editable={editable || undefined}
    >
      {cards.map((c, i) => {
        const id = cardIds?.[i] ?? `share-${i}`
        const isDragging = editable && dragState?.bookmarkId === id

        // Non-dragged cards use preview positions during drag so they
        // visibly reflow as the virtual order changes. The dragged card
        // itself follows the pointer via translate.
        const visualPos = !isDragging ? previewPositions?.[id] : null
        const left = visualPos ? visualPos.x : c.x * width
        const top = visualPos ? visualPos.y : c.y * height
        const cardW = visualPos ? visualPos.w : c.w * width
        const cardH = visualPos ? visualPos.h : c.h * height

        // Translate the dragged card so its center follows the pointer.
        let translate: string | undefined
        if (isDragging && dragState) {
          const dx = dragState.currentX - (left + cardW / 2)
          const dy = dragState.currentY - (top + cardH / 2)
          translate = `translate(${dx}px, ${dy}px)`
        }

        return (
          <div
            key={id}
            className={styles.cardWrap}
            data-card-id={id}
            data-dragging={isDragging || undefined}
            style={{
              left: `${left}px`,
              top: `${top}px`,
              width: `${cardW}px`,
              height: `${cardH}px`,
              transform: translate,
              cursor: editable ? 'grab' : (onCardOpen ? 'pointer' : 'default'),
              zIndex: isDragging ? 50 : undefined,
              ['--card-index' as string]: i,
              ['--card-radius' as string]: '20px',
            } as CSSProperties}
            onPointerDown={(e): void => {
              if (editable && cardIds) handleCardPointerDown(e, id)
            }}
            onClick={(e): void => {
              if (editable || !onCardOpen) return
              const rect = e.currentTarget.getBoundingClientRect()
              onCardOpen(i, rect)
            }}
            data-testid={`share-frame-card-${i}`}
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
          </div>
        )
      })}
    </div>
  )
}
