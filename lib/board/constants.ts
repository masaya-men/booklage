export const LAYOUT_CONFIG = {
  TARGET_ROW_HEIGHT_PX: 180,
  GAP_PX: 4,
  CONTAINER_MARGIN_PX: 16,
} as const

export const CARD_SIZE_LIMITS = {
  MIN_PX: 120,
  MAX_PX: 800,
} as const

export const CULLING = {
  BUFFER_SCREENS: 1.0,
} as const

export const BOARD_Z_INDEX = {
  THEME_BG: 0,
  CARDS: 10,
  INTERACTION_OVERLAY: 20,
  RESIZE_HANDLE: 30,
  DRAG_GHOST: 100,
} as const

export const INTERACTION = {
  DRAG_THRESHOLD_PX: 4,
  WHEEL_SCROLL_MULTIPLIER: 1.0,
  EMPTY_DRAG_SCROLL_MULTIPLIER: 1.0,
} as const

export const PERF = {
  TARGET_FPS: 60,
  MAX_LAYOUT_MS_1000_CARDS: 16,
} as const
