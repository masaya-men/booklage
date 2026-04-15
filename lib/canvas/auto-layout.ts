import type { UrlType } from '@/lib/utils/url'
import {
  CARD_WIDTH,
  GRID_GAP,
  GRID_COLUMNS_DESKTOP,
  GRID_COLUMNS_MOBILE,
  CARD_HEIGHT_WITH_THUMB,
  CARD_HEIGHT_NO_THUMB,
  CARD_HEIGHT_TWEET,
  COLLAGE_ROTATION_RANGE,
  COLLAGE_MAX_OVERLAP,
  COLLAGE_PLACEMENT_ATTEMPTS,
  JUSTIFIED_ROW_HEIGHT,
  JUSTIFIED_GAP,
} from '@/lib/constants'
import { findNonOverlappingPosition, type Rect } from './collision'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Card dimensions for layout calculation */
export interface CardDimension {
  id: string
  width: number
  height: number
}

/** Computed masonry grid position */
export interface MasonryPosition {
  id: string
  x: number
  y: number
}

/** Computed justified grid position (Moodboard 3000 style) */
export interface JustifiedPosition {
  id: string
  x: number
  y: number
  width: number
  height: number
}

/** Computed collage scatter position */
export interface CollagePosition {
  x: number
  y: number
  rotation: number
}

// ---------------------------------------------------------------------------
// Responsive columns
// ---------------------------------------------------------------------------

/**
 * Determine the number of grid columns based on viewport width.
 * PC: 3–5 columns, Mobile: 2 columns.
 */
export function calculateResponsiveColumns(viewportWidth: number): number {
  if (viewportWidth < 600) return GRID_COLUMNS_MOBILE
  if (viewportWidth < 1000) return 3
  if (viewportWidth < 1400) return GRID_COLUMNS_DESKTOP
  return 5
}

// ---------------------------------------------------------------------------
// Masonry grid layout
// ---------------------------------------------------------------------------

/**
 * Calculate masonry (waterfall) positions for a list of cards.
 * Cards are placed in the shortest column first.
 *
 * @param cards - Cards with their dimensions
 * @param columns - Number of columns
 * @param cardWidth - Width of each card (uniform)
 * @param gap - Gap between cards (both horizontal and vertical)
 * @param originX - X origin for the grid (default 50)
 * @param originY - Y origin for the grid (default 50)
 * @returns Array of positions with card IDs
 */
export function calculateMasonryPositions(
  cards: CardDimension[],
  columns: number,
  cardWidth: number = CARD_WIDTH,
  gap: number = GRID_GAP,
  originX: number = 50,
  originY: number = 50,
): MasonryPosition[] {
  if (cards.length === 0) return []

  const columnHeights = new Array<number>(columns).fill(0)
  const positions: MasonryPosition[] = []

  for (const card of cards) {
    let shortestCol = 0
    for (let col = 1; col < columns; col++) {
      if (columnHeights[col] < columnHeights[shortestCol]) {
        shortestCol = col
      }
    }

    const x = originX + shortestCol * (cardWidth + gap)
    const y = originY + columnHeights[shortestCol]

    positions.push({ id: card.id, x, y })
    columnHeights[shortestCol] += card.height + gap
  }

  return positions
}

// ---------------------------------------------------------------------------
// Justified grid layout (Moodboard 3000 style)
// ---------------------------------------------------------------------------

/**
 * Simple hash to generate deterministic variety per card.
 * Returns a value in [0, 1) from a card ID string.
 */
function hashId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0
  }
  return Math.abs(h % 1000) / 1000
}

/** Aspect ratio presets for varied grid (Moodboard 3000 style) */
const GRID_ASPECT_PRESETS = [
  0.75,  // tall portrait
  1.0,   // square
  1.2,   // slightly wide
  1.5,   // standard landscape
  1.8,   // wide
  2.2,   // panoramic
]

/**
 * Estimate the aspect ratio of a card for justified layout.
 * Uses actual user-resized dimensions when both are set,
 * otherwise assigns varied aspect ratios from a preset palette
 * based on the card ID for a visually interesting grid.
 */
