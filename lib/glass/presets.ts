/**
 * Production presets for <LiquidGlass>.
 *
 * Each preset is a fully-resolved set of visual params, tuned in the Glass
 * Lab (`/glass-lab`) and locked here so multiple call sites share one look.
 *
 * Shape (circle / rounded / rect) and size are NOT in the preset — they're
 * passed per-instance so the same preset can dress a 36 px close button or
 * a 92 px play button with the same visual language.
 *
 * Adding a new preset:
 *   1. Tune in the Lab → Copy JSON
 *   2. Drop dead-code fields (the recipe doc has the rules)
 *   3. Paste here as a new entry, register in PRESETS
 *   4. Update PresetName union (auto-derived below)
 */

export type GlassPreset = {
  // ── refraction Map A — bezel Snell (set strength=0 to disable)
  strength: number
  bezelPercent: number
  profileExponent: number
  refractiveIndex: number
  // ── refraction Map B — lens-wide magnification (set magnifyStrength=0 to disable)
  magnifyStrength: number
  magnifyExponent: number
  // ── filter chain (frosting + colour shift + specular bloom)
  blurStdDev: number
  saturate: number
  specularEnabled: boolean
  specularMaxAlpha: number
  specularBloomBlur: number
  // ── surface (CSS layer over the backdrop-filter)
  bgAlpha: number
  borderAlpha: number
  borderWidth: number
  // ── shadow / depth
  outerShadowBlur: number
  outerShadowAlpha: number
  innerTopHighlightAlpha: number
  innerBottomShadeAlpha: number
}

/**
 * "lens-magnify" — v1 baseline. User-confirmed 2026-05-04.
 *
 * Pure Map B (magnification) — no bezel refraction, no shadow, no border.
 * Identity comes from the strong inner top highlight (white crescent at the
 * top inside) plus the heavy lens distortion at the edges.
 *
 * Why no bezel: cleaner / more "soap-bubble" feel. The visual centre of the
 * piece is the magnify hot-ring, not a separate refractive rim.
 *
 * Why extreme magnify (80 px) on small buttons is fine: any UI placed AS A
 * CHILD of <LiquidGlass> sits ABOVE the backdrop-filter, so the icon /
 * label never gets distorted. Only the page content BEHIND the glass bends.
 */
const LENS_MAGNIFY: GlassPreset = {
  strength: 0,
  bezelPercent: 0.15,        // unused (strength=0); kept at sensible default for re-use
  profileExponent: 4,         // unused (strength=0)
  refractiveIndex: 1.5,       // unused (strength=0)
  magnifyStrength: 80,
  magnifyExponent: 4,
  blurStdDev: 0,
  saturate: 1,
  specularEnabled: false,     // user kept alpha=0 → skip computation entirely
  specularMaxAlpha: 0,
  specularBloomBlur: 0,
  bgAlpha: 0,
  borderAlpha: 0,             // user had borderWidth=0 → border invisible regardless
  borderWidth: 0,
  outerShadowBlur: 0,
  outerShadowAlpha: 0,        // user had blur=0 → shadow invisible regardless
  innerTopHighlightAlpha: 1,
  innerBottomShadeAlpha: 0,
}

export const PRESETS = {
  'lens-magnify': LENS_MAGNIFY,
} as const

export type PresetName = keyof typeof PRESETS
