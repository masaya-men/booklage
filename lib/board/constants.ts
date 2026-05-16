export const LAYOUT_CONFIG = {
  TARGET_ROW_HEIGHT_PX: 180,
  GAP_PX: 4,
  CONTAINER_MARGIN_PX: 16,
} as const

/**
 * Page-level cluster constraints. The cards arrange within a centered column
 * of width `min(viewport.w, MAX_WIDTH_PX) - 2 * SIDE_PADDING_PX` so the
 * background remains visible at the edges (mymind / Pinterest / Are.na pattern).
 */
/** destefanis is full-viewport edge-to-edge (no max-width cap). MAX_WIDTH_PX
 *  is intentionally a massive value so `Math.min(availableWidth, MAX)` always
 *  picks `availableWidth`. SIDE_PADDING_PX = COLUMN_MASONRY.GAP_PX / 2 so the
 *  outer card edges sit a half-gap from the viewport edge, mirroring the inner
 *  gap rhythm (destefanis applies `+gap/2` to x positions). */
export const BOARD_INNER = {
  MAX_WIDTH_PX: 999_999,
  SIDE_PADDING_PX: 9,
} as const

export const RESIZE = {
  MIN_PX: 80,
  MAX_PX: 1200,
  HANDLE_SIZE_PX: 10,
  EDGE_HANDLE_SIZE_PX: 10,
} as const

export const CULLING = {
  BUFFER_SCREENS: 1.0,
} as const

export const BOARD_Z_INDEX = {
  THEME_BG: 0,
  FRAME_MASK: 5,
  CARDS: 10,
  EMPTY_STATE: 12,
  FRAME_BORDER: 15,
  INTERACTION_OVERLAY: 20,
  SNAP_GUIDES: 25,
  RESIZE_HANDLE: 30,
  SELECTION_OUTLINE: 31,
  ROTATION_HANDLE: 32,
  DROP_INDICATOR: 40,
  CONTEXT_MENU: 90,
  DRAG_GHOST: 100,
  TOOLBAR: 110,
  POPOVER: 120,
  UNDO_TOAST: 130,
  MODAL_OVERLAY: 200,  // App-level modal overlay (Bookmarklet install, etc.)
} as const

export const INTERACTION = {
  DRAG_THRESHOLD_PX: 4,
  WHEEL_SCROLL_MULTIPLIER: 1.0,
  EMPTY_DRAG_SCROLL_MULTIPLIER: 1.0,
} as const

export const SNAP = {
  EDGE_ALIGNMENT_TOLERANCE_PX: 5,
  INSERT_SLOT_ACTIVATION_PX: 12,
  SPACING_EQUAL_TOLERANCE_PX: 3,
} as const

export const ROTATION = {
  SNAP_STEP_DEG: 15,
  AUTO_RANDOM_RANGE_DEG: 5,       // ±5° 自動微傾
  HANDLE_OFFSET_ABOVE_CARD_PX: 24,
  HANDLE_SIZE_PX: 14,
} as const

export const Z_ORDER = {
  AUTO_TOUCHED_TOP: true,
  LOCK_KEY: 'l',
  FORWARD_KEY: ']',
  BACKWARD_KEY: '[',
  FORWARD_STEP_KEY: { key: ']', modifier: 'ctrl' },
  BACKWARD_STEP_KEY: { key: '[', modifier: 'ctrl' },
} as const

export const FRAME = {
  MIN_PX: 200,
  MAX_PX: 5000,
  BORDER_PX: 1.5,
  BORDER_COLOR: 'rgba(0, 0, 0, 0.3)',
  OUTSIDE_OVERLAY_BG: 'rgba(210, 210, 210, 0.55)',
  OUTSIDE_SATURATE: 0.2,
} as const

export const MODE_TRANSITION = {
  MORPH_MS: 400,
  EASING: 'power2.inOut',
} as const

export const UNDO = {
  TOAST_DURATION_MS: 10_000,
} as const

export const PERF = {
  TARGET_FPS: 60,
  MAX_LAYOUT_MS_1000_CARDS: 16,
} as const

/** destefanis: 5 columns at typical desktop viewports, 18px gaps.
 *  TARGET_COLUMN_UNIT_PX is the desired column width — masonry picks the column
 *  count that gets nearest. With 280 target, sidebar 240, viewport 1900 →
 *  available 1660, picks 5 columns of ~314px each (destefanis-like). */
export const COLUMN_MASONRY = {
  TARGET_COLUMN_UNIT_PX: 280,
  GAP_PX: 18,
} as const

/** Board-wide card width and gap controlled by the header sliders.
 *  CARD_WIDTH_DEFAULT_PX = 267 was originally derived for a dense
 *  5-column layout at the developer's canvasWrap width with G=18.
 *  Session 30 (= 全画面化 visual pivot) では default を 「最密 5 列
 *  thumbnail wall」 から 「4 列 + 大きな gap でカード呼吸 + 背景タイポ
 *  透過」 に転換。 W は据置 267 (= カード 1 枚の親密感は維持)、
 *  G を 18 → 97 に拡大して 4 列 gallery 密度に。 ミッション 「整理ツール
 *  ではなく 表現ツール」 (CLAUDE.md) を default で体現する転換。
 *  Reset button restores both to these defaults. */
export const BOARD_SLIDERS = {
  CARD_WIDTH_DEFAULT_PX: 267,
  CARD_WIDTH_MIN_PX: 120,
  CARD_WIDTH_MAX_PX: 720,
  CARD_GAP_DEFAULT_PX: 97,
  CARD_GAP_MIN_PX: 0,
  CARD_GAP_MAX_PX: 300,
} as const

/**
 * Share-wire encoding only. The board itself uses continuous `cardWidth`
 * (lib/board/size-migration.ts); this column-span map is kept for the
 * legacy 'S' | 'M' | 'L' wire format consumed by composer-layout and
 * relay-layout, where preserving the original 1/2/3-column behavior is
 * required for backward-compat with already-shared URLs.
 */
export const SIZE_PRESET_SPAN: Readonly<Record<'S' | 'M' | 'L', number>> = {
  S: 1,
  M: 2,
  L: 3,
}
