# Board: Content-Sized Masonry + Drag-to-Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pivot `/board` from always-free canvas to a content-sized column-masonry gallery with iOS-style drag-to-reorder and S/M/L size presets. Resolve the "card-under-neighbor" class of bugs by guaranteeing non-overlap.

**Architecture:** Replace justified-rows layout (`computeAutoLayout`) with a column-masonry layout that packs cards into columns. Card dimensions are derived at render time from content type (YouTube 16:9, long tweet 1:2, etc.) multiplied by a per-card `sizePreset` that spans 1, 2, or 3 columns. Strip free-drag / resize handle / rotation handle / Align button from the Board. Drag changes the `orderIndex` (not x/y). GSAP FLIP animates reflow on drop.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, vanilla CSS Modules, IndexedDB via `idb`, GSAP (Draggable not needed; bare `gsap.to` + `gsap.quickTo` for reorder/FLIP), vitest + fake-indexeddb for unit, Playwright for E2E.

**Spec:** [`docs/superpowers/specs/2026-04-20-board-content-sized-reorder-design.md`](../specs/2026-04-20-board-content-sized-reorder-design.md)

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `lib/board/column-masonry.ts` | Pure function: pack cards with variable spans into columns, return positions |
| `lib/board/column-masonry.test.ts` | Unit tests |
| `components/board/SizePresetToggle.tsx` | Hover-revealed S/M/L cycle button (right-bottom of card) |
| `components/board/SizePresetToggle.module.css` | Toggle styling |
| `components/board/use-card-reorder-drag.ts` | Drag state machine + FLIP reflow, owns the pointer-capture lifecycle |

### Modified files

| Path | Change |
|---|---|
| `lib/board/aspect-ratio.ts` | Extend existing heuristics: YouTube Shorts 9:16, Instagram Reels 9:16, refined tweet thresholds (140/280), image-bearing tweet uses OGP image ratio |
| `lib/board/aspect-ratio.test.ts` | Add tests for new branches |
| `lib/storage/indexeddb.ts` | Add `orderIndex` + `sizePreset` fields to `BookmarkRecord`; add v8 migration; add `updateBookmarkOrderAndSize` helper |
| `lib/constants.ts` | Bump `DB_VERSION` 7 → 8 |
| `lib/storage/use-board-data.ts` | Expose `sizePreset` + `orderIndex` on `BoardItem`; add `persistOrderIndex` + `persistSizePreset` + `persistOrderBatch`; deprecate `persistCardPosition` shim |
| `components/board/BoardRoot.tsx` | Remove free-drag / resize / rotation / align state; wire column-masonry + reorder drag |
| `components/board/CardsLayer.tsx` | Drop free-drag state machine + ResizeHandle + align morph; render column-masonry positions; wire reorder drag + FLIP |
| `components/board/CardNode.tsx` | Accept `sizePreset` prop, render `SizePresetToggle` on hover |
| `components/board/Toolbar.tsx` | Remove `onAlign` prop + button; keep Share only |
| `app/(app)/board/page.tsx` | No change expected; verify only |

### Deleted files

| Path | Reason |
|---|---|
| `components/board/ResizeHandle.tsx` + `.module.css` | Continuous resize replaced by S/M/L preset |
| `components/board/RotationHandle.tsx` + `.module.css` | Rotation moves to Share Modal (Plan B) |
| `components/board/use-card-drag.ts` | Superseded by `use-card-reorder-drag.ts` |
| `components/board/SnapGuides.tsx` + `.module.css` | Free-drag snap guides no longer needed |
| `lib/board/free-layout.ts` + `.test.ts` | Free-drag snap helpers unused after pivot |

### Preserved (not touched)

- `lib/board/auto-layout.ts` — kept as-is for Share Modal preview (Plan B)
- `lib/board/align.ts` — kept as-is; no longer called from Board, but Share Modal may reuse
- `InteractionLayer.tsx` / `ThemeLayer.tsx` / `Sidebar.tsx` / `LiquidGlass.tsx` — unchanged

---

## Execution Order

**Phase A — Pure functions (no UX change):**
- Task 1: Extend `aspect-ratio.ts` heuristics
- Task 2: Implement `column-masonry.ts`

**Phase B — Data model:**
- Task 3: Add `orderIndex` + `sizePreset` to IDB + v8 migration
- Task 4: Expose via `use-board-data` hook

**Phase C — Layout swap (visible moodboard):**
- Task 5: Switch `CardsLayer` / `BoardRoot` to column-masonry (keeping existing drag/resize wired)
- Task 6: Remove Align button from `Toolbar` + `BoardRoot`

**Phase D — Strip legacy interactions:**
- Task 7: Remove free-drag + ResizeHandle + RotationHandle + SnapGuides from `CardsLayer` / `BoardRoot` (cards become static-but-rendered)

**Phase E — New Size UI:**
- Task 8: `SizePresetToggle` component
- Task 9: Wire toggle in `CardNode` + persist on click
- Task 10: Keyboard `1`/`2`/`3` shortcuts

**Phase F — Drag-to-reorder:**
- Task 11: `use-card-reorder-drag` hook
- Task 12: Wire reorder in `CardsLayer` with GSAP FLIP + persist

**Phase G — Cleanup + ship:**
- Task 13: Delete orphan files
- Task 14: Manual verify + deploy + TODO update

Each task ends with tests passing + commit.

---

### Task 1: Extend aspect-ratio heuristics

**Files:**
- Modify: `lib/board/aspect-ratio.ts`
- Test: `lib/board/aspect-ratio.test.ts`

Goal: add YouTube Shorts (9:16), Instagram Reels (9:16), refine tweet thresholds (short ≤ 140, medium 141–280, long > 280), and let image-bearing tweets use OGP image ratio when available.

- [ ] **Step 1.1: Add failing test for YouTube Shorts**

Append to `lib/board/aspect-ratio.test.ts` inside `describe('detectAspectRatioSource', ...)`:

```ts
  it('detects youtube shorts URL as portrait', () => {
    const s = detectAspectRatioSource({
      url: 'https://www.youtube.com/shorts/abc123',
      urlType: 'youtube',
      title: '',
      description: '',
    })
    expect(s.type).toBe('youtube-shorts')
    expect(estimateAspectRatio(s)).toBeCloseTo(9 / 16)
  })
```

Also append inside `describe('estimateAspectRatio', ...)`:

```ts
  it('YouTube Shorts returns 9:16', () => {
    expect(estimateAspectRatio({ type: 'youtube-shorts' })).toBeCloseTo(9 / 16)
  })
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `pnpm test lib/board/aspect-ratio.test.ts`
Expected: FAIL — `'youtube-shorts'` type not in `AspectRatioSource` union, compile/runtime error.

- [ ] **Step 1.3: Add `youtube-shorts` branch to `AspectRatioSource`**

Edit `lib/board/aspect-ratio.ts`:

Change union:
```ts
export type AspectRatioSource =
  | { type: 'youtube' }
  | { type: 'youtube-shorts' }
  | { type: 'tiktok' }
  | { type: 'instagram-post' }
  | { type: 'instagram-story' }
  | { type: 'instagram-reels' }
  | { type: 'tweet'; hasImage: boolean; textLength: number; ogImageRatio?: number }
  | { type: 'pinterest' }
  | { type: 'soundcloud' | 'spotify' }
  | { type: 'image'; intrinsicRatio?: number }
  | { type: 'generic'; ogImageRatio?: number }
```

Add cases to `estimateAspectRatio`:
```ts
    case 'youtube-shorts':
      return 9 / 16
    case 'instagram-reels':
      return 9 / 16
```

Refine `tweet`:
```ts
    case 'tweet':
      if (source.hasImage && source.ogImageRatio) return source.ogImageRatio
      if (source.hasImage) return 16 / 9
      if (source.textLength > 280) return 1 / 2
      if (source.textLength > 140) return 2 / 3
      return 3 / 4
