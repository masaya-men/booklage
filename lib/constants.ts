/** Application name — sourced from env or fallback */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Booklage'

/** Application URL — sourced from env or fallback */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

/** Predefined folder accent colors */
export const FOLDER_COLORS = [
  '#ff6b6b', '#ff922b', '#ffd43b', '#51cf66', '#20c997',
  '#339af0', '#5c7cfa', '#cc5de8', '#f06595', '#868e96',
] as const

/** Max random rotation (degrees) applied to card seeds in IndexedDB.
 *  B0 does not render rotation; kept for forward compatibility with future card styles. */
export const FLOAT_ROTATION_RANGE = 3

/** IndexedDB database name */
export const DB_NAME = 'booklage-db'

/** IndexedDB schema version */
export const DB_VERSION = 11

/** Card size presets (width in pixels) — used by IndexedDB card seeds */
export const CARD_SIZES = {
  S: 160,
  M: 240,
  L: 320,
  XL: 480,
} as const

export type CardSizePreset = keyof typeof CARD_SIZES

/** Card aspect ratio presets — used by IndexedDB card seeds */
export const CARD_ASPECT_RATIOS = {
  auto: null,
  square: 1,
  landscape: 16 / 9,
  portrait: 3 / 4,
} as const

export type CardAspectPreset = keyof typeof CARD_ASPECT_RATIOS

/** Sizes eligible for random assignment */
export const RANDOM_CARD_SIZES: CardSizePreset[] = ['S', 'M', 'L']

/** Aspect ratios eligible for random assignment */
export const RANDOM_ASPECT_RATIOS: CardAspectPreset[] = ['auto', 'square', 'landscape', 'portrait']
