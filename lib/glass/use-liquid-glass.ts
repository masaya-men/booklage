// lib/glass/use-liquid-glass.ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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

export function useLiquidGlass({
  id,
  strength = 'medium',
  borderRadius = 16,
  fixedSize = false,
}: UseLiquidGlassOptions): UseLiquidGlassReturn {
  const { supportsLiquidGlass, registerFilter } = useLiquidGlassContext()
  const [filterId, setFilterId] = useState<string | null>(null)
  const elementRef = useRef<HTMLElement | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)

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
      if (observerRef.current) {
        observerRef.current.disconnect()
        observerRef.current = null
      }
      elementRef.current = el
      if (!el || !supportsLiquidGlass) return

      measureAndRegister(el)

      if (!fixedSize) {
        observerRef.current = new ResizeObserver(() => {
          if (elementRef.current) {
            measureAndRegister(elementRef.current)
          }
        })
        observerRef.current.observe(el)
      }
    },
    [supportsLiquidGlass, fixedSize, measureAndRegister],
  )

  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [])

  const style: ExtendedCSSProperties =
    supportsLiquidGlass && filterId
      ? {
          backdropFilter: `url(#${filterId})`,
          WebkitBackdropFilter: `url(#${filterId})`,
        }
      : {
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        }

  return {
    ref: refCallback,
    className: supportsLiquidGlass ? 'liquid-glass-active' : 'liquid-glass-fallback',
    style,
  }
}