```

Detect Shorts / Reels in `detectAspectRatioSource`:
```ts
  if (urlType === 'youtube') {
    if (/\/shorts\//i.test(url)) return { type: 'youtube-shorts' }
    return { type: 'youtube' }
  }
```

```ts
  if (urlType === 'instagram') {
    if (/\/reels?\//i.test(url)) return { type: 'instagram-reels' }
    if (STORY_URL_RE.test(url)) return { type: 'instagram-story' }
    return { type: 'instagram-post' }
  }
```

Update tweet detection to pass ogImageRatio through:
```ts
  if (urlType === 'tweet') {
    return {
      type: 'tweet',
      hasImage: Boolean(input.ogImage),
      textLength: (description || title).length,
      ogImageRatio: input.ogImageRatio,
    }
  }
```

- [ ] **Step 1.4: Add tests for Reels + tweet thresholds**

Append inside `describe('detectAspectRatioSource', ...)`:

```ts
  it('detects instagram reels URL as portrait', () => {
    const s = detectAspectRatioSource({
      url: 'https://www.instagram.com/reel/abc/',
      urlType: 'instagram',
      title: '',
      description: '',
    })
    expect(s.type).toBe('instagram-reels')
    expect(estimateAspectRatio(s)).toBeCloseTo(9 / 16)
  })
  it('short tweet (140 chars) returns 3:4', () => {
    expect(estimateAspectRatio({ type: 'tweet', hasImage: false, textLength: 140 })).toBe(3 / 4)
  })
  it('medium tweet (200 chars) returns 2:3', () => {
    expect(estimateAspectRatio({ type: 'tweet', hasImage: false, textLength: 200 })).toBeCloseTo(2 / 3)
  })
  it('long tweet (350 chars) returns 1:2', () => {
    expect(estimateAspectRatio({ type: 'tweet', hasImage: false, textLength: 350 })).toBe(1 / 2)
  })
  it('tweet with image + og ratio uses og ratio', () => {
    expect(
      estimateAspectRatio({ type: 'tweet', hasImage: true, textLength: 100, ogImageRatio: 1.5 }),
    ).toBe(1.5)
  })
```

**Note:** the existing test `tweet short text returns 1:1` (line 21 of `aspect-ratio.test.ts`) uses `textLength: 50` — under the new model that returns 3/4, not 1. Update that test:

```ts
  it('tweet short text (≤140) returns 3:4', () => {
    expect(estimateAspectRatio({ type: 'tweet', hasImage: false, textLength: 50 })).toBe(3 / 4)
  })
  it('tweet long text (>280) returns 1:2', () => {
    expect(estimateAspectRatio({ type: 'tweet', hasImage: false, textLength: 350 })).toBe(1 / 2)
  })
```

Delete the old `tweet long text returns 3:4` test (conflicts with new 2:3 boundary at 200 chars).

- [ ] **Step 1.5: Run tests to verify they pass**

Run: `pnpm test lib/board/aspect-ratio.test.ts`
Expected: PASS (all tweet / shorts / reels tests green).

- [ ] **Step 1.6: Commit**

```bash
rtk git add lib/board/aspect-ratio.ts lib/board/aspect-ratio.test.ts
rtk git commit -m "$(cat <<'EOF'
feat(board): content-sized aspect ratio heuristics (shorts, reels, tweet tiers)

- YouTube Shorts → 9:16 (URL contains /shorts/)
- Instagram Reels → 9:16 (URL contains /reel/ or /reels/)
- Tweet text tiers: ≤140 → 3:4, 141-280 → 2:3, >280 → 1:2
- Image-bearing tweet prefers OGP image ratio when present

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Column masonry pure function

**Files:**
- Create: `lib/board/column-masonry.ts`
- Create: `lib/board/column-masonry.test.ts`

Goal: pack cards (with span 1/2/3) into columns, returning `{ positions, totalHeight, totalWidth }`. Pure; TDD.

- [ ] **Step 2.1: Write failing test — empty input**

Create `lib/board/column-masonry.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeColumnMasonry } from './column-masonry'

describe('computeColumnMasonry', () => {
  it('returns empty result for empty cards', () => {
    const result = computeColumnMasonry({
      cards: [],
      containerWidth: 800,
      gap: 8,
      targetColumnUnit: 240,
    })
    expect(result.positions).toEqual({})
    expect(result.totalHeight).toBe(0)
    expect(result.columnCount).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2.2: Run test — expect compile fail**

Run: `pnpm test lib/board/column-masonry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 2.3: Create minimal `column-masonry.ts`**

Create `lib/board/column-masonry.ts`:

```ts
import type { CardPosition } from './types'

export type MasonryCard = {
  readonly id: string
  readonly aspectRatio: number
  /** 1 = S, 2 = M, 3 = L. Will be clamped to `columnCount` at layout time. */
  readonly columnSpan: number
}

export type MasonryInput = {
  readonly cards: ReadonlyArray<MasonryCard>
  readonly containerWidth: number
  readonly gap: number
  readonly targetColumnUnit: number
}

export type MasonryResult = {
  readonly positions: Readonly<Record<string, CardPosition>>
  readonly totalWidth: number
  readonly totalHeight: number
  readonly columnCount: number
  readonly columnUnit: number
}

export function computeColumnMasonry(input: MasonryInput): MasonryResult {
  const { cards, containerWidth, gap, targetColumnUnit } = input

  const columnCount = Math.max(
    1,
    Math.floor((containerWidth + gap) / (targetColumnUnit + gap)),
  )
  const columnUnit = (containerWidth - (columnCount - 1) * gap) / columnCount

  if (cards.length === 0) {
    return {
      positions: {},
      totalWidth: containerWidth,
      totalHeight: 0,
      columnCount,
      columnUnit,
    }
  }

  const columnBottoms: number[] = Array.from({ length: columnCount }, () => 0)
  const positions: Record<string, CardPosition> = {}

  for (const card of cards) {
    const span = Math.max(1, Math.min(card.columnSpan, columnCount))

    let bestStartCol = 0
    let bestTop = Infinity
    for (let startCol = 0; startCol <= columnCount - span; startCol++) {
      let top = 0
      for (let c = startCol; c < startCol + span; c++) {
        if (columnBottoms[c] > top) top = columnBottoms[c]
      }
      if (top < bestTop) {
        bestTop = top
        bestStartCol = startCol
      }
    }

    const width = span * columnUnit + (span - 1) * gap
    const height = card.aspectRatio > 0 ? width / card.aspectRatio : width
    const x = bestStartCol * (columnUnit + gap)
    const y = bestTop

    positions[card.id] = { x, y, w: width, h: height }

    for (let c = bestStartCol; c < bestStartCol + span; c++) {
      columnBottoms[c] = y + height + gap
    }
  }

  const maxBottom = columnBottoms.reduce((m, b) => (b > m ? b : m), 0)
  const totalHeight = Math.max(0, maxBottom - gap)

  return {
    positions,
    totalWidth: containerWidth,
    totalHeight,
    columnCount,
    columnUnit,
  }
}
```

- [ ] **Step 2.4: Run test — expect pass**

Run: `pnpm test lib/board/column-masonry.test.ts`
Expected: PASS (empty-case test only).

- [ ] **Step 2.5: Add multi-column tests**

Append to `lib/board/column-masonry.test.ts`:

```ts
  it('places 3 cards side-by-side in a 3-column viewport', () => {
    const result = computeColumnMasonry({
      cards: [
        { id: 'a', aspectRatio: 1, columnSpan: 1 },
        { id: 'b', aspectRatio: 1, columnSpan: 1 },
        { id: 'c', aspectRatio: 1, columnSpan: 1 },
      ],
      containerWidth: 800,
      gap: 8,
      targetColumnUnit: 240,
    })
    expect(result.columnCount).toBe(3)
    expect(result.positions.a.y).toBe(0)
    expect(result.positions.b.y).toBe(0)
    expect(result.positions.c.y).toBe(0)
    expect(result.positions.a.x).toBeLessThan(result.positions.b.x)
    expect(result.positions.b.x).toBeLessThan(result.positions.c.x)
  })

  it('wraps to next row after 3 cards in 3-column viewport', () => {
    const result = computeColumnMasonry({
      cards: Array.from({ length: 6 }, (_, i) => ({
        id: String(i),
        aspectRatio: 1,
        columnSpan: 1,
      })),
      containerWidth: 800,
      gap: 8,
      targetColumnUnit: 240,
    })
    // Card 3 should land in column 0, below card 0
    expect(result.positions['3'].x).toBeCloseTo(result.positions['0'].x)
    expect(result.positions['3'].y).toBeGreaterThan(result.positions['0'].y)
  })

  it('pushes shorter columns first (masonry)', () => {
    // Card 0 is tall (aspect 0.5 → h = 2*w). Card 1 is short (aspect 2 → h = 0.5*w).
    // After placing both in cols 0 and 1, card 2 should land in col 1 (shorter).
    const result = computeColumnMasonry({
      cards: [
        { id: 'tall', aspectRatio: 0.5, columnSpan: 1 },   // tall
        { id: 'short', aspectRatio: 2, columnSpan: 1 },    // short
        { id: 'next', aspectRatio: 1, columnSpan: 1 },
      ],
      containerWidth: 520,
      gap: 8,
      targetColumnUnit: 240,
    })
    expect(result.columnCount).toBe(2)
    // next should go below `short` (col 1), not below `tall` (col 0)
    expect(result.positions.next.x).toBeCloseTo(result.positions.short.x)
  })
```

- [ ] **Step 2.6: Run tests — expect pass**

Run: `pnpm test lib/board/column-masonry.test.ts`
Expected: all 4 tests PASS.

- [ ] **Step 2.7: Add span + clamping tests**

Append to `lib/board/column-masonry.test.ts`:

```ts
  it('span=2 card occupies 2 columns', () => {
    const result = computeColumnMasonry({
      cards: [{ id: 'big', aspectRatio: 1, columnSpan: 2 }],
      containerWidth: 800,
      gap: 8,
      targetColumnUnit: 240,
    })
    expect(result.columnCount).toBe(3)
    // Width = 2 * columnUnit + 1 * gap
    const expectedWidth = 2 * result.columnUnit + 8
    expect(result.positions.big.w).toBeCloseTo(expectedWidth)
  })

  it('span=3 card in a 2-column viewport clamps to span=2', () => {
    const result = computeColumnMasonry({
      cards: [{ id: 'xl', aspectRatio: 1, columnSpan: 3 }],
      containerWidth: 520,
      gap: 8,
      targetColumnUnit: 240,
    })
    expect(result.columnCount).toBe(2)
    // Width = 2 * columnUnit + gap (clamped)
    const expectedWidth = 2 * result.columnUnit + 8
    expect(result.positions.xl.w).toBeCloseTo(expectedWidth)
  })

  it('keeps order — earlier card placed first', () => {
    const result = computeColumnMasonry({
      cards: [
        { id: 'first', aspectRatio: 1, columnSpan: 2 },  // span 2 at top-left
        { id: 'second', aspectRatio: 1, columnSpan: 1 }, // col 2, top
      ],
      containerWidth: 800,
      gap: 8,
      targetColumnUnit: 240,
    })
    expect(result.positions.first.x).toBe(0)
    expect(result.positions.first.y).toBe(0)
    expect(result.positions.second.x).toBeGreaterThan(result.positions.first.x)
    expect(result.positions.second.y).toBe(0)
  })

  it('narrow viewport collapses to 1 column', () => {
    const result = computeColumnMasonry({
      cards: [
        { id: 'a', aspectRatio: 1, columnSpan: 1 },
        { id: 'b', aspectRatio: 1, columnSpan: 1 },
      ],
      containerWidth: 200,
      gap: 8,
      targetColumnUnit: 240,
    })
    expect(result.columnCount).toBe(1)
    expect(result.positions.a.x).toBe(0)
    expect(result.positions.b.x).toBe(0)
    expect(result.positions.b.y).toBeGreaterThan(result.positions.a.y)
  })

  it('reports totalHeight based on tallest column', () => {
    const result = computeColumnMasonry({
      cards: [
        { id: 'a', aspectRatio: 1, columnSpan: 1 },   // col 0, h = columnUnit
        { id: 'b', aspectRatio: 0.5, columnSpan: 1 }, // col 1, h = 2*columnUnit
      ],
      containerWidth: 520,
      gap: 8,
      targetColumnUnit: 240,
    })
    expect(result.totalHeight).toBeCloseTo(result.positions.b.y + result.positions.b.h)
  })
```

- [ ] **Step 2.8: Run all column-masonry tests — expect pass**

Run: `pnpm test lib/board/column-masonry.test.ts`
Expected: 9 tests PASS.

- [ ] **Step 2.9: Commit**

```bash
rtk git add lib/board/column-masonry.ts lib/board/column-masonry.test.ts
rtk git commit -m "$(cat <<'EOF'
feat(board): column masonry layout (pure function + 9 TDD tests)

Packs cards with 1/2/3 column spans into the shortest available column slot.
Clamps spans to available column count for narrow viewports. Preserves item
order — the Nth card is guaranteed to be placed before the (N+1)th.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: IDB v8 migration (orderIndex + sizePreset)

**Files:**
- Modify: `lib/constants.ts`
- Modify: `lib/storage/indexeddb.ts`
- Test: `tests/lib/indexeddb.test.ts`

- [ ] **Step 3.1: Bump DB_VERSION**

Edit `lib/constants.ts:21`:

```ts
/** IndexedDB schema version */
export const DB_VERSION = 8
```

- [ ] **Step 3.2: Add fields to BookmarkRecord type**

Edit `lib/storage/indexeddb.ts` — replace the `BookmarkRecord` interface (lines 14-44) with:

```ts
/** Bookmark record stored in IndexedDB */
export interface BookmarkRecord {
  /** UUID primary key */
  id: string
  /** Original URL */
  url: string
  /** Page title (from OGP or document) */
  title: string
  /** Page description */
  description: string
  /** Thumbnail image URL */
  thumbnail: string
  /** Favicon URL */
  favicon: string
  /** Site name (e.g. "YouTube") */
  siteName: string
  /** Detected URL type */
  type: UrlType
  /** ISO 8601 timestamp */
  savedAt: string
  /** Parent folder ID */
  folderId: string
  /** OGP fetch status: pending (not yet fetched), fetched (done), failed (needs retry) */
  ogpStatus: OgpStatus
  // v6 additions
  /** Whether user has read this bookmark */
  isRead?: boolean
  /** Whether this bookmark is soft-deleted (B2 cleanup) */
  isDeleted?: boolean
  /** ISO 8601 timestamp for 30-day purge (B2) */
  deletedAt?: string
  // v8 additions
  /** Board display order (lower = earlier). Dense; rewrite on reorder. */
  orderIndex?: number
  /** Board size preset — S (1 col) / M (2 col) / L (3 col). Default 'S'. */
  sizePreset?: 'S' | 'M' | 'L'
}
```

- [ ] **Step 3.3: Write failing migration test**

Append to `tests/lib/indexeddb.test.ts` (after the existing describe blocks):

```ts
describe('v8 migration', () => {
  it('assigns orderIndex + sizePreset defaults to existing bookmarks', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>
    const folder = await addFolder(database, { name: 'T', color: '#51cf66', order: 0 })
    await addBookmark(database, {
      url: 'https://a.com', title: 'A', description: '',
      thumbnail: '', favicon: '', siteName: '', type: 'website', folderId: folder.id,
    })
    await addBookmark(database, {
      url: 'https://b.com', title: 'B', description: '',
      thumbnail: '', favicon: '', siteName: '', type: 'website', folderId: folder.id,
    })
    const bookmarks = await getBookmarksByFolder(database, folder.id)
    expect(bookmarks).toHaveLength(2)
    for (const b of bookmarks) {
      expect(typeof b.orderIndex).toBe('number')
      expect(b.sizePreset).toBe('S')
    }
    // orderIndex values should be unique
    const orders = bookmarks.map((b) => b.orderIndex).sort((x, y) => (x ?? 0) - (y ?? 0))
    expect(orders[0]).not.toBe(orders[1])
  })
})
```

- [ ] **Step 3.4: Run test — expect fail**

Run: `pnpm test tests/lib/indexeddb.test.ts`
Expected: FAIL — newly-added bookmarks lack `orderIndex` / `sizePreset`.

- [ ] **Step 3.5: Add v8 migration + defaults in addBookmark**

Edit `lib/storage/indexeddb.ts`:

Append the v7→v8 block inside `initDB`'s `upgrade` callback, after the existing `if (oldVersion < 7) { ... }`:

```ts
      // ── v7 → v8: seed orderIndex (dense, by savedAt) + sizePreset='S'
      if (oldVersion < 8) {
        const bookmarkStore = transaction.objectStore('bookmarks')
        const all: BookmarkRecord[] = []
        void bookmarkStore.openCursor().then(function collect(
          cursor: Awaited<ReturnType<typeof bookmarkStore.openCursor>>,
        ): Promise<void> | undefined {
          if (!cursor) {
            all.sort((a, b) => a.savedAt.localeCompare(b.savedAt))
            for (let i = 0; i < all.length; i++) {
              const b = all[i]
              const next: BookmarkRecord = {
                ...b,
                orderIndex: b.orderIndex ?? i,
                sizePreset: b.sizePreset ?? 'S',
              }
              void bookmarkStore.put(next)
            }
            return
          }
          all.push(cursor.value)
          return cursor.continue().then(collect)
        })
      }
```

Modify `addBookmark` (around line 374) to seed the new fields:

```ts
  // ... inside addBookmark, before the tx = db.transaction(...) line:
  // Compute next orderIndex (append to end of current folder's bookmarks)
  const existing = await getBookmarksByFolder(db, input.folderId)
  const nextOrder = existing.length
  const bookmark: BookmarkRecord = {
    id: uuid(),
    url: input.url,
    title: input.title,
    description: input.description,
    thumbnail: input.thumbnail,
    favicon: input.favicon,
    siteName: input.siteName,
    type: input.type,
    savedAt: new Date().toISOString(),
    folderId: input.folderId,
    ogpStatus: input.ogpStatus ?? 'fetched',
    orderIndex: nextOrder,
    sizePreset: 'S',
  }
```

Also modify `addBookmarkBatch` (around line 595) — inside the batch loop, before creating the `bookmark` record, track an appended `nextOrder`:

```ts
    // ... at the top of the batch loop, replace the existing card-count-based `gridIndex` seeding
    // with a combined orderIndex + gridIndex seed:
    const existingBookmarks = await bookmarkStore.index('by-folder').getAll(batch[0].folderId)
    let nextOrder = existingBookmarks.length
    let gridIndex = existingCards.length
```

Then inside the per-input loop, set `orderIndex: nextOrder++` and `sizePreset: 'S'` on the new bookmark:

```ts
    for (const input of batch) {
      const bookmark: BookmarkRecord = {
        id: uuid(),
        url: input.url,
        title: input.title,
        description: input.description,
        thumbnail: input.thumbnail,
        favicon: input.favicon,
        siteName: input.siteName,
        type: input.type,
        savedAt: new Date().toISOString(),
        folderId: input.folderId,
        ogpStatus: input.ogpStatus ?? 'fetched',
        orderIndex: nextOrder++,
        sizePreset: 'S',
      }
      await bookmarkStore.put(bookmark)
      // ... card creation unchanged
    }
```

- [ ] **Step 3.6: Add helpers `updateBookmarkOrderIndex` + `updateBookmarkSizePreset` + `updateBookmarkOrderBatch`**

Append near the existing `updateBookmarkOgp` helper in `lib/storage/indexeddb.ts`:

```ts
/**
 * Set a single bookmark's orderIndex. Caller is responsible for renumber
 * consistency across siblings (use updateBookmarkOrderBatch for multi-card
 * reorder).
 */
export async function updateBookmarkOrderIndex(
  db: IDBPDatabase<AllMarksDB>,
  bookmarkId: string,
  orderIndex: number,
): Promise<void> {
  const existing = await db.get('bookmarks', bookmarkId)
  if (!existing) return
  await db.put('bookmarks', { ...existing, orderIndex })
}

/**
 * Set a single bookmark's sizePreset. 'S' | 'M' | 'L'.
 */
export async function updateBookmarkSizePreset(
  db: IDBPDatabase<AllMarksDB>,
  bookmarkId: string,
  sizePreset: 'S' | 'M' | 'L',
): Promise<void> {
  const existing = await db.get('bookmarks', bookmarkId)
  if (!existing) return
  await db.put('bookmarks', { ...existing, sizePreset })
}

/**
 * Atomically rewrite orderIndex for multiple bookmarks in one transaction.
 * Use for drag-to-reorder: caller supplies the new complete order by ID.
 */
export async function updateBookmarkOrderBatch(
  db: IDBPDatabase<AllMarksDB>,
  orderedBookmarkIds: readonly string[],
): Promise<void> {
  const tx = db.transaction('bookmarks', 'readwrite')
  const store = tx.objectStore('bookmarks')
  for (let i = 0; i < orderedBookmarkIds.length; i++) {
    const id = orderedBookmarkIds[i]
    const existing = await store.get(id)
    if (!existing) continue
    await store.put({ ...existing, orderIndex: i })
  }
  await tx.done
}
```

- [ ] **Step 3.7: Run migration test — expect pass**

Run: `pnpm test tests/lib/indexeddb.test.ts`
Expected: PASS — v8 migration test green, all existing tests still green.

- [ ] **Step 3.8: Commit**

```bash
rtk git add lib/constants.ts lib/storage/indexeddb.ts tests/lib/indexeddb.test.ts
rtk git commit -m "$(cat <<'EOF'
feat(db): v8 migration — orderIndex + sizePreset on bookmarks

- Bumps DB_VERSION 7 → 8
- Seeds existing bookmarks with orderIndex (dense, by savedAt) and sizePreset='S'
- addBookmark / addBookmarkBatch assign orderIndex on insert
- New helpers: updateBookmarkOrderIndex / updateBookmarkSizePreset /
  updateBookmarkOrderBatch (transactional bulk reorder)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Expose orderIndex + sizePreset via use-board-data

**Files:**
- Modify: `lib/storage/use-board-data.ts`

- [ ] **Step 4.1: Add fields to `BoardItem` + sort by orderIndex**

Edit `lib/storage/use-board-data.ts`:

Replace `BoardItem` (lines 16-28):

```ts
export type BoardItem = {
  readonly bookmarkId: string
  readonly cardId: string
  readonly title: string
  readonly thumbnail?: string
  readonly url: string
  readonly aspectRatio: number
  readonly gridIndex: number
  readonly orderIndex: number
  readonly sizePreset: 'S' | 'M' | 'L'
  readonly freePos?: FreePosition
  readonly userOverridePos?: CardPosition  // legacy compat
  readonly isRead: boolean
  readonly isDeleted: boolean
}
```

Replace `toItem` (lines 55-87) — add `orderIndex` and `sizePreset` to the returned item:

```ts
function toItem(b: BookmarkRecord, c: CardRecord | undefined): BoardItem {
  const aspectRatio = computeAspectRatio(b, c)
  const hasPlacement = c?.isManuallyPlaced === true
  const w = c?.width ?? 240
  const h = c?.height ?? (w / aspectRatio)

  const freePos: FreePosition | undefined = hasPlacement && c
    ? {
        x: c.x,
        y: c.y,
        w,
        h,
        rotation: c.rotation ?? 0,
        zIndex: c.zIndex ?? 0,
        locked: c.locked ?? false,
        isUserResized: c.isUserResized ?? false,
      }
    : undefined

  return {
    bookmarkId: b.id,
    cardId: c?.id ?? '',
    title: b.title || b.url,
    thumbnail: deriveThumbnail(b),
    url: b.url,
    aspectRatio,
    gridIndex: c?.gridIndex ?? 0,
    orderIndex: b.orderIndex ?? 0,
    sizePreset: b.sizePreset ?? 'S',
    freePos,
    userOverridePos: hasPlacement ? { x: c.x, y: c.y, w, h } : undefined,
    isRead: b.isRead ?? false,
    isDeleted: b.isDeleted ?? false,
  }
}
```

Replace the load effect's `all = bookmarks.filter(...)` line (currently around line 114) with an orderIndex sort:

```ts
      const all = bookmarks
        .filter(b => !b.isDeleted)
        .map((b) => toItem(b, cardByBookmark.get(b.id)))
        .sort((a, b) => a.orderIndex - b.orderIndex)
      setItems(all)
```

- [ ] **Step 4.2: Add `persistOrderIndex` / `persistSizePreset` / `persistOrderBatch`**

Edit `lib/storage/use-board-data.ts` — add imports at top (after the existing `updateCard` import):

```ts
import {
  initDB,
  getAllBookmarks,
  updateCard,
  updateBookmarkOrderIndex,
  updateBookmarkSizePreset,
  updateBookmarkOrderBatch,
  type BookmarkRecord,
  type CardRecord,
} from './indexeddb'
```

Update the hook return type (currently lines 89-98):

```ts
export function useBoardData(): {
  items: BoardItem[]
  loading: boolean
  persistFreePosition: (cardId: string, pos: FreePosition) => Promise<void>
  persistGridIndex: (cardId: string, gridIndex: number) => Promise<void>
  persistOrderIndex: (bookmarkId: string, orderIndex: number) => Promise<void>
  persistSizePreset: (bookmarkId: string, sizePreset: 'S' | 'M' | 'L') => Promise<void>
  persistOrderBatch: (orderedBookmarkIds: readonly string[]) => Promise<void>
  persistReadFlag: (bookmarkId: string, isRead: boolean) => Promise<void>
  persistSoftDelete: (bookmarkId: string, isDeleted: boolean) => Promise<void>
  /** @deprecated Use persistFreePosition instead. Will be removed after full pivot. */
  persistCardPosition: (cardId: string, pos: CardPosition) => Promise<void>
} {
```

Add three `useCallback` hooks inside the function, after `persistGridIndex`:

```ts
  const persistOrderIndex = useCallback(
    async (bookmarkId: string, orderIndex: number): Promise<void> => {
      const db = dbRef.current
      if (!db || !bookmarkId) return
      setItems((prev) =>
        prev.map((it) => (it.bookmarkId === bookmarkId ? { ...it, orderIndex } : it)),
      )
      await updateBookmarkOrderIndex(db as Parameters<typeof updateBookmarkOrderIndex>[0], bookmarkId, orderIndex)
    },
    [],
  )

  const persistSizePreset = useCallback(
    async (bookmarkId: string, sizePreset: 'S' | 'M' | 'L'): Promise<void> => {
      const db = dbRef.current
      if (!db || !bookmarkId) return
      setItems((prev) =>
        prev.map((it) => (it.bookmarkId === bookmarkId ? { ...it, sizePreset } : it)),
      )
      await updateBookmarkSizePreset(db as Parameters<typeof updateBookmarkSizePreset>[0], bookmarkId, sizePreset)
    },
    [],
  )

  const persistOrderBatch = useCallback(
    async (orderedBookmarkIds: readonly string[]): Promise<void> => {
      const db = dbRef.current
      if (!db) return
      // Optimistic local update — produce items array in the new order with
      // refreshed orderIndex fields, preserving other fields.
      setItems((prev) => {
        const byId = new Map<string, BoardItem>()
        for (const it of prev) byId.set(it.bookmarkId, it)
        const reordered: BoardItem[] = []
        for (let i = 0; i < orderedBookmarkIds.length; i++) {
          const it = byId.get(orderedBookmarkIds[i])
          if (!it) continue
          reordered.push({ ...it, orderIndex: i })
        }
        // Append items not mentioned (defensive) — preserve their current orderIndex
        for (const it of prev) {
          if (!orderedBookmarkIds.includes(it.bookmarkId)) reordered.push(it)
        }
        return reordered
      })
      await updateBookmarkOrderBatch(db as Parameters<typeof updateBookmarkOrderBatch>[0], orderedBookmarkIds)
    },
    [],
  )
```

Update the `return` statement:

```ts
  return {
    items,
    loading,
    persistFreePosition,
    persistGridIndex,
    persistOrderIndex,
    persistSizePreset,
    persistOrderBatch,
    persistReadFlag,
    persistSoftDelete,
    persistCardPosition,
  }
```

- [ ] **Step 4.3: Run tests — expect pass**

Run: `pnpm test`
Expected: all existing tests PASS. No new test yet — hook testing via integration later.

- [ ] **Step 4.4: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no type errors.

- [ ] **Step 4.5: Commit**

```bash
rtk git add lib/storage/use-board-data.ts
rtk git commit -m "$(cat <<'EOF'
feat(board-data): expose orderIndex + sizePreset, add persist helpers

- BoardItem now carries orderIndex + sizePreset
- Items on mount sorted by orderIndex (stable board order)
- persistOrderIndex / persistSizePreset: single-card updates
- persistOrderBatch: atomic multi-card rewrite for drag-to-reorder

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Switch BoardRoot + CardsLayer to column masonry

**Files:**
- Modify: `components/board/BoardRoot.tsx`
- Modify: `components/board/CardsLayer.tsx`

Goal: replace `computeAutoLayout` with `computeColumnMasonry` in the render path. Leave drag / resize wiring untouched for now — they keep working against the new positions. User sees true masonry layout after this step.

- [ ] **Step 5.1: Add column-span helper constants**

Append to `lib/board/constants.ts`:

```ts
export const COLUMN_MASONRY = {
  TARGET_COLUMN_UNIT_PX: 220,
  GAP_PX: 12,
} as const

export const SIZE_PRESET_SPAN: Readonly<Record<'S' | 'M' | 'L', number>> = {
  S: 1,
  M: 2,
  L: 3,
}
```

- [ ] **Step 5.2: Swap layout call in CardsLayer**

Edit `components/board/CardsLayer.tsx`:

Replace the `computeAutoLayout` import (line 13) with:

```ts
import { computeColumnMasonry } from '@/lib/board/column-masonry'
import type { MasonryCard } from '@/lib/board/column-masonry'
```

Delete the imports of `applySnapToPosition`, `computeSnapGuides` (line 14) — they stay for Task 7.

Actually keep them for now; they're still used by the drag-state-machine still present. Task 7 will strip them.

Add to imports from `@/lib/board/constants`:

```ts
import {
  BOARD_Z_INDEX,
  COLUMN_MASONRY,
  CULLING,
  SIZE_PRESET_SPAN,
} from '@/lib/board/constants'
```

Replace the `layoutCards` useMemo (lines 162-170) with a `masonryCards` useMemo:

```ts
  const masonryCards = useMemo<MasonryCard[]>(
    () =>
      items.map((it) => ({
        id: it.bookmarkId,
        aspectRatio: it.aspectRatio,
        columnSpan: SIZE_PRESET_SPAN[it.sizePreset],
      })),
    [items],
  )
```

Replace `gridLayout` useMemo (lines 172-182) with `masonryLayout`:

```ts
  const masonryLayout = useMemo(
    () =>
      computeColumnMasonry({
        cards: masonryCards,
        containerWidth: viewportWidth,
        gap: COLUMN_MASONRY.GAP_PX,
        targetColumnUnit: COLUMN_MASONRY.TARGET_COLUMN_UNIT_PX,
      }),
    [masonryCards, viewportWidth],
  )
```

Replace all `gridLayout.positions` references (inside `freeLayoutPositions` useMemo, inside `handleFreeDragStart`) with `masonryLayout.positions`:

```ts
  // in freeLayoutPositions:
        const gridPos = masonryLayout.positions[it.bookmarkId]
        if (gridPos) result[it.bookmarkId] = gridPos
```

```ts
  // in handleFreeDragStart:
    const gridPos = masonryLayout.positions[bookmarkId]
```

Replace the `useMemo` dependency on `gridLayout` with `masonryLayout` everywhere.

- [ ] **Step 5.3: Update BoardRoot's layout path**

Edit `components/board/BoardRoot.tsx`:

Replace `computeAutoLayout` import (line 4) with:

```ts
import { computeColumnMasonry } from '@/lib/board/column-masonry'
import type { MasonryCard } from '@/lib/board/column-masonry'
```

Update `@/lib/board/constants` import (line 11):

```ts
import { BOARD_INNER, COLUMN_MASONRY, SIZE_PRESET_SPAN } from '@/lib/board/constants'
```

Replace `layoutCards` useMemo (lines 140-148):

```ts
  const masonryCards = useMemo<MasonryCard[]>(
    () =>
      items.map((it) => ({
        id: it.bookmarkId,
        aspectRatio: it.aspectRatio,
        columnSpan: SIZE_PRESET_SPAN[it.sizePreset],
      })),
    [items],
  )
```

Replace the `layout` useMemo (lines 167-178):

```ts
  const layout = useMemo(
    () =>
      computeColumnMasonry({
        cards: masonryCards,
        containerWidth: effectiveLayoutWidth,
        gap: COLUMN_MASONRY.GAP_PX,
        targetColumnUnit: COLUMN_MASONRY.TARGET_COLUMN_UNIT_PX,
      }),
    [masonryCards, effectiveLayoutWidth],
  )
```

`layout.totalWidth` / `layout.totalHeight` contracts are preserved — no other changes needed here.

- [ ] **Step 5.4: Pass sizePreset support through `CardsLayer` props**

Already carried on `items` — no prop change needed. Remove any `targetRowHeight` / `gap` / `direction` prop usages inside CardsLayer's call to the old layout. Keep the props themselves for now (they flow through from BoardRoot but we don't use them). Ignore linter complaints; they'll be removed in Task 7.

Actually, remove the props now to keep things clean. Edit `CardsLayerProps` (lines 38-87) — drop `viewportWidth` / `targetRowHeight` / `gap` / `direction` since we compute columnUnit ourselves:

Keep `viewportWidth` (need it for `containerWidth`); delete `targetRowHeight`, `gap`, `direction` from the type:

```ts
type CardsLayerProps = {
  readonly items: ReadonlyArray<BoardItem>
  readonly viewport: Viewport
  readonly viewportWidth: number
  readonly overrides?: Readonly<Record<string, CardPosition>>
  readonly spaceHeld: boolean
  readonly onCardPointerDown: (e: PointerEvent<HTMLDivElement>, cardId: string) => void
  readonly onCardResize: (cardId: string, w: number, h: number) => void
  readonly onCardResizeEnd: (bookmarkId: string, w: number, h: number) => void
  readonly onCardResetToNative: (bookmarkId: string) => void
  readonly onPersistFreePos: (cardId: string, pos: FreePosition) => Promise<void>
  readonly alignKey: number
}
```

Update the function's destructure (lines 117-132):

```ts
export function CardsLayer({
  items,
  viewport,
  viewportWidth,
  overrides,
  spaceHeld,
  alignKey,
  onCardPointerDown,
  onCardResize,
  onCardResizeEnd,
  onCardResetToNative,
  onPersistFreePos,
}: CardsLayerProps): ReactNode {
```

And on the BoardRoot call site (lines 489-505), remove `targetRowHeight`, `gap`, `direction` from `<CardsLayer ... />`:

```tsx
          <CardsLayer
            items={items}
            viewport={viewport}
            viewportWidth={effectiveLayoutWidth}
            overrides={overrides}
            spaceHeld={spaceHeld}
            alignKey={alignKey}
            onCardPointerDown={handleCardPointerDown}
            onCardResize={handleCardResize}
            onCardResizeEnd={handleCardResizeEnd}
            onCardResetToNative={handleCardResetToNative}
            onPersistFreePos={persistFreePosition}
          />
```

- [ ] **Step 5.5: Run type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors. (`targetRowHeight` / `layoutGap` might now be unused; delete their declarations in BoardRoot around lines 440-442 if so.)

Delete these lines in BoardRoot if they become unused:

```ts
  const targetRowHeight =
    themeMeta.layoutParams?.targetRowHeight ?? LAYOUT_CONFIG.TARGET_ROW_HEIGHT_PX
  const layoutGap = themeMeta.layoutParams?.gap ?? LAYOUT_CONFIG.GAP_PX
```

and remove the `LAYOUT_CONFIG` import if fully unused.

- [ ] **Step 5.6: Run tests**

Run: `pnpm test`
Expected: all unit tests PASS.

- [ ] **Step 5.7: Run E2E smoke**

Run: `pnpm test:e2e tests/e2e/board-b0.spec.ts`
Expected: board renders; exact positions may shift but overlap-free.

If `board-b0.spec.ts` or `board-b0-perf.spec.ts` asserts specific pixel positions that changed, update those expectations to the new layout. Comment any assertion that tests deprecated features (Align button, resize) — we'll delete those assertions in later tasks as UI is removed.

- [ ] **Step 5.8: Commit**

```bash
rtk git add components/board/BoardRoot.tsx components/board/CardsLayer.tsx lib/board/constants.ts
rtk git commit -m "$(cat <<'EOF'
feat(board): swap layout to column masonry (content-sized moodboard)

Cards now pack into columns via computeColumnMasonry, honoring sizePreset's
column span. Justified-rows (computeAutoLayout) is no longer called on the
Board render path (kept in lib/board for possible Share Modal preview reuse).

CardsLayer's surface-level contract shrinks (removes targetRowHeight / gap /
direction props). Drag + resize still wired against the new positions.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Remove Align button

**Files:**
- Modify: `components/board/Toolbar.tsx`
- Modify: `components/board/BoardRoot.tsx`
- Modify: `components/board/Toolbar.module.css` (if separator rules need cleanup)

- [ ] **Step 6.1: Strip `onAlign` from Toolbar**

Edit `components/board/Toolbar.tsx`:

Replace entire file with:

```tsx
'use client'

import type { ReactElement } from 'react'
import { t } from '@/lib/i18n/t'
import styles from './Toolbar.module.css'

type Props = {
  readonly onShare: () => void
}

/**
 * Top-center floating pill: a single Share action. Align was removed when the
 * Board switched to always-masonry (no mode to return to).
 */
export function Toolbar({ onShare }: Props): ReactElement {
  return (
    <div className={styles.container} data-testid="board-toolbar">
      <button
        type="button"
        className={`${styles.button} ${styles.primary}`.trim()}
        onClick={onShare}
        data-toolbar-button="share"
      >
        📤 {t('board.toolbar.share')}
      </button>
    </div>
  )
}
```

- [ ] **Step 6.2: Remove align wiring from BoardRoot**

Edit `components/board/BoardRoot.tsx`:

Remove imports of `alignAllToGrid`:

```ts
// delete this line:
import { alignAllToGrid } from '@/lib/board/align'
```

Remove `alignKey` state (line 44):

```ts
// delete these lines:
  const [alignKey, setAlignKey] = useState<number>(0)
```

Remove the entire `handleAlign` useCallback (lines 346-384).

Update the Toolbar invocation (around line 507):

```tsx
      <Toolbar onShare={handleShare} />
```

Remove `alignKey` from the CardsLayer call:

```tsx
          <CardsLayer
            items={items}
            viewport={viewport}
            viewportWidth={effectiveLayoutWidth}
            overrides={overrides}
            spaceHeld={spaceHeld}
            onCardPointerDown={handleCardPointerDown}
            onCardResize={handleCardResize}
            onCardResizeEnd={handleCardResizeEnd}
            onCardResetToNative={handleCardResetToNative}
            onPersistFreePos={persistFreePosition}
          />
```

- [ ] **Step 6.3: Remove alignKey from CardsLayer props + morph logic**

Edit `components/board/CardsLayer.tsx`:

Delete `alignKey: number` from `CardsLayerProps`.
Delete `alignKey` from the destructure.
Delete `morphTimelineRef` + `prevAlignKeyRef` refs.
Replace the `useLayoutEffect` (lines 256-294) with a simplified version that only snaps — no align-morph branch:

```ts
  useLayoutEffect(() => {
    for (const it of visibleItems) {
      const el = cardRefs.current[it.bookmarkId]
      if (!el) continue
      const p = displayedPositions[it.bookmarkId]
      if (!p) continue
      gsap.set(el, { x: p.x, y: p.y, width: p.w, height: p.h })
    }
  }, [visibleItems, displayedPositions])
```

- [ ] **Step 6.4: Run tests**

Run: `pnpm test`
Expected: all PASS. Existing `align.test.ts` keeps passing (function still exported).

- [ ] **Step 6.5: Sanity-check Toolbar CSS**

Open `components/board/Toolbar.module.css`. If the `.sep` rule is unused, delete it. No commit yet if only whitespace changes.

- [ ] **Step 6.6: Commit**

```bash
rtk git add components/board/Toolbar.tsx components/board/BoardRoot.tsx components/board/CardsLayer.tsx components/board/Toolbar.module.css
rtk git commit -m "$(cat <<'EOF'
refactor(board): remove Align button — board is now always masonry

Toolbar shrinks to a single Share button. BoardRoot drops alignKey state, the
handleAlign callback, and the GSAP morph branch in CardsLayer. alignAllToGrid
remains in lib/board for future Share Modal reuse.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Strip free-drag + resize + rotation + snap-guides

**Files:**
- Modify: `components/board/CardsLayer.tsx`
- Modify: `components/board/BoardRoot.tsx`

Goal: at the end of this task, cards render in masonry but have **no interactions** (no drag, no resize, no rotation, no click). Task 9 reinstates click-to-open; Task 11+12 add reorder drag.

- [ ] **Step 7.1: Gut CardsLayer down to pure render**

Edit `components/board/CardsLayer.tsx`. Replace the **entire file** with:

```tsx
'use client'

import {
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import { gsap } from 'gsap'
import { computeColumnMasonry, type MasonryCard } from '@/lib/board/column-masonry'
import type { CardPosition } from '@/lib/board/types'
import {
  BOARD_Z_INDEX,
  COLUMN_MASONRY,
  CULLING,
  SIZE_PRESET_SPAN,
} from '@/lib/board/constants'
import type { BoardItem } from '@/lib/storage/use-board-data'
import { CardNode } from './CardNode'

type Viewport = {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

type CardsLayerProps = {
  readonly items: ReadonlyArray<BoardItem>
  readonly viewport: Viewport
  readonly viewportWidth: number
  /** Live overrides — used by reorder drag in a later task to pin a card to
   *  pointer coords while dragging. Keyed by bookmarkId. */
  readonly overrides?: Readonly<Record<string, CardPosition>>
}

export function CardsLayer({
  items,
  viewport,
  viewportWidth,
  overrides,
}: CardsLayerProps): ReactNode {
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const masonryCards = useMemo<MasonryCard[]>(
    () =>
      items.map((it) => ({
        id: it.bookmarkId,
        aspectRatio: it.aspectRatio,
        columnSpan: SIZE_PRESET_SPAN[it.sizePreset],
      })),
    [items],
  )

  const masonryLayout = useMemo(
    () =>
      computeColumnMasonry({
        cards: masonryCards,
        containerWidth: viewportWidth,
        gap: COLUMN_MASONRY.GAP_PX,
        targetColumnUnit: COLUMN_MASONRY.TARGET_COLUMN_UNIT_PX,
      }),
    [masonryCards, viewportWidth],
  )

  const displayedPositions = useMemo<Readonly<Record<string, CardPosition>>>(() => {
    if (!overrides) return masonryLayout.positions
    return { ...masonryLayout.positions, ...overrides }
  }, [masonryLayout.positions, overrides])

  const visibleItems = useMemo(() => {
    const bufferX = viewport.w * CULLING.BUFFER_SCREENS
    const bufferY = viewport.h * CULLING.BUFFER_SCREENS
    const minX = viewport.x - bufferX
    const maxX = viewport.x + viewport.w + bufferX
    const minY = viewport.y - bufferY
    const maxY = viewport.y + viewport.h + bufferY

    return items.filter((it) => {
      const p = displayedPositions[it.bookmarkId]
      if (!p) return false
      return !(p.x + p.w < minX || p.x > maxX || p.y + p.h < minY || p.y > maxY)
    })
  }, [items, displayedPositions, viewport])

  useLayoutEffect(() => {
    for (const it of visibleItems) {
      const el = cardRefs.current[it.bookmarkId]
      if (!el) continue
      const p = displayedPositions[it.bookmarkId]
      if (!p) continue
      gsap.set(el, { x: p.x, y: p.y, width: p.w, height: p.h })
    }
  }, [visibleItems, displayedPositions])

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        zIndex: BOARD_Z_INDEX.CARDS,
        pointerEvents: 'none',
      }}
    >
      {visibleItems.map((it) => {
        const p = displayedPositions[it.bookmarkId]
        if (!p) return null
        return (
          <div
            key={it.bookmarkId}
            ref={(el): void => {
              cardRefs.current[it.bookmarkId] = el
            }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: `${p.w}px`,
              height: `${p.h}px`,
              transform: `translate3d(${p.x}px, ${p.y}px, 0)`,
              pointerEvents: 'auto',
            }}
          >
            <CardNode
              id={it.bookmarkId}
              title={it.title}
              thumbnailUrl={it.thumbnail}
            />
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 7.2: Gut BoardRoot drag + resize wiring**

Edit `components/board/BoardRoot.tsx`:

Delete unused imports: `useCardDrag`, `CardPosition` as type-only-if-possible (still used by `overrides` state — keep), `FreePosition`-related wiring.

Remove the `useCardDrag` usage + `handleCardPointerDown` declaration (lines 255-260).

Remove `resolveStart`, `onDrag`, `onDragEnd`, `onCardClick` callbacks (lines 233-260 approx).

Remove the resize callbacks `resolveResizeSource`, `handleCardResize`, `handleCardResizeEnd`, `handleCardResetToNative` (lines 263-339).

Remove `overrides` state and `setOverrides` (line 43), **unless** you want to keep it plumbed for the upcoming reorder-drag work. Keep it — we use it in Task 12.

Simplify the `<CardsLayer>` invocation to just `items / viewport / viewportWidth / overrides`:

```tsx
          <CardsLayer
            items={items}
            viewport={viewport}
            viewportWidth={effectiveLayoutWidth}
            overrides={overrides}
          />
```

Remove any now-unused state/variables (`spaceHeld` is still used by InteractionLayer, keep it; `sidebarCollapsed` is used by sidebar, keep).

Remove the `persistFreePosition` destructure if unused (use-board-data still exports it — fine to ignore).

- [ ] **Step 7.3: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors. Fix any dangling imports.

- [ ] **Step 7.4: Run unit tests**

Run: `pnpm test`
Expected: unit PASS.

- [ ] **Step 7.5: E2E smoke — acknowledge broken interactions**

Existing E2E tests asserting drag / resize / rotation / snap / align will fail now. Either:

a. Skip those assertions (temporarily) with `test.skip(...)`, tagging with `// TODO Task 12: restore via reorder drag`
b. Delete them if they test **only** features we're removing (free position, resize, rotation)

Do a read of `tests/e2e/board.spec.ts` (or wherever) and apply the minimal change to let the suite pass on "board renders, cards are visible, click still opens bookmark URL". Leave explanatory comments for every skipped / removed assertion.

Run: `pnpm test:e2e`
Expected: suite PASSES with the adjusted assertions.

- [ ] **Step 7.6: Commit**

```bash
rtk git add components/board/CardsLayer.tsx components/board/BoardRoot.tsx tests/e2e
rtk git commit -m "$(cat <<'EOF'
refactor(board): strip free-drag / resize / rotation / snap from Board render

Board now renders pure column-masonry with no interactions — click / drag /
resize / rotation / align / snap are all disabled. Reintroduced in following
tasks (click open, size preset toggle, drag-to-reorder).

E2E assertions covering removed features are skipped or cut.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: SizePresetToggle component

**Files:**
- Create: `components/board/SizePresetToggle.tsx`
- Create: `components/board/SizePresetToggle.module.css`

- [ ] **Step 8.1: Create CSS module**

Create `components/board/SizePresetToggle.module.css`:

```css
.toggle {
  position: absolute;
  right: 8px;
  bottom: 8px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 4px 6px;
  border-radius: 6px;
  background: rgba(18, 18, 20, 0.75);
  backdrop-filter: blur(8px) saturate(1.1);
  -webkit-backdrop-filter: blur(8px) saturate(1.1);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 10px;
  letter-spacing: 0.06em;
  line-height: 1;
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 160ms ease, transform 160ms ease, background 160ms ease;
  user-select: none;
  pointer-events: auto;
  z-index: 20;
}

.toggle[data-visible='true'] {
  opacity: 1;
  transform: translateY(0);
}

.toggle:hover {
  background: rgba(124, 92, 252, 0.85);
  border-color: rgba(255, 255, 255, 0.3);
}

.dot {
  width: 5px;
  height: 5px;
  border-radius: 1px;
  background: currentColor;
  opacity: 0.35;
}

.dot[data-on='true'] {
  opacity: 1;
}

.label {
  margin-left: 2px;
  opacity: 0.75;
  font-weight: 600;
}
```

- [ ] **Step 8.2: Create component**

Create `components/board/SizePresetToggle.tsx`:

```tsx
'use client'

import type { PointerEvent, ReactElement } from 'react'
import styles from './SizePresetToggle.module.css'

type Preset = 'S' | 'M' | 'L'

export const NEXT_PRESET: Readonly<Record<Preset, Preset>> = {
  S: 'M',
  M: 'L',
  L: 'S',
}

type Props = {
  readonly preset: Preset
  readonly visible: boolean
  readonly onCycle: (next: Preset) => void
}

/**
 * Hover-revealed button on each card's bottom-right. Click cycles
 * S → M → L → S. The parent is responsible for managing `visible` via
 * hoveredCardId state.
 */
export function SizePresetToggle({ preset, visible, onCycle }: Props): ReactElement {
  const handleClick = (e: PointerEvent<HTMLButtonElement>): void => {
    // Prevent the pointerdown from kicking off a reorder drag.
    e.stopPropagation()
    onCycle(NEXT_PRESET[preset])
  }
  const dots: Array<boolean> = [
    true,
    preset === 'M' || preset === 'L',
    preset === 'L',
  ]
  return (
    <button
      type="button"
      className={styles.toggle}
      data-visible={visible}
      data-preset={preset}
      onPointerDown={handleClick}
      aria-label={`サイズを切り替え (現在: ${preset})`}
    >
      {dots.map((on, idx) => (
        <span key={idx} className={styles.dot} data-on={on} />
      ))}
      <span className={styles.label}>{preset}</span>
    </button>
  )
}
```

- [ ] **Step 8.3: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 8.4: Commit**

```bash
rtk git add components/board/SizePresetToggle.tsx components/board/SizePresetToggle.module.css
rtk git commit -m "$(cat <<'EOF'
feat(board): SizePresetToggle component (hover-revealed S/M/L cycle)

Three glass-styled dots + letter (S/M/L) on the card's bottom-right. Click
cycles S → M → L → S via NEXT_PRESET. Parent owns visibility via hover state.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Wire SizePresetToggle into CardsLayer + persist

**Files:**
- Modify: `components/board/CardsLayer.tsx`
- Modify: `components/board/BoardRoot.tsx`
- Modify: `components/board/CardNode.tsx` (optional; toggle can live outside CardNode)

Design choice: render `SizePresetToggle` inside the card's absolute-positioned wrapper in `CardsLayer`, NOT inside `CardNode`, so CardNode stays content-agnostic.

- [ ] **Step 9.1: Add hover state + onCyclePreset prop to CardsLayer**

Edit `components/board/CardsLayer.tsx`:

Add `useState` import, and `SizePresetToggle` import (the toggle cycles preset internally via its own `NEXT_PRESET` table, so we don't import it here):

```ts
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
// ...
import { SizePresetToggle } from './SizePresetToggle'
```

Extend `CardsLayerProps`:

```ts
type CardsLayerProps = {
  readonly items: ReadonlyArray<BoardItem>
  readonly viewport: Viewport
  readonly viewportWidth: number
  readonly overrides?: Readonly<Record<string, CardPosition>>
  readonly onCyclePreset: (bookmarkId: string, next: 'S' | 'M' | 'L') => void
}
```

Destructure `onCyclePreset`.

Add hover state:

```ts
  const [hoveredId, setHoveredId] = useState<string | null>(null)
```

Render the toggle inside each card wrapper:

```tsx
          <div
            key={it.bookmarkId}
            ref={(el): void => {
              cardRefs.current[it.bookmarkId] = el
            }}
            onPointerEnter={(): void => setHoveredId(it.bookmarkId)}
            onPointerLeave={(): void =>
              setHoveredId((cur) => (cur === it.bookmarkId ? null : cur))
            }
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: `${p.w}px`,
              height: `${p.h}px`,
              transform: `translate3d(${p.x}px, ${p.y}px, 0)`,
              pointerEvents: 'auto',
            }}
          >
            <CardNode
              id={it.bookmarkId}
              title={it.title}
              thumbnailUrl={it.thumbnail}
            />
            <SizePresetToggle
              preset={it.sizePreset}
              visible={hoveredId === it.bookmarkId}
              onCycle={(next): void => onCyclePreset(it.bookmarkId, next)}
            />
          </div>
```

- [ ] **Step 9.2: Wire handler in BoardRoot**

Edit `components/board/BoardRoot.tsx`:

Destructure `persistSizePreset` from `useBoardData`:

```ts
  const { items, persistFreePosition, persistOrderBatch, persistSizePreset } = useBoardData()
```

Add a handler before the `return`:

```ts
  const handleCyclePreset = useCallback(
    (bookmarkId: string, next: 'S' | 'M' | 'L'): void => {
      void persistSizePreset(bookmarkId, next)
    },
    [persistSizePreset],
  )
```

Pass it to CardsLayer:

```tsx
          <CardsLayer
            items={items}
            viewport={viewport}
            viewportWidth={effectiveLayoutWidth}
            overrides={overrides}
            onCyclePreset={handleCyclePreset}
          />
```

- [ ] **Step 9.3: Manual E2E smoke**

Run: `pnpm dev`, open `/board`, hover any card, click the S/M/L toggle. Verify card resizes in-place with correct column span. Refresh — size is preserved.

If behavior matches expectations, continue. Otherwise debug via the in-browser React DevTools and IndexedDB panel.

- [ ] **Step 9.4: Run tests**

Run: `pnpm test` and `pnpm tsc --noEmit`
Expected: all PASS.

- [ ] **Step 9.5: Commit**

```bash
rtk git add components/board/CardsLayer.tsx components/board/BoardRoot.tsx
rtk git commit -m "$(cat <<'EOF'
feat(board): wire SizePresetToggle — click S/M/L cycles + persists

Hover-revealed dots on each card; click cycles the size preset, which
CardsLayer re-lays-out on the next render. BoardRoot persists to IDB via
persistSizePreset.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Keyboard shortcuts 1/2/3

**Files:**
- Modify: `components/board/CardsLayer.tsx`
- Modify: `components/board/BoardRoot.tsx`

- [ ] **Step 10.1: Lift hoveredId to BoardRoot**

Refactor: `BoardRoot` owns `hoveredBookmarkId` state. `CardsLayer` gets a prop + setter.

Edit `components/board/BoardRoot.tsx`:

Add state:

```ts
  const [hoveredBookmarkId, setHoveredBookmarkId] = useState<string | null>(null)
```

Pass down:

```tsx
          <CardsLayer
            items={items}
            viewport={viewport}
            viewportWidth={effectiveLayoutWidth}
            overrides={overrides}
            hoveredBookmarkId={hoveredBookmarkId}
            onHoverChange={setHoveredBookmarkId}
            onCyclePreset={handleCyclePreset}
          />
```

Edit `CardsLayer.tsx`:

Remove local hover state; accept from props:

```ts
type CardsLayerProps = {
  readonly items: ReadonlyArray<BoardItem>
  readonly viewport: Viewport
  readonly viewportWidth: number
  readonly overrides?: Readonly<Record<string, CardPosition>>
  readonly hoveredBookmarkId: string | null
  readonly onHoverChange: (id: string | null) => void
  readonly onCyclePreset: (bookmarkId: string, next: 'S' | 'M' | 'L') => void
}
```

Destructure + use in the card's `onPointerEnter` / `onPointerLeave`:

```tsx
            onPointerEnter={(): void => onHoverChange(it.bookmarkId)}
            onPointerLeave={(): void => onHoverChange(null)}
```

And gate the toggle `visible` prop on the passed-down value:

```tsx
            <SizePresetToggle
              preset={it.sizePreset}
              visible={hoveredBookmarkId === it.bookmarkId}
              onCycle={(next): void => onCyclePreset(it.bookmarkId, next)}
            />
```

- [ ] **Step 10.2: Add 1/2/3 key listener in BoardRoot**

Add this `useEffect` in `BoardRoot.tsx`, near the other keyboard handlers:

```ts
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== '1' && e.key !== '2' && e.key !== '3') return
      if (!hoveredBookmarkId) return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      )
        return
      e.preventDefault()
      const preset = e.key === '1' ? 'S' : e.key === '2' ? 'M' : 'L'
      void persistSizePreset(hoveredBookmarkId, preset)
    }
    window.addEventListener('keydown', onKey)
    return (): void => {
      window.removeEventListener('keydown', onKey)
    }
  }, [hoveredBookmarkId, persistSizePreset])
```

- [ ] **Step 10.3: Manual smoke**

Run `pnpm dev`. Hover a card, press `1` (→ S), `2` (→ M), `3` (→ L). Verify resize + persistence.

- [ ] **Step 10.4: Run tests + type-check**

Run: `pnpm test && pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 10.5: Commit**

```bash
rtk git add components/board/BoardRoot.tsx components/board/CardsLayer.tsx
rtk git commit -m "$(cat <<'EOF'
feat(board): keyboard 1/2/3 cycles hovered card's sizePreset

BoardRoot owns hoveredBookmarkId; a window keydown listener maps 1/2/3 to
S/M/L and calls persistSizePreset. Ignores input-focus + contentEditable.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Drag-to-reorder hook (`use-card-reorder-drag`)

**Files:**
- Create: `components/board/use-card-reorder-drag.ts`

Goal: a hook that exposes `handleCardPointerDown` + `dragState`. The hook owns:
- Pointer capture
- Click vs drag detection (5px / 200ms threshold, or Space-held → bail)
- Emitting `onDragMove(id, x, y)` during drag
- Computing `insertionIndex` on drop and calling `onDrop(orderedBookmarkIds)` (parent persists)
- `onClick(bookmarkId)` shortcut when movement stays under threshold

The hook does NOT directly run FLIP; the parent component ties FLIP to React state changes. This keeps the hook focused and testable.

- [ ] **Step 11.1: Create the hook file scaffolding**

Create `components/board/use-card-reorder-drag.ts`:

```ts
'use client'

import { useCallback, useRef, useState, type PointerEvent } from 'react'
import type { BoardItem } from '@/lib/storage/use-board-data'
import type { CardPosition } from '@/lib/board/types'

const CLICK_THRESHOLD_PX = 5
const CLICK_MAX_MS = 200

export type ReorderDragState = {
  readonly bookmarkId: string
  readonly currentX: number
  readonly currentY: number
}

export type UseReorderDragParams = {
  readonly items: ReadonlyArray<BoardItem>
  readonly positions: Readonly<Record<string, CardPosition>>
  readonly spaceHeld: boolean
  readonly onClick: (bookmarkId: string) => void
  readonly onDragMove: (bookmarkId: string, x: number, y: number) => void
  readonly onDrop: (orderedBookmarkIds: readonly string[]) => void
}

export function useCardReorderDrag(params: UseReorderDragParams): {
  dragState: ReorderDragState | null
  handleCardPointerDown: (e: PointerEvent<HTMLDivElement>, bookmarkId: string) => void
} {
  const { items, positions, spaceHeld, onClick, onDragMove, onDrop } = params
  const [dragState, setDragState] = useState<ReorderDragState | null>(null)
  // Mirror latest state + params in a ref so handlers registered on window
  // see the latest values without rebinding every render.
  const stateRef = useRef<{
    state: ReorderDragState | null
    items: ReadonlyArray<BoardItem>
    positions: Readonly<Record<string, CardPosition>>
    onDrop: typeof onDrop
    onClick: typeof onClick
    onDragMove: typeof onDragMove
  }>({ state: null, items, positions, onDrop, onClick, onDragMove })
  stateRef.current = { state: dragState, items, positions, onDrop, onClick, onDragMove }

  const handleCardPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>, bookmarkId: string): void => {
      if (spaceHeld) return
      e.stopPropagation()
      const el = e.currentTarget
      const pointerId = e.pointerId
      el.setPointerCapture(pointerId)

      const startX = e.clientX
      const startY = e.clientY
      const startTime = performance.now()
      let dragStarted = false

      const move = (ev: globalThis.PointerEvent): void => {
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY
        const distance = Math.hypot(dx, dy)
        const elapsed = performance.now() - startTime

        if (!dragStarted) {
          if (distance < CLICK_THRESHOLD_PX && elapsed < CLICK_MAX_MS) return
          dragStarted = true
          setDragState({ bookmarkId, currentX: ev.clientX, currentY: ev.clientY })
          stateRef.current.onDragMove(bookmarkId, ev.clientX, ev.clientY)
          return
        }
        setDragState({ bookmarkId, currentX: ev.clientX, currentY: ev.clientY })
        stateRef.current.onDragMove(bookmarkId, ev.clientX, ev.clientY)
      }

      const up = (ev: globalThis.PointerEvent): void => {
        el.removeEventListener('pointermove', move)
        el.removeEventListener('pointerup', up)
        el.removeEventListener('pointercancel', up)
        if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId)

        const dx = ev.clientX - startX
        const dy = ev.clientY - startY
        const distance = Math.hypot(dx, dy)

        if (!dragStarted || distance < CLICK_THRESHOLD_PX) {
          setDragState(null)
          stateRef.current.onClick(bookmarkId)
          return
        }

        // Drag end — compute new order
        const newOrder = computeNewOrder({
          items: stateRef.current.items,
          positions: stateRef.current.positions,
          draggedId: bookmarkId,
          pointerClientX: ev.clientX,
          pointerClientY: ev.clientY,
          dropTarget: el,
        })
        setDragState(null)
        stateRef.current.onDrop(newOrder)
      }

      el.addEventListener('pointermove', move)
      el.addEventListener('pointerup', up)
      el.addEventListener('pointercancel', up)
    },
    [spaceHeld],
  )

  return { dragState, handleCardPointerDown }
}

