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

  // Render the displacement map at DEVICE pixel resolution (clamped to 2x)
  // so the bezel/edge transitions are sampled densely enough to look smooth
  // on Retina-class displays. At 1:1 CSS-pixel resolution, the bezel ramp
  // showed visible stair-stepping ("PS1 polygon look") around the rim of
  // small elements (≈92px play disc). The final <feImage> in LiquidGlass.tsx
  // displays at the CSS-pixel size, so the browser bilinear-downsamples the
  // 2x texture to give an antialiased perimeter. Displacement magnitudes
  // (R/G channel encoding) are unit-agnostic — they're normalised by
  // globalMaxDisplacement and rescaled by feDisplacementMap's `scale`
  // attribute, so internal pixel resolution doesn't affect the visual
  // refraction strength, only the smoothness of its sampling.
  const scale = (typeof window !== 'undefined')
    ? Math.min(2, window.devicePixelRatio || 1)
    : 1
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
  const cx = iw / 2
  const cy = ih / 2
  // Lens radius for magnification — distance from center to nearest interior edge.
  // Subtracting bezelWidth keeps the magnification "field" inside the bezel area.
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

      let dx = 0
      let dy = 0
      let spec = 0

      // ── (1) Bezel refraction: only at the rim where the glass surface curves
      const normalizedDist = Math.min(minDist / bezelWidth, 1)
      if (normalizedDist > 0) {
        const thickness = glassProfile(normalizedDist, profileExponent) * strength
        const normalAngle = surfaceNormal(normalizedDist, profileExponent)
        const refrAmount = refractionDisplacement(normalAngle, thickness, refractiveIndex)
        const angleToCenter = Math.atan2(cy - y, cx - x)
        dx += -Math.cos(angleToCenter) * refrAmount
        dy += -Math.sin(angleToCenter) * refrAmount
        spec = specularIntensity(normalizedDist, profileExponent)
      }

      // ── (2) Magnification: pull pixels inward across the whole interior so
      //     the lens visually zooms whatever it sits over (kube.io "second
      //     displacement map"). Vector points TOWARD center; magnitude grows
      //     with normalized radius via configurable exponent.
      if (magnifyStrength > 0 && minDist > 0) {
        const cdx = x - cx
        const cdy = y - cy
        const r = Math.sqrt(cdx * cdx + cdy * cdy)
        if (r > 0.5) {
          const rNorm = Math.min(r / lensRadius, 1)
          const amount = Math.pow(rNorm, magnifyExponent) * magnifyStrength
          dx += -(cdx / r) * amount
          dy += -(cdy / r) * amount
        }
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
