# S2: Grid ⇄ Collage Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toggle button that switches between grid (masonry) view and collage (free scatter) view, with smooth GSAP animation between modes.

**Architecture:** A `viewMode` state (`'grid' | 'collage'`) in BoardClient controls card positioning. In grid mode, card positions are computed by a pure masonry algorithm; drag is disabled. In collage mode, cards use their saved x/y from IndexedDB; drag is enabled. Switching modes triggers a GSAP timeline that animates each card from its current position to the target position with stagger. Pure layout/collision functions are tested with Vitest.

**Tech Stack:** React 19, GSAP, CSS Modules, Vitest, IndexedDB (idb)

**Prerequisites:** Read `docs/superpowers/specs/2026-04-10-week2-design.md` section 1.2.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `lib/constants.ts` | Modify | Add grid/collage layout constants |
| `app/globals.css` | Modify | Add `--grid-gap`, `--collage-rotation-range` CSS variables |
| `lib/canvas/auto-layout.ts` | Create | Pure masonry grid + collage scatter position calculation |
| `lib/canvas/auto-layout.test.ts` | Create | Tests for layout algorithms |
| `lib/canvas/collision.ts` | Create | Bounding box overlap detection |
| `lib/canvas/collision.test.ts` | Create | Tests for collision detection |
| `lib/storage/indexeddb.ts` | Modify | Add `gridIndex`, `isManuallyPlaced` to CardRecord; DB migration v2 |
| `components/board/ViewModeToggle.tsx` | Create | Grid/collage toggle button |
| `components/board/ViewModeToggle.module.css` | Create | Toggle button styling |
| `components/board/DraggableCard.tsx` | Modify | Add `draggable` prop to conditionally enable drag |
| `components/board/DraggableCard.module.css` | Modify | Cursor style when drag disabled |
| `app/(app)/board/board-client.tsx` | Modify | viewMode state, computed positions, toggle wiring, switch animation |

---

## Task 1: Constants & CSS Tokens

**Files:**
- Modify: `lib/constants.ts`
- Modify: `app/globals.css`

- [ ] **Step 1: Add layout constants to `lib/constants.ts`**

Add these constants after the existing canvas constants:

```typescript
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
```

- [ ] **Step 2: Add CSS variables to `app/globals.css`**

Add inside the `:root` block, after the `--duration-dramatic` line:

```css
  /* ── Grid / Collage Layout ── */
  --grid-gap: 16px;
  --collage-rotation-range: 5deg;
  --shadow-grid-card: 0 2px 8px rgba(0, 0, 0, 0.2);
  --shadow-collage-card: 0 8px 24px rgba(0, 0, 0, 0.5);
```

Also add the light mode overrides inside `[data-theme="light"]`:

```css
  --shadow-grid-card: 0 2px 8px rgba(0, 0, 0, 0.08);
  --shadow-collage-card: 0 8px 24px rgba(0, 0, 0, 0.15);
```

- [ ] **Step 3: Commit**

```bash
git add lib/constants.ts app/globals.css
git commit -m "feat(layout): add grid/collage constants and CSS tokens"
```

---

## Task 2: Collision Detection

