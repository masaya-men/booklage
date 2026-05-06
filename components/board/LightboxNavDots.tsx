'use client'

import { useLayoutEffect, useRef, type ReactElement } from 'react'
import { gsap } from 'gsap'
import styles from './Lightbox.module.css'

type Props = {
  readonly current: number
  readonly total: number
  readonly onJump: (index: number) => void
}

type CSSModuleClasses = Readonly<Record<string, string>>

/** Distance-based dot size class. Special-cased for total=2 where
 *  using the adjacent (smaller) class would look unbalanced — there
 *  the non-active dot uses a "non-active equal" style. */
function dotClass(distance: number, total: number, styles: CSSModuleClasses): string {
  if (distance === 0) return styles.navDotActive
  if (total === 2) return styles.navDotInactive
  if (distance === 1) return styles.navDotAdjacent
  if (distance === 2) return styles.navDotFar
  if (distance === 3) return styles.navDotEdge
  return styles.navDotHidden
}

const DOT_GAP = 14 // px between dot centers (matches CSS gap + average dot width)

export function LightboxNavDots({ current, total, onJump }: Props): ReactElement | null {
  const stripRef = useRef<HTMLDivElement>(null)
  const prevCurrentRef = useRef<number>(current)

  // Slide strip so active dot stays at horizontal center.
  useLayoutEffect(() => {
    if (!stripRef.current) return
    const offset = -current * DOT_GAP
    gsap.to(stripRef.current, {
      x: offset,
      duration: 0.24,
      ease: 'power3.out',
    })
  }, [current])

  // Pulse the new active dot on change.
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
        { scale: 1.15, duration: 0.18, ease: 'back.out(2)' },
      )
    }
    prevCurrentRef.current = current
  }, [current])

  if (total <= 1) return null

  return (
    <div className={styles.navDotsWrap}>
      <div className={styles.navDots} ref={stripRef}>
        {Array.from({ length: total }, (_, i) => {
          const distance = Math.abs(i - current)
          return (
            <button
              key={i}
              type="button"
              data-dot-index={i}
              className={`${styles.navDot} ${dotClass(distance, total, styles)}`}
              onClick={(): void => onJump(i)}
              aria-label={`カード ${i + 1} / ${total}`}
              aria-current={i === current ? 'true' : undefined}
            />
          )
        })}
      </div>
    </div>
  )
}
