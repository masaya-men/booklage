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

/** Number of tick marks rendered on the ruler. Decoupled from `total` —
 *  the meter is a pure visual waveform, with current-card position shown
 *  as a localized amplitude swell on top of the global flow. */
const TICK_COUNT = 150

/** Counter slot-machine animation duration on card change. */
const COUNTER_ANIM_MS = 600

export function LightboxNavMeter({ current, total }: Props): ReactElement | null {
  const trackRef = useRef<HTMLDivElement>(null)
  const tickRefs = useRef<HTMLDivElement[]>([])
  const counterRef = useRef<HTMLSpanElement>(null)

  // Refs that the rAF loop reads each frame. Updates here never trigger
  // React re-renders, so layout stays perfectly stable.
  const currentRef = useRef<number>(current)
  const totalRef = useRef<number>(total)
  const animUntilRef = useRef<number>(0)

  // On card change: kick off the counter slot-machine animation and
  // update the position the meter swell tracks.
  useEffect(() => {
    currentRef.current = current
    totalRef.current = total
    animUntilRef.current = performance.now() + COUNTER_ANIM_MS
  }, [current, total])

  // Single rAF loop drives both the waveform and the counter text.
  useEffect(() => {
    let raf = 0
    const loop = (): void => {
      const t = performance.now() / 1000
      const now = performance.now()
      const cur = currentRef.current
      const tot = totalRef.current

      // --- Tick heights: flowing sinusoid waveform (the "音の波形" the
      //     user liked) + a localized amplitude swell at current position.
      //     Centered on the tick index that maps to the active card —
      //     reads as if the meter is alive and "noticing" itself there. ---
      const centerTickIdx = tot > 1 ? (cur / (tot - 1)) * (TICK_COUNT - 1) : TICK_COUNT / 2
      const swellSigma = TICK_COUNT / 14   // narrow swell — feels like a heartbeat zone
      const swellGain = 2.6                // peak multiplier on top of base waveform

      for (let i = 0; i < TICK_COUNT; i++) {
        const el = tickRefs.current[i]
        if (!el) continue

        // Base flowing waveform — three superposed sinusoids (low / mid /
        // high freq) phase-shifted per tick give an audio-waveform feel.
        const w1 = Math.sin(t * 0.6 + i * 0.08) * 0.45
        const w2 = Math.sin(t * 1.7 + i * 0.31) * 0.30
        const w3 = Math.sin(t * 4.2 + i * 0.93) * 0.15
        const norm = (w1 + w2 + w3 + 0.9) / 1.8 // → 0..1-ish
        const baseH = 2 + norm * 8 // slightly tamed base so swell can stand out

        // Amplitude swell centered on current card position. Gaussian
        // bell scales tick height by up to (1 + swellGain)x at the peak.
        const dist = i - centerTickIdx
        const swell = 1 + swellGain * Math.exp(-(dist * dist) / (2 * swellSigma * swellSigma))

        const h = baseH * swell
        el.style.height = `${Math.max(1, h).toFixed(1)}px`
      }

      // --- Counter text: integer part stable, decimal part scrambles
      //     during the post-change window then settles to .0000 ---
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