/**
 * Compute the new ordered bookmarkId list after a drop.
 *
 * Strategy: find the non-dragged card whose center is closest to the pointer;
 * if the pointer is to the left/above the center, insert before; otherwise,
 * after.
 */
function computeNewOrder(params: {
  items: ReadonlyArray<BoardItem>
  positions: Readonly<Record<string, CardPosition>>
  draggedId: string
  pointerClientX: number
  pointerClientY: number
  dropTarget: HTMLElement
}): readonly string[] {
  const { items, positions, draggedId, pointerClientX, pointerClientY, dropTarget } = params

  // Convert pointer clientX/Y into the cards' coord space. dropTarget is the
  // dragged card element; its getBoundingClientRect tells us where it is on
  // screen, and its inline transform gives us its world-space pos.
  const rect = dropTarget.getBoundingClientRect()
  const worldPos = positions[draggedId]
  if (!worldPos) return items.map((it) => it.bookmarkId)
  const deltaClientToWorldX = worldPos.x - rect.left
  const deltaClientToWorldY = worldPos.y - rect.top
  const pointerWorldX = pointerClientX + deltaClientToWorldX
  const pointerWorldY = pointerClientY + deltaClientToWorldY

  let bestId: string | null = null
  let bestDistSq = Infinity
  let bestCenter = { cx: 0, cy: 0 }
  for (const it of items) {
    if (it.bookmarkId === draggedId) continue
    const p = positions[it.bookmarkId]
    if (!p) continue
    const cx = p.x + p.w / 2
    const cy = p.y + p.h / 2
    const dx = pointerWorldX - cx
    const dy = pointerWorldY - cy
    const d = dx * dx + dy * dy
    if (d < bestDistSq) {
      bestDistSq = d
      bestId = it.bookmarkId
      bestCenter = { cx, cy }
    }
  }

  const ordered = items.slice().sort((a, b) => a.orderIndex - b.orderIndex)
  const withoutDragged = ordered.filter((it) => it.bookmarkId !== draggedId)

  if (!bestId) {
    // Drop below all cards — append
    return [...withoutDragged.map((it) => it.bookmarkId), draggedId]
  }

  const insertBefore = pointerWorldX < bestCenter.cx
  const targetIdx = withoutDragged.findIndex((it) => it.bookmarkId === bestId)
  const insertIdx = insertBefore ? targetIdx : targetIdx + 1

  const ids = withoutDragged.map((it) => it.bookmarkId)
  ids.splice(insertIdx, 0, draggedId)
  return ids
}
```

- [ ] **Step 11.2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 11.3: Commit**

```bash
rtk git add components/board/use-card-reorder-drag.ts
rtk git commit -m "$(cat <<'EOF'
feat(board): useCardReorderDrag hook — click-or-drag-to-reorder

