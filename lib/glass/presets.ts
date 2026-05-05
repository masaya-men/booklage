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
 * Pure Map B (magnification) drives the look. Map A (bezel Snell), specular,
 * shadow, and border are all dialled to dormant — but the values are stored
 * VERBATIM as the user set them in the Lab, so re-engaging any single field
 * (e.g. `borderWidth: 1` to wake up the 0.6 alpha border) gives the exact
 * effect the Lab preview hinted at.
 *
 * Why extreme magnify (80 px) on small buttons is fine: any UI placed AS A
 * CHILD of <LiquidGlass> sits ABOVE the backdrop-filter, so the icon /
 * label never gets distorted. Only the page content BEHIND the glass bends.
 */
const LENS_MAGNIFY: GlassPreset = {
  // Map A (bezel) — disabled via strength=0, but ratios kept as user set
  // them in case strength is later raised on a per-instance override.
  strength: 0,
  bezelPercent: 0.05,
  profileExponent: 1,
  refractiveIndex: 2.4,
  // Map B (lens magnification) — the visual core
  magnifyStrength: 80,
  magnifyExponent: 4,
  // Filter chain — fully transparent trio
  blurStdDev: 0,
  saturate: 1,
  // Specular — toggled on but alpha 0 (component skips the chain when alpha=0).
  // Stored as user set so flipping alpha alone re-enables the highlight.
  specularEnabled: true,
  specularMaxAlpha: 0,
  specularBloomBlur: 0,
  // Surface — completely transparent. Border alpha stored at user value so
  // borderWidth: 1 (override) wakes a clean white outline at 0.6 opacity.
  bgAlpha: 0,
  borderAlpha: 0.6,
  borderWidth: 0,
  // Shadow — same pattern. outerShadowBlur: 16 (override) wakes a 0.78 alpha
  // dark cast that gives the glass a floating-bubble feel.
  outerShadowBlur: 0,
  outerShadowAlpha: 0.78,
  innerTopHighlightAlpha: 1,
  innerBottomShadeAlpha: 0,
}

/**
 * "glass-pill" — toolbar pill preset. Added 2026-05-05.
 *
 * Tuned for small (~40 px tall) pill-shaped buttons containing 14 px text.
 * Differs from lens-magnify in three deliberate ways:
 *
 *   1. magnifyStrength: 24 (was 80) — at 40 px tall, magnify=80 would shift
 *      content nearly 2× the lens height, distorting it past readability.
 *      24 px keeps the lens effect legible while preserving the refraction.
 *   2. innerTopHighlightAlpha: 0 (was 1) — the strong inset white shadow
 *      that gives the play disc its "lit-from-above" feel reads as a thick
 *      tacky white rim on small pills. Replaced with a thin border below.
 *   3. borderWidth/Alpha: 1 / 0.18 (was 0 / 0.6) — a 1 px hair-line at low
 *      alpha gives the pill a discernible glass edge without the heavy
 *      cap-light effect of the inset highlight.
 *
 * The lens-magnify preset itself is unchanged — the play button keeps
 * exactly the same look it had before.
 */
const GLASS_PILL: GlassPreset = {
  // Map A bezel — disabled, same as lens-magnify
  strength: 0,
  bezelPercent: 0.05,
  profileExponent: 1,
  refractiveIndex: 2.4,
  // Map B magnify — pill-tuned (1/3 of lens-magnify strength)
  magnifyStrength: 24,
  magnifyExponent: 4,
  // Filter chain — fully transparent trio
  blurStdDev: 0,
  saturate: 1,
  // Specular — toggled on but alpha 0 (component skips when alpha=0)
  specularEnabled: true,
  specularMaxAlpha: 0,
  specularBloomBlur: 0,
  // Surface — thin hair-line border instead of inset cap-light
  bgAlpha: 0,
  borderAlpha: 0.18,
  borderWidth: 1,
  // Shadow / depth — all dormant
  outerShadowBlur: 0,
  outerShadowAlpha: 0.78,
  innerTopHighlightAlpha: 0,
  innerBottomShadeAlpha: 0,
}

export const PRESETS = {
  'lens-magnify': LENS_MAGNIFY,
  'glass-pill': GLASS_PILL,
} as const

export type PresetName = keyof typeof PRESETS
