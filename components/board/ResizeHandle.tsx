'use client'

import { useCallback, useRef, useState, type PointerEvent, type ReactElement } from 'react'
import { MIN_CARD_WIDTH } from '@/lib/board/size-migration'
import styles from './ResizeHandle.module.css'

export type ResizeCorner = 'tl' | 'tr' | 'bl' | 'br'

type ResizeHandleProps = {
  /** Active card width in board px — used as the start width when a drag begins. */
  readonly cardWidth: number
  /** Active card height in board px — together with cardWidth defines the
   *  aspect ratio that uniform-scale will preserve during the drag. */
  readonly cardHeight: number
  /** Upper bound for the resized card width — typically the layout
   *  area's full width (= effectiveLayoutWidth from BoardRoot) so the
   *  user can drag a card up to "edge to edge of the board". */
  readonly maxCardWidth: number
  /** Fired on every pointermove during a resize with the new clamped
   *  card width. Skyline takes care of height (= newWidth / aspectRatio
   *  for image/video cards, or intrinsic for text). */
  readonly onResize: (nextCardWidth: number) => void
  /** Fired once the pointer is released — caller persists to IDB or
   *  finalizes any session-scoped state. Optional: session 2 keeps the
   *  override in-memory and has nothing to persist. */
  readonly onResizeEnd?: (finalCardWidth: number) => void
  /** Optional: notified when a drag actually starts (after the click
   *  threshold is exceeded). Used by the parent to mark the card as
   *  "currently resizing" so it can suppress unrelated chrome. */
  readonly onResizeStart?: () => void
}

/**
 * Renders four corner hot zones around the card. Each hot zone:
 *   - displays a 1/4-circle arc on hover (CSS :hover fade)
 *   - on pointerdown, captures the pointer and translates pointer
 *     movement into a new card width using the diagonally-opposite
 *     corner as the anchor (so dragging the BR corner stretches toward
 *     the pointer while the TL corner stays put)
 *   - calls stopPropagation on pointerdown so the parent's reorder
 *     drag (registered on the card div) does NOT engage
 *
 * Aspect ratio is preserved implicitly: only width is updated. The
 * skyline engine derives height from `cardWidth / aspectRatio` for
 * image/video cards, so the visual effect is uniform scaling on the
 * diagonal.
 */
export function ResizeHandle({
  cardWidth,
  cardHeight,
  maxCardWidth,
  onResize,
  onResizeEnd,
  onResizeStart,
}: ResizeHandleProps): ReactElement {
  return (
    <>
      <Handle corner="tl" cardWidth={cardWidth} cardHeight={cardHeight} maxCardWidth={maxCardWidth} onResize={onResize} onResizeEnd={onResizeEnd} onResizeStart={onResizeStart} />
      <Handle corner="tr" cardWidth={cardWidth} cardHeight={cardHeight} maxCardWidth={maxCardWidth} onResize={onResize} onResizeEnd={onResizeEnd} onResizeStart={onResizeStart} />
      <Handle corner="bl" cardWidth={cardWidth} cardHeight={cardHeight} maxCardWidth={maxCardWidth} onResize={onResize} onResizeEnd={onResizeEnd} onResizeStart={onResizeStart} />
      <Handle corner="br" cardWidth={cardWidth} cardHeight={cardHeight} maxCardWidth={maxCardWidth} onResize={onResize} onResizeEnd={onResizeEnd} onResizeStart={onResizeStart} />
    </>
  )
}

type HandleProps = ResizeHandleProps & { readonly corner: ResizeCorner }