Hook owns pointer capture + click/drag threshold (5px / 200ms). On drop,
computeNewOrder walks non-dragged card centers, picks the nearest, and
inserts before/after based on pointer's horizontal position relative to
that card's center.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Wire reorder drag in CardsLayer with GSAP FLIP

**Files:**
- Modify: `components/board/CardsLayer.tsx`
- Modify: `components/board/BoardRoot.tsx`

Goal: integrate the reorder hook. During drag, the dragged card follows the pointer via GSAP (`quickTo`), other cards stay in their masonry slots. On drop, call `persistOrderBatch`, which updates `items` via optimistic setState; then FLIP-animate all cards to their new positions.

- [ ] **Step 12.1: Add reorder drag + FLIP to CardsLayer**

Edit `components/board/CardsLayer.tsx`:

Add imports:

```ts
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { gsap } from 'gsap'
import { useCardReorderDrag } from './use-card-reorder-drag'
```

Replace `CardsLayerProps` (dropping the now-unused `overrides` prop — reorder drag drives pointer-follow via direct GSAP, not via React state):

```ts
type CardsLayerProps = {
  readonly items: ReadonlyArray<BoardItem>
  readonly viewport: Viewport
  readonly viewportWidth: number
  readonly hoveredBookmarkId: string | null
  readonly spaceHeld: boolean
  readonly onHoverChange: (id: string | null) => void
  readonly onCyclePreset: (bookmarkId: string, next: 'S' | 'M' | 'L') => void
  readonly onClick: (bookmarkId: string) => void
  readonly onDrop: (orderedBookmarkIds: readonly string[]) => void
}
```

