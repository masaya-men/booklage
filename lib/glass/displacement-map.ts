/**
 * Physics-based glass refraction displacement map generator.
 *
 * Technique: kube.io-style approach.
 * 1. Model glass surface as a convex squircle profile
 * 2. Compute surface normals via numerical derivative
 * 3. Apply Snell's Law (n=refractiveIndex) to get refracted ray angle
 * 4. Derive per-pixel displacement magnitude
 * 5. Generate specular highlight from Fresnel/rim-lighting model
 *
 * Output encodes per-pixel displacement vectors as RGB:
 *   R = horizontal displacement (128 = none)
 *   G = vertical   displacement (128 = none)
 *   B = unused (128)
 *   A = 255 (constant — α<255 is the classic "glass goes black" bug)
 */

export type GlassConfig = {
  /** Element width in pixels */
  readonly width: number
  /** Element height in pixels */
  readonly height: number
  /** Corner radius in pixels (set to width/2 for a full circle) */
  readonly borderRadius: number
  /** Maximum displacement at the steepest part of the bezel, in pixels */
  readonly strength: number
  /** Bezel as fraction of the smaller dimension (0.05–0.5). Wider bezel = softer curve */
  readonly bezelPercent: number
  /** Convex squircle profile exponent. 4 = classic squircle, higher = flatter top */
  readonly profileExponent: number
  /** Snell's law refractive index. 1.0 = no bend, 1.5 = glass, 2.4 = diamond */
  readonly refractiveIndex: number
  /**
   * Magnification displacement applied across the WHOLE interior — not just the
   * bezel. This is the "second displacement map" kube.io's Magnifying Glass demo
   * uses to give the lens a real zoom effect (frog eyes look bigger). Pixels are
   * pulled inward with a magnitude that ramps from 0 at center to this value at
   * the lens edge. Set to 0 to disable (pure-bezel refraction only).
   */
  readonly magnifyStrength: number
  /**
   * Curve of the magnification ramp from center to edge.
   *   1   → linear  (uniform zoom across the whole lens)
   *   2   → quadratic (gentle in center, accelerates outward — most realistic)
   *   0.5 → sqrt (fast ramp near center, levels off at edge)
   */
  readonly magnifyExponent: number
}

export type DisplacementResult = {
  readonly displacement: string
  readonly specular: string
  readonly maxDisplacement: number
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}

/** Convex squircle thickness profile. x: 0 (edge) → 1 (center). Returns 0..1 */
function glassProfile(x: number, exponent: number): number {
  const c = clamp01(x)
  return Math.pow(1 - Math.pow(1 - c, exponent), 1 / exponent)
}

/** Outward normal angle (rad) via numerical derivative of the profile */
function surfaceNormal(distFromEdge: number, exponent: number): number {
  const delta = 0.001
  const y1 = glassProfile(distFromEdge - delta, exponent)
  const y2 = glassProfile(distFromEdge + delta, exponent)
  const derivative = (y2 - y1) / (2 * delta)
  return Math.atan2(1, -derivative)
}

/** Snell's law → displacement magnitude (px) the background shifts by */
function refractionDisplacement(
  normalAngle: number,
  glassThickness: number,
  refractiveIndex: number,
): number {
  const incidentAngle = Math.PI / 2 - normalAngle
  const sinRefracted = Math.sin(incidentAngle) / refractiveIndex
  if (Math.abs(sinRefracted) >= 1) return 0
  const refractedAngle = Math.asin(sinRefracted)
  return glassThickness * Math.tan(refractedAngle)
}

/**
 * Outward unit normal at pixel (x, y) for a rounded rectangle of size iw × ih
 * with corner radius ibr. Defines the actual glass-surface tilt at every point —
 * perpendicular to the nearest straight edge, or radially out from a corner-arc
 * center inside corner zones.
 *
 * For a perfect circle (iw = ih = 2·ibr) every pixel is in a corner zone and
 * the four corner-arc centers all sit within ½ px of the geometric centre, so
 * the result collapses to the radial direction from element center — matching
 * the original circle-only logic to within sub-pixel rounding error.
 *
 * For a long pill or rect this gives the CORRECT physical normal: at the right
 * edge it points right, at the top edge it points up, at the rounded corner
 * it sweeps smoothly between the two — instead of always pointing toward the
 * geometric center (which is wrong for non-radially-symmetric shapes).
 */
