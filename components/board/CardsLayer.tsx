'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { gsap } from 'gsap'
import { computeSkylineLayout, type SkylineCard } from '@/lib/board/skyline-layout'
import type { CardPosition, DisplayMode } from '@/lib/board/types'
import {
  BOARD_Z_INDEX,
  COLUMN_MASONRY,
  CULLING,
} from '@/lib/board/constants'
import type { BoardItem } from '@/lib/storage/use-board-data'
import { detectUrlType, isInstagramReel } from '@/lib/utils/url'
import { CardNode } from './CardNode'
import { MediaTypeIndicator, type MediaType } from './MediaTypeIndicator'
import { ResizeHandle } from './ResizeHandle'
import { CardCornerActions } from './CardCornerActions'
import { useCardReorderDrag, computeVirtualOrder, makeSkylineSimulator } from './use-card-reorder-drag'
import { pickCard } from './cards'

/** Derive the media-type badge for a bookmark from existing fields — no
 *  new persisted data needed. Returns null for cards where a video/photo
 *  badge wouldn't add information (text-only items: the card itself
 *  already reads as text). */
function deriveMediaType(item: BoardItem): MediaType | null {
  const urlType = detectUrlType(item.url)
  const isVideo =
    urlType === 'youtube' ||
    urlType === 'tiktok' ||
    (urlType === 'instagram' && isInstagramReel(item.url)) ||
    (urlType === 'tweet' && item.hasVideo === true)
  if (isVideo) return 'video'
  if (item.thumbnail) return 'photo'
  return null
}