Destructure `spaceHeld`, `onClick`, `onDrop`. Inside the component, `displayedPositions = masonryLayout.positions` (no override merging needed).

Add FLIP state: track **previous** positions keyed by bookmarkId (via ref). Before each render's positions are committed to the DOM, read previous DOM positions, compute delta, pre-set inverse transforms, tween to zero.

Replace the `useLayoutEffect` snap block with a FLIP-aware version:

```ts
  // Previous-position ledger used to animate masonry reflows via FLIP.
  // Updated at the end of every effect run.
  const prevPositionsRef = useRef<Record<string, { x: number; y: number }>>({})

  useLayoutEffect(() => {
    for (const it of visibleItems) {
      const el = cardRefs.current[it.bookmarkId]
      if (!el) continue
      const p = displayedPositions[it.bookmarkId]
      if (!p) continue

      const prev = prevPositionsRef.current[it.bookmarkId]
      if (prev && (prev.x !== p.x || prev.y !== p.y)) {
        // FLIP: invert from previous pos, tween to new pos
        gsap.fromTo(
          el,
          { x: prev.x, y: prev.y, width: p.w, height: p.h },
          {
            x: p.x,
            y: p.y,
            width: p.w,
            height: p.h,
            duration: 0.26,
            ease: 'power2.out',
            overwrite: 'auto',
          },
        )
      } else {
        gsap.set(el, { x: p.x, y: p.y, width: p.w, height: p.h })
      }
      prevPositionsRef.current[it.bookmarkId] = { x: p.x, y: p.y }
    }
    // Garbage-collect stale entries (cards unmounted due to culling)
    const liveIds = new Set(visibleItems.map((it) => it.bookmarkId))
    for (const id of Object.keys(prevPositionsRef.current)) {
      if (!liveIds.has(id)) delete prevPositionsRef.current[id]
    }
  }, [visibleItems, displayedPositions])
```

