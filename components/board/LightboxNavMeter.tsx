'use client'

import { useEffect, useRef, useState, type ReactElement } from 'react'
import { gsap } from 'gsap'
import styles from './Lightbox.module.css'

type Props = {
  readonly current: number
  readonly total: number
  /** A stable per-card identity used to seed deterministic right-side
   *  reference values. Same card → same base value (so the readout reads
   *  as "this card's reference"). */
  readonly cardKey: string
}

/** djb2-ish hash → 0..1. Deterministic per cardKey, used to seed the
 *  right-hand "reference" readout so each card has its own large number
 *  that doesn't change between mounts. */
function hash01(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) + s.charCodeAt(i)
    h = h | 0
  }
  // Map to 0..1 via abs % 1e6
  const n = Math.abs(h) % 1000000
  return n / 1000000
}

function formatNumber(value: number): string {
  // Format as XXXX.XXX (4 integer digits, 3 decimal digits, zero-padded).
  const clamped = Math.abs(value) % 10000
  const intPart = Math.floor(clamped).toString().padStart(4, '0')
  const decPart = Math.floor((clamped - Math.floor(clamped)) * 1000)
    .toString()
    .padStart(3, '0')
  return `${intPart}.${decPart}`
}

export function LightboxNavMeter({ current, total, cardKey }: Props): ReactElement | null {
  const trackProgressRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLDivElement>(null)
  const leftRef = useRef<HTMLSpanElement>(null)
  const rightRef = useRef<HTMLSpanElement>(null)
  const prevCurrentRef = useRef<number>(current)

  // Deterministic right-side base value per card. Re-derived only when
  // cardKey changes — same card = same base reading.
  const [rightBase, setRightBase] = useState<number>(() => hash01(cardKey) * 10000)
  useEffect(() => {
    setRightBase(hash01(cardKey) * 10000)
  }, [cardKey])

  // Left-side base value derives from progress (current+1 / total). Mapped
  // into the same 0..10000 space so it visually matches right-side scale.
  const leftBase = total > 0 ? ((current + 1) / total) * 10000 : 0

  // Pulse the active dot on card change.
  useEffect(() => {
    if (prevCurrentRef.current === current) return
    prevCurrentRef.current = current
    if (dotRef.current) {
      gsap.fromTo(
        dotRef.current,
        { scale: 1.0 },
        { scale: 1.4, duration: 0.22, ease: 'back.out(2)', yoyo: true, repeat: 1 },
      )
    }
  }, [current])

  // Idle micro-animation: nudge the readouts every animation frame so the
  // last 1-2 decimal digits constantly shimmer. Keeps the meter feeling
  // alive even when the user isn't navigating.
  useEffect(() => {
    let raf = 0
    const tick = (): void => {
      const t = performance.now() / 1000
      // Two independent sinusoidal walks (different freqs) so left/right
      // never feel synchronized. ±0.012 swing keeps it under 1 decimal place
      // of noticeable jitter.
      const noiseL = Math.sin(t * 0.83) * 0.006 + Math.sin(t * 2.1) * 0.004
      const noiseR = Math.sin(t * 1.17) * 0.005 + Math.sin(t * 0.43) * 0.005
      if (leftRef.current) leftRef.current.textContent = formatNumber(leftBase + noiseL)
      if (rightRef.current) rightRef.current.textContent = formatNumber(rightBase + noiseR)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return (): void => cancelAnimationFrame(raf)
  }, [leftBase, rightBase])

  if (total <= 1) return null

  // Progress marker position on the track: (current / (total - 1)) of full width
  const progress = total > 1 ? current / (total - 1) : 0

  return (
    <div className={styles.meterWrap} aria-hidden="true">
      <span ref={leftRef} className={styles.meterReadout}>
        {formatNumber(leftBase)}
      </span>
      <div className={styles.meterTrack}>
        <div className={styles.meterTrackLine} />
        <div
          ref={trackProgressRef}
          className={styles.meterTrackMark}
          style={{ left: `${progress * 100}%` }}
        />
        <div
          ref={dotRef}
          className={styles.meterActiveDot}
        />
      </div>
      <span ref={rightRef} className={styles.meterReadout}>
        {formatNumber(rightBase)}
      </span>
    </div>
  )
}
