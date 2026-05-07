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
// Noise math — Spectrum Synthesis Method
//
// Earlier attempts used grid-based fractal noise (value noise + fBm). At our
// sample rate (140 1px ticks) the upper octaves alias below Nyquist and the
// hash function leaks correlation between adjacent integer lattice points,
// producing visible regular stripes. Spectrum synthesis avoids both:
//
//   - Sum N sinusoids with **random** spatial freq, time freq, and phase
//   - Spatial freqs are bounded **below** Nyquist (0.5 cycles/sample) so
//     aliasing is mathematically impossible
//   - Random phases at irrational frequency ratios → truly aperiodic output
//   - Amplitudes follow 1/√k → pink-noise spectrum (the spectrum of audio,
//     EEG, ocean waves — i.e., the spectrum that "looks natural")
//   - Central Limit Theorem: a sum of many independent sinusoids approaches
//     a Gaussian distribution, which we soft-clip with tanh to compress the
//     rare large peaks while preserving mid-range texture. This is exactly
//     how broadcast audio limiters work, and gives us "occasionally more
//     intense" peaks for free without scheduled events.
// ---------------------------------------------------------------------------

type Band = {
  readonly fSpace: number
  readonly fTime: number
  readonly phase: number
  readonly amp: number
}

const NOISE_BANDS: ReadonlyArray<Band> = (() => {
  // Deterministic LCG so the pattern is stable across reloads (no jitter
  // between dev/prod, no per-session re-seeding).
  let s = 0xC0FFEE7A | 0
  const rand = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0
    return (s >>> 0) / 4294967296
  }
  const N = 26
  const bands: Band[] = []
  for (let k = 0; k < N; k++) {
    const fk = (k + 1) / N
    bands.push({
      // Spatial freq spread: 0.02..0.42 cycles/tick.
      // Period at low end = 50 ticks (macro envelope), at high end = 2.4
      // ticks (texture). Stays strictly below Nyquist (0.5) → no aliasing.
      fSpace: 0.02 + Math.pow(fk, 1.25) * 0.40,
      // Time freq spread: 0.12..1.6 rad/sec independently random per band
      // so different scales evolve at different rates — gives the meter
      // its "non-uniform" feel.
      fTime: 0.12 + Math.pow(rand(), 0.7) * 1.48,
      // Random phase guarantees aperiodicity in space.
      phase: rand() * Math.PI * 2,
      // Pink-ish: 1/√(k+1) → -3dB/octave (close to 1/f).
      amp: 1 / Math.sqrt(k + 1),
    })
  }
  return bands
})()

// Stddev of the sum (used to normalize the tanh argument). For independent
// random-phase sinusoids, Var(Σ amp_i sin(...)) = ½ Σ amp_i².
const NOISE_STD = Math.sqrt(
  NOISE_BANDS.reduce((acc, b) => acc + (b.amp * b.amp) / 2, 0),
)

function spectralNoise(x: number, t: number): number {
  let sum = 0
  for (const b of NOISE_BANDS) {
    sum += b.amp * Math.sin(b.fSpace * x + b.fTime * t + b.phase)
  }
  // tanh soft-clip via 5/9 Padé approximation (faster than Math.tanh,
  // shape is indistinguishable for our visual purposes). 1.35 * stddev is
  // chosen so most values map into tanh's near-linear range while peaks
  // smoothly compress — feel of an audio limiter.
  const u = sum / (1.35 * NOISE_STD)
  const u2 = u * u
  const tanh = u * (27 + u2) / (27 + 9 * u2)
  return (tanh + 1) / 2 // → 0..1
}

/**
 * Live scroll-position meter. Heights driven by Spectrum Synthesis
 * (random-phase sinusoid sum) for true aperiodic pink noise. Brightness is
 * a smooth Gaussian centered on the current viewport — single bright spot,
 * no discrete on/off boundary.
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
      const viewportTickSpan = total > 0
        ? (ch / total) * TICK_COUNT
        : TICK_COUNT
      const sigma = Math.max(5, Math.min(TICK_COUNT / 3, viewportTickSpan * 0.45))

      for (let i = 0; i < TICK_COUNT; i++) {
        const el = tickRefs.current[i]
        if (!el) continue

        // Spectral pink noise at this tick's space/time coordinates. Output
        // is in 0..1 with rare excursions toward the edges; the soft-clip
        // already shaped the distribution to feel "audio-like".
        const noise = spectralNoise(i, t)

        // Gentle gamma curve to crisp peaks while retaining floor.
        const heightPx = 1.4 + Math.pow(noise, 0.85) * 14.5

        // Brightness: smooth Gaussian centered on viewport position. No
        // boolean active/inactive (which created visible stripe edges).
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
