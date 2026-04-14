'use client'

import { useCallback, useEffect, useRef } from 'react'

type UseCardTiltOptions = {
  maxTilt?: number
  perspective?: number
  enabled?: boolean
}

type UseCardTiltReturn = {
  ref: React.RefCallback<HTMLElement>
}

export function useCardTilt({
  maxTilt = 5,
  perspective = 800,
  enabled = true,
}: UseCardTiltOptions = {}): UseCardTiltReturn {
  const elementRef = useRef<HTMLElement | null>(null)
  const rafRef = useRef<number>(0)
  const isHoveringRef = useRef(false)

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!elementRef.current || !isHoveringRef.current) return
      if (rafRef.current) cancelAnimationFrame(rafRef.current)

      rafRef.current = requestAnimationFrame(() => {
        const el = elementRef.current
        if (!el) return

        const rect = el.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        const normalizedX = (e.clientX - centerX) / (rect.width / 2)
        const normalizedY = (e.clientY - centerY) / (rect.height / 2)
        const clampedX = Math.max(-1, Math.min(1, normalizedX))
        const clampedY = Math.max(-1, Math.min(1, normalizedY))

        const rotateX = -clampedY * maxTilt
        const rotateY = clampedX * maxTilt

        el.style.transform =
          `perspective(${perspective}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.03)`
        el.style.setProperty('--spotlight-x', `${((clampedX + 1) / 2) * 100}%`)
        el.style.setProperty('--spotlight-y', `${((clampedY + 1) / 2) * 100}%`)
        el.style.setProperty('--spotlight-opacity', '1')

        const shadowX = clampedX * 8
        const shadowY = clampedY * 8
        el.style.setProperty(
          '--tilt-shadow',
          `${shadowX}px ${shadowY + 12}px 24px rgba(0,0,0,0.3)`,
        )
      })
    },
    [maxTilt, perspective],
  )

  const handleMouseEnter = useCallback(() => {
    isHoveringRef.current = true
  }, [])

  const handleMouseLeave = useCallback(() => {
    isHoveringRef.current = false
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    const el = elementRef.current
    if (!el) return

    el.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
    el.style.transform = ''
    el.style.setProperty('--spotlight-opacity', '0')
    el.style.setProperty('--tilt-shadow', '')

    setTimeout(() => {
      if (el) el.style.transition = ''
    }, 400)
  }, [])

  const refCallback = useCallback(
    (el: HTMLElement | null) => {
      const prev = elementRef.current
      if (prev) {
        prev.removeEventListener('mousemove', handleMouseMove)
        prev.removeEventListener('mouseenter', handleMouseEnter)
        prev.removeEventListener('mouseleave', handleMouseLeave)
      }
      elementRef.current = el
      if (!el || !enabled) return
      el.addEventListener('mousemove', handleMouseMove, { passive: true })
      el.addEventListener('mouseenter', handleMouseEnter, { passive: true })
      el.addEventListener('mouseleave', handleMouseLeave, { passive: true })
    },
    [enabled, handleMouseMove, handleMouseEnter, handleMouseLeave],
  )

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      const el = elementRef.current
      if (el) {
        el.removeEventListener('mousemove', handleMouseMove)
        el.removeEventListener('mouseenter', handleMouseEnter)
        el.removeEventListener('mouseleave', handleMouseLeave)
      }
    }
  }, [handleMouseMove, handleMouseEnter, handleMouseLeave])

  return { ref: refCallback }
}
