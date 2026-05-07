export const MIN_CARD_WIDTH = 80
export const MAX_CARD_WIDTH = 480
export const DEFAULT_CARD_WIDTH = 240

export type LegacyPreset = 'S' | 'M' | 'L'

const PRESET_TO_WIDTH: Readonly<Record<LegacyPreset, number>> = {
  S: 160,
  M: 240,
  L: 320,
}

export function presetToCardWidth(preset: LegacyPreset | undefined): number {
  if (preset === undefined) return DEFAULT_CARD_WIDTH
  if (!(preset in PRESET_TO_WIDTH)) return DEFAULT_CARD_WIDTH
  return PRESET_TO_WIDTH[preset]
}

export function clampCardWidth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CARD_WIDTH
  if (value < MIN_CARD_WIDTH) return MIN_CARD_WIDTH
  if (value > MAX_CARD_WIDTH) return MAX_CARD_WIDTH
  return value
}

/**
 * Project a continuous cardWidth back into the legacy 'S' | 'M' | 'L' bucket.
 * Used at the board → share-wire boundary where the wire format remains
 * a compact 'S' | 'M' | 'L' byte for backward compatibility.
 */
export function widthToPreset(width: number): LegacyPreset {
  if (width < 200) return 'S'
  if (width < 280) return 'M'
  return 'L'
}
