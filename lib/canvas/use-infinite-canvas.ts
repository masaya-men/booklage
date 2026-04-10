import {
  CANVAS_ZOOM_MIN,
  CANVAS_ZOOM_MAX,
  CANVAS_ZOOM_DEFAULT,
  CANVAS_ZOOM_SENSITIVITY,
} from '@/lib/constants'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** 2D point */
export interface Point {
  x: number
  y: number
}

/** Infinite canvas state */
export interface CanvasState {
  panX: number
  panY: number
  zoom: number
}

// ---------------------------------------------------------------------------
// Pure coordinate utilities (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Convert screen (pixel) coordinates to world (canvas) coordinates.
 * World coords = (screen coords - pan) / zoom
 */
export function screenToWorld(
  screenX: number,
  screenY: number,
  panX: number,
  panY: number,
  zoom: number,
): Point {
  return {
    x: (screenX - panX) / zoom,
    y: (screenY - panY) / zoom,
  }
}

/**
 * Convert world (canvas) coordinates to screen (pixel) coordinates.
 * Screen coords = world coords * zoom + pan
 */
export function worldToScreen(
  worldX: number,
  worldY: number,
  panX: number,
  panY: number,
  zoom: number,
): Point {
  return {
    x: worldX * zoom + panX,
    y: worldY * zoom + panY,
  }
}

/**
 * Clamp a zoom value within the allowed range.
 */
export function clampZoom(zoom: number): number {
  return Math.min(CANVAS_ZOOM_MAX, Math.max(CANVAS_ZOOM_MIN, zoom))
}
