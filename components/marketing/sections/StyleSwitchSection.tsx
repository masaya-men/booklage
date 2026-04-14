'use client'

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import styles from './StyleSwitchSection.module.css'

/**
 * Section 4 — Style Switch.
 * Shows 4 card style options with staggered reveal on scroll.
 */
export function StyleSwitchSection(): React.ReactElement {
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const heading = el.querySelector(`.${styles.heading}`)
    const cards = el.querySelectorAll(`.${styles.styleCard}`)

    if (prefersReduced) {
      gsap.set([heading, ...cards], { opacity: 1, y: 0 })
      return
    }

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: el,
        start: 'top 65%',
        toggleActions: 'play none none reverse',
      },
    })

    tl.fromTo(heading, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' })
    tl.fromTo(
      cards,
      { opacity: 0, y: 30, scale: 0.9 },
      { opacity: 1, y: 0, scale: 1, duration: 0.5, stagger: 0.12, ease: 'back.out(1.4)' },
      '-=0.2',
    )

    return () => { tl.kill() }
  }, [])

  return (
    <section ref={sectionRef} className={styles.section}>
      <h2 className={styles.heading}>スタイルを着せ替え</h2>

      <div className={styles.showcase}>
        <div className={styles.styleCard}>
          <div className={styles.previewGlass} />
          <div className={styles.styleName}>Glass</div>
        </div>
        <div className={styles.styleCard}>
          <div className={styles.previewPolaroid} />
          <div className={styles.styleName}>Polaroid</div>
        </div>
        <div className={styles.styleCard}>
          <div className={styles.previewNewspaper} />
          <div className={styles.styleName}>Newspaper</div>
        </div>
        <div className={styles.styleCard}>
          <div className={styles.previewMagnet}>
            <div className={styles.magnetPin} />
          </div>
          <div className={styles.styleName}>Magnet</div>
        </div>
      </div>
    </section>
  )
}
