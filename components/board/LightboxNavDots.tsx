'use client'

import { useLayoutEffect, useRef, type ReactElement } from 'react'
import { gsap } from 'gsap'
import styles from './Lightbox.module.css'

type Props = {
  readonly current: number
  readonly total: number
  readonly onJump: (index: number) => void
}

export function LightboxNavDots({ current, total, onJump }: Props): ReactElement | null {
  const stripRef = useRef<HTMLDivElement>(null)
  const prevCurrentRef = useRef<number>(current)

  // Pulse the new active dot on change. The strip itself never moves —
  // only the active dot's style swaps, so the dot bar stays visually
  // anchored at screen center regardless of which card is open.
  useLayoutEffect(() => {
    if (prevCurrentRef.current === current) return
    const strip = stripRef.current
    if (!strip) return
    const newActive = strip.querySelector<HTMLButtonElement>(
      `[data-dot-index="${current}"]`,
    )
    if (newActive) {
      gsap.fromTo(
        newActive,
        { scale: 1.0 },
        { scale: 1.25, duration: 0.18, ease: 'back.out(2)' },
      )
    }
    prevCurrentRef.current = current
  }, [current])

  if (total <= 1) return null

  return (
    <div className={styles.navDotsWrap}>
      <div className={styles.navDots} ref={stripRef}>
        {Array.from({ length: total }, (_, i) => (
          <button
            key={i}
            type="button"
            data-dot-index={i}
            className={`${styles.navDot} ${i === current ? styles.navDotActive : styles.navDotInactive}`}
            onClick={(): void => onJump(i)}
            aria-label={`カード ${i + 1} / ${total}`}
            aria-current={i === current ? 'true' : undefined}
          />
        ))}
      </div>
    </div>
  )
}
