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

/** D ハイブリッド scramble windows (spec §1-2): the visible-range numerals
 *  flicker for 600ms after a change, total flickers for 1500ms — long
 *  enough for the eye to read "total count is the most important number". */
const SCRAMBLE_MS_RANGE = 600
const SCRAMBLE_MS_TOTAL = 1500

/** Per-frame ±1 micro-jitter probability on the settled values. The total
 *  number jitters slightly more than the range numbers (spec §1-2). */
const JITTER_PROB_RANGE = 0.06
const JITTER_PROB_TOTAL = 0.10

type Props = {
  /** Total scrollable content height of the board (cards + padding). */
  readonly contentHeight: number
  /** Current viewport y offset within the board's coordinate space. */
  readonly viewportY: number
  /** Visible viewport height. */
  readonly viewportHeight: number
  /** Scroll the board to the given y (called on click / drag). */
  readonly onScrollTo: (y: number) => void
  /** First visible card index (1-based) for the counter readout.
   *  0 when there are no cards. */
  readonly visibleRangeStart: number
  /** Last visible card index (1-based). 0 when no cards. */
  readonly visibleRangeEnd: number
  /** Total card count for the counter readout. */
  readonly totalCount: number
  /** Fade the meter out (opacity 0 + pointer-events none) while the
   *  Lightbox is open — LightboxNavMeter occupies the same pixel spot,
   *  so this lets the two meters cleanly "swap". */
  readonly hidden?: boolean
}

