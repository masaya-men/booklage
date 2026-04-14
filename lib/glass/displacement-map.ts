// lib/glass/displacement-map.ts

/**
 * Generate a displacement map for liquid glass refraction effect.
 *
 * The map encodes per-pixel displacement vectors as RGB colors:
 * - R channel: horizontal displacement (128 = no displacement)
 * - G channel: vertical displacement (128 = no displacement)
 * - B channel: unused (set to 128)
 *
 * Edge pixels get strong inward displacement (simulating glass curvature).
 * Center pixels get zero displacement.
 */

/** Strength presets for different UI elements */
export type GlassStrength = 'subtle' | 'medium' | 'strong'

const STRENGTH_SCALE: Record<GlassStrength, number> = {
  subtle: 8,
  medium: 16,
  strong: 24,
}

/**
 * Generate a displacement map as a data URL for the given dimensions.
 *
 * @param width - Element width in pixels
 * @param height - Element height in pixels
 * @param borderRadius - Corner radius in pixels
 * @param strength - Refraction intensity preset
 * @returns data URL of the displacement map PNG
 */
export function generateDisplacementMap(
  width: number,
  height: number,
  borderRadius: number,
  strength: GlassStrength = 'medium',
): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  const imageData = ctx.createImageData(width, height)
  const data = imageData.data
  const maxDisplacement = STRENGTH_SCALE[strength]

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4

      // Distance from each edge
      const distLeft = x
      const distRight = width - 1 - x
      const distTop = y
      const distBottom = height - 1 - y

      // Minimum distance to any edge
      const distX = Math.min(distLeft, distRight)
      const distY = Math.min(distTop, distBottom)

      // Normalized edge proximity (0 = at edge, 1 = far from edge)
      const edgeFalloff = 30 // pixels over which the effect fades
      const normalizedX = Math.min(distX / edgeFalloff, 1)
      const normalizedY = Math.min(distY / edgeFalloff, 1)

      // Smooth falloff using cubic ease
      const falloffX = 1 - normalizedX * normalizedX * (3 - 2 * normalizedX)
      const falloffY = 1 - normalizedY * normalizedY * (3 - 2 * normalizedY)

      // Displacement direction: push inward from edges
      const dirX = distLeft < distRight ? 1 : -1
      const dirY = distTop < distBottom ? 1 : -1

      // Compute displacement magnitude
      const dx = dirX * falloffX * maxDisplacement
      const dy = dirY * falloffY * maxDisplacement

      // Handle rounded corners — reduce displacement in corner regions
      const inCorner = distX < borderRadius && distY < borderRadius
      let cornerScale = 1
      if (inCorner) {
        const cornerDist = Math.sqrt(
          (borderRadius - distX) ** 2 + (borderRadius - distY) ** 2,
        )
        cornerScale = Math.min(cornerDist / borderRadius, 1)
      }

      // Encode as color: 128 = neutral, ±127 = max displacement
      data[idx] = Math.round(128 + dx * cornerScale) // R = x displacement
      data[idx + 1] = Math.round(128 + dy * cornerScale) // G = y displacement
      data[idx + 2] = 128 // B = unused
      data[idx + 3] = 255 // A = full opacity
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/png')
}

/** Cache for generated displacement maps, keyed by "WxH-radius-strength" */
const mapCache = new Map<string, string>()

/**
 * Get a displacement map, using cache if available.
 */
export function getDisplacementMap(
  width: number,
  height: number,
  borderRadius: number,
  strength: GlassStrength = 'medium',
): string {
  const key = `${width}x${height}-${borderRadius}-${strength}`
  const cached = mapCache.get(key)
  if (cached) return cached

  const dataUrl = generateDisplacementMap(width, height, borderRadius, strength)
  mapCache.set(key, dataUrl)
  return dataUrl
}
