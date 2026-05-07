'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactElement,
} from 'react'
import styles from './ScrollMeter.module.css'

const BAR_COUNT = 56

/** Y-extent summary of a single card on the board, sufficient for density mapping. */
export type CardYExtent = {
  readonly y: number
  readonly h: number
}

type Props = {
  /** All visible cards' vertical extents — drives the density map. */
  readonly cards: ReadonlyArray<CardYExtent>
  /** Total scrollable content height of the board (cards + padding). */
  readonly contentHeight: number
  /** Current viewport y offset within the board's coordinate space. */
  readonly viewportY: number
  /** Visible viewport height. */
  readonly viewportHeight: number
  /** Scroll the board to the given y (called on click / drag-jump). */
  readonly onScrollTo: (y: number) => void
}

function pseudoRandom(i: number): number {
  let h = (i * 374761393) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return ((h >>> 0) % 1000) / 1000
}

/**
 * Live scroll-position meter. Bars represent vertical bands of the board;
 * each bar's height encodes how dense that band is with cards. The active
 * range (within current viewport) is highlighted with a soft glow that
 * smoothly tracks scroll. Click anywhere to jump-scroll.
 */
export function ScrollMeter({
  cards,
  contentHeight,
  viewportY,
  viewportHeight,
  onScrollTo,
}: Props): ReactElement {
  const trackRef = useRef<HTMLDivElement>(null)
  const [hoverFrac, setHoverFrac] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Density mapping: count card-overlap per band, normalize, blend with a
  // pseudo-random base so even an empty board has waveform character.
  const heights = useMemo<ReadonlyArray<number>>(() => {
    const baseline = Array.from({ length: BAR_COUNT }, (_, i) =>
      0.18 + 0.32 * pseudoRandom(i),
    )
    if (contentHeight <= 0 || cards.length === 0) return baseline
    const bandH = contentHeight / BAR_COUNT
    const counts: number[] = Array.from({ length: BAR_COUNT }, () => 0)
    for (const c of cards) {
      const start = Math.max(0, Math.floor(c.y / bandH))
      const end = Math.min(BAR_COUNT - 1, Math.floor((c.y + c.h) / bandH))
      for (let i = start; i <= end; i++) counts[i] += 1
    }
    const max = counts.reduce((m, c) => (c > m ? c : m), 0)
    if (max === 0) return baseline
    return counts.map((c, i) => {
      const density = c / max
      // Blend density (60%) with baseline (40%) so the waveform always looks alive
      return 0.22 + 0.78 * (0.6 * density + 0.4 * baseline[i])
    })
  }, [cards, contentHeight])

  const scrollableHeight = Math.max(0, contentHeight - viewportHeight)
  const activeStartFrac = scrollableHeight > 0 ? viewportY / contentHeight : 0
  const activeEndFrac = contentHeight > 0
    ? Math.min(1, (viewportY + viewportHeight) / contentHeight)
    : 1

  const fracFromPointer = useCallback((clientX: number): number => {
    const el = trackRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    if (rect.width === 0) return 0
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }, [])

  const scrollToFrac = useCallback((frac: number): void => {
    const target = frac * scrollableHeight
    onScrollTo(Math.max(0, target))
  }, [onScrollTo, scrollableHeight])

  const handlePointerDown = useCallback((e: PointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    const el = trackRef.current
    if (!el) return
    if (typeof el.setPointerCapture === 'function') el.setPointerCapture(e.pointerId)
    setIsDragging(true)
    const frac = fracFromPointer(e.clientX)
    scrollToFrac(frac)
  }, [fracFromPointer, scrollToFrac])

  const handlePointerMove = useCallback((e: PointerEvent<HTMLDivElement>): void => {
    const frac = fracFromPointer(e.clientX)
    setHoverFrac(frac)
    if (isDragging) scrollToFrac(frac)
  }, [fracFromPointer, isDragging, scrollToFrac])

  const handlePointerUp = useCallback((e: PointerEvent<HTMLDivElement>): void => {
    const el = trackRef.current
    if (el && typeof el.hasPointerCapture === 'function' && el.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId)
    }
    setIsDragging(false)
  }, [])

  const handlePointerLeave = useCallback((): void => {
    setHoverFrac(null)
  }, [])

  // Auto-clear hover preview if the component unmounts while hovering.
  useEffect(() => (): void => setHoverFrac(null), [])

  const activeStartPct = activeStartFrac * 100
  const activeWidthPct = Math.max(0.5, (activeEndFrac - activeStartFrac) * 100)
  const hoverPct = hoverFrac !== null ? hoverFrac * 100 : null

  return (
    <div
      ref={trackRef}
      className={styles.track}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      role="slider"
      aria-label="Scroll position"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(activeStartFrac * 100)}
      data-testid="scroll-meter"
      data-dragging={isDragging || undefined}
    >
      {/* Background bars — full meter, density-mapped, always pulsing */}
      <div className={styles.bars} aria-hidden="true">
        {heights.map((h, i) => {
          const fillFrac = i / Math.max(1, BAR_COUNT - 1)
          const isActive = fillFrac >= activeStartFrac && fillFrac <= activeEndFrac
          const style: CSSProperties = {
            height: `${(h * 100).toFixed(1)}%`,
            ['--bar-i' as string]: i,
          }
          return (
            <span
              key={i}
              className={styles.bar}
              data-active={isActive}
              style={style}
            />
          )
        })}
      </div>

      {/* Active-region glow — sweeps with scroll, no transition during drag */}
      <div
        className={styles.activeGlow}
        aria-hidden="true"
        data-instant={isDragging || undefined}
        style={{
          left: `${activeStartPct}%`,
          width: `${activeWidthPct}%`,
        }}
      />

      {/* Hover indicator — vertical line where the user is about to jump */}
      {hoverPct !== null && !isDragging && (
        <div
          className={styles.hoverLine}
          aria-hidden="true"
          style={{ left: `${hoverPct}%` }}
        />
      )}
    </div>
  )
}
