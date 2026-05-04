'use client'

/**
 * <LiquidGlass> — production wrapper for the liquid-glass effect.
 *
 * Renders an element (button or div) with an inline SVG filter that bends
 * its backdrop using a Snell-law displacement map plus an optional lens-wide
 * magnification. Visual params come from a named preset in `lib/glass/presets`
 * so multiple call sites share one look.
 *
 * Children render ABOVE the backdrop-filter — the play triangle / close × /
 * label is never distorted, only what sits BEHIND the glass element bends.
 *
 * Browser support: SVG `backdrop-filter: url()` is Chromium-only. Firefox /
 * Safari fall back to a plain `blur(...)` matching the preset's blurStdDev,
 * so they get a frosted disc instead of a refractive lens — degraded but
 * not broken.
 */

import {
  forwardRef, useEffect, useId, useMemo, useState,
  type CSSProperties, type MouseEventHandler, type ReactNode, type Ref,
} from 'react'
import { generateDisplacementMap, type GlassConfig } from '@/lib/glass/displacement-map'
import { PRESETS, type GlassPreset, type PresetName } from '@/lib/glass/presets'

type Shape = 'circle' | 'rounded' | 'rect'

export type LiquidGlassProps = {
  /** Preset name from `lib/glass/presets` (default 'lens-magnify') */
  readonly preset?: PresetName
  /** Shape — controls how borderRadius / width / height are derived */
  readonly shape?: Shape
  /** Size in px. For circle / rounded this is both width AND height. For
   *  rect this is height; pair with `width`. */
  readonly size: number
  /** Width override for `rect` shape (defaults to `size`) */
  readonly width?: number
  /** Border radius for `rounded` / `rect` (ignored for circle = always size/2) */
  readonly borderRadius?: number
  /** Render as button (with click) or div (decoration). Default 'div' */
  readonly as?: 'button' | 'div'
  readonly onClick?: MouseEventHandler<HTMLElement>
  readonly 'aria-label'?: string
  readonly children?: ReactNode
  readonly className?: string
  readonly style?: CSSProperties
  /** Per-instance overrides on top of the preset (rare) */
  readonly override?: Partial<GlassPreset>
}

function detectChromium(): boolean {
  if (typeof window === 'undefined') return true
  const ua = navigator.userAgent
  return /Chrome|Chromium|Edg|Brave|OPR/.test(ua) && !/Firefox|FxiOS/.test(ua)
}

