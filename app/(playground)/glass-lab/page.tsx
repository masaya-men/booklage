'use client'

/**
 * Glass Lab — interactive playground for tuning the liquid-glass effect.
 *
 * Workflow:
 *   1. Pick a background (busy photo / gradient / your own URL or upload)
 *   2. Drag the glass over different colors to evaluate transparency
 *   3. Adjust sliders until the glass reads as "real water droplet"
 *   4. Copy the JSON preset and paste into docs/private/liquid-glass-recipe.md
 *
 * State persists to localStorage (survives reload) and the URL hash (shareable).
 *
 * SVG `backdrop-filter: url(#id)` works only in Chromium-family browsers
 * (Chrome / Edge / Brave / Arc / Opera). Firefox / Safari fall back to a
 * blur-only chain — a banner warns when this is the case.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react'
import { gsap } from 'gsap'
import { Draggable } from 'gsap/Draggable'
import { generateDisplacementMap, type GlassConfig } from '@/lib/glass/displacement-map'
import styles from './glass-lab.module.css'

if (typeof window !== 'undefined') {
  gsap.registerPlugin(Draggable)
}

// ─── Types ────────────────────────────────────────────────────────────

type Shape = 'circle' | 'rounded' | 'rect'

type LabParams = {
  // ── shape & size
  shape: Shape
  size: number
  borderRadius: number
  // ── refraction (Snell, bezel)
  refractiveIndex: number
  strength: number
  bezelPercent: number
  profileExponent: number
  // ── magnification (lens-wide displacement, kube.io "second map")
  magnifyStrength: number
  magnifyExponent: number
  // ── filter chain
  blurStdDev: number
  saturate: number
  specularEnabled: boolean
  specularMaxAlpha: number
  /** stdDeviation for the feGaussianBlur applied to the specular layer.
   *  0 = sharp highlight (current). >0 = soft "specular bloom" depth. */
  specularBloomBlur: number
  // ── surface (CSS layer over the filter)
  bgAlpha: number
  borderAlpha: number
  borderWidth: number
  // ── shadow
  outerShadowBlur: number
  outerShadowAlpha: number
  innerTopHighlightAlpha: number
  innerBottomShadeAlpha: number
  // ── deformation (mouse-reactive water-drop morph)
  deformEnabled: boolean
  deformInfluence: number
  elasticAmplitude: number
  elasticPeriod: number
  deformDuration: number
  hoverScale: number
  // ── stage (background framing + automation)
  bgZoom: number              // background-size multiplier (1 = cover, 2 = 2x)
  centerLock: boolean         // glass snaps back to center
  autoOrbit: boolean          // glass orbits in a circle automatically
  orbitRadius: number         // orbit radius in px
  orbitDuration: number       // seconds per full revolution
  // ── debug
  showDisplacementMap: boolean
}

const DEFAULTS: LabParams = {
  shape: 'circle',
  size: 240,
  borderRadius: 24,
  refractiveIndex: 1.5,
  strength: 24,
  bezelPercent: 0.15,
  profileExponent: 4,
  magnifyStrength: 30,
  magnifyExponent: 2,
  blurStdDev: 0,
  saturate: 1.0,
  specularEnabled: true,
  specularMaxAlpha: 0.3,
  specularBloomBlur: 2,
  bgAlpha: 0,
  borderAlpha: 0.18,
  borderWidth: 1,
  outerShadowBlur: 28,
  outerShadowAlpha: 0.5,
  innerTopHighlightAlpha: 0.55,
  innerBottomShadeAlpha: 0.22,
  deformEnabled: true,
  deformInfluence: 50,
  elasticAmplitude: 1.0,
  elasticPeriod: 0.4,
  deformDuration: 0.6,
  hoverScale: 1.005,
  bgZoom: 1,
  centerLock: false,
  autoOrbit: false,
  orbitRadius: 200,
  orbitDuration: 8,
  showDisplacementMap: false,
}

