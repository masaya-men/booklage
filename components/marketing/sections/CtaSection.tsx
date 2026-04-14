'use client'

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Link from 'next/link'
import styles from './CtaSection.module.css'

/**
 * Section 6 — Final CTA.
 * "Make it yours." with a prominent call-to-action button.
 */
export function CtaSection(): React.ReactElement {
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const headline = el.querySelector(`.${styles.headline}`)
    const sub = el.querySelector(`.${styles.sub}`)
    const btn = el.querySelector(`.${styles.ctaBtn}`)
    const privacy = el.querySelector(`.${styles.privacy}`)

    if (prefersReduced) {
      gsap.set([headline, sub, btn, privacy], { opacity: 1 })
      return
    }

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: el,
        start: 'top 70%',
        toggleActions: 'play none none reverse',
      },
    })

    tl.fromTo(headline, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' })
      .fromTo(sub, { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }, '-=0.3')
      .fromTo(btn, { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.6, ease: 'back.out(1.5)' }, '-=0.2')
      .fromTo(privacy, { opacity: 0 }, { opacity: 1, duration: 0.4 }, '-=0.2')

    return () => { tl.kill() }
  }, [])

  return (
    <section ref={sectionRef} className={styles.section}>
      <h2 className={styles.headline}>
        <span className={styles.headlineGradient}>Make it yours.</span>
      </h2>
      <p className={styles.sub}>
        無料。登録不要。データはあなたのブラウザだけに。
      </p>
      <Link href="/board" className={styles.ctaBtn}>
        コラージュを始める
      </Link>
      <p className={styles.privacy}>
        サーバーにデータを送りません。完全プライバシー。
      </p>
    </section>
  )
}
