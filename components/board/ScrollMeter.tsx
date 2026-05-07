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
// Noise math
//
// We want the meter to read like a real noise waveform: dense, multi-scale,
// natural-looking, without periodic artifacts. Standard solution is fractal
// Brownian motion (fBm) over value noise.
//
//   1. value noise: bilinear interpolation of deterministic per-lattice
//      hashes, smoothed with a smoothstep curve. Continuous, locally
//      smooth, but globally random.
//   2. fBm: sum of N octaves of value noise at increasing frequencies and
//      decreasing amplitudes. With persistence ~0.55 and lacunarity ~2.05
//      the resulting spectrum approximates 1/f^0.85 — close to pink noise,
//      which is the spectral signature of real-world signals (audio, EEG,
//      ocean waves, river flow). This is why it "looks alive."
// ---------------------------------------------------------------------------

function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return ((h >>> 0) % 1024) / 1023
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

function valueNoise2D(x: number, y: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = smoothstep(x - x0)
  const fy = smoothstep(y - y0)
  const v00 = hash2(x0, y0)
  const v10 = hash2(x0 + 1, y0)
  const v01 = hash2(x0, y0 + 1)
  const v11 = hash2(x0 + 1, y0 + 1)
  const a = v00 + (v10 - v00) * fx
  const b = v01 + (v11 - v01) * fx
  return a + (b - a) * fy
}

function fBm(
  x: number,
  y: number,
  octaves = 5,
  persistence = 0.55,
  lacunarity = 2.05,
): number {
  let sum = 0
  let amp = 1
  let freq = 1
  let total = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2D(x * freq, y * freq)
    total += amp
    freq *= lacunarity
    amp *= persistence
  }
  return sum / total
}

/**
 * Live scroll-position meter.
 *
 * Tick heights are driven by 5-octave fBm noise (≈ pink-noise spectrum) so
 * the waveform reads as natural, dense, and aperiodic — none of the obvious
 * sinusoidal "stripes" you get from sin-stack approaches. Global amplitude
 * also breathes via a low-frequency fBm so intensity rises and falls
 * organically over time without scheduled bursts.
 *
 * Brightness is a smooth Gaussian spotlight centered on the current viewport
 * — no per-tick boolean active/inactive (which created visible stripe edges
 * at the boundary). Sigma scales with viewport extent so a small viewport
 * shows a tight bright peak and a large viewport shows a broader glow.
 *
 * Click or drag the track to scroll-jump.
 */
export function ScrollMeter({
  contentHeight,
  viewportY,
  viewportHeight,
  onScrollTo,
}: Props): ReactElement {
  const trackRef = useRef<HTMLDivElement>(null)
  const tickRefs = useRef<HTMLDivElement[]>([])

  // The rAF loop reads these refs each frame. No restart on scroll.
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

      // Spotlight center + sigma. Sigma scales with viewport extent so the
      // bright region is "viewport-shaped" — small viewport → tight peak,
      // big viewport → broader glow. Capped to avoid the spotlight ever
      // washing the entire meter (which would defeat the locality cue).
      const viewportCenterTick = total > 0
        ? ((cy + ch / 2) / total) * (TICK_COUNT - 1)
        : (TICK_COUNT - 1) / 2
      const viewportTickSpan = total > 0
        ? (ch / total) * TICK_COUNT
        : TICK_COUNT
      const sigma = Math.max(5, Math.min(TICK_COUNT / 3, viewportTickSpan * 0.45))

      // Global amplitude "breath" — slow low-freq fBm sample at constant x.
      // Range ~0.65..1.35; produces natural rise-and-fall in overall waveform
      // intensity without scheduled events. This is what gives the meter
      // its "occasionally more intense" feel without being obviously cyclic.
      const breath = 0.65 + 0.7 * fBm(7.13, t * 0.18, 3, 0.6, 2.0)

      for (let i = 0; i < TICK_COUNT; i++) {
        const el = tickRefs.current[i]
        if (!el) continue

        // 5-octave fBm — natural pink-noise-ish waveform.
        // Space coord = tick index; time coord = elapsed seconds.
        const noise = fBm(i * 0.16, t * 0.42, 5)

        // Mild gamma curve so peaks read crisply against the baseline.
        const shaped = Math.pow(noise, 0.82)
        const heightPx = 1.4 + shaped * 14 * breath

        // Gaussian opacity. Single peak at viewport center, smooth fall-off.
        // Floor at 0.22 so the rest of the meter is still legible.
        const dist = i - viewportCenterTick
        const gauss = Math.exp(-(dist * dist) / (2 * sigma * sigma))
        const opacity = 0.22 + 0.78 * gauss

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