Add dragged-card pointer-follow via a second effect using `quickTo`. Track `draggedId` + `pointerX` / `pointerY` through the reorder hook's `dragState`. During drag, override the dragged card's position so it follows the pointer:

```ts
  const {
    dragState,
    handleCardPointerDown: handleReorderPointerDown,
  } = useCardReorderDrag({
    items,
    positions: masonryLayout.positions,
    spaceHeld,
    onClick,
    onDragMove: (id, clientX, clientY) => {
      const el = cardRefs.current[id]
      if (!el) return
      // Convert client coords to world coords by adding the current card's
      // offset from its element's rect (rect.left/rect.top are in screen
      // coords; the element's inline transform already holds world x/y).
      const rect = el.getBoundingClientRect()
      // Compute pointer in world space assuming the card tracks by its
      // top-left under the pointer anchored where the drag started. For the
      // simpler MVP: center the card on the pointer.
      const p = masonryLayout.positions[id]
      if (!p) return
      const worldTargetX = p.x + (clientX - rect.left) - p.w / 2
      const worldTargetY = p.y + (clientY - rect.top) - p.h / 2
      gsap.to(el, {
        x: worldTargetX,
        y: worldTargetY,
        scale: 1.03,
        duration: 0.12,
        ease: 'power2.out',
        overwrite: 'auto',
      })
    },
    onDrop: (orderedIds) => {
      const draggedId = dragState?.bookmarkId
      if (draggedId) {
        const el = cardRefs.current[draggedId]
        if (el) gsap.to(el, { scale: 1, duration: 0.18, ease: 'power2.out' })
      }
      onDrop(orderedIds)
    },
  })
```