function Handle({ corner, cardWidth, cardHeight, maxCardWidth, onResize, onResizeEnd, onResizeStart }: HandleProps): ReactElement {
  const [resizing, setResizing] = useState<boolean>(false)
  const latestWidthRef = useRef<number>(cardWidth)
  latestWidthRef.current = cardWidth

  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>): void => {
      if (e.button > 0) return
      // Stop propagation so the card-parent's reorder pointerdown handler
      // (registered in CardsLayer) does not fire. Without this, every
      // resize drag would also trigger a reorder.
      e.stopPropagation()
      e.preventDefault()

      const el = e.currentTarget
      const pointerId = e.pointerId
      // setPointerCapture isn't fully implemented in jsdom — guard it so
      // unit tests can still drive a drag through the synthetic event
      // path without throwing. In real browsers this is the only way to
      // keep receiving pointermove events when the cursor leaves the
      // handle's box.
      try {
        el.setPointerCapture(pointerId)
      } catch {
        // ignore — capture isn't critical for the drag itself
      }

      const aspect = cardHeight > 0 ? cardWidth / cardHeight : 1
      // Sign-per-corner: which direction along each axis grows the card?
      // BR grows on +x and +y; TL grows on -x and -y; etc.
      const signX = corner === 'tr' || corner === 'br' ? 1 : -1
      const signY = corner === 'bl' || corner === 'br' ? 1 : -1

      const startClientX = e.clientX
      const startClientY = e.clientY
      const startWidth = cardWidth
      // Sensitivity: ratio of cardWidth-change to pointer-distance. >1
      // means a small mouse movement produces a larger size change so
      // the user can resize all the way to MIN/MAX without ever having
      // to drag the cursor across the entire screen.
      const SENSITIVITY = 2.0
      let dragStarted = false

      setResizing(true)
      onResizeStart?.()

      const move = (ev: globalThis.PointerEvent): void => {
        const totalDx = ev.clientX - startClientX
        const totalDy = ev.clientY - startClientY
        if (!dragStarted && Math.abs(totalDx) < 2 && Math.abs(totalDy) < 2) return
        dragStarted = true

        // Convert raw pointer movement to width-equivalent growth on
        // each axis (positive = grow direction, negative = shrink).
        const dx = totalDx * signX
        const dyW = aspect > 0 ? totalDy * signY * aspect : 0
        // Pick the dominant axis, keeping its sign so shrink works.
        // Using a dominant axis (vs averaging) keeps the gesture
        // predictable when the user drags mostly along one axis.
        const dom = Math.abs(dx) >= Math.abs(dyW) ? dx : dyW
        const next = Math.max(
          MIN_CARD_WIDTH,
          Math.min(maxCardWidth, startWidth + dom * SENSITIVITY),
        )
        latestWidthRef.current = next
        onResize(next)
      }

      const end = (): void => {
        el.removeEventListener('pointermove', move)
        el.removeEventListener('pointerup', end)
        el.removeEventListener('pointercancel', end)
        // Match the setPointerCapture guard above — jsdom doesn't
        // implement these methods, so calling them in the unit-test
        // env throws and aborts the listener cleanup midway.
        try {
          if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId)
        } catch {
          // ignore — capture release isn't critical for the drag itself
        }
        setResizing(false)
        if (dragStarted) onResizeEnd?.(latestWidthRef.current)
      }

      el.addEventListener('pointermove', move)
      el.addEventListener('pointerup', end)
      el.addEventListener('pointercancel', end)
    },
    [corner, cardWidth, cardHeight, maxCardWidth, onResize, onResizeEnd, onResizeStart],
  )

  const handleClass = [
    styles.handle,
    styles[corner],
    resizing ? styles.resizing : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      {/* Wider hover-only hint zone — fires :hover at a generous approach
          radius so the arc fades in BEFORE the cursor reaches the small
          click-active handle. No event handlers: clicks here bubble up to
          the card-parent's reorder pointerdown, which is the desired
          fallback behavior near (but not on) the corner. */}
      <div
        className={[styles.hint, styles[`hint-${corner}`]].join(' ')}
        aria-hidden="true"
      />
      <div
        className={handleClass}
        onPointerDown={handlePointerDown}
        data-testid={`resize-handle-${corner}`}
      >
        <ArcSvg corner={corner} />
      </div>
    </>
  )
}

/** 1/4-circle arc anchored to the corresponding corner of the 32x32 zone.
 *  The handle box overshoots the card by 12px on the corner-side axes
 *  (top:-12 left:-12 for TL etc.), so the card corner sits at box-local
 *  (12, 12) for TL or (20, 12) for TR (since 32-12=20). The arc is
 *  centered ON the card corner and opens AWAY from the card body
 *  (visible portion lives in the 12px outward strip), so the
 *  affordance reads as a small bracket sitting just outside the corner. */
function ArcSvg({ corner }: { corner: ResizeCorner }): ReactElement {
  const r = 10
  const cx = corner === 'tl' || corner === 'bl' ? 12 : 20
  const cy = corner === 'tl' || corner === 'tr' ? 12 : 20
  // Start / end points 90° around the card corner. Each corner picks
  // the two endpoints that sit on the OUTWARD axes (the area outside
  // the card edge), and the sweep flag is chosen so the arc bulges
  // through the outward quadrant. SVG sweep=1 = clockwise visually,
  // sweep=0 = counter-clockwise visually.
  let p1x: number
  let p1y: number
  let p2x: number
  let p2y: number
  let sweepFlag: 0 | 1
  if (corner === 'tl') {
    // From left-of-corner (9 o'clock) to above-corner (12 o'clock),
    // bulging through upper-left = clockwise.
    p1x = cx - r; p1y = cy
    p2x = cx; p2y = cy - r
    sweepFlag = 1
  } else if (corner === 'tr') {
    // From right-of-corner (3 o'clock) to above-corner (12 o'clock),
    // bulging through upper-right = counter-clockwise.
    p1x = cx + r; p1y = cy
    p2x = cx; p2y = cy - r
    sweepFlag = 0
  } else if (corner === 'bl') {
    // From left-of-corner (9 o'clock) to below-corner (6 o'clock),
    // bulging through lower-left = counter-clockwise.
    p1x = cx - r; p1y = cy
    p2x = cx; p2y = cy + r
    sweepFlag = 0
  } else {
    // From right-of-corner (3 o'clock) to below-corner (6 o'clock),
    // bulging through lower-right = clockwise.
    p1x = cx + r; p1y = cy
    p2x = cx; p2y = cy + r
    sweepFlag = 1
  }
  const d = `M ${p1x} ${p1y} A ${r} ${r} 0 0 ${sweepFlag} ${p2x} ${p2y}`
  return (
    <svg className={styles.arc} viewBox="0 0 32 32" aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke="rgba(255, 255, 255, 0.9)"
        strokeWidth={2.25}
        strokeLinecap="round"
      />
    </svg>
  )
}
