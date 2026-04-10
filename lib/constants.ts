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
export const DB_VERSION = 2

/** Minimum zoom level (zoomed out — see full overview) */
export const CANVAS_ZOOM_MIN = 0.1

/** Maximum zoom level (zoomed in — card detail) */
export const CANVAS_ZOOM_MAX = 3.0

/** Default zoom level */
export const CANVAS_ZOOM_DEFAULT = 1.0

/** Zoom speed multiplier for mouse wheel */
export const CANVAS_ZOOM_SENSITIVITY = 0.001

/** Zoom speed multiplier for pinch gesture */
export const CANVAS_PINCH_SENSITIVITY = 0.01

// ---------------------------------------------------------------------------
// Grid / Collage Layout
// ---------------------------------------------------------------------------

/** Default card width in world pixels (matches BookmarkCard.module.css .card width) */
export const CARD_WIDTH = 240

/** Default gap between cards in grid mode (world pixels) */
export const GRID_GAP = 16

/** Number of grid columns — desktop */
export const GRID_COLUMNS_DESKTOP = 4

/** Number of grid columns — mobile */
export const GRID_COLUMNS_MOBILE = 2

/** Collage mode rotation range in degrees (cards get random ± this value) */
export const COLLAGE_ROTATION_RANGE = 5

/** Max overlap percentage allowed during auto-placement (0-1) */
export const COLLAGE_MAX_OVERLAP = 0.5

/** Max attempts to find a non-overlapping position */
export const COLLAGE_PLACEMENT_ATTEMPTS = 10

/** Estimated card heights by type (for masonry calculation) */
export const CARD_HEIGHT_WITH_THUMB = 160
export const CARD_HEIGHT_NO_THUMB = 130
export const CARD_HEIGHT_TWEET = 300

/** View mode switch animation */
export const VIEW_SWITCH_DURATION = 0.6
export const VIEW_SWITCH_STAGGER = 0.02
export const VIEW_SWITCH_EASE = 'power2.inOut'
