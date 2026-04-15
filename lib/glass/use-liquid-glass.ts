// lib/glass/use-liquid-glass.ts
'use client'

import { useCallback, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { useLiquidGlassContext } from './LiquidGlassProvider'
import type { GlassStrength } from './displacement-map'

type UseLiquidGlassOptions = {
  /** Unique identifier for this glass element (used to key the SVG filter) */
  id: string
  /** Refraction intensity preset */
  strength?: GlassStrength
  /** Corner radius in pixels, must match the element's CSS border-radius */
  borderRadius?: number
  /**
   * When true, skips ResizeObserver — use for elements whose size never changes
   * after mount (e.g. fixed-size toolbar buttons)
   */
  fixedSize?: boolean
  /**
   * Enable mouse-reactive bouncy deformation.
   * Default: true for medium/strong strength, false for subtle (cards).
   */
  deformation?: boolean
}

type UseLiquidGlassReturn = {
  /** Attach to the target element via ref prop */
  ref: React.RefCallback<HTMLElement>
  /** Add to className — 'liquid-glass-active' or 'liquid-glass-fallback' */
  className: string
  /** Inline style with the correct backdrop-filter value */
  style: React.CSSProperties
}

// Extend CSSProperties to include webkit-prefixed property not in the standard type
type ExtendedCSSProperties = React.CSSProperties & {
  WebkitBackdropFilter?: string
}

/** Fallback backdrop-filter per strength (non-Chromium browsers) */
const FALLBACK_BLUR: Record<GlassStrength, string> = {
  subtle: 'blur(12px) saturate(180%)',
  medium: 'blur(20px) saturate(180%)',
  strong: 'blur(28px) saturate(180%)',
}

export function useLiquidGlass({
  id,
  strength = 'medium',
  borderRadius = 16,
  fixedSize = false,
  deformation,
}: UseLiquidGlassOptions): UseLiquidGlassReturn {
  const { supportsLiquidGlass, registerFilter } = useLiquidGlassContext()
  const [filterId, setFilterId] = useState<string | null>(null)
  const elementRef = useRef<HTMLElement | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  // Default: deformation on for medium/strong (panels), off for subtle (cards)
  const enableDeformation = deformation ?? strength !== 'subtle'

  const measureAndRegister = useCallback(
    (el: HTMLElement): void => {
      const rect = el.getBoundingClientRect()
      const w = Math.round(rect.width)
      const h = Math.round(rect.height)
      if (w > 0 && h > 0) {
        const fId = registerFilter(id, w, h, borderRadius, strength)
        setFilterId(fId)
      }
    },
    [id, borderRadius, strength, registerFilter],
  )

  const refCallback = useCallback(
    (el: HTMLElement | null): void => {
      // Clean up previous element's observers and listeners
      if (cleanupRef.current) {
        cleanupRef.current()
        cleanupRef.current = null
      }

      elementRef.current = el
      if (!el) return

      const cleanups: Array<() => void> = []

      // ── SVG Filter Registration (Chromium only) ──
      if (supportsLiquidGlass) {
        measureAndRegister(el)

        if (!fixedSize) {
          const observer = new ResizeObserver(() => {
            if (elementRef.current) {
              measureAndRegister(elementRef.current)
            }
          })
          observer.observe(el)
          cleanups.push(() => observer.disconnect())
        }
      }

      // ── Bouncy Deformation (mouse-reactive organic morph) ──
      if (enableDeformation) {
        const base = borderRadius
        // Deformation influence: 50% of base radius, minimum 4px
        const influence = Math.max(4, Math.round(base * 0.5))
        let raf = 0

        const handleMouseMove = (e: MouseEvent): void => {
          cancelAnimationFrame(raf)
          raf = requestAnimationFrame(() => {
            const target = elementRef.current
            if (!target) return
            const rect = target.getBoundingClientRect()

            // Normalized mouse position (0–1)
            const mx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
            const my = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))

            // Proximity to each corner (0 = far, ~0.83 = on top of corner)
            const tl = 1 - Math.min(1, Math.sqrt(mx * mx + my * my) / 1.2)
            const tr = 1 - Math.min(1, Math.sqrt((1 - mx) ** 2 + my * my) / 1.2)
            const br = 1 - Math.min(1, Math.sqrt((1 - mx) ** 2 + (1 - my) ** 2) / 1.2)
            const bl = 1 - Math.min(1, Math.sqrt(mx * mx + (1 - my) ** 2) / 1.2)

            gsap.to(target, {
              borderTopLeftRadius: base + influence * tl,
              borderTopRightRadius: base + influence * tr,
              borderBottomRightRadius: base + influence * br,
              borderBottomLeftRadius: base + influence * bl,
              duration: 0.6,
              ease: 'elastic.out(1, 0.4)',
              overwrite: 'auto',
            })
          })
        }

        const handleMouseEnter = (): void => {
          gsap.to(el, {
            scale: 1.005,
            duration: 0.4,
            ease: 'elastic.out(1, 0.5)',
          })
        }

        const handleMouseLeave = (): void => {
          cancelAnimationFrame(raf)
          gsap.to(el, {
            borderTopLeftRadius: base,
            borderTopRightRadius: base,
            borderBottomRightRadius: base,
            borderBottomLeftRadius: base,
            scale: 1,
            duration: 0.8,
            ease: 'elastic.out(1, 0.3)',
            overwrite: 'auto',
          })
        }

        el.addEventListener('mousemove', handleMouseMove, { passive: true })
        el.addEventListener('mouseenter', handleMouseEnter)
        el.addEventListener('mouseleave', handleMouseLeave)

        cleanups.push(() => {
          cancelAnimationFrame(raf)
          el.removeEventListener('mousemove', handleMouseMove)
          el.removeEventListener('mouseenter', handleMouseEnter)
          el.removeEventListener('mouseleave', handleMouseLeave)
          gsap.set(el, { clearProps: 'borderRadius,scale' })
        })
      }

      // Combined cleanup for this element
      cleanupRef.current = () => {
        for (const fn of cleanups) fn()
      }
    },
    [supportsLiquidGlass, fixedSize, measureAndRegister, enableDeformation, borderRadius],
  )

  const fallbackValue = FALLBACK_BLUR[strength]
  const style: ExtendedCSSProperties =
    supportsLiquidGlass && filterId
      ? {
          backdropFilter: `url(#${filterId})`,
          WebkitBackdropFilter: `url(#${filterId})`,
        }
      : {
          backdropFilter: fallbackValue,
          WebkitBackdropFilter: fallbackValue,
        }

  return {
    ref: refCallback,
    className: supportsLiquidGlass ? 'liquid-glass-active' : 'liquid-glass-fallback',
    style,
  }
}