type Viewport = {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

type CardsLayerProps = {
  readonly items: ReadonlyArray<BoardItem>
  readonly viewport: Viewport
  readonly viewportWidth: number
  readonly hoveredBookmarkId: string | null
  readonly spaceHeld: boolean
  readonly onHoverChange: (id: string | null) => void
  readonly onClick: (bookmarkId: string, originRect: DOMRect) => void
  readonly onDrop: (orderedBookmarkIds: readonly string[]) => void
  /** Soft-delete handler — fired by the visible × button in the card's
   *  top-right corner. Right-click is intentionally NOT wired up so
   *  the gesture stays free for future affordances (selection, etc). */
  readonly onDelete: (bookmarkId: string) => void
  readonly persistMeasuredAspect?: (cardId: string, aspectRatio: number) => Promise<void>
  readonly displayMode: DisplayMode
  readonly newlyAddedIds: ReadonlySet<string>
  /** Default per-card width for cards with no custom width — derived from
   *  the active SizePicker level so the board still distributes evenly
   *  across N columns. Skyline layout uses this for every card whose id
   *  is NOT in the resize override map. */
  readonly defaultCardWidth: number
  /** In-memory per-card resize overrides (lifted to BoardRoot so the
   *  scroll-range calculation there sees the same widths). */
  readonly customWidths: Readonly<Record<string, number>>
  /** Notify the parent of a per-card width update during a resize drag. */
  readonly onCardResize: (bookmarkId: string, nextWidth: number) => void
  /** Fired once the user releases the resize handle. The parent persists
   *  the final width to IDB and flips `customCardWidth` to true. */
  readonly onCardResizeEnd: (bookmarkId: string, finalWidth: number) => void
  /** Fired when the user clicks the per-card "reset size" affordance.
   *  The parent clears the IDB flag for this bookmark. */
  readonly onCardResetSize: (bookmarkId: string) => void
  /** When the lightbox is open, the card with this id is the one that
   *  opened it (the "source"). It is held visibility:hidden on the board
   *  for the duration of the lightbox session so the user sees a calm
   *  blank slot where their click originated — matching destefanis-style
   *  moodboards where the click "becomes" the lightbox. Reflow is
   *  intentionally suppressed (visibility, not display:none) so the rest
   *  of the layout does not jitter, and the slot stays available as the
   *  visual home for the close-FLIP return. (B-#11)  */
  readonly sourceCardId?: string | null
}

export function CardsLayer({
  items,
  viewport,
  viewportWidth,
  hoveredBookmarkId,
  spaceHeld,
  onHoverChange,
  onClick,
  onDrop,
  onDelete,
  persistMeasuredAspect,
  displayMode,
  newlyAddedIds,
  defaultCardWidth,
  customWidths,
  onCardResize,
  onCardResizeEnd,
  onCardResetSize,
  sourceCardId,
}: CardsLayerProps): ReactNode {
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})
  // Throttle: skip recomputing virtual order if card hasn't moved >8px since last compute.
  const lastComputeRef = useRef<{ x: number; y: number } | null>(null)

  // Stage 2: virtual order during drag for live reflow preview.
  // null = no drag in progress (use real masonry order).
  const [virtualOrderedIds, setVirtualOrderedIds] = useState<readonly string[] | null>(null)

  // Per-card intrinsic heights reported by text-heavy cards (Tweet/Text).
  // When set, masonry uses this as absolute height instead of width / aspectRatio.
  // Keyed by bookmarkId. Image / video cards do not report — masonry falls back to aspectRatio.
  const [intrinsicHeights, setIntrinsicHeights] = useState<Readonly<Record<string, number>>>({})
  const reportIntrinsicHeight = useCallback((bookmarkId: string, h: number): void => {
    setIntrinsicHeights((prev) => {
      const existing = prev[bookmarkId]
      if (existing != null && Math.abs(existing - h) < 4) return prev
      return { ...prev, [bookmarkId]: h }
    })
  }, [])

  // Session-2 per-card resize overrides — lifted to BoardRoot so the
  // scroll-range calculation there sees the same widths as the cards
  // layer's render layout.
  const resolveCardWidth = useCallback(
    (bookmarkId: string): number => customWidths[bookmarkId] ?? defaultCardWidth,
    [customWidths, defaultCardWidth],
  )

  // Resolve each card's render width + height for the skyline engine.
  // Width comes from `customWidths` if the card has been resized in
  // this session, otherwise from `defaultCardWidth` (= the SizePicker
  // level's auto-distribute width). Height is intrinsic for text cards
  // or `width / aspectRatio` for image/video cards.
  const buildSkylineCard = useCallback(
    (it: BoardItem): SkylineCard => {
      const intrinsic = intrinsicHeights[it.bookmarkId]
      const w = resolveCardWidth(it.bookmarkId)
      const h =
        intrinsic && intrinsic > 0
          ? intrinsic
          : it.aspectRatio > 0
            ? w / it.aspectRatio
            : w
      return { id: it.bookmarkId, width: w, height: h }
    },
    [resolveCardWidth, intrinsicHeights],
  )


  const skylineCards = useMemo<SkylineCard[]>(
    () => items.map(buildSkylineCard),
    [items, buildSkylineCard],
  )

  const masonryLayout = useMemo(
    () =>
      computeSkylineLayout({
        cards: skylineCards,
        containerWidth: viewportWidth,
        gap: COLUMN_MASONRY.GAP_PX,
      }),
    [skylineCards, viewportWidth],
  )

  // Stage 2: preview layout computed from the live virtual order.
  const previewMasonry = useMemo(() => {
    if (!virtualOrderedIds) return null
    const idToItem = new Map(items.map((it) => [it.bookmarkId, it]))
    const orderedCards: SkylineCard[] = []
    for (const id of virtualOrderedIds) {
      const it = idToItem.get(id)
      if (!it) continue
      orderedCards.push(buildSkylineCard(it))
    }
    return computeSkylineLayout({
      cards: orderedCards,
      containerWidth: viewportWidth,
      gap: COLUMN_MASONRY.GAP_PX,
    })
  }, [virtualOrderedIds, items, viewportWidth, buildSkylineCard])

  // During drag, use preview positions for non-dragged cards.
  // During drop/idle, use real masonry positions.
  const displayedPositions = useMemo<Readonly<Record<string, CardPosition>>>(
    () => previewMasonry?.positions ?? masonryLayout.positions,
    [previewMasonry, masonryLayout.positions],
  )

  const visibleItems = useMemo(() => {
    const bufferX = viewport.w * CULLING.BUFFER_SCREENS
    const bufferY = viewport.h * CULLING.BUFFER_SCREENS
    const minX = viewport.x - bufferX
    const maxX = viewport.x + viewport.w + bufferX
    const minY = viewport.y - bufferY
    const maxY = viewport.y + viewport.h + bufferY

    return items.filter((it) => {
      const p = displayedPositions[it.bookmarkId]
      if (!p) return false
      return !(p.x + p.w < minX || p.x > maxX || p.y + p.h < minY || p.y > maxY)
    })
  }, [items, displayedPositions, viewport])

  // Previous-position ledger used to animate masonry reflows via FLIP.
  // Updated at the end of every effect run.
  const prevPositionsRef = useRef<Record<string, { x: number; y: number }>>({})

  // dragState ref for use inside useLayoutEffect without triggering extra renders
  const dragStateRef = useRef<{ bookmarkId: string } | null>(null)

  useLayoutEffect(() => {
    const draggedId = dragStateRef.current?.bookmarkId ?? null

    for (const it of visibleItems) {
      // Skip the card being dragged — the drag hook owns its transform.
      if (it.bookmarkId === draggedId) continue

      const el = cardRefs.current[it.bookmarkId]
      if (!el) continue
      const p = displayedPositions[it.bookmarkId]
      if (!p) continue

      const prev = prevPositionsRef.current[it.bookmarkId]
      const positionMoved = prev && (prev.x !== p.x || prev.y !== p.y)
      if (positionMoved) {
        // FLIP: animate from element's current live transform to new position.
        // gsap.to (not fromTo) continues from wherever the element is now —
        // avoids the per-tick snap-back to stored prev on fast pointer movement.
        const isLiveReflow = draggedId !== null
        gsap.to(el, {
          x: p.x,
          y: p.y,
          width: p.w,
          height: p.h,
          duration: isLiveReflow ? 0.18 : 0.15,
          ease: 'power2.out',
          overwrite: 'auto',
        })
      } else {
        gsap.set(el, { x: p.x, y: p.y, width: p.w, height: p.h, overwrite: 'auto' })
      }
      prevPositionsRef.current[it.bookmarkId] = { x: p.x, y: p.y }
    }
    // Garbage-collect stale entries (cards unmounted due to culling)
    const liveIds = new Set(visibleItems.map((it) => it.bookmarkId))
    for (const id of Object.keys(prevPositionsRef.current)) {
      if (!liveIds.has(id)) delete prevPositionsRef.current[id]
    }
  }, [visibleItems, displayedPositions])

  const {
    dragState,
    handleCardPointerDown: handleReorderPointerDown,
  } = useCardReorderDrag({
    items,
    positions: masonryLayout.positions,
    spaceHeld,
    onClick,
    onDragMove: useCallback(
      (
        id: string,
        cardWorldX: number,
        cardWorldY: number,
        _pointerWorldX: number,
        _pointerWorldY: number,
      ): void => {
        // Stage 1: instant pointer follow — gsap.set is synchronous, zero lag.
        const el = cardRefs.current[id]
        if (el) {
          gsap.set(el, { x: cardWorldX, y: cardWorldY, scale: 1.03, overwrite: 'auto' })
        }

        // Stage 2: position-preserving insertion — throttle via 8px movement delta.
        const last = lastComputeRef.current
        if (last && Math.abs(last.x - cardWorldX) < 8 && Math.abs(last.y - cardWorldY) < 8) {
          return // skip — no significant pointer movement
        }
        lastComputeRef.current = { x: cardWorldX, y: cardWorldY }

        const newOrder = computeVirtualOrder({
          items,
          draggedId: id,
          cardWorldX,
          cardWorldY,
          simulateLayout: makeSkylineSimulator({
            containerWidth: viewportWidth,
            gap: COLUMN_MASONRY.GAP_PX,
            resolveWidth: resolveCardWidth,
            intrinsicHeights,
          }),
        })

        // Only update state if order actually changed — avoids re-render storms.
        setVirtualOrderedIds((prev) => {
          if (!prev) return newOrder
          if (prev.length !== newOrder.length) return newOrder
          for (let i = 0; i < prev.length; i++) {
            if (prev[i] !== newOrder[i]) return newOrder
          }
          return prev
        })
      },
      [items, viewportWidth, resolveCardWidth, intrinsicHeights],
    ),
    onDrop: useCallback(
      (_orderedIds: readonly string[]): void => {
        // Reset throttle ref so next drag starts fresh.
        lastComputeRef.current = null

        const draggedId = dragStateRef.current?.bookmarkId

        // Resolve the final order: use latest virtualOrderedIds if set, else the
        // hook's _orderedIds (unused but kept as fallback).
        const finalOrder = virtualOrderedIds ?? _orderedIds

        // Compute the FINAL skyline layout manually — identical to what
        // masonryLayout will be after React commits the new items order. This
        // guarantees the positions we snap to match what React will render,
        // so FLIP's useLayoutEffect sees prev === p and issues no animation.
        const idToItem = new Map(items.map((it) => [it.bookmarkId, it]))
        const finalCards: SkylineCard[] = []
        for (const id of finalOrder) {
          const it = idToItem.get(id)
          if (!it) continue
          finalCards.push(buildSkylineCard(it))
        }
        const finalMasonry = computeSkylineLayout({
          cards: finalCards,
          containerWidth: viewportWidth,
          gap: COLUMN_MASONRY.GAP_PX,
        })

        // Snap all non-dragged cards to their FINAL masonry positions + scale 1,
        // killing any in-flight FLIP tweens. Using finalMasonry (not previewMasonry)
        // guarantees React's next render sees prev === p and issues no animation.
        for (const id of Object.keys(finalMasonry.positions)) {
          if (id === draggedId) continue
          const el = cardRefs.current[id]
          const p = finalMasonry.positions[id]
          if (el && p) {
            gsap.set(el, {
              x: p.x,
              y: p.y,
              width: p.w,
              height: p.h,
              scale: 1,
              overwrite: true,
            })
            prevPositionsRef.current[id] = { x: p.x, y: p.y }
          }
        }

        // Capture the dragged card's current DOM transform as its prev — FLIP in
        // the drop render animates from pointer position to new masonry slot.
        if (draggedId) {
          const el = cardRefs.current[draggedId]
          if (el) {
            const currentX = Number(gsap.getProperty(el, 'x'))
            const currentY = Number(gsap.getProperty(el, 'y'))
            prevPositionsRef.current[draggedId] = { x: currentX, y: currentY }
            // Instant scale snap — no 0.22s shrink tween
            gsap.set(el, { scale: 1, overwrite: 'auto' })
          }
        }

        // Commit the new order and clear virtual.
        onDrop(finalOrder)
        setVirtualOrderedIds(null)
      },
      [onDrop, virtualOrderedIds, items, viewportWidth, buildSkylineCard],
    ),
  })

  // Keep dragStateRef in sync so useLayoutEffect can read the dragged id
  // without a dependency that causes extra FLIP runs.
  dragStateRef.current = dragState ? { bookmarkId: dragState.bookmarkId } : null

  // Esc during drag → restore dragged card to its pre-drag slot (FLIP handles it).
  useEffect(() => {
    if (!dragState) return
    const onEsc = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      const el = cardRefs.current[dragState.bookmarkId]
      const p = masonryLayout.positions[dragState.bookmarkId]
      if (el && p) {
        gsap.to(el, {
          x: p.x, y: p.y, scale: 1, duration: 0.22, ease: 'power2.out', overwrite: 'auto',
        })
      }
      setVirtualOrderedIds(null)
    }
    window.addEventListener('keydown', onEsc)
    return (): void => {
      window.removeEventListener('keydown', onEsc)
    }
  }, [dragState, masonryLayout.positions])

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        zIndex: BOARD_Z_INDEX.CARDS,
        pointerEvents: 'none',
      }}
    >
      {visibleItems.map((it) => {
        const p = displayedPositions[it.bookmarkId]
        if (!p) return null
        return (
          <div
            key={it.bookmarkId}
            ref={(el): void => {
              cardRefs.current[it.bookmarkId] = el
            }}
            data-bookmark-id={it.bookmarkId}
            data-link-status={it.linkStatus ?? undefined}
            onPointerDown={(e: PointerEvent<HTMLDivElement>): void => handleReorderPointerDown(e, it.bookmarkId)}
            onPointerEnter={(): void => onHoverChange(it.bookmarkId)}
            onPointerLeave={(): void => onHoverChange(null)}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: `${p.w}px`,
              height: `${p.h}px`,
              pointerEvents: sourceCardId === it.bookmarkId ? 'none' : 'auto',
              zIndex: dragState?.bookmarkId === it.bookmarkId ? 1000 : undefined,
              opacity: newlyAddedIds.has(it.bookmarkId) ? 0 : 1,
              visibility: sourceCardId === it.bookmarkId ? 'hidden' : undefined,
              animation: newlyAddedIds.has(it.bookmarkId) ? 'booklage-entrance-a 400ms ease-out forwards' : undefined,
              ['--card-radius' as string]: `${Math.min(24, Math.min(p.w, p.h) * 0.075)}px`,
            }}
          >
            <CardNode
              id={it.bookmarkId}
              title={it.title}
              thumbnailUrl={it.thumbnail}
            >
              {(() => {
                const Card = pickCard(it)
                return (
                  <Card
                    item={it}
                    persistMeasuredAspect={persistMeasuredAspect}
                    reportIntrinsicHeight={reportIntrinsicHeight}
                    cardWidth={p.w}
                    cardHeight={p.h}
                    displayMode={it.displayMode ?? displayMode}
                  />
                )
              })()}
            </CardNode>
            <MediaTypeIndicator
              type={deriveMediaType(it)}
              visible={hoveredBookmarkId === it.bookmarkId}
            />
            {/* CardCornerActions renders BEFORE ResizeHandle so the corner
                arcs can pick up button hover via the ~ sibling combinator
                (see ResizeHandle.module.css cross-module rules). Without
                this ordering, hovering × or ↺ silences the resize hint
                arcs in the corners they cover. */}
            <CardCornerActions
              hovered={hoveredBookmarkId === it.bookmarkId}
              hasCustomWidth={it.customCardWidth}
              onDelete={(): void => onDelete(it.bookmarkId)}
              onResetSize={(): void => onCardResetSize(it.bookmarkId)}
            />
            <ResizeHandle
              cardWidth={p.w}
              cardHeight={p.h}
              maxCardWidth={viewportWidth}
              onResize={(nextW: number): void => onCardResize(it.bookmarkId, nextW)}
              onResizeEnd={(finalW: number): void => onCardResizeEnd(it.bookmarkId, finalW)}
            />
          </div>
        )
      })}
    </div>
  )
}
