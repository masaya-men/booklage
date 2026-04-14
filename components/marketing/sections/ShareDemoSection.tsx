'use client'

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import styles from './ShareDemoSection.module.css'

/**
 * Section 5 — Share Demo.
 * Collage → PNG → SNS share flow, animated on scroll.
 */
export function ShareDemoSection(): React.ReactElement {
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const heading = el.querySelector(`.${styles.heading}`)
    const sub = el.querySelector(`.${styles.sub}`)
    const steps = el.querySelectorAll(`.${styles.step}`)
    const arrows = el.querySelectorAll(`.${styles.arrow}`)

    if (prefersReduced) {
      gsap.set([heading, sub, ...steps, ...arrows], { opacity: 1, y: 0 })
      return
    }

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: el,
        start: 'top 70%',
        toggleActions: 'play none none reverse',
      },
    })

    tl.fromTo(heading, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' })
      .fromTo(sub, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }, '-=0.3')

    steps.forEach((step, i) => {
      tl.fromTo(step, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }, '-=0.2')
      if (arrows[i]) {
        tl.fromTo(arrows[i], { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(2)' }, '-=0.3')
      }
    })

    return () => { tl.kill() }
  }, [])

  return (
    <section ref={sectionRef} className={styles.section}>
      <h2 className={styles.heading}>コラージュを世界へ</h2>
      <p className={styles.sub}>画像として保存 → SNSにシェア → バイラル</p>

      <div className={styles.flow}>
        {/* Step 1: Collage */}
        <div className={styles.step}>
          <div className={styles.collageThumb}>
            <div className={styles.miniCard} style={{ left: '8%', top: '10%', width: 50, height: 35, transform: 'rotate(-3deg)', background: 'rgba(124,92,252,0.15)' }} />
            <div className={styles.miniCard} style={{ left: '40%', top: '25%', width: 60, height: 40, transform: 'rotate(2deg)', background: 'rgba(244,114,182,0.15)' }} />
            <div className={styles.miniCard} style={{ left: '15%', top: '55%', width: 55, height: 35, transform: 'rotate(-1deg)', background: 'rgba(52,211,153,0.15)' }} />
            <div className={styles.miniCard} style={{ left: '55%', top: '50%', width: 45, height: 30, transform: 'rotate(4deg)', background: 'rgba(99,102,241,0.15)' }} />
          </div>
        </div>

        <div className={styles.arrow}>→</div>

        {/* Step 2: PNG */}
        <div className={styles.step}>
          <div className={styles.pngOutput}>
            <div className={styles.pngIcon}>🖼️</div>
            <div className={styles.pngLabel}>collage.png</div>
          </div>
        </div>

        <div className={styles.arrow}>→</div>

        {/* Step 3: Social */}
        <div className={styles.step}>
          <div className={styles.socialBtns}>
            <div className={styles.socialX}>𝕏 でシェア</div>
            <div className={styles.socialInsta}>📷 ストーリーに投稿</div>
          </div>
        </div>
      </div>
    </section>
  )
}
