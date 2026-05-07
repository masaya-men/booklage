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

// ---------------------------------------------------------------------------
// Noise generator — Pure spatial white noise, temporally interpolated
//
// Earlier iterations layered in spectrum synthesis for "envelope" texture,
// but any band-limited spectral component injects visible low-frequency
// structure (≈20-tick undulations from the 1/f-ish slope of the lowest
// bands). White noise sidesteps this entirely:
//
//   - Spatially: each tick samples an independent hash of (i, time-bucket)
//     → the spatial spectrum is flat. No frequency is over-represented, so
//     no wavelength stands out as a "stripe."
//   - Temporally: linear interpolation between consecutive 12 Hz samples
//     gives smooth, calm motion (no flicker, no per-frame jitter).
//
// The "audio meter" feel comes from the spotlight's amplitude modulation —
// the noise's *amplitude* envelope is the Gaussian spotlight itself, so
// outside the active region the meter is nearly flat (tiny ~2 px ticks),
// inside it the noise is fully expressed (up to ~17 px). This gives the
// requested "sharply enlarged spotlight" without busy motion elsewhere.
// ---------------------------------------------------------------------------

// Avalanche hash → [0, 1). xxhash-style mixing on standard 32-bit constants.
function hash01(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x9E3779B1)
  h = (h + Math.imul(b | 0, 0x85EBCA77)) | 0
  h = Math.imul(h ^ (h >>> 16), 0x85EBCA77)
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE3D)
  h = h ^ (h >>> 16)
  return (h >>> 0) / 4294967296
}

const FUZZ_RATE_HZ = 12

/**
 * Live scroll-position meter.
 *
 * Heights are pure interpolated white noise (no spectral component → no
 * residual stripe envelope). Motion is calm everywhere except inside the
 * spotlight, which sharply boosts both amplitude and opacity at the
 * current viewport center. Two thin bookend lines mark the viewport's
 * active range edges; they clamp to the meter ends when scrolled to top
 * or bottom.
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
    const start = performance.now()
    const loop = (): void => {
      const t = (performance.now() - start) / 1000
      const cy = viewportYRef.current
      const ch = viewportHRef.current
      const total = contentHRef.current

      const viewportCenterTick = total > 0
        ? ((cy + ch / 2) / total) * (TICK_COUNT - 1)
        : (TICK_COUNT - 1) / 2
      // Sharp narrow spotlight — sigma chosen so the bright zone reads as
      // a focused indicator rather than a diffuse glow. The amplitude
      // multiplier (below) accents this further.
      const SPOT_SIGMA = 5.5
      const TWO_SIG2 = 2 * SPOT_SIGMA * SPOT_SIGMA

      // Per-frame fuzz interpolation parameters.
      const fuzzClockRaw = t * FUZZ_RATE_HZ
      const fuzzIdx = Math.floor(fuzzClockRaw)
      const fuzzPhase = fuzzClockRaw - fuzzIdx

      for (let i = 0; i < TICK_COUNT; i++) {
        const el = tickRefs.current[i]
        if (!el) continue

        // Spotlight: Gaussian centered on viewport mid. Drives both
        // amplitude (height range) and opacity (brightness).
        const dist = i - viewportCenterTick
        const spot = Math.exp(-(dist * dist) / TWO_SIG2)

        // Per-tick interpolated white noise. Two hashes + lerp per frame.
        const a = hash01(i, fuzzIdx)
        const b = hash01(i, fuzzIdx + 1)
        const noise = a + (b - a) * fuzzPhase

        // Amplitude modulated by spotlight: ~2 px outside (calm), up to
        // ~17 px inside (vivid). The crisp transition is what makes the
        // active position read as "sharply enlarged."
        const amp = 2 + 15 * spot
        const heightPx = 1 + Math.pow(noise, 0.85) * amp

        // Opacity also scales with spotlight so the active region is
        // genuinely brighter, not just taller.
        const opacity = 0.28 + 0.62 * spot

        el.style.height = `${heightPx.toFixed(1)}px`
        el.style.opacity = opacity.toFixed(3)
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

  // Active range bookends — two 1px lines at the viewport's start and end
  // fractions. Clamp to [0, 100] so they hug the meter edges when the user
  // is scrolled all the way to the top or bottom.
  const activeStartPct = contentHeight > 0
    ? Math.max(0, Math.min(100, (viewportY / contentHeight) * 100))
    : 0
  const activeEndPct = contentHeight > 0
    ? Math.max(0, Math.min(100, ((viewportY + viewportHeight) / contentHeight) * 100))
    : 100
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
      <div
        className={styles.bookend}
        aria-hidden="true"
        style={{ left: `${activeStartPct}%` }}
      />
      <div
        className={styles.bookend}
        aria-hidden="true"
        style={{ left: `${activeEndPct}%` }}
      />
      {hoverPct !== null && !isDragging && (
        <div className={styles.hoverLine} aria-hidden="true" style={{ left: `${hoverPct}%` }} />
      )}
    </div>
  )
}
