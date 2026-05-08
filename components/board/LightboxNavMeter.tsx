'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactElement,
} from 'react'
import styles from './Lightbox.module.css'

type Props = {
  readonly current: number
  readonly total: number
  /** Stable per-card identity, currently used only as a render key. */
  readonly cardKey: string
  /** Snap-jump to a specific card index when the user releases a scrub. */
  readonly onJump?: (index: number) => void
  /** When true, render the meter even with total ≤ 1 (single-card decks).
   *  Default false: the Lightbox itself hides the meter when there's
   *  nothing to navigate. PiP overrides this so the meter stays visible
   *  as part of the always-on bottom chrome regardless of card count. */
  readonly alwaysShow?: boolean
}

function pad4(n: number): string {
  return Math.max(0, Math.min(9999, Math.floor(n))).toString().padStart(4, '0')
}

/** Number of tick marks rendered on the ruler. Decoupled from `total` —
 *  the meter is a pure visual waveform, with current-card position shown
 *  as a localized amplitude swell on top of the global flow. */
const TICK_COUNT = 150

/** Counter slot-machine animation duration on card change. */
const COUNTER_ANIM_MS = 600

/** Spring stiffness driving the swell-position chase between cards. With
 *  critical damping (DAMPING = 2√k) settle time ≈ 4/√k ≈ 225 ms — snappy
 *  enough to feel direct on a single ±1 card move, slow enough to read as
 *  a deliberate slide rather than a discrete jump. */
const SWELL_STIFFNESS = 320
const SWELL_DAMPING = 2 * Math.sqrt(SWELL_STIFFNESS)

