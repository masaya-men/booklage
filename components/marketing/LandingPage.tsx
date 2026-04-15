'use client'

import { useSmoothScroll } from '@/lib/scroll/use-smooth-scroll'
import { useScrollTrigger } from '@/lib/scroll/use-scroll-trigger'
import { ThemeToggle } from './ThemeToggle'
import { HeroSection } from './sections/HeroSection'
import { SaveDemoSection } from './sections/SaveDemoSection'
import { CollageDemoSection } from './sections/CollageDemoSection'
import { StyleSwitchSection } from './sections/StyleSwitchSection'
import { ShareDemoSection } from './sections/ShareDemoSection'
import { CtaSection } from './sections/CtaSection'
import styles from './LandingPage.module.css'

/**
 * Landing page root client component.
 * Initializes Lenis smooth scrolling and GSAP ScrollTrigger.
 * Renders 6 marketing sections.
 */
export function LandingPage(): React.ReactElement {
  useSmoothScroll()
  useScrollTrigger()

  return (
    <div className={styles.wrapper}>
      <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 100 }}>
        <ThemeToggle />
      </div>
      <div className={styles.content}>
        <HeroSection />
        <SaveDemoSection />
        <CollageDemoSection />
        <StyleSwitchSection />
        <ShareDemoSection />
        <CtaSection />
      </div>
    </div>
  )
}
