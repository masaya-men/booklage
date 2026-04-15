// lib/glass/LiquidGlassProvider.tsx
'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getDisplacementMap, type GlassStrength } from './displacement-map'

/** Gaussian blur stdDeviation per strength (frosted glass effect) */
const BLUR_SCALE: Record<GlassStrength, number> = {
  subtle: 6,
  medium: 10,
  strong: 14,
}

// navigator.userAgentData is not yet in the standard TypeScript lib types
declare global {
  interface Navigator {
    userAgentData?: {
      brands?: Array<{ brand: string; version: string }>
    }
  }
}

type LiquidGlassContextValue = {
  supportsLiquidGlass: boolean
  registerFilter: (
    id: string,
    width: number,
    height: number,
    borderRadius: number,
    strength?: GlassStrength,
  ) => string
}

const LiquidGlassContext = createContext<LiquidGlassContextValue>({
  supportsLiquidGlass: false,
  registerFilter: () => '',
})

export function useLiquidGlassContext(): LiquidGlassContextValue {
  return useContext(LiquidGlassContext)
}

function detectSvgBackdropFilterSupport(): boolean {
  if (typeof window === 'undefined') return false

  // SVG backdrop-filter (url(#id) syntax) is only supported in Chromium-based browsers.
  // Check 1: basic backdrop-filter support
  const hasBackdropFilter = CSS.supports('backdrop-filter', 'blur(1px)')
  if (!hasBackdropFilter) return false

  // Check 2: Chromium detection (Chrome, Edge, Opera, Brave, Arc, etc.)
  // Chromium exposes `window.chrome` or the "Chromium" brand in userAgentData.
  const isChromium =
    'chrome' in window ||
    (navigator.userAgentData?.brands?.some((b) => b.brand === 'Chromium') ?? false)

  return isChromium
}

type LiquidGlassProviderProps = {
  /** Child components that will have access to the liquid glass context */
  children: React.ReactNode
}

type FilterEntry = {
  id: string
  width: number
  height: number
  borderRadius: number
  strength: GlassStrength
  dataUrl: string
  specularUrl: string
  maxDisplacement: number
  blurAmount: number
}

export function LiquidGlassProvider({ children }: LiquidGlassProviderProps): React.ReactElement {
  const [supported, setSupported] = useState(false)
  const filtersRef = useRef<Map<string, FilterEntry>>(new Map())
  const [filters, setFilters] = useState<FilterEntry[]>([])

  useEffect(() => {
    setSupported(detectSvgBackdropFilterSupport())
  }, [])

  const registerFilter = useCallback(
    (
      id: string,
      width: number,
      height: number,
      borderRadius: number,
      strength: GlassStrength = 'medium',
    ): string => {
      const filterId = `liquid-glass-${id}`
      if (!filtersRef.current.has(filterId)) {
        const { displacement, specular, maxDisplacement } = getDisplacementMap(
          width,
          height,
          borderRadius,
          strength,
        )
        const entry: FilterEntry = {
          id: filterId,
          width,
          height,
          borderRadius,
          strength,
          dataUrl: displacement,
          specularUrl: specular,
          maxDisplacement,
          blurAmount: BLUR_SCALE[strength],
        }
        filtersRef.current.set(filterId, entry)
        setFilters(Array.from(filtersRef.current.values()))
      }
      return filterId
    },
    [],
  )

  const contextValue = useMemo(
    () => ({ supportsLiquidGlass: supported, registerFilter }),
    [supported, registerFilter],
  )

  return (
    <LiquidGlassContext.Provider value={contextValue}>
      {supported && filters.length > 0 && typeof document !== 'undefined' &&
        createPortal(
          <svg
            style={{
              position: 'absolute',
              width: 0,
              height: 0,
              overflow: 'hidden',
              pointerEvents: 'none',
            }}
            colorInterpolationFilters="sRGB"
            aria-hidden="true"
          >
            <defs>
              {filters.map((f) => (
                <filter key={f.id} id={f.id} x="-5%" y="-5%" width="110%" height="110%">
                  {/* Step 1: Frosted glass blur */}
                  <feGaussianBlur
                    in="SourceGraphic"
                    stdDeviation={f.blurAmount}
                    result="frosted"
                  />
                  {/* Step 2: Restore saturation lost by blur */}
                  <feColorMatrix
                    in="frosted"
                    type="saturate"
                    values="1.8"
                    result="saturated"
                  />
                  {/* Step 3: Refraction displacement */}
                  <feImage
                    href={f.dataUrl}
                    x="0"
                    y="0"
                    width={f.width}
                    height={f.height}
                    result="displacement_map"
                  />
                  <feDisplacementMap
                    in="saturated"
                    in2="displacement_map"
                    scale={f.maxDisplacement}
                    xChannelSelector="R"
                    yChannelSelector="G"
                    result="refracted"
                  />
                  {/* Step 4: Specular highlight overlay */}
                  <feImage
                    href={f.specularUrl}
                    x="0"
                    y="0"
                    width={f.width}
                    height={f.height}
                    result="specular"
                  />
                  <feBlend in="refracted" in2="specular" mode="screen" />
                </filter>
              ))}
            </defs>
          </svg>,
          document.body,
        )
      }
      {children}
    </LiquidGlassContext.Provider>
  )
}
