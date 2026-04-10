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