function outwardNormal(
  x: number, y: number, iw: number, ih: number, ibr: number,
): { nx: number; ny: number } {
  const distLeft = x
  const distRight = iw - 1 - x
  const distTop = y
  const distBottom = ih - 1 - y

  const inLeftCol = distLeft < ibr
  const inRightCol = distRight < ibr
  const inTopRow = distTop < ibr
  const inBottomRow = distBottom < ibr

  // Corner zone: within ibr of two adjacent edges.
  if ((inLeftCol || inRightCol) && (inTopRow || inBottomRow)) {
    const ccx = inLeftCol ? ibr : iw - 1 - ibr
    const ccy = inTopRow ? ibr : ih - 1 - ibr
    const dx0 = x - ccx
    const dy0 = y - ccy
    const len = Math.sqrt(dx0 * dx0 + dy0 * dy0)
    if (len < 0.001) return { nx: 0, ny: 0 }
    return { nx: dx0 / len, ny: dy0 / len }
  }

  // Flat edge zone: pick the nearest cardinal direction.
  const minEdge = Math.min(distLeft, distRight, distTop, distBottom)
  if (minEdge === distLeft) return { nx: -1, ny: 0 }
  if (minEdge === distRight) return { nx: 1, ny: 0 }
  if (minEdge === distTop) return { nx: 0, ny: -1 }
  return { nx: 0, ny: 1 }
}

/** Specular intensity at a point. Rim lighting model (top-left light) */
function specularIntensity(distFromEdge: number, exponent: number): number {
  const normal = surfaceNormal(distFromEdge, exponent)
  const lightAngle = Math.PI * 0.75
  const dot = Math.cos(normal - lightAngle)
  const fresnel = Math.pow(1 - Math.max(0, Math.cos(Math.PI / 2 - normal)), 3)
  return Math.max(0, dot) * 0.3 + fresnel * 0.7
}

