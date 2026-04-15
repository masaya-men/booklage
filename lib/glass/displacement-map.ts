// lib/glass/displacement-map.ts

/**
 * Physics-based glass refraction displacement map generator.
 *
 * Technique: kube.io-style approach.
 * 1. Model glass surface as a convex squircle profile
 * 2. Compute surface normals via numerical derivative
 * 3. Apply Snell's Law (n=1.5) to get refracted ray angle
 * 4. Derive per-pixel displacement magnitude
 * 5. Generate specular highlight from Fresnel/rim-lighting model
 *
 * The map encodes per-pixel displacement vectors as RGB colors:
 * - R channel: horizontal displacement (128 = no displacement)
 * - G channel: vertical displacement (128 = no displacement)
 * - B channel: unused (set to 128)
 */

/** Strength presets for different UI elements */
export type GlassStrength = 'subtle' | 'medium' | 'strong'

const STRENGTH_SCALE: Record<GlassStrength, number> = {
  subtle: 12,
  medium: 24,
  strong: 40,
}

const GLASS_REFRACTIVE_INDEX = 1.5

/**
 * Glass surface thickness profile (convex squircle).
 * x: normalized distance from edge (0 = edge, 1 = center)
 * returns: height (0 = flat, 1 = max thickness)
 */
function glassProfile(x: number): number {
  const clamped = Math.max(0, Math.min(1, x))
  // Convex squircle: (1 - (1-x)^4)^(1/4)
  return Math.pow(1 - Math.pow(1 - clamped, 4), 0.25)
}

/**
 * Calculate surface normal angle via numerical derivative.
 * Returns the angle of the outward normal in radians.
 */
function surfaceNormal(distFromEdge: number): number {
  const delta = 0.001
  const y1 = glassProfile(distFromEdge - delta)
  const y2 = glassProfile(distFromEdge + delta)
  const derivative = (y2 - y1) / (2 * delta)
  // Normal is perpendicular to tangent
  return Math.atan2(1, -derivative)
}

/**
 * Apply Snell's law to find refraction displacement magnitude.
 * Returns displacement in pixels (the background shifts by this amount).
 */
function refractionDisplacement(normalAngle: number, glassThickness: number): number {
  // Incident ray is vertical (orthogonal to background)
  const incidentAngle = Math.PI / 2 - normalAngle

  // Snell's law: sin(θr) = sin(θi) / n
  const sinRefracted = Math.sin(incidentAngle) / GLASS_REFRACTIVE_INDEX

  // Total internal reflection check
  if (Math.abs(sinRefracted) >= 1) return 0

  const refractedAngle = Math.asin(sinRefracted)

  // Displacement = thickness * tan(refracted angle)
  return glassThickness * Math.tan(refractedAngle)
}

/**
 * Calculate specular highlight intensity at a point.
 * Rim lighting: brightest where surface is steeply angled (near edges).
 */
function specularIntensity(distFromEdge: number): number {
  const normal = surfaceNormal(distFromEdge)
  // Light from top-left at 45 degrees
  const lightAngle = Math.PI * 0.75
  const dot = Math.cos(normal - lightAngle)
  // Fresnel-like falloff: stronger at glancing angles (edges)
  const fresnel = Math.pow(1 - Math.max(0, Math.cos(Math.PI / 2 - normal)), 3)
  return Math.max(0, dot) * 0.3 + fresnel * 0.7
}

type DisplacementResult = {
  displacement: string
  specular: string
  maxDisplacement: number
}

/**
 * Generate a physics-based displacement map and specular highlight as data URLs.
 *
 * @param width - Element width in pixels
 * @param height - Element height in pixels
 * @param borderRadius - Corner radius in pixels
 * @param strength - Refraction intensity preset
 * @returns Object with displacement URL, specular URL, and max displacement value
 */