**Files:**
- Create: `lib/canvas/collision.ts`
- Create: `lib/canvas/collision.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/canvas/collision.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  getOverlapArea,
  getOverlapPercentage,
  findNonOverlappingPosition,
  type Rect,
} from './collision'

describe('getOverlapArea', () => {
  it('returns 0 for non-overlapping rects', () => {
    const a: Rect = { x: 0, y: 0, width: 100, height: 100 }
    const b: Rect = { x: 200, y: 200, width: 100, height: 100 }
    expect(getOverlapArea(a, b)).toBe(0)
  })

  it('returns correct area for partially overlapping rects', () => {
    const a: Rect = { x: 0, y: 0, width: 100, height: 100 }
    const b: Rect = { x: 50, y: 50, width: 100, height: 100 }
    // Overlap region: x=[50,100], y=[50,100] => 50 * 50 = 2500
    expect(getOverlapArea(a, b)).toBe(2500)
  })

  it('returns full area for identical rects', () => {
    const a: Rect = { x: 10, y: 10, width: 50, height: 50 }
    expect(getOverlapArea(a, a)).toBe(2500)
  })

  it('returns correct area when one rect is inside another', () => {
    const outer: Rect = { x: 0, y: 0, width: 200, height: 200 }
    const inner: Rect = { x: 50, y: 50, width: 50, height: 50 }
    expect(getOverlapArea(outer, inner)).toBe(2500)
  })
})

describe('getOverlapPercentage', () => {
  it('returns 0 for non-overlapping rects', () => {
    const a: Rect = { x: 0, y: 0, width: 100, height: 100 }
    const b: Rect = { x: 200, y: 0, width: 100, height: 100 }
    expect(getOverlapPercentage(a, b)).toBe(0)
  })

  it('returns 1 for identical rects', () => {
    const a: Rect = { x: 0, y: 0, width: 100, height: 100 }
    expect(getOverlapPercentage(a, a)).toBe(1)
  })

  it('returns correct percentage for partial overlap', () => {
    const a: Rect = { x: 0, y: 0, width: 100, height: 100 }
    const b: Rect = { x: 50, y: 0, width: 100, height: 100 }
    // Overlap = 50*100 = 5000, smaller area = 10000
    expect(getOverlapPercentage(a, b)).toBe(0.5)
  })
})

describe('findNonOverlappingPosition', () => {
  it('returns center when no existing rects', () => {
    const pos = findNonOverlappingPosition(
      [],
      { width: 100, height: 100 },
      { x: 500, y: 500 },
      0.5,
      10,
    )
    expect(pos.x).toBe(500)
    expect(pos.y).toBe(500)
  })

  it('avoids overlapping with existing rect', () => {
    const existing: Rect[] = [{ x: 500, y: 500, width: 240, height: 160 }]
    const pos = findNonOverlappingPosition(
      existing,
      { width: 240, height: 160 },
      { x: 500, y: 500 },
      0.5,
      10,
    )
    // Should find a position where overlap < 50%
    const newRect: Rect = { x: pos.x, y: pos.y, width: 240, height: 160 }
    const overlap = getOverlapPercentage(existing[0], newRect)
    expect(overlap).toBeLessThan(0.5)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/canvas/collision.test.ts`
Expected: FAIL — module `./collision` not found

- [ ] **Step 3: Implement collision detection**

Create `lib/canvas/collision.ts`:

