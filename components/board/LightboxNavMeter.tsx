'use client'

import { useEffect, useRef, type ReactElement } from 'react'
import styles from './Lightbox.module.css'

type Props = {
  readonly current: number
  readonly total: number
  /** Stable per-card identity, currently used only as a render key. */
  readonly cardKey: string
}

/** Number of tick marks rendered on the ruler. Decoupled from `total` —
 *  the meter is now pure visual ornament (a flowing waveform) rather than
 *  a per-card position indicator. Current card position is shown in the
 *  central counter above the ruler. */
const TICK_COUNT = 150

function pad4(n: number): string {
  return Math.max(0, Math.min(9999, Math.floor(n))).toString().padStart(4, '0')
}

/** Format a coordinate as IIII.D (4 integer digits + 1 decimal),
 *  zero-padded. Used for mouse X/Y readouts. */
function formatCoord(value: number): string {
  const v = Math.max(0, Math.min(9999.9, value))
  const intPart = Math.floor(v).toString().padStart(4, '0')
  const decPart = Math.floor((v - Math.floor(v)) * 10).toString()
  return `${intPart}.${decPart}`
}

export function LightboxNavMeter({ current, total }: Props): ReactElement | null {
  const trackRef = useRef<HTMLDivElement>(null)
  const tickRefs = useRef<HTMLDivElement[]>([])
  const xReadoutRef = useRef<HTMLSpanElement>(null)
  const yReadoutRef = useRef<HTMLSpanElement>(null)
  const mouseRef = useRef({ x: 0, y: 0 })

  // Capture mouse coordinates globally — the meter shows them as live
  // readouts so the user sees a number that's actually wired to something
  // (their cursor) rather than ornamental noise.
  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      mouseRef.current.x = e.clientX
      mouseRef.current.y = e.clientY
    }
    window.addEventListener('mousemove', onMove)
    return (): void => window.removeEventListener('mousemove', onMove)
  }, [])

  // rAF loop: drives both the waveform tick heights and the coord readouts.
  // Tick heights are a sum of three sinusoids at different frequencies,
  // phase-shifted by tick index so neighboring ticks differ in height —
  // produces a flowing audio-waveform-like ribbon that's never static.
  useEffect(() => {
    let raf = 0
    const tick = (): void => {
      const t = performance.now() / 1000
      // Per-tick height: base + sum of 3 sinusoids (low / mid / high freq).
      // Coefficients tuned so peaks land 14-18px and troughs 2-3px.
      for (let i = 0; i < TICK_COUNT; i++) {
        const el = tickRefs.current[i]
        if (!el) continue
        const w1 = Math.sin(t * 0.6 + i * 0.08) * 0.45      // long swell
        const w2 = Math.sin(t * 1.7 + i * 0.31) * 0.30      // mid
        const w3 = Math.sin(t * 4.2 + i * 0.93) * 0.15      // shimmer
        const norm = (w1 + w2 + w3 + 0.9) / 1.8 // → 0..1-ish
        const h = 2 + norm * 14 // px, 2..16
        el.style.height = `${h.toFixed(1)}px`
      }
      // Mouse readouts.
      if (xReadoutRef.current) {
        xReadoutRef.current.textContent = formatCoord(mouseRef.current.x)
      }
      if (yReadoutRef.current) {
        yReadoutRef.current.textContent = formatCoord(mouseRef.current.y)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return (): void => cancelAnimationFrame(raf)
  }, [])

  if (total <= 1) return null

  // Current/total counter (1-indexed for human readability).
  const counter = `${pad4(current + 1)} / ${pad4(total)}`

  return (
    <div className={styles.meterWrap} aria-hidden="true">
      <span className={styles.meterReadout}>
        <span className={styles.meterAxisLabel}>X</span>
        <span ref={xReadoutRef}>0000.0</span>
      </span>
      <div className={styles.meterStack}>
        <div className={styles.meterCounter}>
          <span className={styles.meterBracket}>[</span>
          {' '}
          {counter}
          {' '}
          <span className={styles.meterBracket}>]</span>
        </div>
        <div className={styles.meterTrack} ref={trackRef}>
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
      <span className={styles.meterReadout}>
        <span className={styles.meterAxisLabel}>Y</span>
        <span ref={yReadoutRef}>0000.0</span>
      </span>
    </div>
  )
}
