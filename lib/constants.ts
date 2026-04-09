/** Z-index hierarchy — never use magic numbers in components */
export const Z_INDEX = {
  CANVAS_CARD: 1,
  CANVAS_CARD_DRAGGING: 50,
  FOLDER_NAV: 60,
  TOOLBAR: 70,
  DROPDOWN: 80,
  MODAL_BACKDROP: 90,
  MODAL: 100,
  TOAST: 110,
  BOOKMARKLET_POPUP: 120,
  PIP_DROPZONE: 130,
} as const

/** Application name — sourced from env or fallback */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Booklage'

/** Application URL — sourced from env or fallback */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

/** Predefined folder accent colors */
export const FOLDER_COLORS = [
  '#ff6b6b', '#ff922b', '#ffd43b', '#51cf66', '#20c997',
  '#339af0', '#5c7cfa', '#cc5de8', '#f06595', '#868e96',
] as const

/** Max random rotation (degrees) for floating cards */
export const FLOAT_ROTATION_RANGE = 3

/** Max random delay (seconds) for float animation staggering */
export const FLOAT_DELAY_MAX = 4

/** Duration (seconds) of one float animation cycle */
export const FLOAT_DURATION = 4

/** IndexedDB database name */
export const DB_NAME = 'booklage-db'

/** IndexedDB schema version */
export const DB_VERSION = 1

/** Days before shared snapshots expire on R2 */
export const SHARE_SNAPSHOT_TTL_DAYS = 90
