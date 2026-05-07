'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactElement,
} from 'react'
import styles from './ScrollMeter.module.css'

/** Match LightboxNavMeter so the two meters read as a matched set. */
const TICK_COUNT = 150

type Props = {
  /** Total scrollable content height of the board (cards + padding). */
  readonly contentHeight: number
  /** Current viewport y offset within the board's coordinate space. */
  readonly viewportY: number
  /** Visible viewport height. */
  readonly viewportHeight: number
  /** Scroll the board to the given y (called on click / drag). */
  readonly onScrollTo: (y: number) => void
}

/**
 * Live scroll-position meter — direct port of `LightboxNavMeter`'s waveform
 * algorithm, adapted to drive its swell from the board's scroll position
 * instead of the active card index.
 *
 * Three superposed sinusoids per tick (low / mid / high frequency, each
 * phase-shifted per tick index) give an audio-waveform "音の波形" feel.
 * On top, a localized Gaussian amplitude swell centered on the current
 * scroll fraction makes the meter "notice" itself there — the swell IS
 * the position indicator (no separate playhead or bookend lines needed).
 *
 * Track and ticks visually mirror the lightbox meter: faint 1px baseline,
 * 1px tick columns at uniform white 0.55 opacity, swell amplitude scaled
 * up to 3.4× the base height at the spot center.
 */
export function ScrollMeter({
  contentHeight,
  viewportY,
  viewportHeight,
  onScrollTo,
}: Props): ReactElement {
  const trackRef = useRef<HTMLDivElement>(null)
  const tickRefs = useRef<HTMLDivElement[]>([])

  const viewportYRef = useRef<number>(viewportY)
  const viewportHRef = useRef<number>(viewportHeight)
  const contentHRef = useRef<number>(contentHeight)
  useEffect(() => { viewportYRef.current = viewportY }, [viewportY])
  useEffect(() => { viewportHRef.current = viewportHeight }, [viewportHeight])
  useEffect(() => { contentHRef.current = contentHeight }, [contentHeight])

  const [hoverFrac, setHoverFrac] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    let raf = 0
    const loop = (): void => {
      const t = performance.now() / 1000
      const cy = viewportYRef.current
      const ch = viewportHRef.current
      const total = contentHRef.current

      // Map scroll fraction to a tick index. When at top (cy=0) the swell
      // sits at tick 0 (left edge). When at bottom (cy=scrollableMax) it
      // sits at the last tick (right edge). Removes the "indicator never
      // reaches the edge" issue from the previous viewport-center mapping.
      const scrollableH = Math.max(0, total - ch)
      const fraction = scrollableH > 0 ? cy / scrollableH : 0
      const centerTickIdx = fraction * (TICK_COUNT - 1)

      // Lightbox parameters, verbatim. The narrow sigma + tall gain reads
      // as a sharp spike at the active position — the meter "noticing"
      // itself there.
      const swellSigma = TICK_COUNT / 32
      const swellGain = 3.4

      for (let i = 0; i < TICK_COUNT; i++) {
        const el = tickRefs.current[i]
        if (!el) continue

        // Three superposed sinusoids — low / mid / high frequency — phase-
        // shifted per tick index. The result is a flowing aperiodic
        // waveform with audio-waveform character.
        const w1 = Math.sin(t * 0.6 + i * 0.08) * 0.45
        const w2 = Math.sin(t * 1.7 + i * 0.31) * 0.30
        const w3 = Math.sin(t * 4.2 + i * 0.93) * 0.15
        const norm = (w1 + w2 + w3 + 0.9) / 1.8 // → 0..1-ish
        const baseH = 2 + norm * 8

        // Gaussian amplitude swell at the current scroll position.
        const dist = i - centerTickIdx
        const swell = 1
          + swellGain * Math.exp(-(dist * dist) / (2 * swellSigma * swellSigma))

        const h = baseH * swell
        el.style.height = `${Math.max(1, h).toFixed(1)}px`
      }

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return (): void => cancelAnimationFrame(raf)
  }, [])

  const fracFromPointer = useCallback((clientX: number): number => {
    const el = trackRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    if (rect.width === 0) return 0
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }, [])

  const scrollableHeight = Math.max(0, contentHeight - viewportHeight)

  const scrollToFrac = useCallback((frac: number): void => {
    onScrollTo(Math.max(0, frac * scrollableHeight))
  }, [onScrollTo, scrollableHeight])

  const handlePointerDown = useCallback((e: PointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    const el = trackRef.current
    if (!el) return
    if (typeof el.setPointerCapture === 'function') el.setPointerCapture(e.pointerId)
    setIsDragging(true)
    scrollToFrac(fracFromPointer(e.clientX))
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

  useEffect(() => (): void => setHoverFrac(null), [])

  const hoverPct = hoverFrac !== null ? hoverFrac * 100 : null
  const ticks = useMemo(() => Array.from({ length: TICK_COUNT }, (_, i) => i), [])

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
      aria-valuenow={Math.round((scrollableHeight > 0 ? viewportY / scrollableHeight : 0) * 100)}
      data-testid="scroll-meter"
      data-dragging={isDragging || undefined}
    >
      <div className={styles.baseline} aria-hidden="true" />
      {ticks.map((i) => (
        <div
          key={i}
          ref={(el): void => { if (el) tickRefs.current[i] = el }}
          className={styles.tick}
          style={{ left: `${(i / (TICK_COUNT - 1)) * 100}%` }}
        />
      ))}
      {hoverPct !== null && !isDragging && (
        <div className={styles.hoverLine} aria-hidden="true" style={{ left: `${hoverPct}%` }} />
      )}
    </div>
  )
}