function pad4(n: number): string {
  return Math.max(0, Math.min(9999, Math.floor(n))).toString().padStart(4, '0')
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
 * Counter readout stacks above the waveform, mirroring the LightboxNavMeter
 * `meterStack` layout. Range numbers (N1, N2) scramble for 600ms after a
 * change; the total scrambles for 1500ms (it's the headline number — gets
 * the longest read time). Both jitter slightly even when settled so the
 * meter feels alive. Critically, the waveform swell IGNORES the scrambled
 * values entirely (uses scroll fraction) — the spec calls for the
 * "数字は うるさい / 波形は 静か" split so motion stays legible.
 */
export function ScrollMeter({
  contentHeight,
  viewportY,
  viewportHeight,
  onScrollTo,
  visibleRangeStart,
  visibleRangeEnd,
  totalCount,
  hidden,
}: Props): ReactElement {
  const trackRef = useRef<HTMLDivElement>(null)
  const tickRefs = useRef<HTMLDivElement[]>([])
  const n1Ref = useRef<HTMLSpanElement>(null)
  const n2Ref = useRef<HTMLSpanElement>(null)
  const totalSpanRef = useRef<HTMLSpanElement>(null)

  const viewportYRef = useRef<number>(viewportY)
  const viewportHRef = useRef<number>(viewportHeight)
  const contentHRef = useRef<number>(contentHeight)
  useEffect(() => { viewportYRef.current = viewportY }, [viewportY])
  useEffect(() => { viewportHRef.current = viewportHeight }, [viewportHeight])
  useEffect(() => { contentHRef.current = contentHeight }, [contentHeight])

  // Settled values + scramble deadlines for the counter rAF loop. The loop
  // reads these refs every frame — React state would cause re-renders,
  // which is exactly what we don't want for a 60Hz number display.
  const n1SettledRef = useRef<number>(visibleRangeStart)
  const n2SettledRef = useRef<number>(visibleRangeEnd)
  const totalSettledRef = useRef<number>(totalCount)
  const n1ScrambleUntilRef = useRef<number>(0)
  const n2ScrambleUntilRef = useRef<number>(0)
  const totalScrambleUntilRef = useRef<number>(0)

  useEffect(() => {
    if (visibleRangeStart !== n1SettledRef.current) {
      n1SettledRef.current = visibleRangeStart
      n1ScrambleUntilRef.current = performance.now() + SCRAMBLE_MS_RANGE
    }
  }, [visibleRangeStart])
  useEffect(() => {
    if (visibleRangeEnd !== n2SettledRef.current) {
      n2SettledRef.current = visibleRangeEnd
      n2ScrambleUntilRef.current = performance.now() + SCRAMBLE_MS_RANGE
    }
  }, [visibleRangeEnd])
  useEffect(() => {
    if (totalCount !== totalSettledRef.current) {
      totalSettledRef.current = totalCount
      totalScrambleUntilRef.current = performance.now() + SCRAMBLE_MS_TOTAL
    }
  }, [totalCount])

  const [hoverFrac, setHoverFrac] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    let raf = 0
    const loop = (): void => {
      const now = performance.now()
      const t = now / 1000
      const cy = viewportYRef.current
      const ch = viewportHRef.current
      const total = contentHRef.current

      // ---- Waveform swell driven by scroll fraction (spec §1-1: do not
      // change this calc — the waveform stays calm while the numbers
      // scramble, that contrast is the whole point of the design). ----
      const scrollableH = Math.max(0, total - ch)
      const fraction = scrollableH > 0 ? cy / scrollableH : 0
      const centerTickIdx = fraction * (TICK_COUNT - 1)

      const swellSigma = TICK_COUNT / 32
      const swellGain = 3.4

      for (let i = 0; i < TICK_COUNT; i++) {
        const el = tickRefs.current[i]
        if (!el) continue

        const w1 = Math.sin(t * 0.6 + i * 0.08) * 0.45
        const w2 = Math.sin(t * 1.7 + i * 0.31) * 0.30
        const w3 = Math.sin(t * 4.2 + i * 0.93) * 0.15
        const norm = (w1 + w2 + w3 + 0.9) / 1.8 // → 0..1-ish
        const baseH = 2 + norm * 8

        const dist = i - centerTickIdx
        const swell = 1
          + swellGain * Math.exp(-(dist * dist) / (2 * swellSigma * swellSigma))

        const h = baseH * swell
        el.style.height = `${Math.max(1, h).toFixed(1)}px`
      }

      // ---- Counter scramble + micro-jitter ----
      const writeDigit = (
        node: HTMLSpanElement | null,
        settled: number,
        scrambleUntil: number,
        jitterProb: number,
      ): void => {
        if (!node) return
        let value: number
        if (now < scrambleUntil) {
          value = Math.floor(Math.random() * 10000)
        } else if (Math.random() < jitterProb) {
          const delta = Math.random() < 0.5 ? -1 : 1
          value = Math.max(0, settled + delta)
        } else {
          value = settled
        }
        node.textContent = pad4(value)
      }
      writeDigit(n1Ref.current, n1SettledRef.current, n1ScrambleUntilRef.current, JITTER_PROB_RANGE)
      writeDigit(n2Ref.current, n2SettledRef.current, n2ScrambleUntilRef.current, JITTER_PROB_RANGE)
      writeDigit(totalSpanRef.current, totalSettledRef.current, totalScrambleUntilRef.current, JITTER_PROB_TOTAL)

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

  const wrapClassName = hidden
    ? `${styles.meterWrap} ${styles.hidden}`
    : styles.meterWrap

  return (
    <div className={wrapClassName} aria-hidden={hidden ? 'true' : undefined}>
      <div className={styles.meterStack}>
        <div className={styles.meterCounter} aria-hidden="true">
          <span className={styles.meterBracket}>[</span>
          {' '}
          <span ref={n1Ref}>{pad4(visibleRangeStart)}</span>
          {' '}
          <span className={styles.meterDim}>—</span>
          {' '}
          <span ref={n2Ref}>{pad4(visibleRangeEnd)}</span>
          {' '}
          <span className={styles.meterDim}>/</span>
          {' '}
          <span ref={totalSpanRef}>{pad4(totalCount)}</span>
          {' '}
          <span className={styles.meterBracket}>]</span>
        </div>
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
      </div>
    </div>
  )
}
