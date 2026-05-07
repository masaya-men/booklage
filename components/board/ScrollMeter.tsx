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

const TICK_COUNT = 140

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

/**
 * Live scroll-position meter. Modeled on the LightboxNavMeter:
 * 1px ticks across a thin baseline, heights driven by a rAF loop that
 * superposes three sinusoids for an "audio waveform" feel, modulated by
 * card density per band, with a Gaussian swell over the active viewport
 * range and a periodic burst pulse that sweeps the meter left-to-right
 * for visual energy. Click / drag the track to scroll-jump.
 */
export function ScrollMeter({
  cards,
  contentHeight,
  viewportY,
  viewportHeight,
  onScrollTo,
}: Props): ReactElement {
  const trackRef = useRef<HTMLDivElement>(null)
  const tickRefs = useRef<HTMLDivElement[]>([])

  // rAF-loop reads these refs each frame so updates from React renders
  // (scroll position, density) are picked up without restarting the loop.
  const viewportYRef = useRef<number>(viewportY)
  const viewportHRef = useRef<number>(viewportHeight)
  const contentHRef = useRef<number>(contentHeight)
  const densityRef = useRef<ReadonlyArray<number>>([])
  const activeRangeRef = useRef<{ start: number; end: number }>({ start: 0, end: 1 })

  useEffect(() => { viewportYRef.current = viewportY }, [viewportY])
  useEffect(() => { viewportHRef.current = viewportHeight }, [viewportHeight])
  useEffect(() => { contentHRef.current = contentHeight }, [contentHeight])

  const [hoverFrac, setHoverFrac] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Density per tick band — recomputed only when layout changes.
  const density = useMemo<ReadonlyArray<number>>(() => {
    if (contentHeight <= 0 || cards.length === 0) {
      return new Array(TICK_COUNT).fill(0.5)
    }
    const bandH = contentHeight / TICK_COUNT
    const counts: number[] = new Array(TICK_COUNT).fill(0)
    for (const c of cards) {
      const start = Math.max(0, Math.floor(c.y / bandH))
      const end = Math.min(TICK_COUNT - 1, Math.floor((c.y + c.h) / bandH))
      for (let i = start; i <= end; i++) counts[i] += 1
    }
    const max = counts.reduce((m, c) => (c > m ? c : m), 0)
    if (max === 0) return new Array(TICK_COUNT).fill(0.5)
    return counts.map((c) => 0.35 + 0.65 * (c / max))
  }, [cards, contentHeight])

  useEffect(() => {
    densityRef.current = density
  }, [density])

  // Compute the integer tick range that falls within the current viewport.
  // Triggers React re-render so the active-range edge lines + tick color
  // update on scroll. (rAF handles tick *heights*, not class updates.)
  const activeStartTick = useMemo(() => {
    if (contentHeight <= 0) return 0
    return Math.max(0, Math.floor((viewportY / contentHeight) * TICK_COUNT))
  }, [viewportY, contentHeight])
  const activeEndTick = useMemo(() => {
    if (contentHeight <= 0) return TICK_COUNT - 1
    return Math.min(
      TICK_COUNT - 1,
      Math.floor(((viewportY + viewportHeight) / contentHeight) * TICK_COUNT),
    )
  }, [viewportY, viewportHeight, contentHeight])

  useEffect(() => {
    activeRangeRef.current = { start: activeStartTick, end: activeEndTick }
  }, [activeStartTick, activeEndTick])

  // The single rAF loop. Mounts once; reads everything from refs.
  useEffect(() => {
    // Burst: every BURST_PERIOD a Gaussian wave sweeps left-to-right.
    // Wraps around the cycle so it's always either traveling or resting.
    const BURST_PERIOD_MS = 5400
    const BURST_TRAVEL_MS = 1100
    let raf = 0
    const start = performance.now()

    const loop = (): void => {
      const now = performance.now()
      const t = (now - start) / 1000

      const cy = viewportYRef.current
      const ch = viewportHRef.current
      const total = contentHRef.current
      const dens = densityRef.current
      const range = activeRangeRef.current
      const swellCenter = total > 0
        ? ((cy + ch / 2) / total) * (TICK_COUNT - 1)
        : (TICK_COUNT - 1) / 2
      const swellSigma = TICK_COUNT / 14
      const swellGain = 1.6

      const burstPhase = (now - start) % BURST_PERIOD_MS
      const burstActive = burstPhase < BURST_TRAVEL_MS
      const burstCenter = burstActive
        ? (burstPhase / BURST_TRAVEL_MS) * (TICK_COUNT + 14) - 7
        : -1000
      const burstSigma = TICK_COUNT / 22
      const burstGain = 2.6

      for (let i = 0; i < TICK_COUNT; i++) {
        const el = tickRefs.current[i]
        if (!el) continue

        // Three superposed sinusoids — low/mid/high — for the audio-waveform
        // feel. Phase-shifted per tick so the wave shimmers across the bar.
        const w1 = Math.sin(t * 0.7 + i * 0.09) * 0.42
        const w2 = Math.sin(t * 1.9 + i * 0.27) * 0.30
        const w3 = Math.sin(t * 4.6 + i * 0.81) * 0.16
        const norm = (w1 + w2 + w3 + 0.88) / 1.76 // → 0..1 roughly
        const baseH = 2 + norm * 7

        // Density factor: dense bands are visibly taller (1.0..1.55x).
        const d = dens[i] ?? 0.5
        const densityFactor = 0.85 + 0.55 * d

        // Active-region Gaussian swell — the meter "knows" where you are.
        const distSwell = i - swellCenter
        const swell = 1
          + swellGain * Math.exp(-(distSwell * distSwell) / (2 * swellSigma * swellSigma))

        // Travelling burst — every BURST_PERIOD a tall narrow Gaussian
        // sweeps left-to-right. Adds visual energy; reads as a "scan."
        const distBurst = i - burstCenter
        const burst = burstActive
          ? burstGain * Math.exp(-(distBurst * distBurst) / (2 * burstSigma * burstSigma))
          : 0

        const h = baseH * densityFactor * swell + burst * 5
        el.style.height = `${Math.max(1, h).toFixed(1)}px`

        // Active range: brighter ticks within the current viewport. Plain
        // class swap is too costly per-frame; toggle data-attr instead so
        // CSS can style it (the integer range comes from React state and
        // is updated only on scroll).
        const inRange = i >= range.start && i <= range.end
        if ((el.dataset.active === 'true') !== inRange) {
          el.dataset.active = inRange ? 'true' : 'false'
        }
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

  const activeStartPct = (activeStartTick / Math.max(1, TICK_COUNT - 1)) * 100
  const activeEndPct = (activeEndTick / Math.max(1, TICK_COUNT - 1)) * 100
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
      {/* Faint horizontal baseline that the ticks straddle. */}
      <div className={styles.baseline} aria-hidden="true" />

      {/* 1px ticks. Heights are rewritten every frame by the rAF loop. */}
      {ticks.map((i) => (
        <div
          key={i}
          ref={(el): void => {
            if (el) tickRefs.current[i] = el
          }}
          className={styles.tick}
          data-active="false"
          style={{ left: `${(i / (TICK_COUNT - 1)) * 100}%` }}
        />
      ))}

      {/* Active range edge lines — 1px vertical bookends marking viewport. */}
      <div
        className={styles.edge}
        aria-hidden="true"
        data-instant={isDragging || undefined}
        style={{ left: `${activeStartPct}%` }}
      />
      <div
        className={styles.edge}
        aria-hidden="true"
        data-instant={isDragging || undefined}
        style={{ left: `${activeEndPct}%` }}
      />

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