export function LightboxNavMeter({ current, total, onJump, alwaysShow }: Props): ReactElement | null {
  const trackRef = useRef<HTMLDivElement>(null)
  const tickRefs = useRef<HTMLDivElement[]>([])
  const counterRef = useRef<HTMLSpanElement>(null)

  // Refs that the rAF loop reads each frame. Updates here never trigger
  // React re-renders, so layout stays perfectly stable.
  const currentRef = useRef<number>(current)
  const totalRef = useRef<number>(total)
  const animUntilRef = useRef<number>(0)

  // ---- Smooth swell position ----
  // `displayedTickIdx` is what the rAF actually renders. It springs
  // toward the current card's tick index so a card change reads as a
  // smooth slide instead of a hard jump.
  const displayedTickIdxRef = useRef<number>(0)
  const swellVelRef = useRef<number>(0)
  const lastFrameTimeRef = useRef<number>(0)

  // ---- Drag scrubbing ----
  // While dragging, the swell tracks the pointer 1:1 (no spring lag) AND
  // the lightbox content live-flips through cards as the scrub crosses
  // card-index boundaries — feels like rapidly leafing through pages.
  const scrubTickIdxRef = useRef<number | null>(null)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const onJumpRef = useRef<typeof onJump>(onJump)
  useEffect(() => { onJumpRef.current = onJump }, [onJump])

  // Initialize displayed swell to match the first `current` so we don't
  // animate in from tick 0 on mount.
  useEffect(() => {
    const cur = currentRef.current
    const tot = totalRef.current
    displayedTickIdxRef.current = tot > 1
      ? (cur / (tot - 1)) * (TICK_COUNT - 1)
      : (TICK_COUNT - 1) / 2
  }, [])

  // On card change: kick off the counter scramble animation; the swell
  // will smoothly spring to its new target via the rAF loop.
  useEffect(() => {
    currentRef.current = current
    totalRef.current = total
    animUntilRef.current = performance.now() + COUNTER_ANIM_MS
  }, [current, total])

  // Single rAF loop drives both the waveform and the counter text.
  useEffect(() => {
    let raf = 0
    const loop = (): void => {
      const now = performance.now()
      const t = now / 1000
      const cur = currentRef.current
      const tot = totalRef.current

      // ---- Determine swell center this frame ----
      const scrubTick = scrubTickIdxRef.current
      let centerTickIdx: number
      if (scrubTick !== null) {
        // Drag mode: pointer is the source of truth, snap displayed
        // directly to it (no spring) for ばらばらばら 1:1 follow.
        displayedTickIdxRef.current = scrubTick
        swellVelRef.current = 0
        lastFrameTimeRef.current = 0
        centerTickIdx = scrubTick

        // Live page-flip: as the scrub crosses card-index boundaries we
        // immediately commit a jump so the lightbox content tracks the
        // pointer in real-time (a "rapid leafing through pages" feel).
        // Throttled to once-per-frame (rAF rate) so we don't fire hundreds
        // of React updates per second on a fast flick.
        if (onJumpRef.current && tot > 1) {
          const cardIdx = Math.max(
            0,
            Math.min(
              tot - 1,
              Math.round((scrubTick / (TICK_COUNT - 1)) * (tot - 1)),
            ),
          )
          if (cardIdx !== cur) {
            // Sync currentRef so the next frame's "should I fire?" check
            // sees the latest committed index, not the stale React prop.
            currentRef.current = cardIdx
            onJumpRef.current(cardIdx)
          }
        }
      } else {
        // Free flight: spring chases the current-card tick.
        const targetIdx = tot > 1
          ? (cur / (tot - 1)) * (TICK_COUNT - 1)
          : (TICK_COUNT - 1) / 2

        const dt = lastFrameTimeRef.current === 0
          ? 1 / 60
          : Math.min(0.05, (now - lastFrameTimeRef.current) / 1000)
        lastFrameTimeRef.current = now

        const displayed = displayedTickIdxRef.current
        const error = targetIdx - displayed
        const accel = SWELL_STIFFNESS * error - SWELL_DAMPING * swellVelRef.current
        swellVelRef.current += accel * dt
        const stepIdx = swellVelRef.current * dt

        const next = displayed + stepIdx
        if (Math.abs(error) < 0.02 && Math.abs(swellVelRef.current) < 0.5) {
          displayedTickIdxRef.current = targetIdx
          swellVelRef.current = 0
          lastFrameTimeRef.current = 0
          centerTickIdx = targetIdx
        } else {
          displayedTickIdxRef.current = next
          centerTickIdx = next
        }
      }

      // ---- Tick heights: flowing sinusoid waveform + amplitude swell ----
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
        const swell = 1 + swellGain * Math.exp(-(dist * dist) / (2 * swellSigma * swellSigma))

        const h = baseH * swell
        el.style.height = `${Math.max(1, h).toFixed(1)}px`
      }

      // ---- Counter text ----
      if (counterRef.current) {
        const isAnimating = now < animUntilRef.current
        // While scrubbing, show the card the user is about to land on.
        const showingIdx = scrubTick !== null
          ? Math.max(
              0,
              Math.min(
                tot - 1,
                Math.round((scrubTick / (TICK_COUNT - 1)) * (tot - 1)),
              ),
            )
          : cur
        const intPart = pad4(showingIdx + 1)
        const decPart = isAnimating && scrubTick === null
          ? Math.floor(Math.random() * 10000).toString().padStart(4, '0')
          : '0000'
        const totalStr = pad4(tot)
        counterRef.current.textContent = `${intPart}.${decPart} / ${totalStr}.0000`
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return (): void => cancelAnimationFrame(raf)
  }, [])

  // ---- Pointer handlers for drag scrubbing ----
  const tickIdxFromPointer = useCallback((clientX: number): number => {
    const el = trackRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return 0
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return frac * (TICK_COUNT - 1)
  }, [])

  const handlePointerDown = useCallback((e: PointerEvent<HTMLDivElement>): void => {
    if (totalRef.current <= 1 || !onJump) return
    e.preventDefault()
    const el = trackRef.current
    if (!el) return
    if (typeof el.setPointerCapture === 'function') el.setPointerCapture(e.pointerId)
    const idx = tickIdxFromPointer(e.clientX)
    scrubTickIdxRef.current = idx
    setIsScrubbing(true)
  }, [onJump, tickIdxFromPointer])

  const handlePointerMove = useCallback((e: PointerEvent<HTMLDivElement>): void => {
    if (scrubTickIdxRef.current === null) return
    scrubTickIdxRef.current = tickIdxFromPointer(e.clientX)
  }, [tickIdxFromPointer])

  const finishScrub = useCallback((): void => {
    const scrub = scrubTickIdxRef.current
    if (scrub === null) return
    scrubTickIdxRef.current = null
    setIsScrubbing(false)
    const tot = totalRef.current
    if (tot <= 0 || !onJump) return
    const cardIdx = Math.max(
      0,
      Math.min(tot - 1, Math.round((scrub / (TICK_COUNT - 1)) * (tot - 1))),
    )
    if (cardIdx !== currentRef.current) {
      // Sync currentRef so the rAF loop's spring target matches the new
      // index immediately — prevents a one-frame snap-back to the old
      // index between this call and React's re-render.
      currentRef.current = cardIdx
      onJump(cardIdx)
    }
  }, [onJump])

  const handlePointerUp = useCallback((e: PointerEvent<HTMLDivElement>): void => {
    const el = trackRef.current
    if (el && typeof el.hasPointerCapture === 'function' && el.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId)
    }
    finishScrub()
  }, [finishScrub])

  if (total <= 1 && !alwaysShow) return null

  return (
    <div className={styles.meterWrap} aria-hidden="true">
      <div className={styles.meterStack}>
        <div className={styles.meterCounter}>
          <span className={styles.meterBracket}>[</span>
          {' '}
          <span ref={counterRef}>0001.0000 / 0001.0000</span>
          {' '}
          <span className={styles.meterBracket}>]</span>
        </div>
        <div
          className={styles.meterTrack}
          ref={trackRef}
          data-scrubbing={isScrubbing || undefined}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div className={styles.meterTrackLine} />
          {Array.from({ length: TICK_COUNT }, (_, i) => (
            <div
              key={i}
              ref={(el) => { if (el) tickRefs.current[i] = el }}
              className={styles.meterTick}
              style={{ left: `${(i / (TICK_COUNT - 1)) * 100}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
