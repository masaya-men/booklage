// components/marketing/sections/SaveDemoSection.tsx
'use client'

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import styles from './SaveDemoSection.module.css'

export function SaveDemoSection(): React.ReactElement {
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
        end: 'center center',
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
    <section ref={sectionRef} id="save-demo" className={styles.section}>
      <h2 className={styles.heading}>ワンクリックで保存</h2>
      <p className={styles.sub}>ブックマークレットをクリック → OGP自動取得 → カードが飛んでくる</p>

      <div className={styles.flow}>
        <div className={styles.step}>
          <div className={styles.browser}>
            <div className={styles.browserBar}>
              <div className={styles.browserDot} style={{ background: '#ff5f57' }} />
              <div className={styles.browserDot} style={{ background: '#febc2e' }} />
              <div className={styles.browserDot} style={{ background: '#28c840' }} />
              <div className={styles.browserUrl} />
            </div>
            <div className={styles.browserBody}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                任意のWebサイト
              </div>
              <div className={styles.bookmarkletBtn}>📌 Save</div>
            </div>
          </div>
        </div>

        <div className={styles.arrow}>→</div>

        <div className={styles.step}>
          <div className={styles.popup}>
            <div className={styles.popupHeader}>📌 AllMarks に保存</div>
            <div className={styles.popupPreview} />
            <div className={styles.popupFolder}>My Collage</div>
            <div className={styles.popupSave}>保存</div>
          </div>
        </div>

        <div className={styles.arrow}>→</div>

        <div className={styles.step}>
          <div className={styles.cardArrive}>新しいカード</div>
        </div>
      </div>
    </section>
  )
}