// ─── Backgrounds ──────────────────────────────────────────────────────
// Mix of image (picsum.photos seeds — deterministic, hotlink-OK), pure CSS
// patterns (best for "did refraction actually bend?" inspection), pure CSS
// gradient (zero network), and DOM text (verifies type-edge bending).
type BgKind = 'image' | 'pattern' | 'gradient' | 'text'
type BgPreset = { id: string; label: string; kind: BgKind; url?: string; className?: string }
const BG_PRESETS: BgPreset[] = [
  { id: 'gradient', label: 'gradient', kind: 'gradient' },
  { id: 'sunset',   label: 'sunset',   kind: 'image', url: 'https://picsum.photos/seed/glass-sunset-7/2000/1400' },
  { id: 'ocean',    label: 'ocean',    kind: 'image', url: 'https://picsum.photos/seed/glass-ocean-3/2000/1400' },
  { id: 'forest',   label: 'forest',   kind: 'image', url: 'https://picsum.photos/seed/glass-forest-5/2000/1400' },
  { id: 'neon',     label: 'neon',     kind: 'image', url: 'https://picsum.photos/seed/glass-neon-12/2000/1400' },
  { id: 'mono',     label: 'mono',     kind: 'image', url: 'https://picsum.photos/seed/glass-mono-9/2000/1400' },
  // Test patterns — straight lines / radial rings / sharp gradient mesh make
  // any displacement immediately visible. Designed for refraction inspection.
  { id: 'checker',  label: 'checker',  kind: 'pattern', className: 'patternChecker' },
  { id: 'rings',    label: 'rings',    kind: 'pattern', className: 'patternRings' },
  { id: 'grid',     label: 'grid',     kind: 'pattern', className: 'patternGrid' },
  { id: 'mesh',     label: 'mesh',     kind: 'pattern', className: 'patternMesh' },
  // DOM text — verify the lens bends typography (not just bitmap pixels).
  { id: 'text',     label: 'text',     kind: 'text' },
]

// ─── Persistence helpers ──────────────────────────────────────────────

const LS_KEY = 'glass-lab-params-v1'

function loadFromStorage(): Partial<LabParams> | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Partial<LabParams>
  } catch { return null }
}

