import { useCallback, useState } from 'react'
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

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

/** Return type of useInfiniteCanvas */
export interface InfiniteCanvasControls {
  /** Current canvas transform state */
  state: CanvasState
  /** Pan by delta (adds to current pan) */
  pan: (deltaX: number, deltaY: number) => void
  /** Set zoom level, adjusting pan to keep screenX,screenY fixed */
  zoomAtPoint: (newZoom: number, screenX: number, screenY: number) => void
  /** Reset to default view (no pan, zoom 1) */
  resetView: () => void
  /** Convert screen coordinates to world coordinates */
  toWorld: (screenX: number, screenY: number) => Point
  /** CSS transform string for the world container */
  worldTransform: string
  /** Whether a pan gesture is currently active */
  isPanning: boolean
  /** Set panning state (used by event handlers) */
  setIsPanning: (value: boolean) => void
}

/**
 * Hook that manages infinite canvas pan/zoom state.
 *
 * Returns state and imperative methods; does NOT attach DOM event listeners.
 * The Canvas component attaches listeners and calls these methods.
 */
export function useInfiniteCanvas(): InfiniteCanvasControls {
  const [state, setState] = useState<CanvasState>({
    panX: 0,
    panY: 0,
    zoom: CANVAS_ZOOM_DEFAULT,
  })
  const [isPanning, setIsPanning] = useState(false)

  const pan = useCallback((deltaX: number, deltaY: number) => {
    setState((prev) => ({
      ...prev,
      panX: prev.panX + deltaX,
      panY: prev.panY + deltaY,
    }))
  }, [])

  const zoomAtPoint = useCallback(
    (newZoom: number, screenX: number, screenY: number) => {
      setState((prev) => {
        const clamped = clampZoom(newZoom)
        const worldX = (screenX - prev.panX) / prev.zoom
        const worldY = (screenY - prev.panY) / prev.zoom
        return {
          panX: screenX - worldX * clamped,
          panY: screenY - worldY * clamped,
          zoom: clamped,
        }
      })
    },
    [],
  )

  const resetView = useCallback(() => {
    setState({ panX: 0, panY: 0, zoom: CANVAS_ZOOM_DEFAULT })
  }, [])

  const toWorld = useCallback(
    (screenX: number, screenY: number): Point =>
      screenToWorld(screenX, screenY, state.panX, state.panY, state.zoom),
    [state.panX, state.panY, state.zoom],
  )

  const worldTransform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`

  return {
    state,
    pan,
    zoomAtPoint,
    resetView,
    toWorld,
    worldTransform,
    isPanning,
    setIsPanning,
  }
}
