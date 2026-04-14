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

          if (avg > 16.67 && tierIndexRef.current < TIER_ORDER.length - 1) {
            tierIndexRef.current++
            setTier(TIER_ORDER[tierIndexRef.current])
            frameTimesRef.current = []
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