```typescript
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Axis-aligned bounding box */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

// ---------------------------------------------------------------------------
// Overlap calculation
// ---------------------------------------------------------------------------

/**
 * Calculate the overlapping area (in square pixels) between two rectangles.
 * Returns 0 if they don't overlap.
 */
export function getOverlapArea(a: Rect, b: Rect): number {
  const overlapX = Math.max(
    0,
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
  )
  const overlapY = Math.max(
    0,
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
  )
  return overlapX * overlapY
}

/**
 * Calculate overlap as a fraction (0–1) of the smaller rectangle's area.
 * Returns 0 if no overlap, 1 if fully contained.
 */
export function getOverlapPercentage(a: Rect, b: Rect): number {
  const overlap = getOverlapArea(a, b)
  if (overlap === 0) return 0
  const smallerArea = Math.min(a.width * a.height, b.width * b.height)
  return overlap / smallerArea
}

// ---------------------------------------------------------------------------
// Position finding
// ---------------------------------------------------------------------------

/**
 * Find a position near `center` where a new card of the given size
 * doesn't overlap more than `maxOverlap` with any existing rect.
 *
 * Uses a spiral search pattern outward from center.
 * Returns center immediately if no existing rects.
 */
export function findNonOverlappingPosition(
  existingRects: Rect[],
  newSize: { width: number; height: number },
  center: { x: number; y: number },
  maxOverlap: number,
  maxAttempts: number,
): { x: number; y: number } {
  if (existingRects.length === 0) {
    return { x: center.x, y: center.y }
  }

  // Spiral outward from center
  const step = 60 // pixels per step
  for (let i = 0; i < maxAttempts; i++) {
    const angle = (i * 137.5 * Math.PI) / 180 // golden angle for even spread
    const radius = step * Math.sqrt(i)
    const candidateX = center.x + radius * Math.cos(angle)
    const candidateY = center.y + radius * Math.sin(angle)

    const candidate: Rect = {
      x: candidateX,
      y: candidateY,
      width: newSize.width,
      height: newSize.height,
    }

    const hasExcessiveOverlap = existingRects.some(
      (r) => getOverlapPercentage(r, candidate) > maxOverlap,
    )

    if (!hasExcessiveOverlap) {
      return { x: candidateX, y: candidateY }
    }
  }

  // All attempts exhausted — use the last attempted position
  const lastAngle = (maxAttempts * 137.5 * Math.PI) / 180
  const lastRadius = step * Math.sqrt(maxAttempts)
  return {
    x: center.x + lastRadius * Math.cos(lastAngle),
    y: center.y + lastRadius * Math.sin(lastAngle),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/canvas/collision.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/canvas/collision.ts lib/canvas/collision.test.ts
git commit -m "feat(layout): add collision detection with tests"
```

---

## Task 3: Auto-Layout Engine

**Files:**
- Create: `lib/canvas/auto-layout.ts`
- Create: `lib/canvas/auto-layout.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/canvas/auto-layout.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  calculateMasonryPositions,
  calculateResponsiveColumns,
  estimateCardHeight,
  type CardDimension,
  type MasonryPosition,
} from './auto-layout'

describe('calculateResponsiveColumns', () => {
  it('returns 4 columns for desktop viewport (1200px)', () => {
    expect(calculateResponsiveColumns(1200)).toBe(4)
  })

  it('returns 3 columns for tablet viewport (900px)', () => {
    expect(calculateResponsiveColumns(900)).toBe(3)
  })

  it('returns 2 columns for mobile viewport (400px)', () => {
    expect(calculateResponsiveColumns(400)).toBe(2)
  })

  it('returns 5 columns for wide viewport (1800px)', () => {
    expect(calculateResponsiveColumns(1800)).toBe(5)
  })
})

describe('calculateMasonryPositions', () => {
  it('returns empty array for no cards', () => {
    expect(calculateMasonryPositions([], 3, 240, 16)).toEqual([])
  })

  it('places one card at origin', () => {
    const cards: CardDimension[] = [{ id: 'a', width: 240, height: 160 }]
    const positions = calculateMasonryPositions(cards, 3, 240, 16, 50, 50)
    expect(positions).toHaveLength(1)
    expect(positions[0].id).toBe('a')
    expect(positions[0].x).toBe(50) // origin X
    expect(positions[0].y).toBe(50) // origin Y
  })

  it('places cards in columns (shortest column first)', () => {
    const cards: CardDimension[] = [
      { id: 'a', width: 240, height: 100 },
      { id: 'b', width: 240, height: 200 },
      { id: 'c', width: 240, height: 100 },
      { id: 'd', width: 240, height: 100 }, // should go under 'a' (col 0, height 100) not 'b' (col 1, height 200)
    ]
    const positions = calculateMasonryPositions(cards, 3, 240, 16, 0, 0)

    // Card d should be placed in column 0 or 2 (both have height 100), not column 1 (height 200)
    const posD = positions.find((p) => p.id === 'd')!
    const posB = positions.find((p) => p.id === 'b')!
    // posD should NOT be directly below posB
    expect(posD.x).not.toBe(posB.x)
  })

  it('respects gap between rows', () => {
    const cards: CardDimension[] = [
      { id: 'a', width: 240, height: 100 },
      { id: 'b', width: 240, height: 100 },
      { id: 'c', width: 240, height: 100 },
      { id: 'd', width: 240, height: 100 }, // wraps to row 2 in col 0
    ]
    const gap = 16
    const positions = calculateMasonryPositions(cards, 3, 240, gap, 0, 0)
    const posA = positions.find((p) => p.id === 'a')!
    const posD = positions.find((p) => p.id === 'd')!
    // posD is in column 0 below posA
    expect(posD.x).toBe(posA.x)
    expect(posD.y).toBe(posA.y + 100 + gap) // height of a + gap
  })
})

describe('estimateCardHeight', () => {
  it('returns tweet height for tweet type', () => {
    expect(estimateCardHeight('tweet', true)).toBe(300)
  })

  it('returns thumbnail height when thumbnail exists', () => {
    expect(estimateCardHeight('website', true)).toBe(160)
  })

  it('returns no-thumbnail height when no thumbnail', () => {
    expect(estimateCardHeight('website', false)).toBe(130)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/canvas/auto-layout.test.ts`
