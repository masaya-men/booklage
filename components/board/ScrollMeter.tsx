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
// Noise math — Hybrid (Spectrum Synthesis envelope + Per-tick White Noise)
//
// Pure spectral synthesis with a small number of bands (≤30) shows visible
// beats and a recognizably sinusoidal envelope — the wave reads as a smooth
// curve, not as noise. To break that we layer two completely different
// signal generators:
//
//   1. Spectrum component (96 bands)
//      Sum of 96 sinusoids with random phases, log-spaced spatial freqs
//      bounded below Nyquist (no aliasing), independent random time freqs.
//      Amplitude ~ 1/k^0.4 — flatter than pink noise so high-freq bands
//      contribute meaningfully and the envelope doesn't look slow.
//      With 96 closely-spaced bands the inter-band beats average out into
//      apparent randomness rather than visible periodicity.
//
//   2. White-noise fuzz (per-tick, time-varying)
//      Each tick samples a deterministic hash at (i, floor(t * RATE)).
//      Linearly interpolated between consecutive time slices for visual
//      smoothness. Updates at 28 Hz — fast enough that the eye reads it
//      as constant texture, slow enough to avoid strobing artifacts.
//      This is the component that prevents the wave from ever looking
//      sine-like: each tick has its own uncorrelated random trajectory.
//
// Combined 45:55 the result has a continuous flowing envelope (spectrum)
// with dense uncorrelated texture on top (fuzz) — visually indistinguishable
// from a real audio peak meter. tanh soft-clip on the spectrum half keeps
// peaks musical instead of harsh.
// ---------------------------------------------------------------------------

type Band = {
  readonly fSpace: number
  readonly fTime: number
  readonly phase: number
  readonly amp: number
}

const BAND_COUNT = 96

const NOISE_BANDS: ReadonlyArray<Band> = (() => {
  // Deterministic LCG so the pattern is stable across reloads.
  let s = 0xC0FFEE7A | 0
  const rand = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0
    return (s >>> 0) / 4294967296
  }
  const bands: Band[] = []
  // Log-spaced spatial frequencies from 0.008 to 0.42 cycles/tick. All
  // strictly below the Nyquist limit (0.5) — aliasing is mathematically
  // impossible. Period ranges 2.4..125 ticks, covering both macro-envelope
  // and fine texture inside a single integration.
  const F_MIN = 0.008
  const F_MAX = 0.42
  for (let k = 0; k < BAND_COUNT; k++) {
    const fk = (k + 0.5) / BAND_COUNT
    bands.push({
      fSpace: F_MIN * Math.pow(F_MAX / F_MIN, fk),
      // Independent random time frequencies — each band evolves on its own
      // schedule, ensuring no global "breathing" sync between scales.
      fTime: 0.08 + Math.pow(rand(), 0.6) * 2.4,
      phase: rand() * Math.PI * 2,
      // Flatter spectrum (1/k^0.4) than classic pink (1/√k = 1/k^0.5).
      // Gives high-freq bands enough energy that the envelope doesn't read
      // as slow sinusoidal sweeps.
      amp: 1 / Math.pow(k + 1, 0.4),
    })
  }
  return bands
})()

const NOISE_STD = Math.sqrt(
  NOISE_BANDS.reduce((acc, b) => acc + (b.amp * b.amp) / 2, 0),
)

// 32-bit avalanche hash. Each (i, t-bucket) pair maps to an unbiased number
// in [0, 1). Used for the per-tick white-noise fuzz layer.
function hash01(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x9E3779B1)
  h = (h + Math.imul(b | 0, 0x85EBCA77)) | 0
  h = Math.imul(h ^ (h >>> 16), 0x85EBCA77)
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE3D)
  h = h ^ (h >>> 16)
  return (h >>> 0) / 4294967296
}

const FUZZ_RATE_HZ = 28

/**
 * Live scroll-position meter. Two-layer noise model gives a dense, irregular
 * audio-meter feel; a 1px playhead line marks the precise current viewport
 * center, with a tight Gaussian halo around it for soft locality.
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

      // Tight spotlight — a fixed narrow Gaussian centered on the viewport
      // mid-point. Independent of viewport extent so the location indicator
      // stays "thin" even when zoomed-out content is showing.
      const viewportCenterTick = total > 0
        ? ((cy + ch / 2) / total) * (TICK_COUNT - 1)
        : (TICK_COUNT - 1) / 2
      const SPOT_SIGMA = 5

      // Pre-compute fuzz-time-bucket interpolation parameters once per frame
      // so each tick's fuzz lookup costs only two hashes + a lerp.
      const fuzzClockRaw = t * FUZZ_RATE_HZ
      const fuzzIdx = Math.floor(fuzzClockRaw)
      const fuzzPhase = fuzzClockRaw - fuzzIdx

      for (let i = 0; i < TICK_COUNT; i++) {
        const el = tickRefs.current[i]
        if (!el) continue

        // ---- Spectrum layer ----
        let sum = 0
        for (let k = 0; k < BAND_COUNT; k++) {
          const b = NOISE_BANDS[k]
          sum += b.amp * Math.sin(b.fSpace * i + b.fTime * t + b.phase)
        }
        const u = sum / (1.4 * NOISE_STD)
        const u2 = u * u
        // Padé 5/9 tanh approximation — soft-limit peaks without slowing
        // down the inner loop with Math.tanh.
        const spectral = (u * (27 + u2) / (27 + 9 * u2) + 1) / 2 // 0..1

        // ---- White-noise fuzz layer ----
        const fuzzA = hash01(i, fuzzIdx)
        const fuzzB = hash01(i, fuzzIdx + 1)
        const fuzz = fuzzA + (fuzzB - fuzzA) * fuzzPhase

        // 45 % envelope + 55 % uncorrelated fuzz. Power curve crispens peaks.
        const noiseValue = 0.45 * spectral + 0.55 * fuzz
        const heightPx = 1.3 + Math.pow(noiseValue, 0.88) * 15

        // Brightness: tight Gaussian halo. No discrete on/off.
        const dist = i - viewportCenterTick
        const gauss = Math.exp(-(dist * dist) / (2 * SPOT_SIGMA * SPOT_SIGMA))
        const opacity = 0.32 + 0.55 * gauss

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

  const playheadPct = contentHeight > 0
    ? Math.max(0, Math.min(100, ((viewportY + viewportHeight / 2) / contentHeight) * 100))
    : 50
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
        className={styles.playhead}
        aria-hidden="true"
        style={{ left: `${playheadPct}%` }}
      />
      {hoverPct !== null && !isDragging && (
        <div className={styles.hoverLine} aria-hidden="true" style={{ left: `${hoverPct}%` }} />
      )}
    </div>
  )
}
