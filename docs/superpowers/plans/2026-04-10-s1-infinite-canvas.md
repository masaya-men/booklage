# S1: Infinite Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed-size canvas with an infinite pan/zoom canvas that works on both PC and mobile.

**Architecture:** A custom `useInfiniteCanvas` hook manages pan/zoom state and event handlers. The Canvas component applies a CSS transform (`translate + scale`) to an inner "world" div. Cards remain absolutely positioned in world coordinates. GSAP Draggable handles card drag; custom pointer/touch handlers handle canvas pan and pinch-zoom. Coordinate conversion (`screenToWorld`) bridges the two systems.

**Tech Stack:** React 19, GSAP Draggable, CSS transforms, Pointer Events API, Touch Events API, Vitest

**Prerequisites:** Read `docs/superpowers/specs/2026-04-10-week2-design.md` section 1.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `lib/canvas/use-infinite-canvas.ts` | Create | Hook: pan/zoom state, event handlers, coordinate conversion |
| `lib/canvas/use-infinite-canvas.test.ts` | Create | Unit tests for coordinate math and state transitions |
| `components/board/Canvas.tsx` | Rewrite | Render viewport + transformed world div |
| `components/board/Canvas.module.css` | Rewrite | Viewport + world + cursor styles |
| `components/board/DraggableCard.tsx` | Modify | Report world-space positions via canvas zoom factor |
| `components/board/DraggableCard.module.css` | Keep | No changes needed |
| `app/(app)/board/board-client.tsx` | Modify | Wire useInfiniteCanvas, pass zoom to DraggableCard |
| `lib/constants.ts` | Modify | Add canvas zoom min/max/default constants |

---

## Task 1: Canvas Constants

**Files:**
- Modify: `lib/constants.ts`

- [ ] **Step 1: Add canvas constants**

Add these constants at the end of `lib/constants.ts`:

```typescript
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
```

- [ ] **Step 2: Remove obsolete constant**

Remove `SHARE_SNAPSHOT_TTL_DAYS` (R2 removed in ¥0 design):

```typescript
// DELETE this line:
export const SHARE_SNAPSHOT_TTL_DAYS = 90
```

- [ ] **Step 3: Verify build**

Run: `pnpm run build`
Expected: Build succeeds (no references to deleted constant).

- [ ] **Step 4: Commit**

```bash
git add lib/constants.ts
git commit -m "feat(canvas): add infinite canvas zoom constants, remove R2 TTL"
```

---

## Task 2: Coordinate Utility & Tests

**Files:**
- Create: `lib/canvas/use-infinite-canvas.ts` (types + utility functions only)
- Create: `lib/canvas/use-infinite-canvas.test.ts`

- [ ] **Step 1: Write failing tests for coordinate conversion**

