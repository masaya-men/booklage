// components/marketing/LandingPage.tsx
'use client'

import { useSmoothScroll } from '@/lib/scroll/use-smooth-scroll'
import { useScrollTrigger } from '@/lib/scroll/use-scroll-trigger'
import { HeroSection } from './sections/HeroSection'
import { SaveDemoSection } from './sections/SaveDemoSection'
import { CollageDemoSection } from './sections/CollageDemoSection'
import styles from './LandingPage.module.css'

export function LandingPage(): React.ReactElement {
  useSmoothScroll()
  useScrollTrigger()

  return (
    <div className={styles.wrapper}>
      <div className={styles.content}>
        <HeroSection />
        <SaveDemoSection />
        <CollageDemoSection />
      </div>
    </div>
  )
}
