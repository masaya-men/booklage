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

/** Cap on how many tick marks we actually render. With > MAX_TICKS cards,
 *  we sample evenly so the meter stays readable regardless of total. */
const MAX_TICKS = 50

/** Build the list of card-indices to render as tick marks. When `total`
 *  is at or below the cap, this is just [0..total-1]. Above the cap,
 *  it's an evenly sampled subset that ALWAYS includes the active index
 *  and the two endpoints, so the user always sees themselves on the meter. */
function buildTickIndices(total: number, current: number): number[] {
  if (total <= MAX_TICKS) {
    return Array.from({ length: total }, (_, i) => i)
  }
  const sampled = new Set<number>()
  for (let i = 0; i < MAX_TICKS; i++) {
    sampled.add(Math.round((i / (MAX_TICKS - 1)) * (total - 1)))
  }
  sampled.add(0)
  sampled.add(total - 1)
  sampled.add(current)
  return Array.from(sampled).sort((a, b) => a - b)
}

export function LightboxNavMeter({ current, total, cardKey }: Props): ReactElement | null {
  const trackRef = useRef<HTMLDivElement>(null)
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

  // Pulse the active tick on card change. Selector targets the tick whose
  // data attribute matches `current`.
  useEffect(() => {
    if (prevCurrentRef.current === current) return
    prevCurrentRef.current = current
    const track = trackRef.current
    if (!track) return
    const activeTick = track.querySelector<HTMLDivElement>(
      `[data-tick-index="${current}"]`,
    )
    if (activeTick) {
      gsap.fromTo(
        activeTick,
        { scaleY: 1.0 },
        { scaleY: 1.6, duration: 0.22, ease: 'back.out(2)', yoyo: true, repeat: 1 },
      )
    }
  }, [current])

  // Idle micro-animation: nudge the readouts every animation frame so the
  // last decimal digit constantly shimmers. Keeps the meter feeling alive
  // even when the user isn't navigating.
  useEffect(() => {
    let raf = 0
    const tick = (): void => {
      const t = performance.now() / 1000
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

  const tickIndices = buildTickIndices(total, current)

  return (
    <div className={styles.meterWrap} aria-hidden="true">
      <span ref={leftRef} className={styles.meterReadout}>
        {formatNumber(leftBase)}
      </span>
      <div className={styles.meterTrack} ref={trackRef}>
        <div className={styles.meterTrackLine} />
        {tickIndices.map((i) => {
          const pos = total > 1 ? (i / (total - 1)) * 100 : 50
          const isActive = i === current
          return (
            <div
              key={i}
              data-tick-index={i}
              className={`${styles.meterTick} ${isActive ? styles.meterTickActive : ''}`}
              style={{ left: `${pos}%` }}
            />
          )
        })}
      </div>
      <span ref={rightRef} className={styles.meterReadout}>
        {formatNumber(rightBase)}
      </span>
    </div>
  )
}