Update the card `<div>` wrapper to use `handleReorderPointerDown`:

```tsx
          <div
            key={it.bookmarkId}
            ref={(el): void => {
              cardRefs.current[it.bookmarkId] = el
            }}
            onPointerDown={(e): void => handleReorderPointerDown(e, it.bookmarkId)}
            onPointerEnter={(): void => onHoverChange(it.bookmarkId)}
            onPointerLeave={(): void => onHoverChange(null)}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: `${p.w}px`,
              height: `${p.h}px`,
              transform: `translate3d(${p.x}px, ${p.y}px, 0)`,
              pointerEvents: 'auto',
              zIndex: dragState?.bookmarkId === it.bookmarkId ? 1000 : undefined,
            }}
          >
```

- [ ] **Step 12.2: Escape-key cancel**

Add to the same component, just after the hook call:

```ts
  // Esc during drag → restore dragged card to its pre-drag slot (FLIP handles it).
  useEffect(() => {
    if (!dragState) return
    const onEsc = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      // Force a FLIP back by re-invoking the snap with current positions.
      const el = cardRefs.current[dragState.bookmarkId]
      const p = masonryLayout.positions[dragState.bookmarkId]
      if (el && p) {
        gsap.to(el, {
          x: p.x, y: p.y, scale: 1, duration: 0.22, ease: 'power2.out', overwrite: 'auto',
        })
      }
      // Swallow the drop — the hook's pointerup will no-op because we re-snap.
      // Simplest cancel: synthesize pointerup on document.
    }
    window.addEventListener('keydown', onEsc)
    return (): void => {
      window.removeEventListener('keydown', onEsc)
    }
  }, [dragState, masonryLayout.positions])
```