Create `lib/canvas/use-infinite-canvas.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { screenToWorld, worldToScreen, clampZoom } from './use-infinite-canvas'
import {
  CANVAS_ZOOM_MIN,
  CANVAS_ZOOM_MAX,
  CANVAS_ZOOM_DEFAULT,
} from '@/lib/constants'

describe('screenToWorld', () => {
  it('converts screen coords to world coords at zoom 1, no pan', () => {
    const result = screenToWorld(100, 200, 0, 0, 1)
    expect(result).toEqual({ x: 100, y: 200 })
  })

  it('accounts for pan offset', () => {
    // Pan moved world 50px right, 30px down in screen space
    const result = screenToWorld(100, 200, 50, 30, 1)
    // Screen point 100,200 minus pan 50,30 = world 50,170
    expect(result).toEqual({ x: 50, y: 170 })
  })

  it('accounts for zoom', () => {
    // Zoomed to 2x, no pan
    const result = screenToWorld(200, 400, 0, 0, 2)
    // Screen 200,400 / zoom 2 = world 100,200
    expect(result).toEqual({ x: 100, y: 200 })
  })

  it('accounts for both pan and zoom', () => {
    const result = screenToWorld(200, 400, 100, 50, 2)
    // (200 - 100) / 2 = 50, (400 - 50) / 2 = 175
    expect(result).toEqual({ x: 50, y: 175 })
  })
})

describe('worldToScreen', () => {
  it('converts world coords to screen coords at zoom 1, no pan', () => {
    const result = worldToScreen(100, 200, 0, 0, 1)
    expect(result).toEqual({ x: 100, y: 200 })
  })

  it('is the inverse of screenToWorld', () => {
    const panX = 60
    const panY = 40
    const zoom = 1.5
    const world = screenToWorld(300, 250, panX, panY, zoom)
    const screen = worldToScreen(world.x, world.y, panX, panY, zoom)
    expect(screen.x).toBeCloseTo(300)
    expect(screen.y).toBeCloseTo(250)
  })
})

describe('clampZoom', () => {
  it('returns value within range', () => {
    expect(clampZoom(1.5)).toBe(1.5)
  })

  it('clamps to minimum', () => {
    expect(clampZoom(0.01)).toBe(CANVAS_ZOOM_MIN)
  })

  it('clamps to maximum', () => {
    expect(clampZoom(10)).toBe(CANVAS_ZOOM_MAX)
  })

  it('handles default zoom', () => {
    expect(clampZoom(CANVAS_ZOOM_DEFAULT)).toBe(CANVAS_ZOOM_DEFAULT)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test -- lib/canvas/use-infinite-canvas.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement coordinate utilities**

Create `lib/canvas/use-infinite-canvas.ts`:

```typescript
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
 *
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
 *
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
```

Note: The React hook (`useInfiniteCanvas`) will be added in Task 3. This file currently exports only the pure utility functions.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm run test -- lib/canvas/use-infinite-canvas.test.ts`
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/canvas/use-infinite-canvas.ts lib/canvas/use-infinite-canvas.test.ts
git commit -m "feat(canvas): add coordinate conversion utilities with tests"
```

---

## Task 3: useInfiniteCanvas Hook

**Files:**
- Modify: `lib/canvas/use-infinite-canvas.ts` (add the React hook)
- Modify: `lib/canvas/use-infinite-canvas.test.ts` (add hook tests)

- [ ] **Step 1: Write failing test for the hook**

Append to `lib/canvas/use-infinite-canvas.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react'
import { useInfiniteCanvas } from './use-infinite-canvas'

