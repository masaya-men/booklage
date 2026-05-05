// lib/share/watermark-config.ts

export type WatermarkVariant = 'A' | 'B'

export type WatermarkSpec = {
  readonly variant: WatermarkVariant
  readonly primary: string
  readonly secondary?: string
  readonly primaryFontSize: number
  readonly secondaryFontSize: number
  readonly fontFamily: string
  readonly fontWeight: number
  readonly textColor: string
  readonly secondaryColor: string
  readonly bg: string
  readonly paddingX: number
  readonly paddingY: number
  readonly borderRadius: number
  readonly margin: number
}

const COMMON = {
  primary: 'Booklage',
  fontFamily: 'Geist, system-ui, sans-serif',
  fontWeight: 600,
  textColor: 'rgba(255,255,255,0.85)',
  secondaryColor: 'rgba(255,255,255,0.55)',
  bg: 'rgba(0,0,0,0.55)',
  paddingX: 9,
  paddingY: 4,
  borderRadius: 4,
  margin: 12,
} as const

export const WATERMARK_VARIANT_A: WatermarkSpec = {
  ...COMMON,
  variant: 'A',
  primaryFontSize: 11,
  secondary: undefined,
  secondaryFontSize: 0,
}

export const WATERMARK_VARIANT_B: WatermarkSpec = {
  ...COMMON,
  variant: 'B',
  primaryFontSize: 11,
  secondary: 'booklage.com',
  secondaryFontSize: 8.5,
}

/**
 * Read NEXT_PUBLIC_WATERMARK_VARIANT and return the corresponding spec.
 * Defaults to Variant A (text-only) until a strong domain is acquired.
 */
export function getActiveWatermark(): WatermarkSpec {
  const v = process.env.NEXT_PUBLIC_WATERMARK_VARIANT
  return v === 'B' ? WATERMARK_VARIANT_B : WATERMARK_VARIANT_A
}
