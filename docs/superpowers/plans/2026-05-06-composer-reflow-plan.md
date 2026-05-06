# Composer Reflow + 編集レイヤー Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan A 残り item 2 を完成させる。Composer の中央 frame 真っ黒バグを解消し、アスペクト切替で reflow するようにし、board と完全パリティな編集レイヤー (drag reorder / S/M/L 循環 / 右クリック削除) を追加する。

**Architecture:** 新規モジュール `lib/share/composer-layout.ts` (pure function) で frame サイズ基準の column-masonry + auto-shrink + 縦中央寄せを実行し、ShareCard[] を返す。ShareComposer は内部 state (cardOrder, sizeOverrides) を持ち、編集操作で state を mutate して composer-layout を再呼び出し。ShareFrame は editable=true のとき drag / sizecycle / contextmenu の affordance を mount。Composer は board state に副作用なし (isolation 保証)。

**Tech Stack:** TypeScript strict, React 19, Next.js 16, vitest 4, playwright 1.59, vanilla CSS modules. 既存 `computeColumnMasonry`, `SizePresetToggle`, `computeAspectFrameSize` を流用、新規フック `useShareReorderDrag` を frame-local 座標用に書く。

**Spec:** [docs/superpowers/specs/2026-05-06-composer-reflow-design.md](../specs/2026-05-06-composer-reflow-design.md)

**Branch:** master 単一運用 (memory `feedback_no_worktrees.md`)

**Commit style:** `feat(share): ...` / `test(share): ...` / `fix(share): ...` (recent commits parity)

---

## File Structure

| Path | Status | Responsibility |
|------|--------|----------------|
| `lib/share/composer-layout.ts` | Create | Pure function: items + order + sizeOverrides + aspect → ShareCard[] (frame-fit + auto-shrink + 縦中央寄せ + 0..1 normalize) |
| `lib/share/composer-layout.test.ts` | Create | Unit tests covering layout / shrink / centering / order / sizeOverrides |
| `components/share/use-share-reorder-drag.ts` | Create | Frame-local drag hook: pointerdown → drag → drop → onReorder(orderedIds) |
| `components/share/ShareComposer.tsx` | Modify | Add cardOrder + sizeOverrides state; replace `boardItemsToShareCards` with `composeShareLayout`; wire edit handlers to ShareFrame |
| `components/share/ShareFrame.tsx` | Modify | Add editable affordances (drag / SizePresetToggle / contextmenu) and onCardOpen for receiving side; new props for cardIds/onReorder/onCycleSize/onDelete/onCardOpen |
| `components/share/ShareFrame.module.css` | Modify | hover-revealed SizePresetToggle positioning, cursor + scale on viewer side, drag ghost styling |
| `components/share/SharedView.tsx` | Modify | Pass `onCardOpen` that calls `window.open(c.u, '_blank', 'noopener,noreferrer')` |
| `components/board/BoardRoot.tsx` | Modify | Add `aspectRatio` to BoardItemLite payload passed to ShareComposer |
| `tests/e2e/share-composer-edit.spec.ts` | Create | E2E coverage for composer edit flow (open → reorder → resize → delete → aspect switch → confirm) |
| `lib/share/board-to-cards.ts` | Keep | Retained for backward compat; ShareComposer no longer calls it but `filterByViewport` is still used |

---

## Task 1: Create `composer-layout.ts` skeleton with first unit test (free-aspect, 3 cards)

**Files:**
- Create: `lib/share/composer-layout.ts`
- Create: `lib/share/composer-layout.test.ts`

- [ ] **Step 1: Write the failing test for basic layout**

Create `lib/share/composer-layout.test.ts`:

```typescript
// lib/share/composer-layout.test.ts
import { describe, it, expect } from 'vitest'
import { composeShareLayout } from './composer-layout'

const item = (id: string, opts: Partial<{ aspectRatio: number; sizePreset: 'S' | 'M' | 'L' }> = {}) => ({
  bookmarkId: id,
  url: `https://example.com/${id}`,
  title: `t-${id}`,
  description: '',
  thumbnail: '',
  type: 'website' as const,
  sizePreset: opts.sizePreset ?? ('S' as const),
  aspectRatio: opts.aspectRatio ?? 1,
})