describe('useInfiniteCanvas', () => {
  it('initializes with default state', () => {
    const { result } = renderHook(() => useInfiniteCanvas())

    expect(result.current.state.panX).toBe(0)
    expect(result.current.state.panY).toBe(0)
    expect(result.current.state.zoom).toBe(CANVAS_ZOOM_DEFAULT)
  })

  it('zoomAtPoint zooms toward cursor position', () => {
    const { result } = renderHook(() => useInfiniteCanvas())

    // Zoom in at screen point (200, 200)
    act(() => {
      result.current.zoomAtPoint(1.5, 200, 200)
    })

    expect(result.current.state.zoom).toBe(1.5)
    // Pan adjusts to keep (200,200) pointing at the same world coord
    // Before zoom: world = (200-0)/1 = 200
    // After zoom: screen = 200*1.5 + panX → panX = 200 - 200*1.5 = -100
    expect(result.current.state.panX).toBe(-100)
    expect(result.current.state.panY).toBe(-100)
  })

  it('pan updates offset', () => {
    const { result } = renderHook(() => useInfiniteCanvas())

    act(() => {
      result.current.pan(50, -30)
    })

    expect(result.current.state.panX).toBe(50)
    expect(result.current.state.panY).toBe(-30)
  })

  it('clamps zoom to allowed range', () => {
    const { result } = renderHook(() => useInfiniteCanvas())

    act(() => {
      result.current.zoomAtPoint(999, 0, 0)
    })

    expect(result.current.state.zoom).toBe(CANVAS_ZOOM_MAX)
  })

  it('resetView returns to defaults', () => {
    const { result } = renderHook(() => useInfiniteCanvas())

    act(() => {
      result.current.pan(100, 200)
      result.current.zoomAtPoint(2, 0, 0)
    })

    act(() => {
      result.current.resetView()
    })

    expect(result.current.state.panX).toBe(0)
    expect(result.current.state.panY).toBe(0)
    expect(result.current.state.zoom).toBe(CANVAS_ZOOM_DEFAULT)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test -- lib/canvas/use-infinite-canvas.test.ts`
Expected: FAIL — `useInfiniteCanvas` is not exported.

- [ ] **Step 3: Implement the hook**

Append to the end of `lib/canvas/use-infinite-canvas.ts`:

```typescript
import { useCallback, useRef, useState } from 'react'

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
  /** Ref to set isPanning (used by event handlers) */
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
        // Keep the world point under the cursor fixed
        // worldPoint = (screenX - panX) / oldZoom
        // newPanX = screenX - worldPoint * newZoom
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm run test -- lib/canvas/use-infinite-canvas.test.ts`
Expected: All 12 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/canvas/use-infinite-canvas.ts lib/canvas/use-infinite-canvas.test.ts
git commit -m "feat(canvas): add useInfiniteCanvas hook with pan/zoom state"
```

---

## Task 4: Rewrite Canvas Component

**Files:**
- Rewrite: `components/board/Canvas.tsx`
- Rewrite: `components/board/Canvas.module.css`

- [ ] **Step 1: Rewrite Canvas.module.css**

Replace the entire contents of `components/board/Canvas.module.css`:

```css
/* ── Infinite Canvas ──────────────────────────────────────── */

.viewport {
  position: relative;
  flex: 1;
  overflow: hidden;
  background: var(--canvas-bg, var(--color-bg-primary));
  background-image: var(--canvas-pattern, none);
  background-size: var(--canvas-pattern-size, auto);
  /* Prevent browser default touch gestures (we handle them) */
  touch-action: none;
  /* Prevent text selection during pan */
  user-select: none;
  -webkit-user-select: none;
}

.world {
  position: absolute;
  top: 0;
  left: 0;
  /* Width/height are intentionally unset — this is infinite space.
     Children use position: absolute with x,y coords. */
  transform-origin: 0 0;
  will-change: transform;
}

/* Cursor states */
.viewport[data-panning="true"] {
  cursor: grabbing;
}

.viewport[data-panning="false"] {
  cursor: default;
}
```

- [ ] **Step 2: Rewrite Canvas.tsx**

Replace the entire contents of `components/board/Canvas.tsx`:

```typescript
'use client'

import {
  useCallback,
  useRef,
  type RefObject,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react'
import { CANVAS_ZOOM_SENSITIVITY, CANVAS_PINCH_SENSITIVITY } from '@/lib/constants'
import type { InfiniteCanvasControls } from '@/lib/canvas/use-infinite-canvas'
import styles from './Canvas.module.css'

/** Props for the Canvas component */
type CanvasProps = {
  /** Child elements rendered inside the world container */
  children: React.ReactNode
  /** Infinite canvas controls from useInfiniteCanvas hook */
  canvas: InfiniteCanvasControls
  /** Ref to the world container, used for image export */
  worldRef?: RefObject<HTMLDivElement | null>
  /** Background theme name (matches [data-bg-theme] in globals.css) */
  bgTheme?: string
}

/**
 * Infinite canvas viewport with pan/zoom support.
 *
 * - Mouse wheel: zoom at cursor position
 * - Middle-click drag OR Space+click drag: pan
 * - Two-finger touch: pan + pinch-to-zoom
 * - Left-click on cards: handled by DraggableCard (not this component)
 */
export function Canvas({
  children,
  canvas,
  worldRef,
  bgTheme = 'dark',
}: CanvasProps): React.ReactElement {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const panStartRef = useRef<{ x: number; y: number } | null>(null)
  const lastTouchDistRef = useRef<number | null>(null)
  const lastTouchCenterRef = useRef<{ x: number; y: number } | null>(null)
  const spaceHeldRef = useRef(false)

  // Store canvas controls in ref so native event listeners read latest values
  const canvasRef = useRef(canvas)
  canvasRef.current = canvas

  // ── Keyboard + Wheel: managed via useEffect with cleanup ────
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        spaceHeldRef.current = true
      }
    }

    const handleKeyUp = (e: KeyboardEvent): void => {
      if (e.code === 'Space') {
        spaceHeldRef.current = false
        canvasRef.current.setIsPanning(false)
        panStartRef.current = null
      }
    }

    // Native wheel listener with { passive: false } so preventDefault() works.
    // React's onWheel is passive in React 19 and cannot call preventDefault().
    const handleWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const rect = viewport.getBoundingClientRect()
      const screenX = e.clientX - rect.left
      const screenY = e.clientY - rect.top
      const delta = -e.deltaY * CANVAS_ZOOM_SENSITIVITY
      const newZoom = canvasRef.current.state.zoom * (1 + delta)
      canvasRef.current.zoomAtPoint(newZoom, screenX, screenY)
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)
    viewport.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
      viewport.removeEventListener('wheel', handleWheel)
    }
  }, []) // Empty deps — uses refs for latest values

  // ── Pointer events: pan (middle button or Space+left) ───────
  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      // Middle mouse button (button 1) or Space+left click
      const isMiddle = e.button === 1
      const isSpaceLeft = spaceHeldRef.current && e.button === 0

      if (isMiddle || isSpaceLeft) {
        e.preventDefault()
        canvas.setIsPanning(true)
        panStartRef.current = { x: e.clientX, y: e.clientY }
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      }
    },
    [canvas],
  )

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!panStartRef.current) return

      const dx = e.clientX - panStartRef.current.x
      const dy = e.clientY - panStartRef.current.y
      panStartRef.current = { x: e.clientX, y: e.clientY }

      canvas.pan(dx, dy)
    },
    [canvas],
  )

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (panStartRef.current) {
        panStartRef.current = null
        if (!spaceHeldRef.current) {
          canvas.setIsPanning(false)
        }
        ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
      }
    },
    [canvas],
  )

  // ── Touch events: 2-finger pan + pinch-to-zoom ──────────────
  const getTouchDistance = (t1: Touch, t2: Touch): number => {
    const dx = t1.clientX - t2.clientX
    const dy = t1.clientY - t2.clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  const getTouchCenter = (t1: Touch, t2: Touch): { x: number; y: number } => ({
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2,
  })

  const handleTouchStart = useCallback(
    (e: ReactTouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        const t1 = e.touches[0]
        const t2 = e.touches[1]
        lastTouchDistRef.current = getTouchDistance(t1, t2)
        lastTouchCenterRef.current = getTouchCenter(t1, t2)
        canvas.setIsPanning(true)
      }
    },
    [canvas],
  )

  const handleTouchMove = useCallback(
    (e: ReactTouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 2 && lastTouchDistRef.current !== null && lastTouchCenterRef.current !== null) {
        e.preventDefault()
        const t1 = e.touches[0]
        const t2 = e.touches[1]

        // Pinch zoom
        const newDist = getTouchDistance(t1, t2)
        const scale = newDist / lastTouchDistRef.current

        const rect = viewportRef.current?.getBoundingClientRect()
        if (!rect) return

        const center = getTouchCenter(t1, t2)
        const screenX = center.x - rect.left
        const screenY = center.y - rect.top

        const newZoom = canvas.state.zoom * scale
        canvas.zoomAtPoint(newZoom, screenX, screenY)

        // Two-finger pan
        const dx = center.x - lastTouchCenterRef.current.x
        const dy = center.y - lastTouchCenterRef.current.y
        canvas.pan(dx, dy)

        lastTouchDistRef.current = newDist
        lastTouchCenterRef.current = center
      }
    },
    [canvas],
  )

  const handleTouchEnd = useCallback(
    (e: ReactTouchEvent<HTMLDivElement>) => {
      if (e.touches.length < 2) {
        lastTouchDistRef.current = null
        lastTouchCenterRef.current = null
        canvas.setIsPanning(false)
      }
    },
    [canvas],
  )

  return (
    <div
      ref={viewportRef}
      className={styles.viewport}
      data-bg-theme={bgTheme}
      data-panning={canvas.isPanning}
      /* onWheel is attached as native listener in useEffect (passive: false) */
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        ref={worldRef}
        className={styles.world}
        style={{ transform: canvas.worldTransform }}
      >
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm run build`
Expected: Build fails due to `board-client.tsx` passing old props (`canvasRef`, missing `canvas`). This is expected — we fix it in Task 6.

- [ ] **Step 4: Commit**

```bash
git add components/board/Canvas.tsx components/board/Canvas.module.css
git commit -m "feat(canvas): rewrite Canvas to infinite pan/zoom viewport"
```

---

## Task 5: Update DraggableCard for Canvas Coordinates

**Files:**
- Modify: `components/board/DraggableCard.tsx`

- [ ] **Step 1: Update DraggableCard to account for zoom**

The key change: when GSAP Draggable reports pixel deltas, we must divide by the canvas zoom factor to get world-coordinate deltas.

Replace the entire contents of `components/board/DraggableCard.tsx`:

```typescript
'use client'

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { Draggable } from 'gsap/Draggable'
import styles from './DraggableCard.module.css'

gsap.registerPlugin(Draggable)

/** Props for the DraggableCard wrapper */
type DraggableCardProps = {
  /** Card content to render inside the draggable wrapper */
  children: React.ReactNode
  /** Unique card identifier */
  cardId: string
  /** X position in world coordinates */
  initialX: number
  /** Y position in world coordinates */
  initialY: number
  /** Current canvas zoom factor (used to convert pixel deltas to world coords) */
  zoom: number
  /** Called when drag finishes with the new world-space position */
  onDragEnd: (cardId: string, x: number, y: number) => void
}

/**
 * Wraps card content in a GSAP Draggable container.
 *
 * - Positioned absolutely in world space (left/top = world coords).
 * - GSAP Draggable tracks pixel deltas; we divide by zoom to get world deltas.
 * - Drag start: deeper shadow, slight scale up.
 * - Drag end: restore shadow, persist new world position.
 */
export function DraggableCard({
  children,
  cardId,
  initialX,
  initialY,
  zoom,
  onDragEnd,
}: DraggableCardProps): React.ReactElement {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const draggableRef = useRef<Draggable[]>([])

  // Store latest values in refs so GSAP callbacks can read them
  // without re-creating the Draggable instance.
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const initialXRef = useRef(initialX)
  initialXRef.current = initialX
  const initialYRef = useRef(initialY)
  initialYRef.current = initialY
  const onDragEndRef = useRef(onDragEnd)
  onDragEndRef.current = onDragEnd

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return

    const instances = Draggable.create(el, {
      type: 'x,y',
      zIndexBoost: false,
      onDragStart() {
        el.classList.add(styles.dragging)
        gsap.to(el, { scale: 1.05, duration: 0.2, ease: 'power2.out' })
      },
      onDragEnd() {
        el.classList.remove(styles.dragging)
        gsap.to(el, {
          scale: 1.0,
          duration: 0.4,
          ease: 'back.out(1.7)',
        })

        // GSAP reports pixel deltas; divide by zoom for world-space delta
        const pixelDeltaX = this.endX ?? 0
        const pixelDeltaY = this.endY ?? 0
        const worldDeltaX = pixelDeltaX / zoomRef.current
        const worldDeltaY = pixelDeltaY / zoomRef.current
        const finalX = initialXRef.current + worldDeltaX
        const finalY = initialYRef.current + worldDeltaY

        onDragEndRef.current(cardId, finalX, finalY)
      },
    })

    draggableRef.current = instances

    return () => {
      for (const instance of instances) {
        instance.kill()
      }
    }
  }, [cardId])

  return (
    <div
      ref={wrapperRef}
      className={styles.wrapper}
      data-card-wrapper={cardId}
      style={{
        left: initialX,
        top: initialY,
      }}
    >
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/board/DraggableCard.tsx
git commit -m "feat(canvas): update DraggableCard to divide deltas by zoom"
```

---

## Task 6: Wire Up BoardClient

**Files:**
- Modify: `app/(app)/board/board-client.tsx`

- [ ] **Step 1: Update board-client.tsx**

Apply these changes to `app/(app)/board/board-client.tsx`:

**1. Add import** (at top, with other imports):

```typescript
import { useInfiniteCanvas } from '@/lib/canvas/use-infinite-canvas'
```

**2. Replace `canvasRef`** in the component body:

Replace:
```typescript
const canvasRef = useRef<HTMLDivElement | null>(null)
```
With:
```typescript
const worldRef = useRef<HTMLDivElement | null>(null)
const canvas = useInfiniteCanvas()
```

**3. Update Canvas rendering:**

Replace:
```typescript
<Canvas bgTheme={bgTheme} canvasRef={canvasRef}>
```
With:
```typescript
<Canvas bgTheme={bgTheme} canvas={canvas} worldRef={worldRef}>
```

**4. Add `zoom` prop to every DraggableCard:**

In both the TweetCard and BookmarkCard render blocks, add `zoom={canvas.state.zoom}`:

Replace (TweetCard block):
```typescript
<DraggableCard
  key={card.id}
  cardId={card.id}
  initialX={card.x}
  initialY={card.y}
  onDragEnd={handleDragEnd}
>
```
With:
```typescript
<DraggableCard
  key={card.id}
  cardId={card.id}
  initialX={card.x}
  initialY={card.y}
  zoom={canvas.state.zoom}
  onDragEnd={handleDragEnd}
>
```

Do the same for the BookmarkCard block.

**5. Update ExportButton ref:**

Replace:
```typescript
<ExportButton canvasRef={canvasRef} />
```
With:
```typescript
<ExportButton canvasRef={worldRef} />
```

- [ ] **Step 2: Verify build**

Run: `pnpm run build`
Expected: Build succeeds with zero errors.

- [ ] **Step 3: Run all tests**

Run: `pnpm run test`
Expected: All tests pass (coordinate utility + hook tests).

- [ ] **Step 4: Commit**

```bash
git add app/(app)/board/board-client.tsx
git commit -m "feat(canvas): wire infinite canvas into board client"
```

---

## Task 7: Manual Verification Checklist

This task has no code changes. Verify the implementation by running the dev server and testing interactively.

- [ ] **Step 1: Start dev server**

Run: `pnpm run dev`

- [ ] **Step 2: PC verification**

Open `http://localhost:3000/board` in a desktop browser:

1. Mouse wheel → canvas zooms in/out at cursor position
2. Middle-click drag → canvas pans
3. Hold Space + left-click drag → canvas pans
4. Left-click drag on a card → card moves (pan does NOT activate)
5. Add a URL → card appears, can be dragged
6. Zoom in (wheel up) → cards get larger
7. Zoom out (wheel down) → cards get smaller, more visible area
8. After zooming, drag a card → card position is saved correctly in world coords

- [ ] **Step 3: Mobile verification (Chrome DevTools)**

Open Chrome DevTools → Toggle device toolbar (Ctrl+Shift+M):

1. Two-finger pinch → canvas zooms
2. Two-finger drag → canvas pans
3. Single-finger drag on card → card moves
4. Single-finger on background → nothing happens (no accidental pan)

- [ ] **Step 4: Export verification**

1. Zoom to a comfortable level
2. Click export button → PNG should capture the world container
3. Verify the exported image shows cards at their world positions

- [ ] **Step 5: Final commit with updated TODO**

Update `docs/TODO.md`: move S1 to completed, set S2 as next.

```bash
git add docs/TODO.md
git commit -m "docs: mark S1 (infinite canvas) as complete"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Canvas constants | `lib/constants.ts` |
| 2 | Coordinate utilities + tests | `lib/canvas/use-infinite-canvas.ts`, `.test.ts` |
| 3 | useInfiniteCanvas hook + tests | Same files (append) |
| 4 | Canvas component rewrite | `Canvas.tsx`, `Canvas.module.css` |
| 5 | DraggableCard zoom support | `DraggableCard.tsx` |
| 6 | Board client wiring | `board-client.tsx` |
| 7 | Manual verification | No code changes |

Total: 7 tasks, ~15 steps, 6 commits.