export function generateDisplacementMap(
  width: number,
  height: number,
  borderRadius: number,
  strength: GlassStrength = 'medium',
): DisplacementResult {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return { displacement: '', specular: '', maxDisplacement: 0 }

  // Also create specular highlight canvas
  const specCanvas = document.createElement('canvas')
  specCanvas.width = width
  specCanvas.height = height
  const specCtx = specCanvas.getContext('2d')

  const imageData = ctx.createImageData(width, height)
  const data = imageData.data
  const specData = specCtx ? specCtx.createImageData(width, height) : null

  const maxThickness = STRENGTH_SCALE[strength]
  // Bezel width: 15% of smallest dimension — the region where glass bends
  const bezelWidth = Math.min(width, height) * 0.15
  let globalMaxDisplacement = 0

  // First pass: calculate all displacements to find maximum (for normalization)
  type PixelDisplacement = { dx: number; dy: number; spec: number }
  const displacements: PixelDisplacement[] = new Array(width * height)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x

      // Distance from each edge
      const distLeft = x
      const distRight = width - 1 - x
      const distTop = y
      const distBottom = height - 1 - y

      let minDist = Math.min(distLeft, distRight, distTop, distBottom)

      // Corner handling with border-radius
      const cornerX = Math.min(distLeft, distRight)
      const cornerY = Math.min(distTop, distBottom)
      if (cornerX < borderRadius && cornerY < borderRadius) {
        const cornerDist = Math.sqrt(
          Math.pow(borderRadius - cornerX, 2) + Math.pow(borderRadius - cornerY, 2),
        )
        minDist = Math.max(0, borderRadius - cornerDist)
      }

      // Normalized distance from edge (0 = at edge, 1 = deep inside)
      const normalizedDist = Math.min(minDist / bezelWidth, 1)

      if (normalizedDist <= 0) {
        displacements[idx] = { dx: 0, dy: 0, spec: 0 }
        continue
      }

      // Glass thickness at this point
      const thickness = glassProfile(normalizedDist) * maxThickness

      // Surface normal and refraction
      const normalAngle = surfaceNormal(normalizedDist)
      const displacement = refractionDisplacement(normalAngle, thickness)

      // Direction: toward nearest edge (glass bulges outward, displacing inward)
      const angleToCenter = Math.atan2(height / 2 - y, width / 2 - x)
      // Displacement pushes AWAY from center
      const dx = -Math.cos(angleToCenter) * displacement
      const dy = -Math.sin(angleToCenter) * displacement

      const magnitude = Math.sqrt(dx * dx + dy * dy)
      if (magnitude > globalMaxDisplacement) {
        globalMaxDisplacement = magnitude
      }

      // Specular highlight intensity
      const spec = specularIntensity(normalizedDist)

      displacements[idx] = { dx, dy, spec }
    }
  }

  // Second pass: normalize and encode into image data
  const normalizeFactor = globalMaxDisplacement > 0 ? 1 / globalMaxDisplacement : 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      const pixelIdx = idx * 4
      const { dx, dy, spec } = displacements[idx]

      // Normalize displacement to -1..1 range
      const normalizedDx = dx * normalizeFactor
      const normalizedDy = dy * normalizeFactor

      // Encode: 128 = neutral, 0 = -max, 255 = +max
      data[pixelIdx] = Math.round(128 + normalizedDx * 127)
      data[pixelIdx + 1] = Math.round(128 + normalizedDy * 127)
      data[pixelIdx + 2] = 128
      data[pixelIdx + 3] = 255

      // Specular: white highlight on transparent background
      if (specData) {
        const intensity = Math.round(spec * 255)
        specData.data[pixelIdx] = 255
        specData.data[pixelIdx + 1] = 255
        specData.data[pixelIdx + 2] = 255
        specData.data[pixelIdx + 3] = Math.round(intensity * 0.55) // 55% max opacity — brighter on transparent glass
      }
    }
  }

  ctx.putImageData(imageData, 0, 0)
  const displacementUrl = canvas.toDataURL('image/png')

  let specularUrl = ''
  if (specCtx && specData) {
    specCtx.putImageData(specData, 0, 0)
    specularUrl = specCanvas.toDataURL('image/png')
  }

  return {
    displacement: displacementUrl,
    specular: specularUrl,
    maxDisplacement: globalMaxDisplacement,
  }
}

/** Cache keyed by "WxH-radius-strength" */
const mapCache = new Map<string, DisplacementResult>()

/**
 * Get a displacement map, using cache if available.
 */
export function getDisplacementMap(
  width: number,
  height: number,
  borderRadius: number,
  strength: GlassStrength = 'medium',
): DisplacementResult {
  const key = `${width}x${height}-${borderRadius}-${strength}`
  const cached = mapCache.get(key)
  if (cached) return cached

  const result = generateDisplacementMap(width, height, borderRadius, strength)
  mapCache.set(key, result)
  return result
}
