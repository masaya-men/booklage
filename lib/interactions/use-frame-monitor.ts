'use client'

import { useEffect, useRef, useState } from 'react'

export type PerformanceTier = 'full' | 'reduced-spotlight' | 'reduced-animation' | 'minimal'

const TIER_ORDER: PerformanceTier[] = ['full', 'reduced-spotlight', 'reduced-animation', 'minimal']

export function useFrameMonitor(cardCount: number): PerformanceTier {
  const [tier, setTier] = useState<PerformanceTier>('full')
  const frameTimesRef = useRef<number[]>([])
  const lastFrameRef = useRef<number>(0)
  const rafRef = useRef<number>(0)
  const tierIndexRef = useRef(0)
  /** Count of consecutive good-FPS windows — used to recover tier */
  const goodStreakRef = useRef(0)

  useEffect(() => {
    let baseTier = 0
    if (cardCount > 200) baseTier = 3
    else if (cardCount > 100) baseTier = 2
    else if (cardCount > 50) baseTier = 1

    if (baseTier > tierIndexRef.current) {
      tierIndexRef.current = baseTier
      setTier(TIER_ORDER[baseTier])
    }
  }, [cardCount])

  useEffect(() => {
    let running = true
    /** Degrade only when average exceeds 30fps threshold (33.33ms) */
    const DEGRADE_THRESHOLD = 33.33
    /** Recover when average is comfortably above 45fps (22.22ms) */
    const RECOVER_THRESHOLD = 22.22
    /** Number of consecutive good windows before recovering a tier */
    const RECOVER_STREAK = 3

    function measure(now: number): void {
      if (!running) return

      if (lastFrameRef.current > 0) {
        const delta = now - lastFrameRef.current
        frameTimesRef.current.push(delta)

        if (frameTimesRef.current.length > 60) {
          frameTimesRef.current.shift()
        }

        if (frameTimesRef.current.length >= 30) {
          const avg =
            frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length

          if (avg > DEGRADE_THRESHOLD && tierIndexRef.current < TIER_ORDER.length - 1) {
            // Degrade: FPS dropped below 30
            tierIndexRef.current++
            setTier(TIER_ORDER[tierIndexRef.current])
            frameTimesRef.current = []
            goodStreakRef.current = 0
          } else if (avg < RECOVER_THRESHOLD && tierIndexRef.current > 0) {
            // Track consecutive good windows for recovery
            goodStreakRef.current++
            if (goodStreakRef.current >= RECOVER_STREAK) {
              tierIndexRef.current--
              setTier(TIER_ORDER[tierIndexRef.current])
              frameTimesRef.current = []
              goodStreakRef.current = 0
            }
          } else {
            goodStreakRef.current = 0
          }
        }
      }

      lastFrameRef.current = now
      rafRef.current = requestAnimationFrame(measure)
    }

    rafRef.current = requestAnimationFrame(measure)

    return () => {
      running = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return tier
}