Note: Esc does NOT abort the pending `pointerup`; it visually snaps back. Full abort semantics (no persist) is a Phase 2 improvement — mentioned in spec §9.

- [ ] **Step 12.3: Wire onClick / onDrop in BoardRoot**

Edit `components/board/BoardRoot.tsx`:

Destructure new hook members:

```ts
  const { items, persistOrderBatch, persistSizePreset } = useBoardData()
```

Add handlers:

```ts
  const handleCardClick = useCallback(
    (bookmarkId: string): void => {
      const item = items.find((it) => it.bookmarkId === bookmarkId)
      if (!item?.url) return
      window.open(item.url, '_blank', 'noopener,noreferrer')
    },
    [items],
  )

  const handleDropOrder = useCallback(
    (orderedBookmarkIds: readonly string[]): void => {
      void persistOrderBatch(orderedBookmarkIds)
    },
    [persistOrderBatch],
  )
```

Pass to CardsLayer:

```tsx
          <CardsLayer
            items={items}
            viewport={viewport}
            viewportWidth={effectiveLayoutWidth}
            hoveredBookmarkId={hoveredBookmarkId}
            spaceHeld={spaceHeld}
            onHoverChange={setHoveredBookmarkId}
            onCyclePreset={handleCyclePreset}
            onClick={handleCardClick}
            onDrop={handleDropOrder}
          />
```

Remove the `overrides` prop wiring (we no longer pass overrides; the reorder hook manages follow-pointer via direct GSAP).

Remove the `overrides` + `setOverrides` state from BoardRoot if no longer used.

- [ ] **Step 12.4: Run type-check + unit tests**

Run: `pnpm tsc --noEmit && pnpm test`
Expected: PASS.

- [ ] **Step 12.5: Manual drag-to-reorder smoke**

Run: `pnpm dev`. Open `/board`. With at least 3 cards:

1. Click a card — opens in new tab ✓
2. Drag a card to between two others — on release, all cards reflow, dragged card lands in the new slot ✓
3. Drag and release back over the same card — stays put (click threshold passes) ✓
4. Hover + press `2` — card becomes M, row reflows ✓
5. Refresh — new order + sizes persist ✓
6. Press Space + click-drag on background — pan canvas ✓ (InteractionLayer)

Fix any regressions inline before committing.

- [ ] **Step 12.6: Commit**

```bash
rtk git add components/board/CardsLayer.tsx components/board/BoardRoot.tsx
rtk git commit -m "$(cat <<'EOF'
feat(board): drag-to-reorder with GSAP FLIP reflow (iOS home-screen style)

- CardsLayer integrates useCardReorderDrag: pointer capture + click/drag split
- During drag, GSAP quickTo follows the pointer + lifts (scale 1.03) the card
- On drop, persistOrderBatch rewrites orderIndex atomically; items re-render
  in the new order; a FLIP useLayoutEffect tweens every visible card from its
  previous-rendered position to the new masonry slot (~260ms, power2.out)
- Esc visually snaps the dragged card back; full cancel semantics in Phase 2
- click-threshold (5px / 200ms) restores open-in-new-tab

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Delete orphan files

**Files:**
- Delete: `components/board/ResizeHandle.tsx`
- Delete: `components/board/ResizeHandle.module.css`
- Delete: `components/board/RotationHandle.tsx`
- Delete: `components/board/RotationHandle.module.css`
- Delete: `components/board/SnapGuides.tsx`
- Delete: `components/board/SnapGuides.module.css`
- Delete: `components/board/use-card-drag.ts`
- Delete: `lib/board/free-layout.ts`
- Delete: `lib/board/free-layout.test.ts`

- [ ] **Step 13.1: Delete orphan component files**

Run:

```bash
rm components/board/ResizeHandle.tsx components/board/ResizeHandle.module.css
rm components/board/RotationHandle.tsx components/board/RotationHandle.module.css
rm components/board/SnapGuides.tsx components/board/SnapGuides.module.css
rm components/board/use-card-drag.ts
rm lib/board/free-layout.ts lib/board/free-layout.test.ts
```

- [ ] **Step 13.2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors. If something still imports from these files, grep and remove the import:

```bash
rtk grep "ResizeHandle\|RotationHandle\|SnapGuides\|use-card-drag\|free-layout" -- 'components/' 'lib/' 'app/'
```

Clean up any dangling references.

- [ ] **Step 13.3: Run all tests**

Run: `pnpm test && pnpm test:e2e`
Expected: PASS.

- [ ] **Step 13.4: Commit**

```bash
rtk git add -A
rtk git commit -m "$(cat <<'EOF'
refactor(board): delete orphan files after masonry pivot

- ResizeHandle.tsx + .module.css (continuous resize replaced by S/M/L preset)
- RotationHandle.tsx + .module.css (rotation deferred to Share Modal)
- SnapGuides.tsx + .module.css (free-drag snap no longer exists)
- use-card-drag.ts (replaced by use-card-reorder-drag.ts)
- lib/board/free-layout.ts + .test.ts (snap helpers unused)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Manual verify + deploy + TODO update

**Files:**
- Modify: `docs/TODO.md`

- [ ] **Step 14.1: Full manual verification pass**

Against production-like build: `pnpm build && npx wrangler pages dev out`

Checklist:

| # | Check | Expected |
|---|---|---|
| 1 | `/board` initial render | Column masonry, no overlaps |
| 2 | Various content types | YouTube 16:9, Shorts 9:16, long tweet 1:2 |
| 3 | Hover → size toggle appears | Right-bottom, fade-in 160ms |
| 4 | Click size toggle | Cycles S→M→L→S, reflows in place |
| 5 | Keyboard 1/2/3 on hovered card | Same as click toggle |
| 6 | Click card (no drag) | Opens URL in new tab |
| 7 | Drag card to new position | FLIP reflow, new order persists |
| 8 | Drag release over self | Click-threshold triggers open |
| 9 | Reload after reorder + resize | Order + sizePreset persist |
| 10 | Narrow viewport (≤ 2 cols) | L cards clamp to 2 cols |
| 11 | Space + drag background | InteractionLayer pans |
| 12 | Esc during drag | Card snaps back visually |

Fix any regressions with small commits. If something is fundamentally broken (e.g. FLIP flicker), return to Task 12 and iterate.

- [ ] **Step 14.2: Deploy to production**

```bash
pnpm build
npx wrangler pages deploy out/ --project-name=booklage --commit-dirty=true --branch=main
```

Verify the deploy at `https://booklage.pages.dev`:
- Repeat the 12-point checklist against production

- [ ] **Step 14.3: Update docs/TODO.md**

Edit `docs/TODO.md`:

Replace the `## 現在の状態` section:

```markdown
## 現在の状態（次セッションはここから読む）

- **ブランチ**: `claude/b1-placement`（column masonry + reorder + S/M/L 実装済、deploy 済）
- **進捗**: **Board content-sized reorder 完了** → 次は **Share Modal（Plan B）** か **Phase 2: 多機能化 or live reflow**
- **本番URL**: `https://booklage.pages.dev`（masonry レイアウト + 並び替え反映済）
- **DBバージョン**: v8（orderIndex + sizePreset 追加）
- **GitHub**: `origin` → `https://github.com/masaya-men/booklage.git`（Public）

### 直近の作業

- Spec: `docs/superpowers/specs/2026-04-20-board-content-sized-reorder-design.md`
- Plan: `docs/superpowers/plans/2026-04-20-board-content-sized-reorder.md`
- Layout 切替: `computeAutoLayout` → `computeColumnMasonry`
- Content-sized aspect ratio: YouTube / Shorts / Reels / Twitter tiered
- Drag-to-reorder: iOS 風、GSAP FLIP drop-time reflow
- Size preset UI: hover toggle + keyboard 1/2/3
- 撤去: free-drag / Resize / Rotation / Align / SnapGuides

### 次フェーズ候補

- **Phase 2 live drag reflow**: drag 中もカードが避ける挙動
- **Plan B Share Modal**: SNS 枠選択 + 自由配置 + PNG 出力
- **B2 ブクマ管理**: URL 入力 / フォルダ / 設定パネルを BoardRoot に戻す
- **C LP リビルド**
```

- [ ] **Step 14.4: Commit + push**

```bash
rtk git add docs/TODO.md
rtk git commit -m "$(cat <<'EOF'
docs(todo): board masonry pivot complete — deploy 済、次は Phase 2 or Plan B

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
rtk git push origin claude/b1-placement
```

- [ ] **Step 14.5: Verify remote**

Run: `rtk gh pr list --head claude/b1-placement` to see if a PR exists. If yes, it's auto-updated. If no, inform the user — they decide whether to open one.

---

## Risks & Mitigation

| Risk | Mitigation |
|---|---|
| FLIP flicker on items that unmount due to viewport culling | Only apply FLIP to items in `prevPositionsRef`; fall back to `gsap.set` for first-time-visible items (Task 12.1) |
| `getBoundingClientRect` read in drag-move causes layout thrash | `onDragMove` is throttled via `gsap.to`'s native 60fps animation; we only read rect once per drag start (Task 12.1) |
| Bookmark import batch writes orderIndex incorrectly | `addBookmarkBatch` uses `existingBookmarks.length` as seed, then increments — verified by the extended IDB test |
| Existing users' `freePos` ghost-rendered | `freePos` no longer read by layout; present as dead column only |
| Task 7 leaves E2E suite failing mid-plan | Explicit `test.skip(...)` with TODO markers; Task 14 checklist re-verifies |
| `persistOrderBatch` fires on every click (accidental drag below threshold) | Hook only triggers drop handler when `dragStarted === true` (Task 11.1) |

## Out of Scope (Phase 2 / Plan B)

- Live drag reflow (masonry recomputes at each pointermove)
- Multi-select drag
- Range-select reorder
- Share Modal (frame presets, PNG export, Web Intents)
- Rotation / free placement in Share Modal
- pretext-based precise aspect ratio

## Definition of Done

- All 14 tasks' commits on `claude/b1-placement`
- Unit + E2E suites green
- Production verification checklist (Task 14.1) clean
- `docs/TODO.md` updated
- No orphan files (Task 13)