function loadFromHash(): Partial<LabParams> | null {
  try {
    const hash = window.location.hash.replace(/^#/, '')
    if (!hash) return null
    const json = decodeURIComponent(atob(hash))
    return JSON.parse(json) as Partial<LabParams>
  } catch { return null }
}

function detectChromium(): boolean {
  if (typeof window === 'undefined') return true
  const ua = navigator.userAgent
  return /Chrome|Chromium|Edg|Brave|OPR/.test(ua) && !/Firefox|FxiOS/.test(ua)
}

// ─── Component ────────────────────────────────────────────────────────

export default function GlassLabPage(): ReactElement {
  const [params, setParams] = useState<LabParams>(DEFAULTS)
  const [bgPreset, setBgPreset] = useState<string>('sunset')
  const [bgCustomUrl, setBgCustomUrl] = useState<string>('')
  const [bgUploadUrl, setBgUploadUrl] = useState<string>('')
  const [chromium, setChromium] = useState<boolean>(true)
  const [mounted, setMounted] = useState<boolean>(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const glassRef = useRef<HTMLDivElement>(null)

  // ── Hydrate from URL hash > localStorage > defaults (client-only — canvas
  // generation in the displacement map needs `document`, and we want to skip
  // SSR rendering of the SVG filter to avoid empty-href warnings).
  useEffect(() => {
    const fromHash = loadFromHash()
    const fromLs = loadFromStorage()
    const merged = { ...DEFAULTS, ...(fromLs ?? {}), ...(fromHash ?? {}) }
    setParams(merged)
    setChromium(detectChromium())
    setMounted(true)
  }, [])

  // ── Persist on change (debounced)
  useEffect(() => {
    const t = window.setTimeout(() => {
      try { localStorage.setItem(LS_KEY, JSON.stringify(params)) } catch { /* ignore */ }
    }, 150)
    return (): void => window.clearTimeout(t)
  }, [params])

  // ── Derive effective borderRadius from shape
  const effectiveRadius = useMemo<number>(() => {
    if (params.shape === 'circle') return params.size / 2
    if (params.shape === 'rect') return params.borderRadius
    return params.borderRadius
  }, [params.shape, params.size, params.borderRadius])

  const effectiveWidth = useMemo<number>(() => {
    return params.shape === 'rect' ? Math.round(params.size * 1.6) : params.size
  }, [params.shape, params.size])
  const effectiveHeight = params.size

  // ── Generate displacement map whenever refraction or magnify params change
  const filterId = 'glass-lab-filter'
  const map = useMemo(() => {
    if (typeof window === 'undefined') return { displacement: '', specular: '', maxDisplacement: 0 }
    const cfg: GlassConfig = {
      width: effectiveWidth,
      height: effectiveHeight,
      borderRadius: effectiveRadius,
      strength: params.strength,
      bezelPercent: params.bezelPercent,
      profileExponent: params.profileExponent,
      refractiveIndex: params.refractiveIndex,
      magnifyStrength: params.magnifyStrength,
      magnifyExponent: params.magnifyExponent,
    }
    return generateDisplacementMap(cfg)
  }, [
    effectiveWidth, effectiveHeight, effectiveRadius,
    params.strength, params.bezelPercent, params.profileExponent, params.refractiveIndex,
    params.magnifyStrength, params.magnifyExponent,
  ])

  // ── Mount Draggable + mouse-reactive deformation + auto-orbit + center-lock
  useLayoutEffect(() => {
    const el = glassRef.current
    if (!el) return
    const drag = Draggable.create(el, {
      type: 'x,y',
      bounds: stageRef.current ?? undefined,
      inertia: false,
      onDragEnd(): void {
        if (params.centerLock) {
          gsap.to(el, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.5)' })
        }
      },
    })

    let raf = 0
    const base = effectiveRadius
    const influencePx = Math.max(2, base * (params.deformInfluence / 100))

    // Auto-orbit: glass moves in a circle on a GSAP timeline. Uses keyframes
    // around the circle so the path is exactly circular (rather than two
    // overshooting tweens). Killed when toggle goes off or component unmounts.
    let orbitTl: gsap.core.Timeline | null = null
    if (params.autoOrbit) {
      const r = params.orbitRadius
      const steps = 64
      orbitTl = gsap.timeline({ repeat: -1 })
      for (let i = 1; i <= steps; i++) {
        const theta = (i / steps) * Math.PI * 2
        orbitTl.to(el, {
          x: Math.cos(theta) * r,
          y: Math.sin(theta) * r,
          duration: params.orbitDuration / steps,
          ease: 'none',
        })
      }
    }

    const onMove = (e: MouseEvent): void => {
      if (!params.deformEnabled) return
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect()
        const mx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
        const my = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
        const tl = 1 - Math.min(1, Math.hypot(mx, my) / 1.2)
        const tr = 1 - Math.min(1, Math.hypot(1 - mx, my) / 1.2)
        const br = 1 - Math.min(1, Math.hypot(1 - mx, 1 - my) / 1.2)
        const bl = 1 - Math.min(1, Math.hypot(mx, 1 - my) / 1.2)
        gsap.to(el, {
          borderTopLeftRadius:     base + influencePx * tl,
          borderTopRightRadius:    base + influencePx * tr,
          borderBottomRightRadius: base + influencePx * br,
          borderBottomLeftRadius:  base + influencePx * bl,
          duration: params.deformDuration,
          ease: `elastic.out(${params.elasticAmplitude}, ${params.elasticPeriod})`,
          overwrite: 'auto',
        })
      })
    }

    const onEnter = (): void => {
      gsap.to(el, { scale: params.hoverScale, duration: 0.4, ease: 'elastic.out(1, 0.5)' })
    }
    const onLeave = (): void => {
      cancelAnimationFrame(raf)
      gsap.to(el, {
        borderRadius: base,
        scale: 1,
        duration: 0.8,
        ease: `elastic.out(${params.elasticAmplitude}, 0.3)`,
        overwrite: 'auto',
      })
    }

    el.addEventListener('mousemove', onMove, { passive: true })
    el.addEventListener('mouseenter', onEnter)
    el.addEventListener('mouseleave', onLeave)

    return (): void => {
      cancelAnimationFrame(raf)
      el.removeEventListener('mousemove', onMove)
      el.removeEventListener('mouseenter', onEnter)
      el.removeEventListener('mouseleave', onLeave)
      drag.forEach((d) => d.kill())
      orbitTl?.kill()
      gsap.set(el, { clearProps: 'borderRadius,scale,x,y' })
    }
  }, [
    effectiveRadius,
    params.deformEnabled, params.deformInfluence,
    params.elasticAmplitude, params.elasticPeriod,
    params.deformDuration, params.hoverScale,
    params.centerLock, params.autoOrbit, params.orbitRadius, params.orbitDuration,
  ])

  // ── Resolve background source
  const activePreset = BG_PRESETS.find((b) => b.id === bgPreset)
  const explicitImageUrl = bgUploadUrl || bgCustomUrl
  // If user typed/uploaded a URL it overrides any preset (becomes 'image' kind)
  const bgKind: BgKind = explicitImageUrl ? 'image' : (activePreset?.kind ?? 'gradient')
  const bgImageUrl: string | null = explicitImageUrl || (activePreset?.kind === 'image' ? activePreset.url ?? null : null)
  const bgPatternClass: string | null = activePreset?.kind === 'pattern' ? (activePreset.className ?? null) : null

  const stageBg: CSSProperties = bgImageUrl
    ? {
        backgroundImage: `url("${bgImageUrl}")`,
        backgroundSize: `${100 * params.bgZoom}% auto`,
      }
    : {}

  // The glass is positioned by margin (not transform: translate(-50%, -50%))
  // so GSAP Draggable's transform updates don't fight the centering offset.
  const glassStyle: CSSProperties = {
    width: effectiveWidth,
    height: effectiveHeight,
    borderRadius: effectiveRadius,
    background: `rgba(255, 255, 255, ${params.bgAlpha})`,
    border: `${params.borderWidth}px solid rgba(255, 255, 255, ${params.borderAlpha})`,
    boxShadow: [
      `0 ${params.outerShadowBlur * 0.5}px ${params.outerShadowBlur * 1.5}px rgba(0,0,0,${params.outerShadowAlpha})`,
      `inset 0 2px 2px rgba(255,255,255,${params.innerTopHighlightAlpha})`,
      `inset 0 -3px 6px rgba(0,0,0,${params.innerBottomShadeAlpha})`,
    ].join(', '),
    backdropFilter: chromium
      ? `url(#${filterId})`
      : `blur(${params.blurStdDev}px) saturate(${params.saturate * 100}%)`,
    WebkitBackdropFilter: chromium
      ? `url(#${filterId})`
      : `blur(${params.blurStdDev}px) saturate(${params.saturate * 100}%)`,
    left: '50%',
    top: '50%',
    marginLeft: -effectiveWidth / 2,
    marginTop: -effectiveHeight / 2,
    isolation: 'isolate',
  }

  // ── Action handlers
  const update = useCallback(<K extends keyof LabParams>(key: K, val: LabParams[K]): void => {
    setParams((p) => ({ ...p, [key]: val }))
  }, [])

  const reset = useCallback((): void => {
    setParams(DEFAULTS)
    try { localStorage.removeItem(LS_KEY) } catch { /* ignore */ }
    if (window.location.hash) history.replaceState(null, '', window.location.pathname)
  }, [])

  const copyJson = useCallback(async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(params, null, 2))
      // eslint-disable-next-line no-console
      console.info('Glass-lab preset copied to clipboard')
    } catch { /* ignore */ }
  }, [params])

  const copyShareUrl = useCallback(async (): Promise<void> => {
    try {
      const hash = btoa(encodeURIComponent(JSON.stringify(params)))
      const url = `${window.location.origin}${window.location.pathname}#${hash}`
      await navigator.clipboard.writeText(url)
      // eslint-disable-next-line no-console
      console.info('Shareable URL copied')
    } catch { /* ignore */ }
  }, [params])

  const onUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0]
    if (!f) return
    if (bgUploadUrl) URL.revokeObjectURL(bgUploadUrl)
    setBgUploadUrl(URL.createObjectURL(f))
  }, [bgUploadUrl])

  // ─── Render ─────────────────────────────────────────────────────────
  return (
    <div className={styles.shell}>
      {/* Hidden SVG filter — only render on the client once the displacement
          map data URLs are generated (SSR has no canvas, so they'd be empty
          and React would warn about href=""). */}
      {mounted && map.displacement && (
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" colorInterpolationFilters="sRGB">
        <defs>
          {/* Filter region 300% (= 100% margin per side) so strong Map B
              magnification doesn't clip into black at the corners. Matches
              the production <LiquidGlass> exactly so Lab-tuned previews
              translate 1-to-1 into shipped UI. */}
          <filter id={filterId} x="-100%" y="-100%" width="300%" height="300%">
            {params.blurStdDev > 0 && (
              <feGaussianBlur in="SourceGraphic" stdDeviation={params.blurStdDev} result="blurred" />
            )}
            {params.saturate !== 1 && (
              <feColorMatrix in={params.blurStdDev > 0 ? 'blurred' : 'SourceGraphic'} type="saturate" values={String(params.saturate)} result="saturated" />
            )}
            <feImage href={map.displacement} x="0" y="0" width={effectiveWidth} height={effectiveHeight} result="displacementMap" preserveAspectRatio="none" />
            <feDisplacementMap
              in={
                params.saturate !== 1 ? 'saturated'
                  : params.blurStdDev > 0 ? 'blurred'
                  : 'SourceGraphic'
              }
              in2="displacementMap"
              scale={map.maxDisplacement}
              xChannelSelector="R"
              yChannelSelector="G"
              result="refracted"
            />
            {params.specularEnabled && map.specular && (
              <>
                <feImage href={map.specular} x="0" y="0" width={effectiveWidth} height={effectiveHeight} result="specularRaw" preserveAspectRatio="none" />
                <feColorMatrix
                  in="specularRaw"
                  type="matrix"
                  values={`0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 ${params.specularMaxAlpha} 0`}
                  result="specularTinted"
                />
                {/* Specular bloom: blur the highlight before screen-blending so
                    the rim catches light softly instead of as a sharp white
                    ring. stdDeviation=0 → fall through unchanged. */}
                {params.specularBloomBlur > 0 ? (
                  <>
                    <feGaussianBlur in="specularTinted" stdDeviation={params.specularBloomBlur} result="specularBloomed" />
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
      )}

      {/* ── Stage ───────────────────────────────────────────── */}
      <div ref={stageRef} className={styles.stage} style={stageBg}>
        {bgKind === 'gradient' && <div className={styles.stageGradient} />}
        {bgKind === 'pattern' && bgPatternClass && (
          <div
            className={`${styles.stagePattern} ${styles[bgPatternClass] ?? ''}`}
            style={{ transform: `scale(${params.bgZoom})` }}
          />
        )}
        {bgKind === 'text' && <StageText zoom={params.bgZoom} />}

        <div className={styles.stageInfo}>
          {chromium ? 'Chromium · SVG backdrop-filter active' : '⚠ Non-Chromium · fallback (blur only) shown'}
        </div>
        <div className={styles.stageGuide}>
          ↔ ドラッグ移動 / hover で水滴変形 {params.autoOrbit && '· 🌀 auto-orbit ON'} {params.centerLock && '· 🎯 center-lock ON'}
        </div>

        <div ref={glassRef} className={styles.glass} style={glassStyle}>
          <div className={styles.glassInner} />
        </div>

        {/* Debug: show the actual displacement + specular maps in the bottom-right */}
        {params.showDisplacementMap && map.displacement && (
          <div className={styles.debugMaps}>
            <div className={styles.debugMapsLabel}>displacement</div>
            <img src={map.displacement} alt="displacement map" />
            {map.specular && (
              <>
                <div className={styles.debugMapsLabel}>specular</div>
                <img src={map.specular} alt="specular map" />
              </>
            )}
            <div className={styles.debugMapsLabel}>maxDispl: {map.maxDisplacement.toFixed(2)}px</div>
          </div>
        )}
      </div>

      {/* ── Controls ────────────────────────────────────────── */}
      <aside className={styles.controls}>
        <header className={styles.controlsHeader}>
          <h1 className={styles.title}>🧪 Glass Lab</h1>
          <p className={styles.subtitle}>Tune the liquid-glass effect in real time</p>
          <div className={styles.headerActions}>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={copyJson}>Copy JSON</button>
            <button type="button" className={styles.btn} onClick={copyShareUrl}>Copy URL</button>
            <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={reset}>Reset</button>
          </div>
        </header>

        {/* ── Shape ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Shape</h2>
          <div className={styles.shapeRow}>
            {(['circle', 'rounded', 'rect'] as Shape[]).map((s) => (
              <button
                key={s}
                type="button"
                className={`${styles.shapeBtn} ${params.shape === s ? styles.shapeBtnActive : ''}`}
                onClick={(): void => update('shape', s)}
              >{s}</button>
            ))}
          </div>
          <Slider label="size (px)" value={params.size} min={60} max={420} step={2} onChange={(v): void => update('size', v)} />
          {params.shape !== 'circle' && (
            <Slider label="border-radius (px)" value={params.borderRadius} min={0} max={Math.round(params.size / 2)} step={1} onChange={(v): void => update('borderRadius', v)} />
          )}
        </section>

        {/* ── Refraction (bezel) ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Refraction · bezel (Map A)</h2>
          <Slider label="refractive index n" value={params.refractiveIndex} min={1.0} max={2.4} step={0.01} onChange={(v): void => update('refractiveIndex', v)} />
          <Slider label="strength (max px)" value={params.strength} min={0} max={80} step={1} onChange={(v): void => update('strength', v)} />
          <Slider label="bezel %" value={params.bezelPercent} min={0.05} max={0.5} step={0.01} onChange={(v): void => update('bezelPercent', v)} />
          <Slider label="profile exponent" value={params.profileExponent} min={1} max={8} step={0.1} onChange={(v): void => update('profileExponent', v)} />
        </section>

        {/* ── Magnification (lens-wide displacement) ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Magnification · lens (Map B)</h2>
          <Slider label="magnify strength (px)" value={params.magnifyStrength} min={0} max={80} step={1} onChange={(v): void => update('magnifyStrength', v)} />
          <Slider label="curve exponent" value={params.magnifyExponent} min={0.5} max={4} step={0.05} onChange={(v): void => update('magnifyExponent', v)} />
          <p className={styles.hint}>0 = bezel only · 30+ = obvious lens zoom (kube.io frog look)</p>
        </section>

        {/* ── Blur / Saturate ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Blur / Color</h2>
          <Slider label="blur stdDev" value={params.blurStdDev} min={0} max={12} step={0.1} onChange={(v): void => update('blurStdDev', v)} />
          <Slider label="saturate (1 = neutral)" value={params.saturate} min={0.5} max={2.5} step={0.05} onChange={(v): void => update('saturate', v)} />
        </section>

        {/* ── Specular ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Specular highlight</h2>
          <label className={styles.toggleRow}>
            <input type="checkbox" checked={params.specularEnabled} onChange={(e): void => update('specularEnabled', e.target.checked)} />
            enabled
          </label>
          <Slider label="max alpha" value={params.specularMaxAlpha} min={0} max={1} step={0.01} onChange={(v): void => update('specularMaxAlpha', v)} />
          <Slider label="bloom blur (px)" value={params.specularBloomBlur} min={0} max={12} step={0.1} onChange={(v): void => update('specularBloomBlur', v)} />
          <p className={styles.hint}>0 = sharp highlight · 2+ = soft specular bloom</p>
        </section>

        {/* ── Surface ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Surface (CSS overlay)</h2>
          <Slider label="bg alpha" value={params.bgAlpha} min={0} max={0.4} step={0.005} onChange={(v): void => update('bgAlpha', v)} />
          <Slider label="border alpha" value={params.borderAlpha} min={0} max={0.6} step={0.01} onChange={(v): void => update('borderAlpha', v)} />
          <Slider label="border width (px)" value={params.borderWidth} min={0} max={3} step={0.5} onChange={(v): void => update('borderWidth', v)} />
        </section>

        {/* ── Shadow ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Shadow</h2>
          <Slider label="outer shadow blur" value={params.outerShadowBlur} min={0} max={80} step={1} onChange={(v): void => update('outerShadowBlur', v)} />
          <Slider label="outer shadow alpha" value={params.outerShadowAlpha} min={0} max={0.8} step={0.01} onChange={(v): void => update('outerShadowAlpha', v)} />
          <Slider label="inner top highlight α" value={params.innerTopHighlightAlpha} min={0} max={1} step={0.01} onChange={(v): void => update('innerTopHighlightAlpha', v)} />
          <Slider label="inner bottom shade α" value={params.innerBottomShadeAlpha} min={0} max={0.6} step={0.01} onChange={(v): void => update('innerBottomShadeAlpha', v)} />
        </section>

        {/* ── Deformation ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Deformation (water-drop morph)</h2>
          <label className={styles.toggleRow}>
            <input type="checkbox" checked={params.deformEnabled} onChange={(e): void => update('deformEnabled', e.target.checked)} />
            enabled (mouse-reactive corner morph)
          </label>
          <Slider label="influence %" value={params.deformInfluence} min={0} max={100} step={1} onChange={(v): void => update('deformInfluence', v)} />
          <Slider label="elastic amplitude" value={params.elasticAmplitude} min={0.2} max={2.0} step={0.05} onChange={(v): void => update('elasticAmplitude', v)} />
          <Slider label="elastic period" value={params.elasticPeriod} min={0.1} max={0.8} step={0.02} onChange={(v): void => update('elasticPeriod', v)} />
          <Slider label="duration (s)" value={params.deformDuration} min={0.2} max={1.5} step={0.05} onChange={(v): void => update('deformDuration', v)} />
          <Slider label="hover scale" value={params.hoverScale} min={1.0} max={1.10} step={0.005} onChange={(v): void => update('hoverScale', v)} />
        </section>

        {/* ── Background ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Background</h2>
          <div className={styles.bgGrid}>
            {BG_PRESETS.map((b) => {
              const thumbStyle: CSSProperties =
                b.kind === 'image' && b.url ? { backgroundImage: `url("${b.url}")` }
                : b.kind === 'pattern' && b.className === 'patternChecker' ? { backgroundImage: 'conic-gradient(#fff 25%, #000 0 50%, #fff 0 75%, #000 0)', backgroundSize: '20px 20px' }
                : b.kind === 'pattern' && b.className === 'patternRings' ? { background: 'repeating-radial-gradient(circle, #ff5e62 0 8px, #6a82fb 8px 16px, #00f5a0 16px 24px)' }
                : b.kind === 'pattern' && b.className === 'patternGrid' ? { backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '12px 12px', backgroundColor: '#000' }
                : b.kind === 'pattern' && b.className === 'patternMesh' ? { background: 'radial-gradient(circle at 30% 30%, #ff5e62 0%, transparent 50%), radial-gradient(circle at 70% 70%, #6a82fb 0%, transparent 50%), #00f5a0' }
                : b.kind === 'text' ? { background: '#1a1a22', color: '#fff', display: 'grid', placeItems: 'center', fontSize: '8px' }
                : { background: 'linear-gradient(135deg, #ff5e62, #6a82fb 50%, #00f5a0)' }
              return (
                <div
                  key={b.id}
                  className={`${styles.bgThumb} ${bgPreset === b.id && !bgCustomUrl && !bgUploadUrl ? styles.bgThumbActive : ''}`}
                  style={thumbStyle}
                  title={b.label}
                  onClick={(): void => {
                    setBgPreset(b.id)
                    setBgCustomUrl('')
                    setBgUploadUrl('')
                  }}
                >{b.kind === 'text' ? 'Aa' : ''}</div>
              )
            })}
          </div>
          <input
            className={styles.urlInput}
            type="url"
            placeholder="custom URL (paste image URL)"
            value={bgCustomUrl}
            onChange={(e): void => { setBgCustomUrl(e.target.value); setBgUploadUrl('') }}
          />
          <input
            className={styles.urlInput}
            type="file"
            accept="image/*"
            onChange={onUpload}
          />
          <Slider label="bg zoom" value={params.bgZoom} min={0.5} max={4} step={0.05} onChange={(v): void => update('bgZoom', v)} />
        </section>

        {/* ── Stage automation ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Stage automation</h2>
          <label className={styles.toggleRow}>
            <input type="checkbox" checked={params.centerLock} onChange={(e): void => update('centerLock', e.target.checked)} />
            🎯 center-lock (drop snaps back to center)
          </label>
          <label className={styles.toggleRow}>
            <input type="checkbox" checked={params.autoOrbit} onChange={(e): void => update('autoOrbit', e.target.checked)} />
            🌀 auto-orbit (glass rotates by itself)
          </label>
          {params.autoOrbit && (
            <>
              <Slider label="orbit radius (px)" value={params.orbitRadius} min={50} max={400} step={10} onChange={(v): void => update('orbitRadius', v)} />
              <Slider label="orbit duration (s)" value={params.orbitDuration} min={2} max={20} step={0.5} onChange={(v): void => update('orbitDuration', v)} />
            </>
          )}
        </section>

        {/* ── Debug ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Debug</h2>
          <label className={styles.toggleRow}>
            <input type="checkbox" checked={params.showDisplacementMap} onChange={(e): void => update('showDisplacementMap', e.target.checked)} />
            show displacement + specular maps (overlay)
          </label>
        </section>

        {/* ── Live JSON ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Current preset (JSON)</h2>
          <textarea
            className={styles.recipeOut}
            value={JSON.stringify(params, null, 2)}
            readOnly
            rows={20}
          />
        </section>
      </aside>
    </div>
  )
}

// ─── Stage text background ────────────────────────────────────────────
// Multi-color paragraphs make typography refraction visible. Repeats so the
// text fills any stage size and the glass always has rich content underneath.

function StageText({ zoom }: { readonly zoom: number }): ReactElement {
  const colors = ['#ff5e62', '#ffd86b', '#00f5a0', '#6a82fb', '#c084fc', '#fb7185', '#f9a8d4', '#a3e635']
  const blocks: string[] = [
    'Liquid Glass — Refraction in motion. Watch the edges bend the world behind.',
    'コラージュは整理ツールではなく表現ツール。並べることで意味が生まれる。',
    'Magnifying. Distorting. Bending. Each pixel re-routed by Snell\'s law of refraction.',
    '光は曲がる。境界で角度を変える。それが屈折。それがガラスの本性。',
    'Sweep across strong edges — high contrast makes the bend snap.',
    'Drag the lens. Hover. Release. The droplet bounces back to shape.',
    'displacement / refraction / specular / bloom / shadow / deformation',
    'AllMarks · Bookmark × Collage · 表現としてのブックマーク',
  ]
  // Repeat 4× so even tall stages stay populated.
  const items = Array.from({ length: 4 }, (_, copy) =>
    blocks.map((text, i) => ({ text, color: colors[(i + copy) % colors.length], key: `${copy}-${i}` })),
  ).flat()
  return (
    <div className={styles.stageText} style={{ transform: `scale(${zoom})` }}>
      {items.map((it) => (
        <p key={it.key} style={{ color: it.color }}>{it.text}</p>
      ))}
    </div>
  )
}

// ─── Slider sub-component ─────────────────────────────────────────────

function Slider({
  label, value, min, max, step, onChange,
}: {
  readonly label: string
  readonly value: number
  readonly min: number
  readonly max: number
  readonly step: number
  readonly onChange: (v: number) => void
}): ReactElement {
  const decimals = step < 1 ? Math.max(0, -Math.floor(Math.log10(step))) : 0
  return (
    <div className={styles.row}>
      <label>{label}</label>
      <span className={styles.value}>{value.toFixed(decimals)}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e): void => onChange(parseFloat(e.target.value))}
      />
    </div>
  )
}
