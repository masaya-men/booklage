// components/marketing/sections/HeroSection.tsx
'use client'

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import Link from 'next/link'
import styles from './HeroSection.module.css'

const FLOAT_CARDS = [
  { left: '8%', top: '12%', w: 120, h: 80, rot: -5, delay: 0 },
  { left: '72%', top: '8%', w: 140, h: 90, rot: 4, delay: 0.8 },
  { left: '15%', top: '65%', w: 100, h: 70, rot: 3, delay: 1.6 },
  { left: '80%', top: '60%', w: 110, h: 75, rot: -3, delay: 0.4 },
  { left: '45%', top: '5%', w: 90, h: 60, rot: 2, delay: 1.2 },
  { left: '55%', top: '75%', w: 130, h: 85, rot: -4, delay: 2.0 },
  { left: '30%', top: '40%', w: 80, h: 55, rot: 6, delay: 2.4 },
] as const

export function HeroSection(): React.ReactElement {
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const cards = el.querySelectorAll(`.${styles.floatCard}`)
    if (prefersReduced) {
      gsap.set(cards, { opacity: 0.5 })
    } else {
      gsap.fromTo(
        cards,
        { opacity: 0, scale: 0.8, filter: 'blur(12px)' },
        { opacity: 0.5, scale: 1, filter: 'blur(0px)', duration: 1.2, stagger: 0.12, ease: 'power2.out' },
      )
    }

    const textEls = [
      el.querySelector(`.${styles.label}`),
      el.querySelector(`.${styles.headline}`),
      el.querySelector(`.${styles.subtitle}`),
      el.querySelector(`.${styles.ctaRow}`),
      el.querySelector(`.${styles.scrollHint}`),
    ].filter(Boolean)

    if (prefersReduced) {
      gsap.set(textEls, { opacity: 1 })
    } else {
      gsap.fromTo(
        textEls,
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.8, stagger: 0.15, ease: 'power2.out', delay: 0.6 },
      )
    }
  }, [])

  const handleScrollDown = (): void => {
    const next = document.getElementById('save-demo')
    if (next) next.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section ref={sectionRef} className={styles.hero}>
      <div className={styles.cardsLayer}>
        {FLOAT_CARDS.map((card, i) => (
          <div
            key={i}
            className={styles.floatCard}
            style={{
              left: card.left,
              top: card.top,
              width: card.w,
              height: card.h,
              transform: `rotate(${card.rot}deg)`,
              '--delay': `${card.delay}s`,
            } as React.CSSProperties}
          />
        ))}
      </div>

      <div className={styles.textLayer}>
        <div className={styles.label}>Bookmark × Collage</div>
        <h1 className={styles.headline}>
          <span className={styles.headlineGradient}>
            Bookmark.<br />
            Collage.<br />
            Share.
          </span>
        </h1>
        <p className={styles.subtitle}>
          あらゆるWebサイトを、あなただけのコラージュに。
        </p>
        <div className={styles.ctaRow}>
          <Link href="/board" className={styles.ctaPrimary}>
            始める — 無料
          </Link>
          <button type="button" className={styles.ctaGhost} onClick={handleScrollDown}>
            ↓ デモを見る
          </button>
        </div>
      </div>

      <div className={styles.scrollHint}>scroll</div>
    </section>
  )
}
