# Board Chrome Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move board chrome out of the canvas into a sticky top header, replace S/M/L card sizing with a continuous slider, add a board-wide zoom slider, and introduce the `View` dropdown as the foundation for theme switching. Apply the "waveform" visual language across the new chrome.

**Architecture:** Top header sits as a sibling to the board canvas (not absolutely positioned within it). Three logical groups (NAV / INSTRUMENT / ACTIONS) separated by hairline dividers. Continuous card sizing flows through the existing `column-masonry` algorithm by changing what `targetColumnUnit` means, and migrating BoardItem.sizePreset → cardWidth. Board zoom is a CSS `transform: scale()` on the cards container; pointer event coords are divided by zoom for hit testing. Theme is a `data-theme` attribute on the board root, read by future theme CSS — only `waveform` (default) is implemented this phase.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Vanilla CSS Modules, IndexedDB (idb), GSAP. No Tailwind, no Framer Motion (per CLAUDE.md).

**Spec:** [`docs/superpowers/specs/2026-05-07-board-chrome-redesign-design.md`](../specs/2026-05-07-board-chrome-redesign-design.md)

---

## File Structure

### New Files
- `components/board/TopHeader.tsx` + `.module.css` + `.test.tsx` — replaces current Toolbar; 3-group sticky header
- `components/board/SizeSlider.tsx` + `.module.css` + `.test.tsx` — continuous card-size slider
- `components/board/ZoomSlider.tsx` + `.module.css` + `.test.tsx` — board-wide zoom slider
- `components/board/ViewDropdown.tsx` + `.module.css` + `.test.tsx` — display mode + theme picker
- `components/board/WaveformTrack.tsx` + `.module.css` — shared waveform-bar slider track (DRY)
- `lib/theme/types.ts` — theme id type
- `lib/theme/use-theme.ts` + `.test.ts` — theme state hook with IndexedDB persistence
- `lib/board/size-migration.ts` + `.test.ts` — pure helpers for S/M/L → cardWidth conversion

### Modified Files
- `components/board/Toolbar.tsx` — DELETE (replaced by TopHeader)
- `components/board/Toolbar.module.css` — DELETE
- `components/board/FilterPill.tsx` — bracket-wrapped style (`[ ALL · 248 ]`)
- `components/board/FilterPill.module.css` — waveform aesthetic
- `components/board/BoardRoot.tsx` — render TopHeader as sibling to canvas, remove Toolbar; thread cardWidth + zoom state
- `components/board/BoardRoot.module.css` — page-level grid: `auto / 1fr` (header / canvas)
- `components/board/CardsLayer.tsx` — read cardWidth from items, divide pointer coords by zoom; apply scale transform
- `components/board/InteractionLayer.tsx` — divide pointer coords by zoom (drag pan continues to be world-coord-based)
- `components/board/use-card-reorder-drag.ts` — already operates in container coords; ensure callers pass zoom-adjusted coords
- `components/board/SizePresetToggle.tsx` — DELETE (replaced by global SizeSlider)
- `components/board/SizePresetToggle.module.css` — DELETE
- `components/share/ShareFrame.tsx` — strip the `<SizePresetToggle>` import + hover toggle
- `lib/board/types.ts` — add `cardWidth: number`, deprecate `sizePreset`
- `lib/board/column-masonry.ts` — accept per-card `targetWidth` instead of columnSpan-based sizing
- `lib/storage/indexeddb.ts` — schema bump, add cardWidth to BookmarkRecord, migration v8 → v9
- `lib/storage/use-board-data.ts` — `persistSizePreset` → `persistCardWidth`, BoardItem shape
- `lib/board/constants.ts` — keep `TARGET_COLUMN_UNIT_PX` (now used as default cardWidth)

### Deleted Files
- `components/board/SizePresetToggle.tsx`
- `components/board/SizePresetToggle.module.css`
- `components/board/Toolbar.tsx`
- `components/board/Toolbar.module.css`

---

## Sub-Phase 1A: Top Header Restructure

Move chrome out of board, restructure into 3-group layout with bracket pills. **No new behaviors yet** — refactor only.

### Task 1A.1: Create TopHeader skeleton + render in BoardRoot

**Files:**
- Create: `components/board/TopHeader.tsx`
- Create: `components/board/TopHeader.module.css`
- Modify: `components/board/BoardRoot.tsx`
- Modify: `components/board/BoardRoot.module.css`

- [ ] **Step 1: Create TopHeader.tsx with 3-group skeleton**

```tsx
// components/board/TopHeader.tsx
'use client'

import type { ReactElement, ReactNode } from 'react'
import styles from './TopHeader.module.css'

type Props = {
  readonly nav: ReactNode
  readonly instrument: ReactNode
  readonly actions: ReactNode
}

export function TopHeader({ nav, instrument, actions }: Props): ReactElement {
  return (
    <header className={styles.header} data-testid="board-top-header">
      <div className={styles.group} data-group="nav">{nav}</div>
      <span className={styles.divider} aria-hidden="true" />
      <div className={styles.group} data-group="instrument">{instrument}</div>
      <span className={styles.divider} aria-hidden="true" />
      <div className={styles.group} data-group="actions">{actions}</div>
    </header>
  )
}
```

- [ ] **Step 2: Create TopHeader.module.css**

```css
.header {
  display: flex;
  align-items: center;
  height: 64px;
  padding: 0 24px;
  background: #000;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  position: sticky;
  top: 0;
  z-index: 110;
  gap: 16px;
}

.group {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
}

.group[data-group="instrument"] {
  flex: 1 1 auto;
  justify-content: center;
}

.group[data-group="actions"] {
  margin-left: auto;
}

.divider {
  width: 1px;
  height: 24px;
  background: rgba(255, 255, 255, 0.12);
  flex: 0 0 auto;
}
```

- [ ] **Step 3: Render TopHeader in BoardRoot, replacing Toolbar**

In `components/board/BoardRoot.tsx`:
- Remove `import { Toolbar } from './Toolbar'`
- Add `import { TopHeader } from './TopHeader'`
- Find the `<Toolbar ... />` call site and replace with:

```tsx
<TopHeader
  nav={<FilterPill value={activeFilter} onChange={setActiveFilter} moods={moods} counts={counts} />}
  instrument={null /* SizeSlider + ZoomSlider go here in 1B / 1C */}
  actions={
    <>
      <button
        type="button"
        className={styles.sharePill}
        onClick={() => setShareComposerOpen(true)}
        data-testid="share-pill"
      >
        Share ↗
      </button>
    </>
  }
/>
```

(`DisplayModeSwitch` is intentionally dropped here — it returns in Task 1D inside `ViewDropdown`.)

- [ ] **Step 4: Update BoardRoot.module.css for header + canvas layout**