Expected: FAIL — module `./auto-layout` not found

- [ ] **Step 3: Implement auto-layout**

Create `lib/canvas/auto-layout.ts`:

```typescript
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

  // Track the bottom Y of each column
  const columnHeights = new Array<number>(columns).fill(0)
  const positions: MasonryPosition[] = []

  for (const card of cards) {
    // Find the shortest column
    let shortestCol = 0
    for (let col = 1; col < columns; col++) {
      if (columnHeights[col] < columnHeights[shortestCol]) {
        shortestCol = col
      }
    }

    const x = originX + shortestCol * (cardWidth + gap)
    const y = originY + columnHeights[shortestCol]

    positions.push({ id: card.id, x, y })

    // Update column height
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/canvas/auto-layout.test.ts`
Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/canvas/auto-layout.ts lib/canvas/auto-layout.test.ts
git commit -m "feat(layout): add masonry grid and collage scatter algorithms with tests"
```

---

## Task 4: IndexedDB Schema Migration

**Files:**
- Modify: `lib/constants.ts`
- Modify: `lib/storage/indexeddb.ts`

- [ ] **Step 1: Bump DB version in constants**

In `lib/constants.ts`, change:

```typescript
// Old:
export const DB_VERSION = 1

// New:
export const DB_VERSION = 2
```

- [ ] **Step 2: Update CardRecord interface**

In `lib/storage/indexeddb.ts`, update the `CardRecord` interface:

```typescript
/** Card record — visual position of a bookmark on the canvas */
export interface CardRecord {
  /** UUID primary key */
  id: string
  /** Associated bookmark ID */
  bookmarkId: string
  /** Parent folder ID (denormalized for efficient queries) */
  folderId: string
  /** X position on canvas (collage mode) */
  x: number
  /** Y position on canvas (collage mode) */
  y: number
  /** Rotation in degrees (collage mode) */
  rotation: number
  /** Scale factor */
  scale: number
  /** Stacking order */
  zIndex: number
  /** Position index for grid mode ordering (auto-assigned) */
  gridIndex: number
  /** Whether user manually placed this card (vs auto-scatter) */
  isManuallyPlaced: boolean
}
```

- [ ] **Step 3: Add v1→v2 migration in `initDB`**

Replace the `upgrade` function in `initDB`:

```typescript
export async function initDB(): Promise<IDBPDatabase<AllMarksDB>> {
  return openDB<AllMarksDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      // ── v0 → v1: initial schema ──
      if (oldVersion < 1) {
        const bookmarkStore = db.createObjectStore('bookmarks', { keyPath: 'id' })
        bookmarkStore.createIndex('by-folder', 'folderId')
        bookmarkStore.createIndex('by-date', 'savedAt')

        db.createObjectStore('folders', { keyPath: 'id' })

        const cardStore = db.createObjectStore('cards', { keyPath: 'id' })
        cardStore.createIndex('by-folder', 'folderId')
        cardStore.createIndex('by-bookmark', 'bookmarkId')

        db.createObjectStore('settings', { keyPath: 'key' })
      }

      // ── v1 → v2: add gridIndex + isManuallyPlaced to cards ──
      if (oldVersion < 2) {
        const cardStore = transaction.objectStore('cards')
        cardStore.openCursor().then(function addFields(cursor) {
          if (!cursor) return
          const card = cursor.value as Record<string, unknown>
          if (card.gridIndex === undefined) {
            card.gridIndex = 0
            card.isManuallyPlaced = false
            cursor.update(card)
          }
          return cursor.continue().then(addFields)
        })
      }
    },
  })
}
```

- [ ] **Step 4: Update `addBookmark` to set new fields**

In the `addBookmark` function, update the card creation to include the new fields. Replace the card creation block:

```typescript
    // Count existing cards to determine gridIndex
    const existingCards = await tx.objectStore('cards').index('by-folder').getAll(bookmark.folderId)
    const gridIndex = existingCards.length

    const pos = randomPosition()
    const card: CardRecord = {
      id: uuid(),
      bookmarkId: bookmark.id,
      folderId: bookmark.folderId,
      x: pos.x,
      y: pos.y,
      rotation: randomRotation(),
      scale: 1,
      zIndex: 1,
      gridIndex,
      isManuallyPlaced: false,
    }
