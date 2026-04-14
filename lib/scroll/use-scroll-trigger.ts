// lib/scroll/use-scroll-trigger.ts
'use client'

import { useEffect } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

/**
 * Register GSAP ScrollTrigger plugin on mount.
 * Call this once in the top-level LP component.
 */
export function useScrollTrigger(): void {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)

    return () => {
      ScrollTrigger.getAll().forEach((t) => t.kill())
    }
  }, [])
}