Add at the top of the existing styles (this depends on the existing root-level container — adapt selector if needed; common case shown):

```css
.root {
  display: grid;
  grid-template-rows: auto 1fr;
  height: 100vh;
}

.canvasWrap {
  position: relative;
  overflow: hidden;
  min-height: 0;
}
```

Wrap the existing canvas DOM in `<div className={styles.canvasWrap}>` so it occupies the `1fr` row below TopHeader.

- [ ] **Step 5: Confirm tsc + manual smoke**

Run: `rtk pnpm tsc --noEmit`
Expected: 0 errors.

Run: `rtk pnpm dev` (background); open `/board`.
Expected: top header bar visible at top, filter pill on left, share pill on right, canvas below.

- [ ] **Step 6: Commit**

```bash
rtk git add components/board/TopHeader.tsx components/board/TopHeader.module.css components/board/BoardRoot.tsx components/board/BoardRoot.module.css
rtk git commit -m "feat(board): TopHeader skeleton — 3-group sticky chrome"
```

### Task 1A.2: FilterPill — bracket-wrapped count style

**Files:**
- Modify: `components/board/FilterPill.tsx`
- Modify: `components/board/FilterPill.module.css`
- Modify: `tests/...` (if existing FilterPill tests need updates — check `tests/components/` for test file)

- [ ] **Step 1: Update FilterPill button label format**

In `components/board/FilterPill.tsx`, replace the `<button>` label rendering inside the closed (collapsed) state. Find:

```tsx
{label(value, moods)} ▾
```

Replace with:

```tsx
<span className={styles.bracket}>[</span>
<span className={styles.label}>{label(value, moods)}</span>
<span className={styles.count}>· {countFor(value, counts)}</span>
<span className={styles.bracket}>]</span>
```

Add this helper above the component:

```tsx
function countFor(f: BoardFilter, counts: { all: number; inbox: number; archive: number }): string {
  if (f === 'all') return String(counts.all).padStart(3, '0')
  if (f === 'inbox') return String(counts.inbox).padStart(3, '0')
  if (f === 'archive') return String(counts.archive).padStart(3, '0')
  return '---'
}
```

- [ ] **Step 2: Add bracket / count styles in FilterPill.module.css**

Append to `components/board/FilterPill.module.css`:

```css
.bracket {
  color: rgba(255, 255, 255, 0.4);
  font-family: ui-monospace, Menlo, monospace;
  font-size: 11px;
  letter-spacing: 0.06em;
}

.label {
  color: rgba(255, 255, 255, 0.92);
  font-size: 12px;
  letter-spacing: 0.04em;
  margin: 0 6px;
  text-transform: uppercase;
}

.count {
  color: rgba(255, 255, 255, 0.5);
  font-family: ui-monospace, Menlo, monospace;
  font-size: 11px;
}

.pill {
  /* override existing .pill rule body — keep transparent bg, drop ▾ via removed text */
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.10);
  padding: 6px 10px;
  border-radius: 999px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  font-family: inherit;
}

.pill:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.18);
}
```

- [ ] **Step 3: Verify tsc + visual check**

Run: `rtk pnpm tsc --noEmit`
Expected: 0 errors.

Manual: reload `/board`. Expected: filter pill renders as `[ ALL · 248 ]` with bracket monospace + uppercase label.

- [ ] **Step 4: Commit**

```bash
rtk git add components/board/FilterPill.tsx components/board/FilterPill.module.css
rtk git commit -m "feat(board): FilterPill bracket-wrapped count style"
```

### Task 1A.3: Delete dead Toolbar files

**Files:**
- Delete: `components/board/Toolbar.tsx`
- Delete: `components/board/Toolbar.module.css`

- [ ] **Step 1: Verify no remaining imports**

Run: `rtk grep -r "from './Toolbar'" components/`
Expected: no matches.

Run: `rtk grep -r "from '@/components/board/Toolbar'" .`
Expected: no matches (if any, fix before deleting).

- [ ] **Step 2: Delete files**

```bash
rm components/board/Toolbar.tsx
rm components/board/Toolbar.module.css
```

- [ ] **Step 3: Commit**

```bash
rtk git add -A components/board/
rtk git commit -m "chore(board): remove unused Toolbar (replaced by TopHeader)"
```

### Task 1A.4: Add E2E smoke for new header

**Files:**
- Modify: `tests/e2e/board-b0.spec.ts` (or nearest existing board E2E)

- [ ] **Step 1: Add a single smoke test**

Append to the most relevant existing `describe` block:

```ts
test('top header renders with 3 groups', async ({ page }) => {
  await page.goto('/board')
  await expect(page.locator('[data-testid="board-top-header"]')).toBeVisible()
  await expect(page.locator('[data-testid="filter-pill"]')).toBeVisible()
  await expect(page.locator('[data-testid="share-pill"]')).toBeVisible()
})
```

- [ ] **Step 2: Run E2E**

Run: `rtk pnpm playwright test tests/e2e/board-b0.spec.ts`
Expected: new test passes; no existing test regresses.

- [ ] **Step 3: Commit**

```bash
rtk git add tests/e2e/board-b0.spec.ts
rtk git commit -m "test(board): smoke for TopHeader 3-group layout"
```

### Task 1A.5: Sub-phase 1A deploy gate

- [ ] **Step 1: Full type check + unit tests**

Run: `rtk pnpm tsc --noEmit`
Expected: 0 errors.

Run: `rtk pnpm vitest run`
Expected: all green.

- [ ] **Step 2: Deploy to production**

```bash
rtk pnpm build
npx wrangler pages deploy out/ --project-name=booklage --branch=master --commit-dirty=true
```

Notify user: "1A shipped — please hard-reload `booklage.pages.dev` and confirm header looks right before 1B starts."

---

## Sub-Phase 1B: Continuous Card Size Slider

Replace S/M/L preset with continuous `cardWidth: number` (80-480px). Migrate IndexedDB. Add global slider in TopHeader instrument group.

### Task 1B.1: Add WaveformTrack shared component

**Files:**
- Create: `components/board/WaveformTrack.tsx`
- Create: `components/board/WaveformTrack.module.css`
- Create: `components/board/WaveformTrack.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// components/board/WaveformTrack.test.tsx
import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { WaveformTrack } from './WaveformTrack'

describe('WaveformTrack', () => {
  it('renders the requested number of bars', () => {
    const { container } = render(<WaveformTrack barCount={20} progress={0.5} />)
    const bars = container.querySelectorAll('[data-bar]')
    expect(bars).toHaveLength(20)
  })

  it('marks bars at-or-before progress as active', () => {
    const { container } = render(<WaveformTrack barCount={10} progress={0.5} />)
    const bars = Array.from(container.querySelectorAll('[data-bar]')) as HTMLElement[]
    // bars 0..4 (50%) should be active, 5..9 inactive
    expect(bars[0].dataset.active).toBe('true')
    expect(bars[4].dataset.active).toBe('true')
    expect(bars[5].dataset.active).toBe('false')
    expect(bars[9].dataset.active).toBe('false')
  })
})
```