export function generateDisplacementMap(config: GlassConfig): DisplacementResult {
  const {
    width, height, borderRadius, strength, bezelPercent, profileExponent, refractiveIndex,
    magnifyStrength, magnifyExponent,
  } = config

  // Supersampling — balance smoothness vs perf. v64 tried 16× baseline
  // which was visibly the smoothest but 4× the texture meant a 4× heavier
  // generation loop AND 4× the GPU upload, which on dynamic-width elements
  // (GlassPill resizing as text changes) caused noticeable hitching.
  //
  // v65 reverts to 8× baseline (10× on high-DPR retina) — the rim mask
  // and outer shadow added in v64 are doing most of the smoothness work
  // anyway (eliminating the border-radius staircasing and adding the
  // floating-glass depth cue), so the texture density doesn't need to be
  // pushed past the point of perceptual diminishing returns. At 8× a
  // 92 px disc is 736² (~2 MB raw / ~500 KB PNG) and the loop runs ~540K
  // iterations — fast enough to feel instant.
  const dpr = (typeof window !== 'undefined') ? (window.devicePixelRatio || 1) : 1
  const scale = Math.min(10, Math.max(8, Math.ceil(dpr * 4)))
  const iw = Math.round(width * scale)
  const ih = Math.round(height * scale)
  const ibr = borderRadius * scale

  const canvas = document.createElement('canvas')
  canvas.width = iw
  canvas.height = ih
  const ctx = canvas.getContext('2d')
  if (!ctx) return { displacement: '', specular: '', maxDisplacement: 0 }

  const specCanvas = document.createElement('canvas')
  specCanvas.width = iw
  specCanvas.height = ih
  const specCtx = specCanvas.getContext('2d')

  const imageData = ctx.createImageData(iw, ih)
  const data = imageData.data
  const specData = specCtx ? specCtx.createImageData(iw, ih) : null

  // All geometry math runs in INTERNAL pixel space (iw × ih). Distances,
  // bezelWidth, and lensRadius are dimensionless ratios when normalised
  // (e.g. minDist / bezelWidth), so they work the same regardless of the
  // chosen scale factor. The displacement magnitudes (`strength`,
  // `magnifyStrength`) are CSS-pixel quantities stored verbatim in the
  // texture and rescaled by the SVG filter at use time.
  const bezelWidth = Math.min(iw, ih) * bezelPercent
  // Lens radius for magnification — half the smaller dimension minus the
  // bezel zone. Acts as the maximum interior depth for the magnify ramp.
  // For a circle this is the classic "lens half-width minus rim". For a
  // pill / rect it's still half the smaller dimension, which is the deepest
  // a pixel can be from the nearest edge.
  const lensRadius = Math.max(1, Math.min(iw, ih) / 2 - bezelWidth)
  let globalMaxDisplacement = 0

  type Pix = { dx: number; dy: number; spec: number }
  const pixels: Pix[] = new Array(iw * ih)

  for (let y = 0; y < ih; y++) {
    for (let x = 0; x < iw; x++) {
      const idx = y * iw + x
      const distLeft = x
      const distRight = iw - 1 - x
      const distTop = y
      const distBottom = ih - 1 - y
      let minDist = Math.min(distLeft, distRight, distTop, distBottom)

      const cornerX = Math.min(distLeft, distRight)
      const cornerY = Math.min(distTop, distBottom)
      if (cornerX < ibr && cornerY < ibr) {
        const cornerDist = Math.sqrt(
          (ibr - cornerX) ** 2 + (ibr - cornerY) ** 2,
        )
        minDist = Math.max(0, ibr - cornerDist)
      }

      const { nx, ny } = outwardNormal(x, y, iw, ih, ibr)

      let dx = 0
      let dy = 0
      let spec = 0

      // ── (1) Bezel refraction: only at the rim where the glass surface curves.
      //     Direction = outward edge normal (perpendicular to the nearest edge,
      //     or radial from the corner-arc center inside corners). For a circle
      //     this collapses to radial-from-center — matching the original logic.
      //     For a pill / rect it gives the physically correct refraction
      //     direction along straight edges instead of bending toward geometric
      //     center, which produced visible distortion at the long edges.
      const normalizedDist = Math.min(minDist / bezelWidth, 1)
      if (normalizedDist > 0) {
        const thickness = glassProfile(normalizedDist, profileExponent) * strength
        const normalAngle = surfaceNormal(normalizedDist, profileExponent)
        const refrAmount = refractionDisplacement(normalAngle, thickness, refractiveIndex)
        dx += nx * refrAmount
        dy += ny * refrAmount
        spec = specularIntensity(normalizedDist, profileExponent)
      }

      // ── (2) Magnification: pull pixels inward across the interior so the lens
      //     visually zooms whatever it sits over. Direction = INWARD normal
      //     (toward the medial axis), magnitude ramps from 0 at the deepest
      //     interior to magnifyStrength at the bezel boundary, controlled by
      //     magnifyExponent. The minDist-based interior depth generalises the
      //     original `r/lensRadius` ramp to non-circular shapes — for a circle
      //     minDist = ibr − r, so this collapses to the same curve.
      //
      //     Rim softness: the last `RIM_SOFTNESS_CSS_PX` of the boundary
      //     tapers the amount linearly back to 0. Without it the magnify
      //     jumps from full strength at minDist=1 to zero at minDist=0 —
      //     a 1-pixel discontinuity that bilinear sampling renders as an
      //     aliased halo around the disc. The taper happens entirely on
      //     the inside of the lens; deep interior is unaffected.
      if (magnifyStrength > 0 && minDist > 0) {
        const interiorDepth = Math.max(0, minDist - bezelWidth)
        const interiorNorm = Math.min(interiorDepth / lensRadius, 1)
        const edgeProximity = 1 - interiorNorm
        const RIM_SOFTNESS_CSS_PX = 2.5
        const rimSoftness = Math.min(minDist / Math.max(scale * RIM_SOFTNESS_CSS_PX, 1), 1)
        const amount = Math.pow(edgeProximity, magnifyExponent) * magnifyStrength * rimSoftness
        dx += -nx * amount
        dy += -ny * amount
      }

      if (dx === 0 && dy === 0 && spec === 0) {
        pixels[idx] = { dx: 0, dy: 0, spec: 0 }
        continue
      }

      const magnitude = Math.sqrt(dx * dx + dy * dy)
      if (magnitude > globalMaxDisplacement) globalMaxDisplacement = magnitude

      pixels[idx] = { dx, dy, spec }
    }
  }

  const norm = globalMaxDisplacement > 0 ? 1 / globalMaxDisplacement : 0
  for (let i = 0; i < pixels.length; i++) {
    const p = pixels[i]
    const pi = i * 4
    data[pi]     = Math.round(128 + p.dx * norm * 127)
    data[pi + 1] = Math.round(128 + p.dy * norm * 127)
    data[pi + 2] = 128
    data[pi + 3] = 255
    if (specData) {
      const intensity = Math.round(p.spec * 255)
      specData.data[pi]     = 255
      specData.data[pi + 1] = 255
      specData.data[pi + 2] = 255
      specData.data[pi + 3] = intensity
    }
  }

  ctx.putImageData(imageData, 0, 0)
  const displacement = canvas.toDataURL('image/png')

  let specular = ''
  if (specCtx && specData) {
    specCtx.putImageData(specData, 0, 0)
    specular = specCanvas.toDataURL('image/png')
  }

  return { displacement, specular, maxDisplacement: globalMaxDisplacement }
}