function getCardAspectRatio(card: CardDimension): number {
  // If user has explicitly resized the card (both dimensions meaningful), use that
  if (card.width > 0 && card.height > 0 && card.height !== card.width) {
    return card.width / card.height
  }
  // Assign varied ratio from presets based on card ID hash
  const h = hashId(card.id)
  const idx = Math.floor(h * GRID_ASPECT_PRESETS.length)
  return GRID_ASPECT_PRESETS[idx]
}

/**
 * Calculate justified-row positions for a list of cards.
 * Cards are arranged in rows that fill the container width edge-to-edge,
 * with each card in a row sharing the same height.
 * Produces a tight, Moodboard 3000-style grid with minimal gaps.
 *
 * @param cards - Cards with their dimensions
 * @param containerWidth - Total available width for the grid
 * @param targetRowHeight - Ideal row height (rows may be shorter/taller to fit)
 * @param gap - Gap between cards (both horizontal and vertical)
 * @param originX - X origin for the grid
 * @param originY - Y origin for the grid
 * @returns Array of positions with computed width/height per card
 */
export function calculateJustifiedPositions(
  cards: CardDimension[],
  containerWidth: number,
  targetRowHeight: number = JUSTIFIED_ROW_HEIGHT,
  gap: number = JUSTIFIED_GAP,
  originX: number = 50,
  originY: number = 50,
): JustifiedPosition[] {
  if (cards.length === 0) return []

  const positions: JustifiedPosition[] = []
  let rowCards: { card: CardDimension; aspect: number }[] = []
  let rowAspectSum = 0
  let y = originY

  function layoutRow(items: typeof rowCards, isLastRow: boolean): void {
    if (items.length === 0) return

    const totalGap = (items.length - 1) * gap
    const availableWidth = containerWidth - totalGap
    const aspectSum = items.reduce((sum, c) => sum + c.aspect, 0)
    let rowHeight = availableWidth / aspectSum

    // Last row: don't stretch excessively if few items remain
    if (isLastRow && rowHeight > targetRowHeight * 1.5) {
      rowHeight = targetRowHeight
    }

    let x = originX
    for (const { card, aspect } of items) {
      const w = Math.round(aspect * rowHeight)
      positions.push({ id: card.id, x, y, width: w, height: Math.round(rowHeight) })
      x += w + gap
    }

    y += Math.round(rowHeight) + gap
  }

  for (const card of cards) {
    const aspect = getCardAspectRatio(card)
    rowCards.push({ card, aspect })
    rowAspectSum += aspect

    // Check whether this row is full (would the row height shrink below target?)
    const totalGap = (rowCards.length - 1) * gap
    const rowHeight = (containerWidth - totalGap) / rowAspectSum

    if (rowHeight <= targetRowHeight) {
      layoutRow(rowCards, false)
      rowCards = []
      rowAspectSum = 0
    }
  }

  // Layout remaining cards as the last row
  layoutRow(rowCards, true)

  return positions
}

// ---------------------------------------------------------------------------
// Card height estimation
// ---------------------------------------------------------------------------

/**
 * Estimate the rendered height of a card based on its content type.
 * Used for masonry layout calculation without DOM measurement.
 */
export function estimateCardHeight(
  type: UrlType,
  hasThumbnail: boolean,
): number {
  if (type === 'tweet') return CARD_HEIGHT_TWEET
  if (hasThumbnail) return CARD_HEIGHT_WITH_THUMB
  return CARD_HEIGHT_NO_THUMB
}

// ---------------------------------------------------------------------------
// Collage scatter placement
// ---------------------------------------------------------------------------

/**
 * Calculate a scattered position for a new card in collage mode.
 * Finds a position near the viewport center that doesn't overlap
 * too much with existing cards, and assigns a random rotation.
 */
export function calculateCollageScatterPosition(
  existingCards: Rect[],
  newCardWidth: number,
  newCardHeight: number,
  center: { x: number; y: number },
): CollagePosition {
  const pos = findNonOverlappingPosition(
    existingCards,
    { width: newCardWidth, height: newCardHeight },
    center,
    COLLAGE_MAX_OVERLAP,
    COLLAGE_PLACEMENT_ATTEMPTS,
  )

  const rotation = (Math.random() * 2 - 1) * COLLAGE_ROTATION_RANGE

  return {
    x: pos.x,
    y: pos.y,
    rotation,
  }
}