- [ ] **Step 2: Run test (should FAIL)**

Run: `rtk pnpm vitest run components/board/WaveformTrack.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement WaveformTrack**

```tsx
// components/board/WaveformTrack.tsx
'use client'

import { useMemo, type ReactElement } from 'react'
import styles from './WaveformTrack.module.css'

type Props = {
  readonly barCount: number
  /** 0..1, fraction of the track that is "filled" */
  readonly progress: number
  /** Optional seed so the bar heights are deterministic per-instance. */
  readonly seed?: number
}

function pseudoRandom(i: number, seed: number): number {
  // Deterministic 0..1 from (i, seed) — fast hash, no library.
  let h = (i * 374761393 + seed * 668265263) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return ((h >>> 0) % 1000) / 1000
}

export function WaveformTrack({ barCount, progress, seed = 1 }: Props): ReactElement {
  const heights = useMemo(() => {
    const out: number[] = []
    for (let i = 0; i < barCount; i++) {
      // Range 25%..100% of available height — visually lively, never zero.
      out.push(0.25 + 0.75 * pseudoRandom(i, seed))
    }
    return out
  }, [barCount, seed])

  return (
    <div className={styles.track} data-testid="waveform-track">
      {heights.map((h, i) => {
        const fillFrac = i / Math.max(1, barCount - 1)
        const active = fillFrac <= progress
        return (
          <span
            key={i}
            data-bar
            data-active={active}
            className={styles.bar}
            style={{ height: `${(h * 100).toFixed(1)}%` }}
          />
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Add CSS**

```css
/* components/board/WaveformTrack.module.css */
.track {
  display: flex;
  align-items: center;
  gap: 1px;
  height: 18px;
  width: 100%;
  position: relative;
}

.bar {
  flex: 1 1 0;
  background: rgba(255, 255, 255, 0.18);
  border-radius: 1px;
  min-width: 1px;
  transition: background 120ms ease-out;
}

.bar[data-active="true"] {
  background: rgba(255, 255, 255, 0.7);
}
```

- [ ] **Step 5: Run test (should PASS)**

Run: `rtk pnpm vitest run components/board/WaveformTrack.test.tsx`
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
rtk git add components/board/WaveformTrack.tsx components/board/WaveformTrack.module.css components/board/WaveformTrack.test.tsx
rtk git commit -m "feat(board): WaveformTrack — shared waveform-bar slider track"
```

### Task 1B.2: Size migration helpers

**Files:**
- Create: `lib/board/size-migration.ts`
- Create: `lib/board/size-migration.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// lib/board/size-migration.test.ts
import { describe, it, expect } from 'vitest'
import { presetToCardWidth, clampCardWidth, DEFAULT_CARD_WIDTH, MIN_CARD_WIDTH, MAX_CARD_WIDTH } from './size-migration'

describe('size-migration', () => {
  it('S maps to 160, M to 240, L to 320', () => {
    expect(presetToCardWidth('S')).toBe(160)
    expect(presetToCardWidth('M')).toBe(240)
    expect(presetToCardWidth('L')).toBe(320)
  })

  it('undefined preset falls back to default', () => {
    expect(presetToCardWidth(undefined)).toBe(DEFAULT_CARD_WIDTH)
  })

  it('clamp keeps values inside [MIN, MAX]', () => {
    expect(clampCardWidth(50)).toBe(MIN_CARD_WIDTH)
    expect(clampCardWidth(9999)).toBe(MAX_CARD_WIDTH)
    expect(clampCardWidth(200)).toBe(200)
    expect(clampCardWidth(NaN)).toBe(DEFAULT_CARD_WIDTH)
  })

  it('exports the expected constants', () => {
    expect(MIN_CARD_WIDTH).toBe(80)
    expect(MAX_CARD_WIDTH).toBe(480)
    expect(DEFAULT_CARD_WIDTH).toBe(240)
  })
})
```

- [ ] **Step 2: Run test (FAIL)**

Run: `rtk pnpm vitest run lib/board/size-migration.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement helpers**

```ts
// lib/board/size-migration.ts
export const MIN_CARD_WIDTH = 80
export const MAX_CARD_WIDTH = 480
export const DEFAULT_CARD_WIDTH = 240

export type LegacyPreset = 'S' | 'M' | 'L'

const PRESET_TO_WIDTH: Readonly<Record<LegacyPreset, number>> = {
  S: 160,
  M: 240,
  L: 320,
}

export function presetToCardWidth(preset: LegacyPreset | undefined): number {
  if (preset === undefined) return DEFAULT_CARD_WIDTH
  return PRESET_TO_WIDTH[preset]
}

export function clampCardWidth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CARD_WIDTH
  if (value < MIN_CARD_WIDTH) return MIN_CARD_WIDTH
  if (value > MAX_CARD_WIDTH) return MAX_CARD_WIDTH
  return value
}
```

- [ ] **Step 4: Run test (PASS)**

Run: `rtk pnpm vitest run lib/board/size-migration.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
rtk git add lib/board/size-migration.ts lib/board/size-migration.test.ts
rtk git commit -m "feat(board): size-migration helpers (S/M/L → cardWidth)"
```

### Task 1B.3: Extend column-masonry to accept per-card targetWidth

**Files:**
- Modify: `lib/board/column-masonry.ts`
- Modify: `lib/board/column-masonry.test.ts` (if exists; create if missing)

- [ ] **Step 1: Add failing test for new field**

In `lib/board/column-masonry.test.ts` (create if missing — or amend nearest existing test file), add:

```ts
import { describe, it, expect } from 'vitest'
import { computeColumnMasonry } from './column-masonry'

describe('computeColumnMasonry — targetWidth', () => {
  it('uses per-card targetWidth to pick the column count, falls back to columnSpan', () => {
    const result = computeColumnMasonry({
      cards: [
        { id: 'a', aspectRatio: 1, columnSpan: 1, targetWidth: 160 },
        { id: 'b', aspectRatio: 1, columnSpan: 1, targetWidth: 160 },
      ],
      containerWidth: 1000,
      gap: 16,
      targetColumnUnit: 160, // matches targetWidth
    })
    // 1000 wide / (160 + 16) = ~5 columns; both cards width ~160ish
    const a = result.positions['a']
    expect(a.w).toBeGreaterThan(140)
    expect(a.w).toBeLessThan(200)
  })
})
```

- [ ] **Step 2: Run test (FAIL — `targetWidth` not part of MasonryCard)**

Run: `rtk pnpm vitest run lib/board/column-masonry.test.ts`
Expected: TypeScript error about unknown property.

- [ ] **Step 3: Modify MasonryCard type**

In `lib/board/column-masonry.ts`, replace the `MasonryCard` type with:

```ts
export type MasonryCard = {
  readonly id: string
  readonly aspectRatio: number
  /**
   * Legacy: 1 = S, 2 = M, 3 = L. Kept so existing call sites compile.
   * Will be ignored if `targetWidth` is provided.
   */
  readonly columnSpan: number
  /**
   * Continuous target width in pixels. When provided, the algorithm picks
   * the column count nearest to (containerWidth + gap) / (targetWidth + gap).
   * Falls back to columnSpan when undefined (legacy callers).
   */
  readonly targetWidth?: number
  readonly intrinsicHeight?: number
}
```

For now do **not** change the algorithm — keep it span-based. The continuous behavior is wired in the next step.

- [ ] **Step 4: Run test (still FAIL but for a different reason — width assertion)**

Run: `rtk pnpm vitest run lib/board/column-masonry.test.ts`
Expected: FAIL on the width assertion (column unit isn't using targetWidth yet).

- [ ] **Step 5: Implement targetWidth-aware sizing**

In `lib/board/column-masonry.ts`, modify the inside of the `for (const card of cards)` loop. Replace the existing block computing `width` and `span` with:

```ts
for (const card of cards) {
  // Choose effective span: prefer targetWidth-derived span, else legacy columnSpan.
  let effectiveSpan: number
  if (typeof card.targetWidth === 'number' && card.targetWidth > 0) {
    // Pick the integer span so span * columnUnit ≈ targetWidth.
    const slotW = columnUnit + gap
    effectiveSpan = Math.max(1, Math.round((card.targetWidth + gap) / slotW))
  } else {
    effectiveSpan = card.columnSpan
  }
  const span = Math.max(1, Math.min(effectiveSpan, columnCount))

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
  const height = card.intrinsicHeight && card.intrinsicHeight > 0
    ? card.intrinsicHeight
    : card.aspectRatio > 0 ? width / card.aspectRatio : width
  const x = bestStartCol * (columnUnit + gap)
  const y = bestTop

  positions[card.id] = { x, y, w: width, h: height }

  for (let c = bestStartCol; c < bestStartCol + span; c++) {
    columnBottoms[c] = y + height + gap
  }
}
```

- [ ] **Step 6: Run test (PASS)**

Run: `rtk pnpm vitest run lib/board/column-masonry.test.ts`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
rtk git add lib/board/column-masonry.ts lib/board/column-masonry.test.ts
rtk git commit -m "feat(board): column-masonry accepts per-card targetWidth"
```

### Task 1B.4: BoardItem.cardWidth + IndexedDB migration v8 → v9

**Files:**
- Modify: `lib/storage/indexeddb.ts`
- Modify: `lib/storage/use-board-data.ts`
- Modify: `tests/lib/indexeddb.test.ts`

- [ ] **Step 1: Add failing migration test**

Open `tests/lib/indexeddb.test.ts`. Append:

```ts
import { presetToCardWidth } from '@/lib/board/size-migration'

describe('IndexedDB v8 → v9 migration', () => {
  it('seeds cardWidth from sizePreset for existing records', async () => {
    // The exact harness depends on existing test setup. Pattern:
    // - Open DB at v8 with one record { sizePreset: 'M', ... }
    // - Close + reopen at v9 (current)
    // - Read the record; assert cardWidth === 240
    //
    // If the existing test file has no v8 setup helper, add a minimal one
    // following the harness already used elsewhere in this file.
    // ...
  })
})
```

(Implementation of this test depends on existing IndexedDB test helpers. If the harness is non-trivial, leave the implementation-detail call to the executing agent — they have the existing patterns in scope.)

- [ ] **Step 2: Bump DB schema version + add migration**

In `lib/storage/indexeddb.ts`, find the `BookmarkRecord` interface and add a new field:

```ts
export interface BookmarkRecord {
  // ... existing fields
  /** Continuous size in CSS pixels. Replaces sizePreset. */
  readonly cardWidth?: number
  /** @deprecated kept for migration compatibility — use cardWidth */
  readonly sizePreset?: 'S' | 'M' | 'L'
}
```

Find the `openDB` call (or equivalent) which has `upgrade` callback. The current schema is at v8 (per existing `// ── v7 → v8` comment). Bump to v9 and add a new branch:

```ts
// inside upgrade(db, oldVersion, newVersion, transaction):
if (oldVersion < 9) {
  // ── v8 → v9: cardWidth seeded from sizePreset
  const tx = transaction
  const store = tx.objectStore('bookmarks')
  const cursor = await store.openCursor()
  // Walk all records (idb cursor pattern — use the existing iteration style in the file)
  // For each record, set cardWidth = presetToCardWidth(record.sizePreset).
  // Pseudocode (adapt to existing cursor style):
  //   while (cursor) {
  //     const record = cursor.value
  //     if (record.cardWidth === undefined) {
  //       const next = { ...record, cardWidth: presetToCardWidth(record.sizePreset) }
  //       await cursor.update(next)
  //     }
  //     cursor = await cursor.continue()
  //   }
}
```

Add `import { presetToCardWidth } from '@/lib/board/size-migration'` at the top.

Bump the `openDB('booklage', 8, ...)` call → `openDB('booklage', 9, ...)`.

Also: in any place that creates a new bookmark record (e.g. line 471, line 733 per the grep), add `cardWidth: 240` alongside `sizePreset: 'S'`.

- [ ] **Step 3: Update `updateBookmarkSizePreset` to also write cardWidth, and add `updateBookmarkCardWidth`**

In `lib/storage/indexeddb.ts`, near the existing `updateBookmarkSizePreset`:

```ts
import { clampCardWidth, MIN_CARD_WIDTH, MAX_CARD_WIDTH } from '@/lib/board/size-migration'

export async function updateBookmarkCardWidth(
  db: BooklageDB,
  bookmarkId: string,
  cardWidth: number,
): Promise<void> {
  const existing = await db.get('bookmarks', bookmarkId)
  if (!existing) return
  await db.put('bookmarks', { ...existing, cardWidth: clampCardWidth(cardWidth) })
}
```

Keep `updateBookmarkSizePreset` for now (we'll remove it in Task 1B.5).

- [ ] **Step 4: Extend BoardItem in use-board-data.ts**

In `lib/storage/use-board-data.ts`:

- Replace `readonly sizePreset: 'S' | 'M' | 'L'` with `readonly cardWidth: number`.
- Find `sizePreset: b.sizePreset ?? 'S'` (line 97 per grep) — change to:
  ```ts
  cardWidth: typeof b.cardWidth === 'number' ? b.cardWidth : presetToCardWidth(b.sizePreset),
  ```
- Replace `persistSizePreset` (line 114, 232) with `persistCardWidth`:
  ```ts
  persistCardWidth: (bookmarkId: string, cardWidth: number) => Promise<void>
  ```
  And the implementation:
  ```ts
  async (bookmarkId: string, cardWidth: number): Promise<void> => {
    const clamped = clampCardWidth(cardWidth)
    setItems((prev) =>
      prev.map((it) => (it.bookmarkId === bookmarkId ? { ...it, cardWidth: clamped } : it)),
    )
    const db = await initDB()
    await updateBookmarkCardWidth(db, bookmarkId, clamped)
  },
  ```
- Add imports: `import { clampCardWidth, presetToCardWidth } from '@/lib/board/size-migration'` and `import { updateBookmarkCardWidth } from './indexeddb'`.

- [ ] **Step 5: Run all tests**

Run: `rtk pnpm vitest run`
Expected: all green (some tests may need follow-up edits — fix as compile errors surface).

Run: `rtk pnpm tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
rtk git add lib/storage/indexeddb.ts lib/storage/use-board-data.ts tests/lib/indexeddb.test.ts
rtk git commit -m "feat(storage): cardWidth field + v8→v9 migration"
```

### Task 1B.5: Update callers — BoardRoot, CardsLayer, ShareFrame

**Files:**
- Modify: `components/board/BoardRoot.tsx`
- Modify: `components/board/CardsLayer.tsx`
- Modify: `components/share/ShareFrame.tsx`
- Modify: `lib/share/composer-layout.ts` (if it builds MasonryCard)
- Modify: `lib/share/board-to-cards.ts`
- Modify: `components/board/use-card-reorder-drag.ts` (if uses sizePreset)

- [ ] **Step 1: Replace `sizePreset` reads with `cardWidth` in BoardRoot.tsx**

Search for all occurrences of `sizePreset` in `components/board/BoardRoot.tsx`:
- Where building MasonryCard, set `targetWidth: it.cardWidth` instead of `columnSpan: SIZE_PRESET_SPAN[it.sizePreset]`
- Where calling `persistSizePreset`, replace with `persistCardWidth` (signature change: `(id, number)` instead of `(id, 'S'|'M'|'L')`)

- [ ] **Step 2: Update CardsLayer.tsx similarly**

Find the `persistSizePreset` call and per-card sizing logic. Replace with `persistCardWidth`. Remove any `<SizePresetToggle>` rendering.

- [ ] **Step 3: Update ShareFrame.tsx**

Remove `<SizePresetToggle>` import + usage entirely. The hover-to-cycle-size feature is gone (covered by global slider in main board). The `onCycleSize` prop becomes optional but unused — leave the prop for now to avoid cascading changes; confirm by tsc.

- [ ] **Step 4: Update lib/share/composer-layout.ts**

In `composer-layout.ts`, find where it passes `columnSpan: SIZE_PRESET_SPAN[sizeOverrides.get(...) ?? it.sizePreset]`. Adapt: composer items now carry `cardWidth: number` (a `ComposerItem.sizePreset` is still in use for the share data; keep it but seed from cardWidth using a width-to-preset reverse map for now — the receiving side and PNG export still encode S/M/L for compactness):

```ts
function widthToPreset(w: number): 'S' | 'M' | 'L' {
  if (w < 200) return 'S'
  if (w < 280) return 'M'
  return 'L'
}
```

Use `widthToPreset(it.cardWidth)` to derive the preset for ShareCard.s (the size byte transmitted).

- [ ] **Step 5: Update lib/share/board-to-cards.ts**

If any function reads `BoardItem.sizePreset`, change to derive via `widthToPreset(boardItem.cardWidth)` or add a similar local helper.

- [ ] **Step 6: Run tsc + vitest**

Run: `rtk pnpm tsc --noEmit`
Expected: 0 errors.

Run: `rtk pnpm vitest run`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
rtk git add -A
rtk git commit -m "feat(board): wire cardWidth through BoardRoot / CardsLayer / share"
```

### Task 1B.6: SizeSlider component

**Files:**
- Create: `components/board/SizeSlider.tsx`
- Create: `components/board/SizeSlider.module.css`
- Create: `components/board/SizeSlider.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// components/board/SizeSlider.test.tsx
import { render, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SizeSlider } from './SizeSlider'

describe('SizeSlider', () => {
  it('renders the current value as a 4-digit padded readout', () => {
    const { getByTestId } = render(
      <SizeSlider value={240} onChange={() => {}} />,
    )
    expect(getByTestId('size-slider-readout').textContent).toContain('0240')
  })

  it('calls onChange with clamped value when the input changes', () => {
    const onChange = vi.fn()
    const { getByRole } = render(<SizeSlider value={240} onChange={onChange} />)
    const range = getByRole('slider')
    fireEvent.change(range, { target: { value: '999' } })
    // 999 clamps to MAX = 480
    expect(onChange).toHaveBeenCalledWith(480)
  })
})
```

- [ ] **Step 2: Implement**

```tsx
// components/board/SizeSlider.tsx
'use client'

import type { ChangeEvent, ReactElement } from 'react'
import { MIN_CARD_WIDTH, MAX_CARD_WIDTH, clampCardWidth } from '@/lib/board/size-migration'
import { WaveformTrack } from './WaveformTrack'
import styles from './SizeSlider.module.css'

type Props = {
  readonly value: number
  readonly onChange: (next: number) => void
}

function pad4(n: number): string {
  return Math.max(0, Math.min(9999, Math.floor(n))).toString().padStart(4, '0')
}

export function SizeSlider({ value, onChange }: Props): ReactElement {
  const progress = (value - MIN_CARD_WIDTH) / (MAX_CARD_WIDTH - MIN_CARD_WIDTH)
  const handleChange = (e: ChangeEvent<HTMLInputElement>): void => {
    onChange(clampCardWidth(Number(e.target.value)))
  }
  return (
    <label className={styles.wrap}>
      <span className={styles.label}>SIZE</span>
      <div className={styles.trackHost}>
        <WaveformTrack barCount={40} progress={progress} seed={2} />
        <input
          type="range"
          min={MIN_CARD_WIDTH}
          max={MAX_CARD_WIDTH}
          step={1}
          value={value}
          onChange={handleChange}
          className={styles.range}
          aria-label="Card size"
        />
      </div>
      <span className={styles.readout} data-testid="size-slider-readout">
        [ {pad4(value)}px ]
      </span>
    </label>
  )
}
```

- [ ] **Step 3: Add CSS**

```css
/* components/board/SizeSlider.module.css */
.wrap {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: ui-monospace, Menlo, monospace;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
}

.label {
  letter-spacing: 0.12em;
  user-select: none;
}

.trackHost {
  position: relative;
  width: 120px;
  height: 18px;
}

.range {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  margin: 0;
}

.readout {
  color: rgba(255, 255, 255, 0.85);
  letter-spacing: 0.06em;
  min-width: 78px;
  text-align: right;
}
```

- [ ] **Step 4: Test passes**

Run: `rtk pnpm vitest run components/board/SizeSlider.test.tsx`
Expected: 2 passed.

- [ ] **Step 5: Wire into TopHeader instrument slot**

In `components/board/BoardRoot.tsx`, replace the `instrument={null}` prop with:

```tsx
instrument={
  <SizeSlider
    value={globalCardWidth}
    onChange={setGlobalCardWidth}
  />
}
```

Add state at the top of `BoardRoot`:

```tsx
const [globalCardWidth, setGlobalCardWidth] = useState<number>(DEFAULT_CARD_WIDTH)
```

Add `import { DEFAULT_CARD_WIDTH } from '@/lib/board/size-migration'`.

Note: this slider currently sets per-card uniformly via a separate handler that we add next. For this task, the slider is wired but does not yet apply globally — connect in Task 1B.7.

- [ ] **Step 6: Commit**

```bash
rtk git add components/board/SizeSlider.tsx components/board/SizeSlider.module.css components/board/SizeSlider.test.tsx components/board/BoardRoot.tsx
rtk git commit -m "feat(board): SizeSlider wired into TopHeader"
```

### Task 1B.7: Apply global cardWidth to all cards

**Files:**
- Modify: `components/board/BoardRoot.tsx`
- Modify: `lib/storage/use-board-data.ts` — add `persistCardWidthBatch` if not present

- [ ] **Step 1: Add `persistCardWidthBatch` to use-board-data.ts**

Mirror the existing `persistOrderBatch` pattern. Function signature:

```ts
persistCardWidthBatch: (bookmarkIds: ReadonlyArray<string>, cardWidth: number) => Promise<void>
```

Implementation: optimistic state update for all listed ids, then DB write per id (or single transaction if available).

- [ ] **Step 2: In BoardRoot, on slider change, apply to all currently-filtered items**

```tsx
const onCardWidthChange = useCallback((next: number) => {
  setGlobalCardWidth(next)
  // Apply uniformly to all items currently in scope (the filtered set the user sees)
  void persistCardWidthBatch(filteredItems.map((i) => i.bookmarkId), next)
}, [filteredItems, persistCardWidthBatch])
```

Pass `onCardWidthChange` instead of `setGlobalCardWidth` to the slider.

- [ ] **Step 3: Run dev + manual test**

Run: `rtk pnpm dev`
Drag the slider. Expected: all cards visibly resize together; on reload, sizes persist.

- [ ] **Step 4: tsc + vitest**

Run: `rtk pnpm tsc --noEmit && rtk pnpm vitest run`
Expected: 0 errors, all green.

- [ ] **Step 5: Commit**

```bash
rtk git add -A
rtk git commit -m "feat(board): SizeSlider applies globally to all visible cards"
```

### Task 1B.8: Delete SizePresetToggle

**Files:**
- Delete: `components/board/SizePresetToggle.tsx`
- Delete: `components/board/SizePresetToggle.module.css`

- [ ] **Step 1: Confirm no remaining imports**

Run: `rtk grep -r "SizePresetToggle" .`
Expected: only docs / specs / planning files match. If any code file matches, remove the usage first.

- [ ] **Step 2: Delete**

```bash
rm components/board/SizePresetToggle.tsx
rm components/board/SizePresetToggle.module.css
```

- [ ] **Step 3: Commit**

```bash
rtk git add -A
rtk git commit -m "chore(board): remove SizePresetToggle (replaced by global SizeSlider)"
```

### Task 1B.9: Sub-phase 1B deploy gate

- [ ] **Step 1: Full test + build**

Run: `rtk pnpm tsc --noEmit && rtk pnpm vitest run`
Expected: green.

- [ ] **Step 2: Deploy**

```bash
rtk pnpm build
npx wrangler pages deploy out/ --project-name=booklage --branch=master --commit-dirty=true
```

Notify user: "1B shipped — please hard-reload, drag the size slider, confirm cards resize smoothly."

---

## Sub-Phase 1C: Board Zoom Slider

Add CSS-transform-based zoom 50-200%. Pointer events divide by zoom for hit testing.

### Task 1C.1: ZoomSlider component

**Files:**
- Create: `components/board/ZoomSlider.tsx`
- Create: `components/board/ZoomSlider.module.css`
- Create: `components/board/ZoomSlider.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// components/board/ZoomSlider.test.tsx
import { render, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ZoomSlider } from './ZoomSlider'

describe('ZoomSlider', () => {
  it('renders percent readout', () => {
    const { getByTestId } = render(<ZoomSlider value={1} onChange={() => {}} />)
    expect(getByTestId('zoom-slider-readout').textContent).toContain('100%')
  })

  it('clamps onChange to [0.5, 2.0]', () => {
    const onChange = vi.fn()
    const { getByRole } = render(<ZoomSlider value={1} onChange={onChange} />)
    fireEvent.change(getByRole('slider'), { target: { value: '5' } })
    expect(onChange).toHaveBeenCalledWith(2.0)
  })
})
```

- [ ] **Step 2: Implement**

```tsx
// components/board/ZoomSlider.tsx
'use client'

import type { ChangeEvent, ReactElement } from 'react'
import { WaveformTrack } from './WaveformTrack'
import styles from './ZoomSlider.module.css'

export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 2.0

type Props = {
  readonly value: number
  readonly onChange: (next: number) => void
}

function clamp(v: number): number {
  if (!Number.isFinite(v)) return 1
  if (v < MIN_ZOOM) return MIN_ZOOM
  if (v > MAX_ZOOM) return MAX_ZOOM
  return v
}

export function ZoomSlider({ value, onChange }: Props): ReactElement {
  const progress = (value - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)
  const handle = (e: ChangeEvent<HTMLInputElement>): void => {
    onChange(clamp(Number(e.target.value)))
  }
  const pct = Math.round(value * 100)
  return (
    <label className={styles.wrap}>
      <span className={styles.label}>ZOOM</span>
      <div className={styles.trackHost}>
        <WaveformTrack barCount={40} progress={progress} seed={3} />
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          value={value}
          onChange={handle}
          className={styles.range}
          aria-label="Board zoom"
        />
      </div>
      <span className={styles.readout} data-testid="zoom-slider-readout">
        [ {String(pct).padStart(3, '0')}% ]
      </span>
    </label>
  )
}
```

- [ ] **Step 3: CSS**

```css
/* components/board/ZoomSlider.module.css */
.wrap {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: ui-monospace, Menlo, monospace;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
}
.label { letter-spacing: 0.12em; user-select: none; }
.trackHost { position: relative; width: 120px; height: 18px; }
.range { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; margin: 0; }
.readout { color: rgba(255, 255, 255, 0.85); letter-spacing: 0.06em; min-width: 56px; text-align: right; }
```

- [ ] **Step 4: Test PASS**

Run: `rtk pnpm vitest run components/board/ZoomSlider.test.tsx`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
rtk git add components/board/ZoomSlider.tsx components/board/ZoomSlider.module.css components/board/ZoomSlider.test.tsx
rtk git commit -m "feat(board): ZoomSlider component"
```

### Task 1C.2: Apply zoom transform to canvas

**Files:**
- Modify: `components/board/BoardRoot.tsx`
- Modify: `components/board/CardsLayer.tsx`
- Modify: `components/board/InteractionLayer.tsx`

- [ ] **Step 1: Add zoom state in BoardRoot, render ZoomSlider in TopHeader**

In `components/board/BoardRoot.tsx`:

```tsx
const [zoom, setZoom] = useState<number>(1)
```

Update the TopHeader's `instrument` prop to include both sliders:

```tsx
instrument={
  <>
    <SizeSlider value={globalCardWidth} onChange={onCardWidthChange} />
    <ZoomSlider value={zoom} onChange={setZoom} />
  </>
}
```

- [ ] **Step 2: Apply transform on the cards container**

Find the JSX that wraps cards (likely the `CardsLayer` parent or the `canvasRef` div). Add a wrapper with `transform: scale(zoom)` and `transform-origin: 0 0`:

```tsx
<div
  className={styles.zoomLayer}
  style={{ transform: `scale(${zoom})`, transformOrigin: '0 0' }}
>
  {/* existing cards / interaction children */}
</div>
```

In the corresponding CSS module, ensure `.zoomLayer { width: 100%; height: 100%; }` and that the parent has `overflow: hidden` (already true).

- [ ] **Step 3: Adjust pointer event coords**

In `components/board/CardsLayer.tsx`, find where pointer events translate `event.clientX/Y` → world coords (likely via `getBoundingClientRect` of the canvas + viewport offset). Divide the relative coords by `zoom` before passing into the masonry/click logic:

```ts
const rawX = e.clientX - rect.left
const rawY = e.clientY - rect.top
const worldX = rawX / zoom + viewport.x
const worldY = rawY / zoom + viewport.y
```

(Adapt to existing variable names. The key transform: divide screen-relative offsets by `zoom`.) Pass `zoom` as a prop down from BoardRoot.

Repeat in `components/board/InteractionLayer.tsx` for pan / drag handlers — same divide-by-zoom rule for clientX/Y deltas.

- [ ] **Step 4: tsc + vitest**

Run: `rtk pnpm tsc --noEmit && rtk pnpm vitest run`
Expected: green.

- [ ] **Step 5: Manual smoke**

Run: `rtk pnpm dev`. On `/board`:
- Drag zoom slider 50% → 200%. Cards visibly scale.
- Click a card at any zoom — Lightbox opens (no offset).
- Drag-reorder a card at zoom 1.5 — drop lands where expected.

- [ ] **Step 6: Commit**

```bash
rtk git add -A
rtk git commit -m "feat(board): board-wide zoom 50-200% via CSS transform"
```

### Task 1C.3: Sub-phase 1C deploy gate

- [ ] **Step 1: Full check + deploy**

```bash
rtk pnpm tsc --noEmit && rtk pnpm vitest run
rtk pnpm build
npx wrangler pages deploy out/ --project-name=booklage --branch=master --commit-dirty=true
```

Notify user: "1C shipped — please hard-reload, drag zoom 50→200%, confirm clicks land correctly."

---

## Sub-Phase 1D: View Dropdown + Theme Foundation

Replace `DisplayModeSwitch` with a unified `ViewDropdown` covering display mode + theme. Foundation only — only `waveform` theme exists.

### Task 1D.1: Theme types + state hook

**Files:**
- Create: `lib/theme/types.ts`
- Create: `lib/theme/use-theme.ts`
- Create: `lib/theme/use-theme.test.ts`

- [ ] **Step 1: Create types**

```ts
// lib/theme/types.ts
export type ThemeId = 'waveform' | 'liquid-glass' | 'sf-military' | 'editorial'
export const DEFAULT_THEME: ThemeId = 'waveform'

export type ThemeMeta = {
  readonly id: ThemeId
  readonly label: string
  readonly disabled: boolean
}

export const THEMES: ReadonlyArray<ThemeMeta> = [
  { id: 'waveform',     label: 'Waveform',     disabled: false },
  { id: 'liquid-glass', label: 'Liquid Glass', disabled: true  },
  { id: 'sf-military',  label: 'SF / Military',disabled: true  },
  { id: 'editorial',    label: 'Editorial',    disabled: true  },
]
```

- [ ] **Step 2: Failing test for useTheme**

```ts
// lib/theme/use-theme.test.ts
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTheme } from './use-theme'

describe('useTheme', () => {
  it('starts with default theme = waveform', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('waveform')
  })

  it('setTheme updates current value', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setTheme('liquid-glass'))
    expect(result.current.theme).toBe('liquid-glass')
  })
})
```

- [ ] **Step 3: Implement hook (without IndexedDB persistence yet — just in-memory state)**

```ts
// lib/theme/use-theme.ts
'use client'

import { useEffect, useState } from 'react'
import { DEFAULT_THEME, type ThemeId } from './types'

const STORAGE_KEY = 'booklage:theme'

export function useTheme(): { theme: ThemeId; setTheme: (id: ThemeId) => void } {
  const [theme, setThemeInternal] = useState<ThemeId>(DEFAULT_THEME)

  // Load on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved === 'waveform' || saved === 'liquid-glass' || saved === 'sf-military' || saved === 'editorial') {
      setThemeInternal(saved)
    }
  }, [])

  // Apply data-theme attribute + persist on change
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.setAttribute('data-theme', theme)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, theme)
    }
  }, [theme])

  return { theme, setTheme: setThemeInternal }
}
```

(Per CLAUDE.md the project prefers IndexedDB over localStorage for data — but theme is a single-key UI preference and IndexedDB overhead is overkill here. localStorage is acceptable for this. If this ever needs cross-device sync, revisit.)

- [ ] **Step 4: Run test (PASS)**

Run: `rtk pnpm vitest run lib/theme/use-theme.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
rtk git add lib/theme/
rtk git commit -m "feat(theme): theme types + useTheme hook (waveform default)"
```

### Task 1D.2: ViewDropdown component

**Files:**
- Create: `components/board/ViewDropdown.tsx`
- Create: `components/board/ViewDropdown.module.css`
- Create: `components/board/ViewDropdown.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
// components/board/ViewDropdown.test.tsx
import { render, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ViewDropdown } from './ViewDropdown'

describe('ViewDropdown', () => {
  it('opens menu on click', () => {
    const { getByTestId, queryByTestId } = render(
      <ViewDropdown
        displayMode="visual"
        onDisplayModeChange={() => {}}
        theme="waveform"
        onThemeChange={() => {}}
      />,
    )
    expect(queryByTestId('view-dropdown-menu')).toBeNull()
    fireEvent.click(getByTestId('view-dropdown-trigger'))
    expect(getByTestId('view-dropdown-menu')).toBeTruthy()
  })

  it('disables non-default themes', () => {
    const onTheme = vi.fn()
    const { getByText, getByTestId } = render(
      <ViewDropdown
        displayMode="visual"
        onDisplayModeChange={() => {}}
        theme="waveform"
        onThemeChange={onTheme}
      />,
    )
    fireEvent.click(getByTestId('view-dropdown-trigger'))
    fireEvent.click(getByText('Liquid Glass'))
    expect(onTheme).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Implement**

```tsx
// components/board/ViewDropdown.tsx
'use client'

import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { DisplayMode } from '@/lib/board/types'
import { THEMES, type ThemeId } from '@/lib/theme/types'
import styles from './ViewDropdown.module.css'

type Props = {
  readonly displayMode: DisplayMode
  readonly onDisplayModeChange: (m: DisplayMode) => void
  readonly theme: ThemeId
  readonly onThemeChange: (t: ThemeId) => void
}

const DISPLAY_MODES: ReadonlyArray<{ id: DisplayMode; label: string; disabled: boolean }> = [
  { id: 'visual',    label: 'Collage',  disabled: false },
  { id: 'editorial', label: 'Grid',     disabled: true  },
  { id: 'native',    label: 'Timeline', disabled: true  },
]

export function ViewDropdown({ displayMode, onDisplayModeChange, theme, onThemeChange }: Props): ReactElement {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent): void => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return (): void => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="view-dropdown-trigger"
      >
        <span className={styles.bracket}>[</span>
        <span className={styles.label}>VIEW</span>
        <span className={styles.bracket}>▾]</span>
      </button>
      {open && (
        <div className={styles.menu} role="menu" data-testid="view-dropdown-menu">
          <div className={styles.section}>Display Mode</div>
          {DISPLAY_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`${styles.item} ${displayMode === m.id ? styles.active : ''}`.trim()}
              onClick={() => { if (!m.disabled) { onDisplayModeChange(m.id); setOpen(false) } }}
              disabled={m.disabled}
            >
              {m.label}
              {m.disabled && <span className={styles.soon}>soon</span>}
            </button>
          ))}
          <div className={styles.section}>Theme</div>
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`${styles.item} ${theme === t.id ? styles.active : ''}`.trim()}
              onClick={() => { if (!t.disabled) { onThemeChange(t.id); setOpen(false) } }}
              disabled={t.disabled}
            >
              {t.label}
              {t.disabled && <span className={styles.soon}>soon</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: CSS**

```css
/* components/board/ViewDropdown.module.css */
.wrap {
  position: relative;
  display: inline-block;
}

.trigger {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.10);
  padding: 6px 10px;
  border-radius: 999px;
  cursor: pointer;
  font-family: inherit;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.trigger:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.18);
}

.bracket {
  font-family: ui-monospace, Menlo, monospace;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  letter-spacing: 0.06em;
}

.label {
  font-size: 12px;
  letter-spacing: 0.04em;
  color: rgba(255, 255, 255, 0.92);
  text-transform: uppercase;
}

.menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 200px;
  background: #0a0a0a;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  padding: 6px;
  z-index: 200;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
}

.section {
  font-family: ui-monospace, Menlo, monospace;
  font-size: 10px;
  letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  padding: 8px 10px 4px;
}

.item {
  display: flex;
  align-items: center;
  width: 100%;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.85);
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  border-radius: 6px;
}

.item:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
}

.item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.item.active {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

.soon {
  margin-left: auto;
  font-size: 10px;
  font-family: ui-monospace, Menlo, monospace;
  color: rgba(255, 255, 255, 0.35);
  letter-spacing: 0.04em;
  text-transform: lowercase;
}
```

- [ ] **Step 4: Test PASS**

Run: `rtk pnpm vitest run components/board/ViewDropdown.test.tsx`
Expected: 2 passed.

- [ ] **Step 5: Wire into BoardRoot**

In `components/board/BoardRoot.tsx`:
- Replace any remaining `DisplayModeSwitch` references with the dropdown.
- Add `import { useTheme } from '@/lib/theme/use-theme'` and `const { theme, setTheme } = useTheme()`.
- Update TopHeader actions:

```tsx
actions={
  <>
    <ViewDropdown
      displayMode={displayMode}
      onDisplayModeChange={setDisplayMode}
      theme={theme}
      onThemeChange={setTheme}
    />
    <button
      type="button"
      className={styles.sharePill}
      onClick={() => setShareComposerOpen(true)}
      data-testid="share-pill"
    >
      Share ↗
    </button>
  </>
}
```

- [ ] **Step 6: Delete `DisplayModeSwitch` if unused elsewhere**

Run: `rtk grep -r "DisplayModeSwitch" .` to confirm no remaining usages outside the deleted Toolbar / planning docs. If only docs match, delete:

```bash
rm components/board/DisplayModeSwitch.tsx
rm components/board/DisplayModeSwitch.module.css 2>/dev/null
```

- [ ] **Step 7: tsc + vitest**

Run: `rtk pnpm tsc --noEmit && rtk pnpm vitest run`
Expected: green.

- [ ] **Step 8: Commit**

```bash
rtk git add -A
rtk git commit -m "feat(board): ViewDropdown — display mode + theme picker"
```

### Task 1D.3: Sub-phase 1D deploy gate

- [ ] **Step 1: Build + deploy**

```bash
rtk pnpm tsc --noEmit && rtk pnpm vitest run
rtk pnpm build
npx wrangler pages deploy out/ --project-name=booklage --branch=master --commit-dirty=true
```

Notify user: "1D shipped — board chrome redesign (Phase 1) complete. Confirm View dropdown, theme persists across reload."

---

## Final Checklist

- [ ] All 4 sub-phases shipped to production
- [ ] `tsc --noEmit` clean
- [ ] All vitest + Playwright tests pass
- [ ] `docs/TODO.md` updated to log Phase 1 completion + reference next phases (Liquid Glass theme, share modal MVP)
- [ ] Memory record updated: add a new entry capturing the new design language ("waveform aesthetic") and that themes are now active design slots