export const LiquidGlass = forwardRef<HTMLElement, LiquidGlassProps>(function LiquidGlass(
  {
    preset = 'lens-magnify',
    shape = 'circle',
    size,
    width,
    borderRadius,
    as = 'div',
    onClick,
    'aria-label': ariaLabel,
    children,
    className,
    style,
    override,
  },
  ref,
) {
  const cfg: GlassPreset = useMemo(() => ({ ...PRESETS[preset], ...override }), [preset, override])

  const w = shape === 'rect' ? (width ?? size) : size
  const h = size
  const r = shape === 'circle' ? size / 2 : (borderRadius ?? Math.round(size * 0.2))

  // Unique filter id per instance — stable across SSR/CSR via useId.
  const rawId = useId()
  const filterId = `lg-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`

  // Displacement map is canvas-generated → client-only. Until it lands the
  // backdrop falls through unfiltered (browser ignores unresolved url()).
  // No flash in practice because Lightbox open animation runs ~400 ms,
  // plenty of time for the map to compute (~5–15 ms).
  const [map, setMap] = useState<{
    displacement: string
    specular: string
    maxDisplacement: number
  }>({ displacement: '', specular: '', maxDisplacement: 0 })

  useEffect(() => {
    const c: GlassConfig = {
      width: w, height: h, borderRadius: r,
      strength: cfg.strength,
      bezelPercent: cfg.bezelPercent,
      profileExponent: cfg.profileExponent,
      refractiveIndex: cfg.refractiveIndex,
      magnifyStrength: cfg.magnifyStrength,
      magnifyExponent: cfg.magnifyExponent,
    }
    setMap(generateDisplacementMap(c))
  }, [
    w, h, r,
    cfg.strength, cfg.bezelPercent, cfg.profileExponent, cfg.refractiveIndex,
    cfg.magnifyStrength, cfg.magnifyExponent,
  ])

  const [chromium, setChromium] = useState<boolean>(true)
  useEffect(() => { setChromium(detectChromium()) }, [])

  const fallbackFilter = `blur(${cfg.blurStdDev}px) saturate(${cfg.saturate * 100}%)`
  const backdropFilter = chromium && map.displacement
    ? `url(#${filterId})`
    : fallbackFilter

  const glassStyle: CSSProperties = {
    width: w,
    height: h,
    borderRadius: r,
    background: cfg.bgAlpha > 0 ? `rgba(255, 255, 255, ${cfg.bgAlpha})` : 'transparent',
    border: cfg.borderWidth > 0
      ? `${cfg.borderWidth}px solid rgba(255, 255, 255, ${cfg.borderAlpha})`
      : '0',
    boxShadow: [
      cfg.outerShadowBlur > 0
        ? `0 ${cfg.outerShadowBlur * 0.5}px ${cfg.outerShadowBlur * 1.5}px rgba(0, 0, 0, ${cfg.outerShadowAlpha})`
        : null,
      cfg.innerTopHighlightAlpha > 0
        ? `inset 0 2px 2px rgba(255, 255, 255, ${cfg.innerTopHighlightAlpha})`
        : null,
      cfg.innerBottomShadeAlpha > 0
        ? `inset 0 -3px 6px rgba(0, 0, 0, ${cfg.innerBottomShadeAlpha})`
        : null,
    ].filter(Boolean).join(', ') || 'none',
    backdropFilter,
    WebkitBackdropFilter: backdropFilter,
    isolation: 'isolate',
    appearance: 'none',
    WebkitAppearance: 'none',
    padding: 0,
    font: 'inherit',
    color: 'inherit',
    cursor: as === 'button' ? 'pointer' : undefined,
    display: 'grid',
    placeItems: 'center',
    overflow: 'hidden',
    ...style,
  }

  // Filter region of 300% × 300% (= 100% margin on each side) accommodates
  // strong magnification — Map B can sample pixels well outside the element
  // bounds when magnifyStrength approaches or exceeds the element radius.
  // Below 200% the corners go black on small elements (e.g. 36 px close
  // button at magnifyStrength: 80). Lab uses the same region so what the
  // user previewed matches what the production component renders.
  const filterEl = chromium && map.displacement && (
    <svg
      width="0"
      height="0"
      style={{ position: 'absolute', pointerEvents: 'none' }}
      aria-hidden="true"
      colorInterpolationFilters="sRGB"
    >
      <defs>
        <filter id={filterId} x="-100%" y="-100%" width="300%" height="300%">
          {cfg.blurStdDev > 0 && (
            <feGaussianBlur in="SourceGraphic" stdDeviation={cfg.blurStdDev} result="blurred" />
          )}
          {cfg.saturate !== 1 && (
            <feColorMatrix
              in={cfg.blurStdDev > 0 ? 'blurred' : 'SourceGraphic'}
              type="saturate"
              values={String(cfg.saturate)}
              result="saturated"
            />
          )}
          <feImage
            href={map.displacement}
            x="0" y="0" width={w} height={h}
            result="displacementMap"
            preserveAspectRatio="none"
          />
          <feDisplacementMap
            in={
              cfg.saturate !== 1 ? 'saturated'
              : cfg.blurStdDev > 0 ? 'blurred'
              : 'SourceGraphic'
            }
            in2="displacementMap"
            scale={map.maxDisplacement}
            xChannelSelector="R"
            yChannelSelector="G"
            result="refracted"
          />
          {cfg.specularEnabled && cfg.specularMaxAlpha > 0 && map.specular && (
            <>
              <feImage
                href={map.specular}
                x="0" y="0" width={w} height={h}
                result="specularRaw"
                preserveAspectRatio="none"
              />
              <feColorMatrix
                in="specularRaw"
                type="matrix"
                values={`0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 ${cfg.specularMaxAlpha} 0`}
                result="specularTinted"
              />
              {cfg.specularBloomBlur > 0 ? (
                <>
                  <feGaussianBlur
                    in="specularTinted"
                    stdDeviation={cfg.specularBloomBlur}
                    result="specularBloomed"
                  />
                  <feBlend in="refracted" in2="specularBloomed" mode="screen" />
                </>
              ) : (
                <feBlend in="refracted" in2="specularTinted" mode="screen" />
              )}
            </>
          )}
        </filter>
      </defs>
    </svg>
  )

  if (as === 'button') {
    return (
      <>
        {filterEl}
        <button
          ref={ref as Ref<HTMLButtonElement>}
          type="button"
          className={className}
          style={glassStyle}
          onClick={onClick}
          aria-label={ariaLabel}
        >
          {children}
        </button>
      </>
    )
  }

  return (
    <>
      {filterEl}
      <div
        ref={ref as Ref<HTMLDivElement>}
        className={className}
        style={glassStyle}
        aria-label={ariaLabel}
      >
        {children}
      </div>
    </>
  )
})
