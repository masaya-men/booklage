// lib/glass/LiquidGlassProvider.tsx
'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { getDisplacementMap, type GlassStrength } from './displacement-map'

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
  const testEl = document.createElement('div')
  testEl.style.cssText = 'backdrop-filter: url(#test); -webkit-backdrop-filter: url(#test);'
  document.body.appendChild(testEl)
  const computed =
    getComputedStyle(testEl).backdropFilter ||
    // Cast to access webkit-prefixed property not in standard CSSStyleDeclaration
    (getComputedStyle(testEl) as unknown as Record<string, string>)['-webkit-backdrop-filter']
  document.body.removeChild(testEl)
  return typeof computed === 'string' && computed.includes('url(')
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
        const dataUrl = getDisplacementMap(width, height, borderRadius, strength)
        const entry: FilterEntry = { id: filterId, width, height, borderRadius, strength, dataUrl }
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
      {supported && filters.length > 0 && (
        <svg
          style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
          colorInterpolationFilters="sRGB"
          aria-hidden="true"
        >
          <defs>
            {filters.map((f) => (
              <filter key={f.id} id={f.id} x="0" y="0" width="100%" height="100%">
                <feImage
                  href={f.dataUrl}
                  x="0"
                  y="0"
                  width={f.width}
                  height={f.height}
                  result="displacement_map"
                />
                <feDisplacementMap
                  in="SourceGraphic"
                  in2="displacement_map"
                  scale={f.strength === 'strong' ? 24 : f.strength === 'medium' ? 16 : 8}
                  xChannelSelector="R"
                  yChannelSelector="G"
                />
              </filter>
            ))}
          </defs>
        </svg>
      )}
      {children}
    </LiquidGlassContext.Provider>
  )
}
