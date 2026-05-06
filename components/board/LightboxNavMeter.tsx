'use client'

import { useEffect, useRef, type ReactElement } from 'react'
import styles from './Lightbox.module.css'

type Props = {
  readonly current: number
  readonly total: number
  /** Stable per-card identity, currently used only as a render key. */
  readonly cardKey: string
}

function pad4(n: number): string {
  return Math.max(0, Math.min(9999, Math.floor(n))).toString().padStart(4, '0')
}

/** Counter slot-machine animation duration on card change. */
const COUNTER_ANIM_MS = 600

export function LightboxNavMeter({ current, total }: Props): ReactElement | null {
  const trackRef = useRef<HTMLDivElement>(null)
  const tickRefs = useRef<HTMLDivElement[]>([])
  const counterRef = useRef<HTMLSpanElement>(null)

  // Refs that the rAF loop reads each frame. Using refs (rather than state)
  // means coordinate / counter updates never trigger React re-renders, so
  // layout stays perfectly stable — no jitter from text reflow.
  const currentRef = useRef<number>(current)
  const totalRef = useRef<number>(total)
  const animUntilRef = useRef<number>(0)

  // On card change: kick off the counter slot-machine animation.
  useEffect(() => {
    currentRef.current = current
    totalRef.current = total
    animUntilRef.current = performance.now() + COUNTER_ANIM_MS
  }, [current, total])

  // Single rAF loop drives both the waveform tick heights and the counter
  // text. Per-frame work is bounded (≤ ~150 elements + 1 text node), well
  // under the budget of a 60fps frame even on low-end devices.
  useEffect(() => {
    let raf = 0
    const loop = (): void => {
      const t = performance.now() / 1000
      const now = performance.now()
      const cur = currentRef.current
      const tot = totalRef.current

      // --- Tick heights: Gaussian centered on `current` + small jitter ---
      // sigma controls the bell width. Scales gently with total so few-card
      // boards have a punchy peak and many-card boards keep the bell visible.
      const sigma = Math.max(1.6, tot / 6)
      const peakH = 16
      const baseH = 2
      for (let i = 0; i < tot; i++) {
        const el = tickRefs.current[i]
        if (!el) continue
        const dist = i - cur
        const bell = Math.exp(-(dist * dist) / (2 * sigma * sigma))
        // Per-tick jitter — sum of two phase-shifted sinusoids, scaled
        // small (±1 px) so the bell shape stays legible while the meter
        // still feels alive.
        const jitter =
          Math.sin(t * 1.3 + i * 0.31) * 0.6 +
          Math.sin(t * 3.1 + i * 0.93) * 0.4
        const h = baseH + (peakH - baseH) * bell + jitter
        el.style.height = `${Math.max(1, h).toFixed(1)}px`
      }

      // --- Counter text: integer part stable, decimal part scrambles
      //     during the 600ms post-change window then settles to .0000 ---
      if (counterRef.current) {
        const isAnimating = now < animUntilRef.current
        const intPart = pad4(cur + 1)
        const decPart = isAnimating
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

  if (total <= 1) return null

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
        <div className={styles.meterTrack} ref={trackRef}>
          <div className={styles.meterTrackLine} />
          {Array.from({ length: total }, (_, i) => (
            <div
              key={i}
              ref={(el) => { if (el) tickRefs.current[i] = el }}
              className={styles.meterTick}
              style={{ left: `${total > 1 ? (i / (total - 1)) * 100 : 50}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
