// components/marketing/sections/CollageDemoSection.tsx
'use client'

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import styles from './CollageDemoSection.module.css'

const DEMO_CARDS = [
  { label: 'YouTube', left: '2%', top: '5%', w: 160, h: 100, rot: -4, color: 'rgba(244,114,182,0.12)', border: 'rgba(244,114,182,0.25)', from: 'top' },
  { label: 'Twitter/X', left: '25%', top: '25%', w: 170, h: 110, rot: 2, color: 'rgba(124,92,252,0.12)', border: 'rgba(124,92,252,0.25)', from: 'left' },
  { label: 'ブログ記事', left: '58%', top: '3%', w: 140, h: 95, rot: 5, color: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.25)', from: 'right' },
  { label: 'Instagram', left: '8%', top: '55%', w: 155, h: 105, rot: -2, color: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.25)', from: 'bottom' },
  { label: 'TikTok', left: '50%', top: '50%', w: 130, h: 90, rot: 3, color: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.25)', from: 'right' },
] as const

function getFromPosition(from: string): { x: number; y: number } {
  switch (from) {
    case 'top': return { x: 0, y: -200 }
    case 'bottom': return { x: 0, y: 200 }
    case 'left': return { x: -300, y: 0 }
    case 'right': return { x: 300, y: 0 }
    default: return { x: 0, y: -200 }
  }
}

export function CollageDemoSection(): React.ReactElement {
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const heading = el.querySelector(`.${styles.heading}`)
    const sub = el.querySelector(`.${styles.sub}`)
    const cards = el.querySelectorAll(`.${styles.card}`)

    if (prefersReduced) {
      gsap.set([heading, sub, ...cards], { opacity: 1 })
      cards.forEach((c) => c.classList.add(styles.floating))
      return
    }

    gsap.fromTo([heading, sub], { opacity: 0, y: 20 }, {
      opacity: 1, y: 0, duration: 0.6, stagger: 0.15, ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 75%', toggleActions: 'play none none reverse' },
    })

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: el,
        start: 'top 50%',
        end: 'center center',
        toggleActions: 'play none none reverse',
      },
    })

    DEMO_CARDS.forEach((cardData, i) => {
      const fromPos = getFromPosition(cardData.from)
      tl.fromTo(
        cards[i],
        { opacity: 0, x: fromPos.x, y: fromPos.y, scale: 0.6, rotation: cardData.rot + 10 },
        {
          opacity: 1, x: 0, y: 0, scale: 1, rotation: cardData.rot,
          duration: 0.7, ease: 'back.out(1.4)',
          onComplete: () => { cards[i].classList.add(styles.floating) },
        },
        i * 0.15,
      )
    })

    return () => { tl.kill() }
  }, [])

  return (
    <section ref={sectionRef} className={styles.section}>
      <h2 className={styles.heading}>自由に並べる</h2>
      <p className={styles.sub}>ドラッグ、回転、リサイズ。あなたのキャンバスに制限はない。</p>

      <div className={styles.canvas}>
        {DEMO_CARDS.map((card, i) => (
          <div
            key={i}
            className={styles.card}
            style={{
              left: card.left,
              top: card.top,
              width: card.w,
              height: card.h,
              transform: `rotate(${card.rot}deg)`,
              background: card.color,
              borderColor: card.border,
              '--delay': `${i * 0.6}s`,
            } as React.CSSProperties}
          >
            {card.label}
          </div>
        ))}
      </div>
    </section>
  )
}