```

- [ ] **Step 5: Update `updateCard` to allow updating new fields**

No code change needed — `updateCard` already uses `Partial<Omit<CardRecord, 'id' | 'bookmarkId' | 'folderId'>>` which automatically includes the new fields.

- [ ] **Step 6: Commit**

```bash
git add lib/constants.ts lib/storage/indexeddb.ts
git commit -m "feat(db): add gridIndex and isManuallyPlaced to CardRecord with v2 migration"
```

---

## Task 5: ViewModeToggle Component

**Files:**
- Create: `components/board/ViewModeToggle.tsx`
- Create: `components/board/ViewModeToggle.module.css`

- [ ] **Step 1: Create the toggle component**

Create `components/board/ViewModeToggle.tsx`:

```typescript
'use client'

import styles from './ViewModeToggle.module.css'

/** View mode for the canvas */
export type ViewMode = 'grid' | 'collage'

/** Props for ViewModeToggle */
type ViewModeToggleProps = {
  /** Current view mode */
  mode: ViewMode
  /** Called when the mode changes */
  onToggle: (mode: ViewMode) => void
}

/**
 * Toggle button for switching between grid and collage view modes.
 * Uses inline SVG icons — no external icon library.
 */
export function ViewModeToggle({
  mode,
  onToggle,
}: ViewModeToggleProps): React.ReactElement {
  return (
    <div className={styles.container}>
      <button
        className={mode === 'grid' ? styles.buttonActive : styles.button}
        onClick={() => onToggle('grid')}
        type="button"
        title="グリッド表示"
        aria-label="Grid view"
        aria-pressed={mode === 'grid'}
      >
        {/* Grid icon: 2x2 squares */}
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect x="1" y="1" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <rect x="10" y="1" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <rect x="1" y="10" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <rect x="10" y="10" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      <button
        className={mode === 'collage' ? styles.buttonActive : styles.button}
        onClick={() => onToggle('collage')}
        type="button"
        title="コラージュ表示"
        aria-label="Collage view"
        aria-pressed={mode === 'collage'}
      >
        {/* Collage icon: scattered overlapping cards */}
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect x="2" y="4" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" transform="rotate(-5 6 7)" />
          <rect x="7" y="2" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" transform="rotate(3 11 5)" />
          <rect x="5" y="9" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" transform="rotate(4 9 12)" />
        </svg>
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Create the toggle CSS**

Create `components/board/ViewModeToggle.module.css`:

```css
.container {
  position: fixed;
  top: var(--space-4);
  left: 50%;
  transform: translateX(-50%);
  z-index: 70; /* Z_INDEX.TOOLBAR */
  display: flex;
  gap: 2px;
  padding: 3px;
  background: var(--color-glass-bg);
  border: 1px solid var(--color-glass-border);
  border-radius: var(--radius-full);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.button,
.buttonActive {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  color: var(--color-text-secondary);
  transition:
    background var(--duration-fast) var(--ease-out-expo),
    color var(--duration-fast) var(--ease-out-expo);
}

.button:hover {
  background: var(--color-glass-bg-hover);
  color: var(--color-text-primary);
}

.buttonActive {
  background: var(--color-accent-primary);
  color: #fff;
}

.buttonActive:hover {
  background: var(--color-accent-primary-hover);
}
```

- [ ] **Step 3: Commit**

```bash
git add components/board/ViewModeToggle.tsx components/board/ViewModeToggle.module.css
git commit -m "feat(ui): add ViewModeToggle component for grid/collage switching"
```

---

## Task 6: DraggableCard — Conditional Drag

**Files:**
- Modify: `components/board/DraggableCard.tsx`
- Modify: `components/board/DraggableCard.module.css`

- [ ] **Step 1: Add `draggable` prop and conditional Draggable creation**

Replace the full content of `components/board/DraggableCard.tsx`:

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
  /** Whether drag is enabled (false in grid mode) */
  draggable?: boolean
}

/**
 * Wraps card content in an absolutely positioned container.
 *
 * - When draggable=true (default): GSAP Draggable is created.
 * - When draggable=false: positioned statically, no drag interaction.
 * - GSAP Draggable tracks pixel deltas; we divide by zoom to get world deltas.
 */
export function DraggableCard({
  children,
  cardId,
  initialX,
  initialY,
  zoom,
  onDragEnd,
  draggable = true,
}: DraggableCardProps): React.ReactElement {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const draggableRef = useRef<Draggable[]>([])

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
    if (!el || !draggable) return

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
      draggableRef.current = []
    }
  }, [cardId, draggable])

  return (
    <div
      ref={wrapperRef}
      className={draggable ? styles.wrapper : styles.wrapperStatic}
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

- [ ] **Step 2: Add static wrapper style**

Replace the content of `components/board/DraggableCard.module.css`:

```css
/* ── DraggableCard wrapper ─────────────────────────────────── */

.wrapper {
  position: absolute;
  cursor: grab;
}

.wrapper:active {
  cursor: grabbing;
}

.wrapperStatic {
  position: absolute;
  cursor: default;
}

.dragging {
  box-shadow: var(--shadow-drag) !important;
  z-index: 50 !important;
}
```

- [ ] **Step 3: Commit**

```bash
git add components/board/DraggableCard.tsx components/board/DraggableCard.module.css
git commit -m "feat(card): add draggable prop to DraggableCard for grid mode support"
```

---

## Task 7: BoardClient — ViewMode Integration

**Files:**
- Modify: `app/(app)/board/board-client.tsx`

This is the main wiring task. BoardClient gets:
- `viewMode` state
- Computed positions based on mode
- ViewModeToggle rendered in the UI
- Drag disabled in grid mode
- Card shadow style varies by mode

- [ ] **Step 1: Add imports and viewMode state**

At the top of `board-client.tsx`, add the new imports (after existing imports):

```typescript
import { ViewModeToggle, type ViewMode } from '@/components/board/ViewModeToggle'
import {
  calculateMasonryPositions,
  calculateResponsiveColumns,
  estimateCardHeight,
} from '@/lib/canvas/auto-layout'
import { CARD_WIDTH, GRID_GAP } from '@/lib/constants'
```

Inside the `BoardClient` function, add after the existing state declarations:

```typescript
  const [viewMode, setViewMode] = useState<ViewMode>('collage')
```

- [ ] **Step 2: Compute grid positions with useMemo**

Add `useMemo` to the import from `react`:

```typescript
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
```

Add the grid position calculation after the `items` state is set up, before the handlers:

```typescript
  // ── Compute grid positions ─────────────────────────────────
  const gridPositions = useMemo(() => {
    if (viewMode !== 'grid' || items.length === 0) return new Map<string, { x: number; y: number }>()

    const columns = calculateResponsiveColumns(
      typeof window !== 'undefined' ? window.innerWidth : 1200,
    )
    const cardDimensions = items.map(({ card, bookmark }) => ({
      id: card.id,
      width: CARD_WIDTH,
      height: estimateCardHeight(bookmark.type, bookmark.thumbnail.length > 0),
    }))
    const positions = calculateMasonryPositions(cardDimensions, columns, CARD_WIDTH, GRID_GAP)
    return new Map(positions.map((p) => [p.id, { x: p.x, y: p.y }]))
  }, [viewMode, items])
```

- [ ] **Step 3: Update the render section**

Replace the card rendering block inside `<Canvas>` (the `items.map(...)` block) with:

```typescript
        {items.map(({ card, bookmark }) => {
          const isGrid = viewMode === 'grid'
          const gridPos = gridPositions.get(card.id)
          const displayX = isGrid && gridPos ? gridPos.x : card.x
          const displayY = isGrid && gridPos ? gridPos.y : card.y
          const displayRotation = isGrid ? 0 : card.rotation

          const innerStyle: React.CSSProperties = {
            zIndex: card.zIndex || Z_INDEX.CANVAS_CARD,
            ['--card-rotation' as string]: `${displayRotation}deg`,
            ['--float-delay' as string]: `${(Math.random() * FLOAT_DELAY_MAX).toFixed(2)}s`,
            ['--float-duration' as string]: `${FLOAT_DURATION}s`,
            boxShadow: isGrid
              ? 'var(--shadow-grid-card)'
              : 'var(--shadow-collage-card)',
            animationPlayState: isGrid ? 'paused' : 'running',
          }

          const tweetId =
            bookmark.type === 'tweet' ? extractTweetId(bookmark.url) : null

          if (tweetId) {
            return (
              <DraggableCard
                key={card.id}
                cardId={card.id}
                initialX={displayX}
                initialY={displayY}
                zoom={canvas.state.zoom}
                onDragEnd={handleDragEnd}
                draggable={!isGrid}
              >
                <TweetCard
                  tweetId={tweetId}
                  style={innerStyle}
                />
              </DraggableCard>
            )
          }

          return (
            <DraggableCard
              key={card.id}
              cardId={card.id}
              initialX={displayX}
              initialY={displayY}
              zoom={canvas.state.zoom}
              onDragEnd={handleDragEnd}
              draggable={!isGrid}
            >
              <BookmarkCard
                bookmark={bookmark}
                style={innerStyle}
              />
            </DraggableCard>
          )
        })}
```

- [ ] **Step 4: Render ViewModeToggle**

Add the ViewModeToggle after the `<Canvas>` closing tag, before `<ExportButton>`:

```typescript
      <ViewModeToggle mode={viewMode} onToggle={setViewMode} />
```

- [ ] **Step 5: Commit**

```bash
git add app/(app)/board/board-client.tsx
git commit -m "feat(board): wire viewMode state with grid/collage position rendering"
```

---

## Task 8: Switch Animation

**Files:**
- Modify: `app/(app)/board/board-client.tsx`

Add GSAP animation when viewMode changes, so cards slide smoothly from one layout to the other.

- [ ] **Step 1: Add animation imports to BoardClient**

Add to imports at the top of `board-client.tsx`:

```typescript
import { gsap } from 'gsap'
import {
  VIEW_SWITCH_DURATION,
  VIEW_SWITCH_STAGGER,
  VIEW_SWITCH_EASE,
} from '@/lib/constants'
```

Note: `gsap` is already imported by GSAP Draggable in child components. It's fine to import directly in `BoardClient` as well — GSAP deduplicates.

- [ ] **Step 2: Add animation effect**

Add this `useEffect` inside `BoardClient`, after the `gridPositions` useMemo:

```typescript
  // ── Animate view mode switch ────────────────────────────────
  const prevViewModeRef = useRef<ViewMode>(viewMode)
  const isFirstRenderRef = useRef(true)

  useEffect(() => {
    // Skip animation on first render
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false
      prevViewModeRef.current = viewMode
      return
    }

    // Skip if mode hasn't actually changed
    if (prevViewModeRef.current === viewMode) return
    prevViewModeRef.current = viewMode

    // Animate all card wrappers
    const wrappers = document.querySelectorAll<HTMLElement>('[data-card-wrapper]')
    if (wrappers.length === 0) return

    // Capture current rendered positions before React updates
    const currentPositions = new Map<string, { left: number; top: number }>()
    wrappers.forEach((el) => {
      const id = el.getAttribute('data-card-wrapper') ?? ''
      currentPositions.set(id, {
        left: parseFloat(el.style.left) || 0,
        top: parseFloat(el.style.top) || 0,
      })
    })

    // After a microtask (React has re-rendered), animate from old to new
    requestAnimationFrame(() => {
      const updatedWrappers = document.querySelectorAll<HTMLElement>('[data-card-wrapper]')
      const tl = gsap.timeline()

      updatedWrappers.forEach((el, index) => {
        const id = el.getAttribute('data-card-wrapper') ?? ''
        const prev = currentPositions.get(id)
        if (!prev) return

        const newLeft = parseFloat(el.style.left) || 0
        const newTop = parseFloat(el.style.top) || 0

        if (prev.left === newLeft && prev.top === newTop) return

        // Reset any GSAP Draggable transforms
        gsap.set(el, { x: 0, y: 0 })

        // Set element to old position and animate to new
        gsap.set(el, { left: prev.left, top: prev.top })
        tl.to(
          el,
          {
            left: newLeft,
            top: newTop,
            duration: VIEW_SWITCH_DURATION,
            ease: VIEW_SWITCH_EASE,
          },
          index * VIEW_SWITCH_STAGGER,
        )
      })
    })
  }, [viewMode, items, gridPositions])
```

- [ ] **Step 3: Commit**

```bash
git add app/(app)/board/board-client.tsx
git commit -m "feat(animation): add GSAP timeline animation for view mode switching"
```

---

## Task 9: Build & Test Verification

**Files:** None (verification only)

- [ ] **Step 1: Run tests**

Run: `npx vitest run`
Expected: All tests pass (collision + auto-layout)

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build completes with no errors

- [ ] **Step 3: Manual verification checklist**

Run `npm run dev` and verify:
- [ ] Toggle button appears centered at top of canvas
- [ ] Clicking "grid" switches to masonry layout (cards aligned, 0° rotation)
- [ ] Clicking "collage" switches back to scattered layout (cards at saved positions with rotation)
- [ ] Cards animate smoothly during switch (0.6s, stagger)
- [ ] In grid mode: cards are NOT draggable (cursor = default)
- [ ] In collage mode: cards ARE draggable (cursor = grab)
- [ ] Float animation pauses in grid mode, resumes in collage mode
- [ ] Card shadow is subtle in grid mode, deep in collage mode
- [ ] Adding a new card works in both modes

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(S2): complete grid/collage view toggle with animation"
```

---

## Completion Criteria (from design spec)

- [x] ボタンでグリッド ⇄ コラージュ切り替え
- [x] 切替時にGSAPアニメーション
- [x] コラージュモードでカードに角度+重なりがある
- [x] 新規カード追加時に自動配置される
- [x] `npm run build` が通る