describe('composeShareLayout', () => {
  it('produces normalized 0..1 coords for 3 simple cards in free aspect', () => {
    const items = [item('a'), item('b'), item('c')]
    const result = composeShareLayout({
      items,
      order: ['a', 'b', 'c'],
      sizeOverrides: new Map(),
      aspect: 'free',
      viewport: { width: 1080, height: 720 },
    })
    expect(result.cards).toHaveLength(3)
    expect(result.didShrink).toBe(false)
    expect(result.shrinkScale).toBe(1)
    expect(result.frameSize).toEqual({ width: 1080, height: 720 })
    for (const c of result.cards) {
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.y).toBeGreaterThanOrEqual(0)
      expect(c.x + c.w).toBeLessThanOrEqual(1.0001)
      expect(c.y + c.h).toBeLessThanOrEqual(1.0001)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk pnpm vitest run lib/share/composer-layout.test.ts`
Expected: FAIL with "Cannot find module './composer-layout'"

- [ ] **Step 3: Write minimal implementation**

Create `lib/share/composer-layout.ts`:

```typescript
// lib/share/composer-layout.ts
import { computeColumnMasonry } from '@/lib/board/column-masonry'
import { SIZE_PRESET_SPAN } from '@/lib/board/constants'
import { computeAspectFrameSize } from './aspect-presets'
import { SHARE_LIMITS } from './types'
import type { ShareAspect, ShareCard, ShareSize } from './types'

export type ComposerItem = {
  readonly bookmarkId: string
  readonly url: string
  readonly title: string
  readonly description?: string
  readonly thumbnail: string
  readonly type: ShareCard['ty']
  readonly sizePreset: ShareSize
  readonly aspectRatio: number
}

export type ComposerLayoutInput = {
  readonly items: ReadonlyArray<ComposerItem>
  readonly order: ReadonlyArray<string>
  readonly sizeOverrides: ReadonlyMap<string, ShareSize>
  readonly aspect: ShareAspect
  readonly viewport: { readonly width: number; readonly height: number }
}

export type ComposerLayoutResult = {
  readonly cards: ShareCard[]
  readonly frameSize: { readonly width: number; readonly height: number }
  readonly didShrink: boolean
  readonly shrinkScale: number
}

export const COMPOSER_MASONRY = {
  GAP_PX: 8,
  TARGET_COLUMN_UNIT_PX: 140,
} as const

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s
}

export function composeShareLayout(input: ComposerLayoutInput): ComposerLayoutResult {
  const { items, order, sizeOverrides, aspect, viewport } = input
  const frameSize = computeAspectFrameSize(aspect, viewport.width, viewport.height)

  // Build ordered items: order first (filtering missing), then any items missing from order at the tail
  const orderSet = new Set(order)
  const itemMap = new Map(items.map((it) => [it.bookmarkId, it] as const))
  const ordered: ComposerItem[] = []
  for (const id of order) {
    const it = itemMap.get(id)
    if (it) ordered.push(it)
  }
  for (const it of items) {
    if (!orderSet.has(it.bookmarkId)) ordered.push(it)
  }

  // Run column-masonry sized to the frame width
  const masonryCards = ordered.map((it) => ({
    id: it.bookmarkId,
    aspectRatio: it.aspectRatio > 0 ? it.aspectRatio : 1,
    columnSpan: SIZE_PRESET_SPAN[sizeOverrides.get(it.bookmarkId) ?? it.sizePreset],
  }))
  const masonry = computeColumnMasonry({
    cards: masonryCards,
    containerWidth: frameSize.width,
    gap: COMPOSER_MASONRY.GAP_PX,
    targetColumnUnit: COMPOSER_MASONRY.TARGET_COLUMN_UNIT_PX,
  })

  // Pixel-space positions (will scale + center, then normalize)
  const px: Record<string, { x: number; y: number; w: number; h: number }> = {}
  for (const id of Object.keys(masonry.positions)) {
    const p = masonry.positions[id]
    px[id] = { x: p.x, y: p.y, w: p.w, h: p.h }
  }

  // Auto-shrink if total height exceeds frame height
  const shrinkScale = masonry.totalHeight > frameSize.height
    ? frameSize.height / masonry.totalHeight
    : 1
  const didShrink = shrinkScale < 1
  if (didShrink) {
    for (const id of Object.keys(px)) {
      px[id].x *= shrinkScale
      px[id].y *= shrinkScale
      px[id].w *= shrinkScale
      px[id].h *= shrinkScale
    }
  }

  // Vertical centering: if scaled total height < frame height, push down by half the slack
  const scaledTotalHeight = masonry.totalHeight * shrinkScale
  const verticalOffset = Math.max(0, (frameSize.height - scaledTotalHeight) / 2)
  if (verticalOffset > 0) {
    for (const id of Object.keys(px)) {
      px[id].y += verticalOffset
    }
  }

  // Build ShareCard[] in `ordered` sequence with normalized coords
  const cards: ShareCard[] = ordered.map((it) => {
    const p = px[it.bookmarkId]
    const effectiveSize = sizeOverrides.get(it.bookmarkId) ?? it.sizePreset
    return {
      u: truncate(it.url, SHARE_LIMITS.MAX_URL),
      t: truncate(it.title, SHARE_LIMITS.MAX_TITLE),
      d: it.description ? truncate(it.description, SHARE_LIMITS.MAX_DESCRIPTION) : undefined,
      th: it.thumbnail ? truncate(it.thumbnail, SHARE_LIMITS.MAX_URL) : undefined,
      ty: it.type,
      x: p.x / frameSize.width,
      y: p.y / frameSize.height,
      w: p.w / frameSize.width,
      h: p.h / frameSize.height,
      s: effectiveSize,
    }
  })

  return { cards, frameSize, didShrink, shrinkScale }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk pnpm vitest run lib/share/composer-layout.test.ts`
Expected: PASS, 1 test

- [ ] **Step 5: Commit**

```bash
rtk git add lib/share/composer-layout.ts lib/share/composer-layout.test.ts
rtk git commit -m "feat(share): composer-layout pure fn with frame-fit masonry + 0..1 normalize"
```

---

## Task 2: Add `cardOrder` respect test

**Files:**
- Modify: `lib/share/composer-layout.test.ts`

- [ ] **Step 1: Add test expecting order to be preserved**

Append to `lib/share/composer-layout.test.ts`:

```typescript
  it('respects given cardOrder; missing items in order are appended at tail', () => {
    const items = [item('a'), item('b'), item('c')]
    const r1 = composeShareLayout({
      items,
      order: ['c', 'a', 'b'],
      sizeOverrides: new Map(),
      aspect: 'free',
      viewport: { width: 1080, height: 720 },
    })
    expect(r1.cards.map((c) => c.u)).toEqual([
      'https://example.com/c',
      'https://example.com/a',
      'https://example.com/b',
    ])

    // order references unknown id 'zzz' — items missing from order are appended
    const r2 = composeShareLayout({
      items,
      order: ['zzz', 'b'],
      sizeOverrides: new Map(),
      aspect: 'free',
      viewport: { width: 1080, height: 720 },
    })
    expect(r2.cards.map((c) => c.u)).toEqual([
      'https://example.com/b',
      'https://example.com/a',
      'https://example.com/c',
    ])
  })
```

- [ ] **Step 2: Run test to verify it passes (already implemented in Task 1)**

Run: `rtk pnpm vitest run lib/share/composer-layout.test.ts`
Expected: PASS, 2 tests

- [ ] **Step 3: Commit**

```bash
rtk git add lib/share/composer-layout.test.ts
rtk git commit -m "test(share): composer-layout respects cardOrder + appends missing items"
```

---

## Task 3: Add `sizeOverrides` test

**Files:**
- Modify: `lib/share/composer-layout.test.ts`

- [ ] **Step 1: Add test verifying L size produces wider cards than S**

Append to `lib/share/composer-layout.test.ts`:

```typescript
  it('applies sizeOverrides — L spans more columns than S', () => {
    const items = [
      item('s', { sizePreset: 'S' }),
      item('l', { sizePreset: 'S' }), // base S, but override to L
    ]
    const overrides = new Map<string, 'S' | 'M' | 'L'>([['l', 'L']])
    const result = composeShareLayout({
      items,
      order: ['s', 'l'],
      sizeOverrides: overrides,
      aspect: 'free',
      viewport: { width: 1080, height: 720 },
    })
    const sCard = result.cards.find((c) => c.u.endsWith('/s'))!
    const lCard = result.cards.find((c) => c.u.endsWith('/l'))!
    expect(lCard.w).toBeGreaterThan(sCard.w)
    expect(lCard.s).toBe('L')   // echoed
    expect(sCard.s).toBe('S')
  })
```

- [ ] **Step 2: Run test to verify it passes**

Run: `rtk pnpm vitest run lib/share/composer-layout.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 3: Commit**

```bash
rtk git add lib/share/composer-layout.test.ts
rtk git commit -m "test(share): composer-layout sizeOverrides widens L beyond S"
```

---

## Task 4: Add auto-shrink test (50 cards in 9:16 → all fit)

**Files:**
- Modify: `lib/share/composer-layout.test.ts`

- [ ] **Step 1: Add test verifying didShrink=true and all cards fit**

Append to `lib/share/composer-layout.test.ts`:

```typescript
  it('auto-shrinks when content overflows frame height; all cards fit within 0..1', () => {
    const items: ReturnType<typeof item>[] = []
    for (let i = 0; i < 50; i++) items.push(item(`x${i}`))
    const result = composeShareLayout({
      items,
      order: items.map((it) => it.bookmarkId),
      sizeOverrides: new Map(),
      aspect: '9:16',
      viewport: { width: 1080, height: 720 },
    })
    expect(result.didShrink).toBe(true)
    expect(result.shrinkScale).toBeLessThan(1)
    expect(result.shrinkScale).toBeGreaterThan(0)
    for (const c of result.cards) {
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.y).toBeGreaterThanOrEqual(0)
      expect(c.x + c.w).toBeLessThanOrEqual(1.0001)
      expect(c.y + c.h).toBeLessThanOrEqual(1.0001)
    }
  })
```

- [ ] **Step 2: Run test to verify it passes**

Run: `rtk pnpm vitest run lib/share/composer-layout.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 3: Commit**

```bash
rtk git add lib/share/composer-layout.test.ts
rtk git commit -m "test(share): composer-layout auto-shrinks 50 cards into 9:16 frame"
```

---

## Task 5: Add vertical centering test (1 card in big frame)

**Files:**
- Modify: `lib/share/composer-layout.test.ts`

- [ ] **Step 1: Add test verifying vertical centering for sparse content**

Append to `lib/share/composer-layout.test.ts`:

```typescript
  it('vertically centers when scaled content height < frame height', () => {
    const items = [item('only', { sizePreset: 'S', aspectRatio: 1 })]
    const result = composeShareLayout({
      items,
      order: ['only'],
      sizeOverrides: new Map(),
      aspect: 'free',
      viewport: { width: 1080, height: 720 },
    })
    const c = result.cards[0]
    // The card should sit roughly in vertical middle (top y > 0.2 since the
    // card itself is small relative to the 720px frame).
    expect(c.y).toBeGreaterThan(0.2)
    // And there should be roughly equal slack above and below.
    const aboveSlack = c.y
    const belowSlack = 1 - (c.y + c.h)
    expect(Math.abs(aboveSlack - belowSlack)).toBeLessThan(0.01)
  })

  it('does not over-center when content already fills the frame', () => {
    const items: ReturnType<typeof item>[] = []
    for (let i = 0; i < 50; i++) items.push(item(`y${i}`))
    const result = composeShareLayout({
      items,
      order: items.map((it) => it.bookmarkId),
      sizeOverrides: new Map(),
      aspect: '9:16',
      viewport: { width: 1080, height: 720 },
    })
    // After auto-shrink content fills the frame; first card top should be ~0.
    const minY = Math.min(...result.cards.map((c) => c.y))
    expect(minY).toBeLessThan(0.01)
  })
```

- [ ] **Step 2: Run test to verify it passes**

Run: `rtk pnpm vitest run lib/share/composer-layout.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 3: Commit**

```bash
rtk git add lib/share/composer-layout.test.ts
rtk git commit -m "test(share): composer-layout vertical centering for sparse content"
```

---

## Task 6: Wire ShareComposer to use composer-layout (also adds aspectRatio plumbing)

**Files:**
- Modify: `components/share/ShareComposer.tsx`
- Modify: `components/board/BoardRoot.tsx:573-583` (the `items.map` payload passed to ShareComposer)

- [ ] **Step 1: Update BoardRoot to pass aspectRatio**

In `components/board/BoardRoot.tsx`, find the `<ShareComposer ... items={...}>` block (around line 572) and add `aspectRatio` to the mapped object:

```typescript
items={filteredItems.map((it) => ({
  bookmarkId: it.bookmarkId,
  url: it.url,
  title: it.title,
  description: it.description ?? '',
  thumbnail: it.thumbnail ?? '',
  type: detectUrlType(it.url),
  sizePreset: it.sizePreset,
  aspectRatio: it.aspectRatio,  // ADD THIS
}))}
```

- [ ] **Step 2: Update ShareComposer to use composer-layout**

Replace the contents of `components/share/ShareComposer.tsx` with this version. Key changes:
- `BoardItemLite` gains `aspectRatio: number`
- New state: `cardOrder`, `sizeOverrides`
- `selectedIds` change syncs `cardOrder` (preserves existing order, appends new at tail)
- Calls `composeShareLayout` instead of `boardItemsToShareCards`
- Initial order = board top-left → bottom-right (by `positions[id].y` ascending then x)

```typescript
// components/share/ShareComposer.tsx
'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { ShareAspect, ShareCard, ShareData, ShareSize } from '@/lib/share/types'
import { SHARE_SCHEMA_VERSION } from '@/lib/share/types'
import { composeShareLayout, type ComposerItem } from '@/lib/share/composer-layout'
import { filterByViewport } from '@/lib/share/board-to-cards'
import { ShareAspectSwitcher } from './ShareAspectSwitcher'
import { ShareFrame } from './ShareFrame'
import { ShareSourceList } from './ShareSourceList'
import styles from './ShareComposer.module.css'

type BoardItemLite = {
  readonly bookmarkId: string
  readonly url: string
  readonly title: string
  readonly description?: string
  readonly thumbnail: string
  readonly type: ShareCard['ty']
  readonly sizePreset: ShareSize
  readonly aspectRatio: number
}

type Pos = { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
type Viewport = { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

type Props = {
  readonly open: boolean
  readonly onClose: () => void
  readonly items: ReadonlyArray<BoardItemLite>
  readonly positions: Readonly<Record<string, Pos>>
  readonly viewport: Viewport
  readonly onConfirm: (data: ShareData, frameRef: HTMLElement | null) => void
}

const FRAME_VIEWPORT = { width: 1080, height: 720 } as const

function sortByBoardPosition(
  ids: ReadonlyArray<string>,
  positions: Readonly<Record<string, Pos>>,
): string[] {
  return ids.slice().sort((a, b) => {
    const pa = positions[a]
    const pb = positions[b]
    if (!pa || !pb) return 0
    if (pa.y !== pb.y) return pa.y - pb.y
    return pa.x - pb.x
  })
}

export function ShareComposer({ open, onClose, items, positions, viewport, onConfirm }: Props): ReactElement | null {
  const [aspect, setAspect] = useState<ShareAspect>('free')
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => {
    const visible = filterByViewport(items, positions, viewport)
    return new Set(visible.map((i) => i.bookmarkId))
  })
  const [cardOrder, setCardOrder] = useState<readonly string[]>(() => {
    const visible = filterByViewport(items, positions, viewport)
    return sortByBoardPosition(visible.map((i) => i.bookmarkId), positions)
  })
  const [sizeOverrides, setSizeOverrides] = useState<ReadonlyMap<string, ShareSize>>(new Map())

  const frameRef = useRef<HTMLDivElement>(null)

  // Close on ESC
  useEffect((): undefined | (() => void) => {
    if (!open) return undefined
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return (): void => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Body scroll lock
  useEffect((): undefined | (() => void) => {
    if (!open) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return (): void => { document.body.style.overflow = prev }
  }, [open])

  // Keep cardOrder in sync with selectedIds: drop removed, append new at tail.
  useEffect(() => {
    setCardOrder((prev) => {
      const filtered = prev.filter((id) => selectedIds.has(id))
      const prevSet = new Set(filtered)
      const additions: string[] = []
      for (const id of selectedIds) if (!prevSet.has(id)) additions.push(id)
      // Sort additions by board position so newly-added items land in a sane place
      const sortedAdditions = sortByBoardPosition(additions, positions)
      return [...filtered, ...sortedAdditions]
    })
  }, [selectedIds, positions])

  const composerItems = useMemo<ComposerItem[]>(
    () =>
      items
        .filter((i) => selectedIds.has(i.bookmarkId))
        .map((i) => ({
          bookmarkId: i.bookmarkId,
          url: i.url,
          title: i.title,
          description: i.description,
          thumbnail: i.thumbnail,
          type: i.type,
          sizePreset: i.sizePreset,
          aspectRatio: i.aspectRatio,
        })),
    [items, selectedIds],
  )

  const layout = useMemo(
    () =>
      composeShareLayout({
        items: composerItems,
        order: cardOrder,
        sizeOverrides,
        aspect,
        viewport: FRAME_VIEWPORT,
      }),
    [composerItems, cardOrder, sizeOverrides, aspect],
  )

  // cardIds = order of cards as they appear in `layout.cards`
  const cardIds = useMemo<string[]>(() => {
    const idByUrl = new Map(composerItems.map((it) => [it.url, it.bookmarkId] as const))
    return layout.cards.map((c) => idByUrl.get(c.u) ?? '')
  }, [layout.cards, composerItems])

  const onToggle = useCallback((id: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const onAddAll = useCallback((): void => {
    setSelectedIds(new Set(items.map((i) => i.bookmarkId)))
  }, [items])

  const onClearAll = useCallback((): void => {
    setSelectedIds(new Set())
  }, [])

  const onAddVisible = useCallback((): void => {
    const v = filterByViewport(items, positions, viewport)
    setSelectedIds(new Set(v.map((i) => i.bookmarkId)))
  }, [items, positions, viewport])

  const handleReorder = useCallback((orderedIds: readonly string[]): void => {
    setCardOrder(orderedIds)
  }, [])

  const handleCycleSize = useCallback((id: string, next: ShareSize): void => {
    setSizeOverrides((prev) => {
      const m = new Map(prev)
      m.set(id, next)
      return m
    })
  }, [])

  const handleDelete = useCallback((id: string): void => {
    onToggle(id)
  }, [onToggle])

  const onConfirmClick = useCallback((): void => {
    const data: ShareData = {
      v: SHARE_SCHEMA_VERSION,
      aspect,
      cards: layout.cards,
    }
    onConfirm(data, frameRef.current)
  }, [aspect, layout.cards, onConfirm])

  if (!open) return null

  return (
    <div
      className={styles.backdrop}
      onClick={(e): void => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-label="Share composer"
        data-testid="share-composer"
      >
        <header className={styles.header}>
          <h2 className={styles.title}>シェア用ボードを組む</h2>
          <ShareAspectSwitcher value={aspect} onChange={setAspect} />
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className={styles.canvasArea}>
          <div ref={frameRef} className={styles.frameWrap}>
            <ShareFrame
              cards={layout.cards}
              cardIds={cardIds}
              width={layout.frameSize.width}
              height={layout.frameSize.height}
              editable={true}
              onReorder={handleReorder}
              onCycleSize={handleCycleSize}
              onDelete={handleDelete}
            />
          </div>
        </div>

        <ShareSourceList
          items={items.map((i) => ({ bookmarkId: i.bookmarkId, thumbnail: i.thumbnail, title: i.title }))}
          selectedIds={selectedIds}
          onToggle={onToggle}
          onAddAll={onAddAll}
          onClearAll={onClearAll}
          onAddVisible={onAddVisible}
        />

        <footer className={styles.footer}>
          <button type="button" className={styles.confirmBtn} onClick={onConfirmClick}>
            画像 + URL でシェア →
          </button>
        </footer>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles even though ShareFrame doesn't yet accept the new props**

Run: `rtk pnpm tsc --noEmit`
Expected: This will fail with errors about unknown props (`cardIds`, `onReorder`, etc.) on ShareFrame. That's expected — Task 8 fixes ShareFrame. Note the error count for verification.

- [ ] **Step 4: Commit (broken-build commit, will be fixed in Task 8)**

```bash
rtk git add components/share/ShareComposer.tsx components/board/BoardRoot.tsx
rtk git commit -m "feat(share): wire composer-layout into ShareComposer + add cardOrder/sizeOverrides state"
```

NOTE: This commit leaves `tsc` red. Task 8 will fix it. To avoid leaving a broken commit on master, **complete Tasks 7 and 8 in the same session before pushing.**

---

## Task 7: Create `useShareReorderDrag` hook

**Files:**
- Create: `components/share/use-share-reorder-drag.ts`

This hook handles drag-to-reorder in frame-local coordinates. Simpler than board's `useCardReorderDrag` because:
- No pan/zoom (frame is fixed-size)
- No virtual-order-preview during drag (just compute final position on drop)
- No click-vs-drag distinction (Composer cards are pure visuals — no click handler)

- [ ] **Step 1: Implement the hook**

```typescript
// components/share/use-share-reorder-drag.ts
'use client'

import { useCallback, useRef, useState, type PointerEvent } from 'react'

const CLICK_THRESHOLD_PX = 5

export type ShareDragState = {
  readonly bookmarkId: string
  readonly currentX: number
  readonly currentY: number
}

type CardLocalRect = {
  readonly id: string
  readonly cx: number  // center x in frame-local coords
  readonly cy: number  // center y in frame-local coords
}

export type UseShareReorderDragParams = {
  readonly cardIds: ReadonlyArray<string>
  /** Frame-local center positions for every card. Used to find drop target. */
  readonly cardCenters: ReadonlyArray<CardLocalRect>
  readonly onReorder: (orderedIds: readonly string[]) => void
}

export function useShareReorderDrag(params: UseShareReorderDragParams): {
  dragState: ShareDragState | null
  handleCardPointerDown: (e: PointerEvent<HTMLDivElement>, bookmarkId: string) => void
} {
  const { cardIds, cardCenters, onReorder } = params
  const [dragState, setDragState] = useState<ShareDragState | null>(null)
  const stateRef = useRef({ cardIds, cardCenters, onReorder })
  stateRef.current = { cardIds, cardCenters, onReorder }

  const handleCardPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>, bookmarkId: string): void => {
      // Only primary button initiates drag. Right-click must pass through to onContextMenu.
      if (e.button > 0) return
      e.stopPropagation()
      const el = e.currentTarget
      const pointerId = e.pointerId
      el.setPointerCapture(pointerId)

      const startClientX = e.clientX
      const startClientY = e.clientY
      let dragStarted = false

      const move = (ev: globalThis.PointerEvent): void => {
        const dx = ev.clientX - startClientX
        const dy = ev.clientY - startClientY
        if (!dragStarted) {
          if (Math.hypot(dx, dy) < CLICK_THRESHOLD_PX) return
          dragStarted = true
        }
        setDragState({ bookmarkId, currentX: dx, currentY: dy })
      }

      const up = (ev: globalThis.PointerEvent): void => {
        el.removeEventListener('pointermove', move)
        el.removeEventListener('pointerup', up)
        el.removeEventListener('pointercancel', up)
        if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId)

        if (!dragStarted) {
          setDragState(null)
          return
        }

        // Lazy-resolve the frame element from the dragged card's DOM ancestry
        // (avoids React ref timing issues — refs are populated after render,
        // and stateRef captured at first render would still be null).
        const frame = el.closest('[data-testid="share-frame"]') as HTMLElement | null
        if (!frame) {
          setDragState(null)
          return
        }
        const rect = frame.getBoundingClientRect()
        const pointerLocalX = ev.clientX - rect.left
        const pointerLocalY = ev.clientY - rect.top

        let bestId: string | null = null
        let bestDist = Infinity
        for (const c of stateRef.current.cardCenters) {
          const dxc = c.cx - pointerLocalX
          const dyc = c.cy - pointerLocalY
          const d = dxc * dxc + dyc * dyc
          if (d < bestDist) {
            bestDist = d
            bestId = c.id
          }
        }

        setDragState(null)
        if (!bestId || bestId === bookmarkId) {
          // Pointer didn't land on another card — leave order unchanged.
          return
        }

        // Move dragged id to the position of bestId
        const ids = stateRef.current.cardIds.slice()
        const fromIdx = ids.indexOf(bookmarkId)
        const toIdx = ids.indexOf(bestId)
        if (fromIdx < 0 || toIdx < 0) return
        ids.splice(fromIdx, 1)
        ids.splice(toIdx, 0, bookmarkId)
        stateRef.current.onReorder(ids)
      }

      el.addEventListener('pointermove', move)
      el.addEventListener('pointerup', up)
      el.addEventListener('pointercancel', up)
    },
    [],
  )

  return { dragState, handleCardPointerDown }
}
```

- [ ] **Step 2: Verify TypeScript compiles for the new hook in isolation**

Run: `rtk pnpm tsc --noEmit components/share/use-share-reorder-drag.ts`
Expected: Note — `tsc --noEmit` with a single file may still scan the whole project. The hook itself should produce no errors; pre-existing errors from Task 6's broken state are OK.

- [ ] **Step 3: Commit**

```bash
rtk git add components/share/use-share-reorder-drag.ts
rtk git commit -m "feat(share): add useShareReorderDrag hook (frame-local drag → reorder)"
```

---

## Task 8: Add ShareFrame editable mode (drag + sizecycle + contextmenu)

**Files:**
- Modify: `components/share/ShareFrame.tsx`
- Modify: `components/share/ShareFrame.module.css`

- [ ] **Step 1: Replace ShareFrame.tsx**

Replace `components/share/ShareFrame.tsx` with:

```typescript
// components/share/ShareFrame.tsx
'use client'

import { useMemo, useRef, useState, type ReactElement } from 'react'
import type { ShareCard, ShareSize } from '@/lib/share/types'
import { CardNode } from '@/components/board/CardNode'
import { SizePresetToggle } from '@/components/board/SizePresetToggle'
import { useShareReorderDrag } from './use-share-reorder-drag'
import styles from './ShareFrame.module.css'

type Props = {
  readonly cards: ReadonlyArray<ShareCard>
  /** bookmarkIds aligned with `cards` — required when editable. */
  readonly cardIds?: ReadonlyArray<string>
  readonly width: number
  readonly height: number
  readonly editable: boolean
  readonly onReorder?: (orderedIds: readonly string[]) => void
  readonly onCycleSize?: (id: string, next: ShareSize) => void
  readonly onDelete?: (id: string) => void
  /** Receiving-side click target: opens c.u in a new tab. */
  readonly onCardOpen?: (i: number) => void
}

const NEXT_PRESET: Readonly<Record<ShareSize, ShareSize>> = {
  S: 'M',
  M: 'L',
  L: 'S',
}

export function ShareFrame({
  cards,
  cardIds,
  width,
  height,
  editable,
  onReorder,
  onCycleSize,
  onDelete,
  onCardOpen,
}: Props): ReactElement {
  const frameRef = useRef<HTMLDivElement>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Card centers in frame-local coords for drop-target detection.
  const cardCenters = useMemo(() => {
    if (!cardIds) return []
    return cards.map((c, i) => ({
      id: cardIds[i] ?? '',
      cx: (c.x + c.w / 2) * width,
      cy: (c.y + c.h / 2) * height,
    }))
  }, [cards, cardIds, width, height])

  const { dragState, handleCardPointerDown } = useShareReorderDrag({
    cardIds: cardIds ?? [],
    cardCenters,
    onReorder: onReorder ?? ((): void => undefined),
  })

  return (
    <div
      ref={frameRef}
      className={styles.frame}
      style={{ width, height }}
      data-testid="share-frame"
    >
      {cards.map((c, i) => {
        const id = cardIds?.[i] ?? `share-${i}`
        const isDragging = editable && dragState?.bookmarkId === id
        const dragOffsetX = isDragging ? (dragState?.currentX ?? 0) : 0
        const dragOffsetY = isDragging ? (dragState?.currentY ?? 0) : 0
        return (
          <div
            key={`${id}-${i}`}
            className={styles.cardWrap}
            data-card-id={id}
            data-dragging={isDragging || undefined}
            style={{
              left: `${c.x * width}px`,
              top: `${c.y * height}px`,
              width: `${c.w * width}px`,
              height: `${c.h * height}px`,
              transform: isDragging ? `translate(${dragOffsetX}px, ${dragOffsetY}px)` : undefined,
              cursor: editable ? 'grab' : (onCardOpen ? 'pointer' : 'default'),
              zIndex: isDragging ? 50 : undefined,
            }}
            onPointerDown={(e): void => {
              if (editable && cardIds) handleCardPointerDown(e, id)
            }}
            onClick={(): void => { if (!editable && onCardOpen) onCardOpen(i) }}
            onContextMenu={(e): void => {
              if (!editable) return
              e.preventDefault()
              if (cardIds && onDelete) onDelete(id)
            }}
            onMouseEnter={(): void => { if (editable) setHoveredId(id) }}
            onMouseLeave={(): void => { if (editable) setHoveredId((prev) => (prev === id ? null : prev)) }}
          >
            <CardNode
              id={`share-${i}`}
              title={c.t}
              thumbnailUrl={c.th}
              rotation={c.r}
            >
              {c.th
                ? <img className={styles.thumbOnly} src={c.th} alt="" draggable={false} />
                : <div className={styles.thumbPlaceholder}>{c.t.slice(0, 24)}</div>}
            </CardNode>
            {editable && (
              <SizePresetToggle
                preset={c.s}
                visible={hoveredId === id}
                onCycle={(): void => {
                  if (onCycleSize) onCycleSize(id, NEXT_PRESET[c.s])
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Update ShareFrame.module.css with hover/drag styles**

Replace `components/share/ShareFrame.module.css` with:

```css
/* components/share/ShareFrame.module.css */
.frame {
  position: relative;
  background: var(--share-frame-bg);
  border-radius: 8px;
  overflow: hidden;
}

.cardWrap {
  position: absolute;
  transition: transform 220ms cubic-bezier(0.2, 0, 0, 1);
}

.cardWrap[data-dragging] {
  transition: none;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

/* Receiving-side hover affordance: subtle scale-up, cursor pointer set inline. */
.cardWrap:not([data-dragging]):hover {
  transform: scale(1.02);
}

.thumbOnly {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
  -webkit-user-drag: none;
  user-select: none;
}

.thumbPlaceholder {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
  letter-spacing: 0.02em;
  text-align: center;
  padding: 8px;
  overflow: hidden;
}
```

- [ ] **Step 3: Run TypeScript check**

Run: `rtk pnpm tsc --noEmit`
Expected: PASS (the broken state from Task 6 is now fully resolved)

- [ ] **Step 4: Run unit tests**

Run: `rtk pnpm vitest run`
Expected: All tests pass (including 6 new composer-layout tests)

- [ ] **Step 5: Manual smoke test**

Run: `rtk pnpm dev` then open `http://localhost:3000/board`. With cards on the board, click the Share pill — verify:
- Composer opens, cards are visible inside the frame (not blank!)
- Aspect switcher (free / 1:1 / 9:16 / 16:9) reflows the cards
- Hovering a card reveals the S/M/L pill at the bottom-right
- Clicking S/M/L pill cycles size and reflows
- Right-clicking a card removes it from the frame and source list
- Drag a card horizontally — releases reorders the layout

- [ ] **Step 6: Commit**

```bash
rtk git add components/share/ShareFrame.tsx components/share/ShareFrame.module.css
rtk git commit -m "feat(share): ShareFrame editable mode (drag reorder / S/M/L cycle / right-click delete)"
```

---

## Task 9: (Already covered by Task 8 — ShareComposer wiring was done in Task 6, ShareFrame consumes the props in Task 8). Skip.

This was originally listed but is now collapsed: ShareComposer's wiring is in Task 6, ShareFrame's consumption is in Task 8. There's no separate work here.

---

## Task 10: Receiving-side click → window.open + hover affordance

**Files:**
- Modify: `components/share/SharedView.tsx`

The CSS hover affordance is already in Task 8's ShareFrame.module.css. SharedView only needs the click handler.

- [ ] **Step 1: Update SharedView to pass onCardOpen**

In `components/share/SharedView.tsx`, modify the rendered ShareFrame block. Find:

```typescript
      <div className={styles.frameHost}>
        <ShareFrame
          cards={state.data.cards}
          width={frame.width}
          height={frame.height}
          editable={false}
        />
      </div>
```

Replace with:

```typescript
      <div className={styles.frameHost}>
        <ShareFrame
          cards={state.data.cards}
          width={frame.width}
          height={frame.height}
          editable={false}
          onCardOpen={(i): void => {
            const url = state.data.cards[i]?.u
            if (!url) return
            window.open(url, '_blank', 'noopener,noreferrer')
          }}
        />
      </div>
```

- [ ] **Step 2: Run TypeScript check**

Run: `rtk pnpm tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Manual smoke test of receiver side**

With dev server running, open a share URL (the Composer already produces these). On the `/share#d=...` page:
- Hover a card: cursor changes to pointer + subtle scale-up animation (1.02)
- Click a card: opens the original URL in a new tab

If you don't have a saved share URL, generate one: open Composer with cards selected → "画像 + URL でシェア →" → copy the URL from ActionSheet → paste in a new tab.

- [ ] **Step 4: Commit**

```bash
rtk git add components/share/SharedView.tsx
rtk git commit -m "feat(share): receiving side — click card opens original URL in new tab"
```

---

## Task 11: E2E spec for composer edit flow

**Files:**
- Create: `tests/e2e/share-composer-edit.spec.ts`

- [ ] **Step 1: Write the E2E spec**

Create `tests/e2e/share-composer-edit.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'

// This spec relies on having at least 2 bookmarks on the board. The starter
// state may be empty — we add cards by hand if needed via the bookmarklet
// install flow simulation. For now we run against whatever the test fixture
// has; if empty, we skip the edit-specific assertions but still verify the
// composer is reachable and frame is non-empty when sources exist.

test.describe('Share composer — edit flow', () => {
  test('composer shows cards inside the frame (not blank)', async ({ page }) => {
    await page.goto('/board')
    await page.waitForSelector('[data-testid="board-toolbar"]', { timeout: 10000 })

    const sharePill = page.locator('[data-testid="share-pill"]')
    await expect(sharePill).toBeVisible()
    await sharePill.click()

    const composer = page.locator('[data-testid="share-composer"]')
    await expect(composer).toBeVisible()

    const frame = page.locator('[data-testid="share-frame"]')
    await expect(frame).toBeVisible()

    // If there are bookmarks, the frame should have at least one cardWrap.
    // If empty, this is also acceptable (graceful no-op) — but the bug we are
    // fixing was that even WITH bookmarks the frame was blank. So we check
    // the source list count to decide whether to assert non-empty.
    const sourceItems = page.locator('[data-testid="share-source-item"]')
    const sourceCount = await sourceItems.count()
    if (sourceCount > 0) {
      const cards = frame.locator('[data-card-id]')
      await expect(cards.first()).toBeVisible({ timeout: 3000 })
    }
  })

  test('aspect switcher reflows the layout', async ({ page }) => {
    await page.goto('/board')
    await page.waitForSelector('[data-testid="board-toolbar"]', { timeout: 10000 })
    await page.locator('[data-testid="share-pill"]').click()
    await expect(page.locator('[data-testid="share-composer"]')).toBeVisible()

    const frame = page.locator('[data-testid="share-frame"]')
    const sizeBefore = await frame.evaluate((el) => ({
      w: (el as HTMLElement).offsetWidth,
      h: (el as HTMLElement).offsetHeight,
    }))

    // Click 9:16 aspect button (button text matches '9:16').
    await page.getByRole('button', { name: '9:16' }).click()

    const sizeAfter = await frame.evaluate((el) => ({
      w: (el as HTMLElement).offsetWidth,
      h: (el as HTMLElement).offsetHeight,
    }))
    // 9:16 is taller than wide compared to free; the aspect ratio must change.
    const ratioBefore = sizeBefore.w / Math.max(1, sizeBefore.h)
    const ratioAfter = sizeAfter.w / Math.max(1, sizeAfter.h)
    expect(ratioAfter).toBeLessThan(ratioBefore)
  })

  test('right-click on a frame card removes it from the frame', async ({ page }) => {
    await page.goto('/board')
    await page.waitForSelector('[data-testid="board-toolbar"]', { timeout: 10000 })
    await page.locator('[data-testid="share-pill"]').click()
    await expect(page.locator('[data-testid="share-composer"]')).toBeVisible()

    const frame = page.locator('[data-testid="share-frame"]')
    const cards = frame.locator('[data-card-id]')
    const initial = await cards.count()
    if (initial === 0) test.skip(true, 'no bookmarks in fixture; cannot exercise delete')

    const firstId = await cards.first().getAttribute('data-card-id')
    await cards.first().click({ button: 'right' })

    // The card with that id should be gone from the frame.
    await expect(frame.locator(`[data-card-id="${firstId}"]`)).toHaveCount(0)
  })
})
```

- [ ] **Step 2: Run the E2E spec**

Run: `rtk pnpm playwright test tests/e2e/share-composer-edit.spec.ts`
Expected: all 3 tests pass (some may auto-skip if no bookmarks in test fixture; that is acceptable)

If a test fails because the dev server isn't running, start it (`rtk pnpm dev`) and re-run. The Playwright config in this repo is set to handle the dev server.

- [ ] **Step 3: Commit**

```bash
rtk git add tests/e2e/share-composer-edit.spec.ts
rtk git commit -m "test(share): E2E coverage for composer edit flow + aspect reflow + delete"
```

---

## Task 12: Final verification

**Files:**
- None (verification only)

- [ ] **Step 1: Run TypeScript**

Run: `rtk pnpm tsc --noEmit`
Expected: PASS, 0 errors

- [ ] **Step 2: Run unit tests**

Run: `rtk pnpm vitest run`
Expected: PASS, all tests including 6 new composer-layout tests + existing 235

- [ ] **Step 3: Run E2E tests**

Run: `rtk pnpm playwright test`
Expected: PASS (existing share-sender.spec.ts + new share-composer-edit.spec.ts)

- [ ] **Step 4: Build for production**

Run: `rtk pnpm build`
Expected: PASS, no warnings about unused imports or type errors

- [ ] **Step 5: Manual end-to-end smoke**

Open `http://localhost:3000/board`. Confirm in the browser:
- Add some cards to the board (via bookmarklet or restoring previous state)
- Click Share pill → Composer opens, frame populated
- Try each aspect: free / 1:1 / 9:16 / 16:9 — all show all cards inside frame, none cut off
- Hover a card, change S/M/L — layout updates
- Right-click a card — disappears from frame and source list
- Drag a card to a different position — reorders
- Click "画像 + URL でシェア →" → ActionSheet shows
- Copy URL, open in new tab → /share page shows the same composition
- Click a card on /share — opens original URL in new tab
- Reload /board — board state unchanged (no Composer side-effects leaked)

- [ ] **Step 6: Deploy to Cloudflare Pages**

Run:
```bash
rtk pnpm build
npx wrangler pages deploy out/ --project-name=booklage --branch=master --commit-dirty=true
```
After deploy, hard-reload `https://booklage.pages.dev` and re-run the smoke list above.

- [ ] **Step 7: Final commit (TODO + status update)**

Update `docs/TODO.md` "現在の状態" + "前セッション到達点" sections to reflect Plan A item 2 completion. Move item 2 from emergency bugs to TODO_COMPLETED.md.

```bash
rtk git add docs/TODO.md docs/TODO_COMPLETED.md
rtk git commit -m "docs(todo): close Plan A item 2 — Composer reflow + edit layer shipped"
rtk git push
```

---

## Self-Review (post-plan)

### Spec coverage check

| Spec section | Plan task | Covered? |
|--------------|-----------|----------|
| §3 architecture (3-layer) | Tasks 1-8 | ✅ |
| §4 composer-layout logic + auto-shrink + 縦中央寄せ | Tasks 1-5 | ✅ |
| §5 ShareComposer state (cardOrder, sizeOverrides) | Task 6 | ✅ |
| §6 ShareFrame editable affordances | Task 8 | ✅ |
| §6 isolation guarantee | Tasks 6+8 (`handleDelete` calls only `onToggle`, no IndexedDB / `onCyclePreset`) | ✅ |
| §7 SharedView click → window.open | Task 10 | ✅ |
| §8 unit tests | Tasks 1-5 | ✅ (6 unit tests) |
| §8 E2E test | Task 11 | ✅ (3 e2e tests) |
| §12 受け入れ基準 全項目 | Task 12 | ✅ |

### Type consistency check

- `composeShareLayout` referenced consistently (Tasks 1, 6)
- `ComposerItem` type defined in Task 1, consumed in Task 6
- `useShareReorderDrag` API: Task 7 defines `cardIds` / `cardCenters` / `frameEl` / `onReorder`, Task 8 wires same names
- `SizePresetToggle` `onCycle` signature: receives next preset (no args from caller, cycles internally) — matches its existing API
- `NEXT_PRESET` map duplicated in Task 8's ShareFrame.tsx (the existing one in board's SizePresetToggle.tsx is not exported as `NEXT_PRESET`. ShareFrame redefines locally for clarity. Could be exported from SizePresetToggle and shared, but local copy is acceptable for spec parity.)

### Placeholder scan

- No "TBD" / "TODO" / "implement later" markers
- All code blocks contain complete, runnable code (or full file replacement when the existing version conflicts)
- Test code blocks contain real `expect` assertions, not placeholders
- Manual smoke steps name specific UI elements

### Scope check

Single implementation plan. All tasks contribute to one shippable feature. Phase 2/3 explicitly out of scope.

### Known small ambiguity (acceptable)

- The dragged card's visual feedback during drag is a simple `translate(dx, dy)` without live virtual-order preview (the dropped layout snaps in on release). Board has live preview via `computeVirtualOrder`. This is intentional simplification per spec §10 risk mitigation. If user requests live preview later, port `computeVirtualOrder` adapted for share frame.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-06-composer-reflow-plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
