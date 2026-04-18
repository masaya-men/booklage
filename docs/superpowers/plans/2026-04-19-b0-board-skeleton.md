# B0 Board Skeleton Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 1431-line `board-client.tsx` monolith with a 6-layer skeleton (装飾ゼロ) where auto-layout + scroll + card drag/resize feel production-quality on 1000+ cards.

**Architecture:** 6-layer separation: BoardRoot (orchestration) → ThemeLayer (background+direction) → auto-layout.ts (pure calc) → CardsLayer (positioning+culling) → InteractionLayer (gestures) → CardNode (leaf, zero decoration). Pure-function layout tested via vitest; UI via Playwright.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Vanilla CSS modules, GSAP Draggable via DOM+createPortal (per existing pattern), `idb` for IndexedDB, next-intl for 15-language i18n, Vitest for unit tests, Playwright for E2E.

**Spec:** `docs/superpowers/specs/2026-04-19-b0-board-skeleton-design.md` (read Part B before starting each task).

---

## File Structure Map

| Category | File | Responsibility | Created in |
|----------|------|----------------|-----------|
| Archive | `docs/archive/liquid-glass-notes.md` | 現行 SVG filter の要点、kube.io 方式で再実装する設計メモ | Task 1 |
| Archive | `docs/archive/sphere-navigation-notes.md` | 3D 球体の shader 値・残課題・再接続設計メモ | Task 1 |
| Types | `lib/board/types.ts` | CardPosition, ThemeId, ScrollDirection, LayoutInput/Result, InteractionState | Task 2 |
| Constants | `lib/board/constants.ts` | LAYOUT_CONFIG, CARD_SIZE_LIMITS, CULLING_BUFFER, Z_INDEX | Task 3 |
| Themes | `lib/board/theme-registry.ts` | THEME_REGISTRY, DEFAULT_THEME_ID, ランタイム CSS class map | Task 4 |
| Themes CSS | `components/board/themes.module.css` | .dottedNotebook, .gridPaper backgrounds | Task 4 |
| Pure | `lib/board/auto-layout.ts` | computeAutoLayout 純関数 | Task 5 |
| Tests | `tests/board/auto-layout.test.ts` | layout 単体テスト 8件 | Task 5 |
| i18n | `messages/{15 langs}.json` | `board.theme.dottedNotebook`, `board.theme.gridPaper` キー追加 | Task 6 |
| Leaf | `components/board/CardNode.tsx` | 素の div、タイトル+サムネ、children として TweetCard/VideoEmbed | Task 7 |
| Leaf CSS | `components/board/CardNode.module.css` | 最低限スタイル | Task 7 |
| Handle | `components/board/ResizeHandle.tsx` | 骨組みリサイズハンドル | Task 8 |
| Handle CSS | `components/board/ResizeHandle.module.css` | 8x8 右下コーナー | Task 8 |
| Theme UI | `components/board/ThemeLayer.tsx` | テーマ背景描画 | Task 9 |
| Cards | `components/board/CardsLayer.tsx` | 位置適用 + viewport culling | Task 10 |
| Interaction | `components/board/InteractionLayer.tsx` | wheel / empty-drag / card-drag / resize ジェスチャ | Task 11 |
| Root | `components/board/BoardRoot.tsx` | 全体オーケストレーション、IndexedDB ロード | Task 12 |
| Page | `app/(app)/board/page.tsx` | BoardRoot を import するだけに simplify | Task 13 |
| E2E | `tests/e2e/board-b0.spec.ts` | Playwright シナリオ 6件 | Task 14 |

Deletion targets handled in Task 15.

---

## Task 1: Archive Notes Before Deletion

**Files:**
- Create: `docs/archive/liquid-glass-notes.md`
- Create: `docs/archive/sphere-navigation-notes.md`

**Why first:** spec B8 で「削除前に archive」を強制。implementation 中に過って削除しても、このタスクで知識保全が済んでいれば B1/B3 再実装は可能。

- [ ] **Step 1: Read current liquid glass implementation to extract parameter values**

```bash
cat lib/glass/use-liquid-glass.ts
cat components/board/card-styles/CardStyleWrapper.module.css
```

Record the actual values used (baseFrequency, stdDeviation, backdrop-filter settings, saturation, blur px, etc.) — they go into the archive note.

- [ ] **Step 2: Create `docs/archive/liquid-glass-notes.md`**

Template — fill in actual values from Step 1:

```markdown
# Liquid Glass 実装ノート（2026-04-19 archive）

> 現行 SVG filter 方式は B0 で削除。次回実装時は kube.io 方式（feDisplacementMap + pre-rendered map, α=255）で完全透明を目指す。

## 現行実装で確認できた値
- SVG filter プリミティブ: feTurbulence + feDisplacementMap + feGaussianBlur + feColorMatrix
- baseFrequency: [実値]
- stdDeviation (blur): [実値] (CardStyleWrapper: 6px, UI パネル: [値])
- saturation: [実値]
- backdrop-filter: [実値]

## 黒ずみ問題（未解決のまま削除）
- 症状: ガラス越しに見える背景が本来より暗くなる
- 推定原因: displacement map の alpha が 255 未満 or feTurbulence 経由で暗いチャンネルが合成されている
- 次回対策: kube.io 方式の pre-rendered displacement map（α=255 固定）に置き換え

## B1 再実装時のチェックリスト
1. DESIGN_REFERENCES.md の「kube.io」技術レシピを読む
2. `feTurbulence` を使わず pre-rendered displacement map を使う
3. α=255 を displacement map 全ピクセルで維持
4. Chrome 以外は半透明グラデへフォールバック（feature detection）
5. scale のみアニメ、shape/size 変更は避ける（map 再ビルド高コスト）
6. 黒ずみ問題が出たら、まず displacement map の α を疑う
```

- [ ] **Step 3: Create `docs/archive/sphere-navigation-notes.md`**

Read `lib/sphere/glass-shader.ts` and `docs/TODO.md` (3D 球体セクション) to extract shader values:

```bash
cat lib/sphere/glass-shader.ts
```

Template:

```markdown
# 3D 球体ナビゲーション archive ノート（2026-04-19）

> B0 では接続を外す。B3 で theme-registry の `direction: 'sphere'` として再接続する。

## 既存実装（master 到達済み）
- Three.js + CSS3DRenderer デュアル描画
- 球面投影: カード ID → 経緯度 → 3D 座標変換（`lib/sphere/projection.ts`）
- 慣性 rotation + zoom
- viewport culling + LOD (裏側 dot 表示は未実装)
- 物理ガラス shader: IOR, chromatic aberration, fresnel (glass-shader.ts、球体には未接続)

## Shader の効いた値
- IOR: [実値]
- Chromatic aberration strength: [実値]
- Fresnel power: [実値]

## 既知の残課題（TODO.md 3D球体セクションから）
- 実際のパン操作で裏側のカードが戻ってくるか未検証
- 球面が大きすぎてカードが小さく遠い（camera distance/scale バランス）
- WebGL キャンバスに謎の白丸アーティファクト（bloom or glow 起因と推測）
- 計画書の裏側 dot LOD 表示は未実装（WebGL points 描画予定）
- ガラスシェーダーは球体に未接続（glass-shader.ts）

## B3 再接続時の方針
1. `lib/board/theme-registry.ts` に `direction: 'sphere'` テーマを追加
2. `InteractionLayer` の sphere 分岐を実装
3. CardsLayer は projection.ts を経由して 3D 座標に変換
4. 既知残課題を spec 化して解決してから master へ
```

- [ ] **Step 4: Verify archive directory exists, create if missing**

```bash
ls docs/archive/ 2>/dev/null || mkdir -p docs/archive
ls docs/archive/
```

Expected: both `liquid-glass-notes.md` and `sphere-navigation-notes.md` listed.

- [ ] **Step 5: Commit**

```bash
git add docs/archive/liquid-glass-notes.md docs/archive/sphere-navigation-notes.md
git commit -m "docs(archive): preserve liquid glass + sphere shader knowledge before B0 deletion"
```

---

## Task 2: Create `lib/board/types.ts`

**Files:**
- Create: `lib/board/types.ts`

- [ ] **Step 1: Write the types file**

```typescript
// lib/board/types.ts

export type ScrollDirection = 'vertical' | 'horizontal' | '2d' | 'sphere'

export type ThemeId = 'dotted-notebook' | 'grid-paper'
// B1+ 追加候補: 'beach-horizon' | 'sphere' | 'cutting-mat' | 'forest' | 'ocean' | ...

export type CardPosition = {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export type LayoutCard = {
  readonly id: string
  readonly aspectRatio: number
  readonly userOverridePos?: CardPosition
}

export type LayoutInput = {
  readonly cards: ReadonlyArray<LayoutCard>
  readonly viewportWidth: number
  readonly targetRowHeight: number
  readonly gap: number
  readonly direction: ScrollDirection
}

export type LayoutResult = {
  readonly positions: Readonly<Record<string, CardPosition>>
  readonly totalHeight: number
  readonly totalWidth: number
}

export type InteractionState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'scrolling' }
  | { readonly kind: 'card-dragging'; readonly cardId: string; readonly startX: number; readonly startY: number }
  | { readonly kind: 'card-resizing'; readonly cardId: string; readonly startW: number; readonly startH: number }

export type ThemeLayoutParams = {
  readonly targetRowHeight?: number
  readonly gap?: number
}

export type ThemeMeta = {
  readonly id: ThemeId
  readonly direction: ScrollDirection
  readonly backgroundClassName: string
  readonly labelKey: string
  readonly layoutParams?: ThemeLayoutParams
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors (if board/types.ts has issues they surface here).

- [ ] **Step 3: Commit**

```bash
git add lib/board/types.ts
git commit -m "feat(board): add type definitions for B0 layout + interaction + theme"
```

---

## Task 3: Create `lib/board/constants.ts`

**Files:**
- Create: `lib/board/constants.ts`

- [ ] **Step 1: Write the constants**

```typescript
// lib/board/constants.ts

export const LAYOUT_CONFIG = {
  TARGET_ROW_HEIGHT_PX: 180,
  GAP_PX: 4,
  CONTAINER_MARGIN_PX: 16,
} as const

export const CARD_SIZE_LIMITS = {
  MIN_PX: 120,
  MAX_PX: 800,
} as const

export const CULLING = {
  BUFFER_SCREENS: 1.0,
} as const

export const BOARD_Z_INDEX = {
  THEME_BG: 0,
  CARDS: 10,
  INTERACTION_OVERLAY: 20,
  RESIZE_HANDLE: 30,
  DRAG_GHOST: 100,
} as const

export const INTERACTION = {
  DRAG_THRESHOLD_PX: 4,
  WHEEL_SCROLL_MULTIPLIER: 1.0,
  EMPTY_DRAG_SCROLL_MULTIPLIER: 1.0,
} as const

export const PERF = {
  TARGET_FPS: 60,
  MAX_LAYOUT_MS_1000_CARDS: 16,
} as const
```

- [ ] **Step 2: Verify compiles**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add lib/board/constants.ts
git commit -m "feat(board): add numeric constants for layout, culling, interaction, z-index"
```

---

## Task 4: Create Theme Registry + Background CSS

**Files:**
- Create: `lib/board/theme-registry.ts`
- Create: `components/board/themes.module.css`

- [ ] **Step 1: Write theme registry**

```typescript
// lib/board/theme-registry.ts
import type { ThemeId, ThemeMeta } from './types'

export const THEME_REGISTRY: Record<ThemeId, ThemeMeta> = {
  'dotted-notebook': {
    id: 'dotted-notebook',
    direction: 'vertical',
    backgroundClassName: 'dottedNotebook',
    labelKey: 'board.theme.dottedNotebook',
  },
  'grid-paper': {
    id: 'grid-paper',
    direction: 'vertical',
    backgroundClassName: 'gridPaper',
    labelKey: 'board.theme.gridPaper',
  },
}

export const DEFAULT_THEME_ID: ThemeId = 'dotted-notebook'

export function getThemeMeta(id: ThemeId): ThemeMeta {
  return THEME_REGISTRY[id]
}

export function listThemeIds(): ReadonlyArray<ThemeId> {
  return Object.keys(THEME_REGISTRY) as ThemeId[]
}
```

- [ ] **Step 2: Write background CSS**

```css
/* components/board/themes.module.css */

.dottedNotebook {
  background-color: #f8f8f6;
  background-image: radial-gradient(circle, #c8c8c8 1px, transparent 1px);
  background-size: 24px 24px;
  background-position: 0 0;
}

.gridPaper {
  background-color: #0e0e11;
  background-image:
    linear-gradient(to right, rgba(255,255,255,0.18) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255,255,255,0.18) 1px, transparent 1px);
  background-size: 40px 40px;
  background-position: 0 0;
}
```

- [ ] **Step 3: Verify both compile**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add lib/board/theme-registry.ts components/board/themes.module.css
git commit -m "feat(board): add theme registry + dotted-notebook/grid-paper backgrounds"
```

---

## Task 5: Implement `auto-layout.ts` with TDD

**Files:**
- Create: `tests/board/auto-layout.test.ts`
- Create: `lib/board/auto-layout.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/board/auto-layout.test.ts
import { describe, it, expect } from 'vitest'
import { computeAutoLayout } from '../../lib/board/auto-layout'
import type { LayoutInput } from '../../lib/board/types'

const baseInput = (overrides: Partial<LayoutInput> = {}): LayoutInput => ({
  cards: [],
  viewportWidth: 1200,
  targetRowHeight: 180,
  gap: 4,
  direction: 'vertical',
  ...overrides,
})

describe('computeAutoLayout', () => {
  it('returns empty positions for empty cards', () => {
    const res = computeAutoLayout(baseInput())
    expect(res.positions).toEqual({})
    expect(res.totalHeight).toBe(0)
  })

  it('places single card at target row height with width = aspect * height', () => {
    const res = computeAutoLayout(baseInput({
      cards: [{ id: 'a', aspectRatio: 1.5 }],
    }))
    expect(res.positions.a.h).toBe(180)
    expect(res.positions.a.w).toBe(180 * 1.5)
    expect(res.positions.a.x).toBeGreaterThanOrEqual(0)
    expect(res.positions.a.y).toBe(0)
  })

  it('justifies a row to viewportWidth when cards exceed it', () => {
    const res = computeAutoLayout(baseInput({
      viewportWidth: 1000,
      cards: [
        { id: 'a', aspectRatio: 2 },   // wants 360
        { id: 'b', aspectRatio: 2 },   // wants 360
        { id: 'c', aspectRatio: 2 },   // wants 360 — total 1080 > 1000
      ],
    }))
    const totalW = res.positions.a.w + res.positions.b.w + res.positions.c.w
    const totalGaps = 4 * 2  // 3 cards => 2 gaps
    expect(totalW + totalGaps).toBeCloseTo(1000, 0)
  })

  it('leaves last row left-aligned when it cannot fill viewport', () => {
    const res = computeAutoLayout(baseInput({
      viewportWidth: 1200,
      cards: [
        { id: 'a', aspectRatio: 1 },
        { id: 'b', aspectRatio: 1 },
        { id: 'c', aspectRatio: 1 },   // single card in last row
      ],
    }))
    // First two fill row; last one left-aligned at targetRowHeight
    expect(res.positions.c.h).toBe(180)
    expect(res.positions.c.w).toBe(180)
  })

  it('handles tall aspect ratio (0.5)', () => {
    const res = computeAutoLayout(baseInput({
      cards: [{ id: 'a', aspectRatio: 0.5 }],
    }))
    expect(res.positions.a.w).toBe(180 * 0.5)
    expect(res.positions.a.h).toBe(180)
  })

  it('respects userOverridePos — card not placed by auto layout', () => {
    const override = { x: 300, y: 500, w: 200, h: 150 }
    const res = computeAutoLayout(baseInput({
      cards: [{ id: 'a', aspectRatio: 1, userOverridePos: override }],
    }))
    expect(res.positions.a).toEqual(override)
  })

  it('computes totalHeight as sum of row heights including final row', () => {
    const res = computeAutoLayout(baseInput({
      viewportWidth: 1000,
      cards: [
        { id: 'a', aspectRatio: 2 },
        { id: 'b', aspectRatio: 2 },
        { id: 'c', aspectRatio: 2 },  // row 1 (justified)
        { id: 'd', aspectRatio: 1 },  // row 2 (left-aligned)
      ],
    }))
    // row 1 height ≈ (1000 - 8) / (2+2+2) = ~165
    // row 2 height = 180
    // totalHeight = row1 + gap + row2
    expect(res.totalHeight).toBeGreaterThan(300)
  })

  it('completes 1000 cards layout under 16ms', () => {
    const cards = Array.from({ length: 1000 }, (_, i) => ({
      id: `card-${i}`,
      aspectRatio: 0.5 + Math.random() * 2.5,
    }))
    const start = performance.now()
    computeAutoLayout(baseInput({ cards }))
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(16)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm vitest run tests/board/auto-layout.test.ts
```

Expected: ALL 8 tests fail with "computeAutoLayout is not a function" or module-not-found.

- [ ] **Step 3: Implement `auto-layout.ts`**

```typescript
// lib/board/auto-layout.ts
import type { LayoutInput, LayoutResult, LayoutCard, CardPosition } from './types'
import { LAYOUT_CONFIG } from './constants'

export function computeAutoLayout(input: LayoutInput): LayoutResult {
  const { cards, viewportWidth, targetRowHeight, gap } = input
  const positions: Record<string, CardPosition> = {}
  let cursorY = 0

  if (cards.length === 0) {
    return { positions, totalHeight: 0, totalWidth: viewportWidth }
  }

  // Separate overridden cards — placed as-is, don't participate in auto-layout
  const autoCards: LayoutCard[] = []
  for (const c of cards) {
    if (c.userOverridePos) {
      positions[c.id] = c.userOverridePos
    } else {
      autoCards.push(c)
    }
  }

  // Build rows greedily
  const rows: LayoutCard[][] = []
  let currentRow: LayoutCard[] = []
  let currentRowWantedWidth = 0

  for (const c of autoCards) {
    const wantedWidth = c.aspectRatio * targetRowHeight
    const gapsIfAdded = currentRow.length // gaps between existing + new
    const totalIfAdded = currentRowWantedWidth + wantedWidth + gapsIfAdded * gap

    if (currentRow.length > 0 && totalIfAdded > viewportWidth) {
      rows.push(currentRow)
      currentRow = [c]
      currentRowWantedWidth = wantedWidth
    } else {
      currentRow.push(c)
      currentRowWantedWidth += wantedWidth
    }
  }
  if (currentRow.length > 0) rows.push(currentRow)

  // Place rows
  const marginX = LAYOUT_CONFIG.CONTAINER_MARGIN_PX
  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx]
    const isLastRow = rowIdx === rows.length - 1
    const totalWantedWidth = row.reduce((sum, c) => sum + c.aspectRatio * targetRowHeight, 0)
    const gapsTotal = (row.length - 1) * gap
    const availableWidth = viewportWidth - marginX * 2 - gapsTotal

    const shouldJustify = !isLastRow || totalWantedWidth >= availableWidth
    const scale = shouldJustify ? availableWidth / totalWantedWidth : 1
    const rowHeight = targetRowHeight * scale

    let cursorX = marginX
    for (const c of row) {
      const w = c.aspectRatio * targetRowHeight * scale
      const h = rowHeight
      positions[c.id] = {
        x: cursorX,
        y: cursorY,
        w,
        h,
      }
      cursorX += w + gap
    }
    cursorY += rowHeight
    if (!isLastRow) cursorY += gap
  }

  return {
    positions,
    totalHeight: cursorY,
    totalWidth: viewportWidth,
  }
}
```

- [ ] **Step 4: Run tests, confirm all pass**

```bash
pnpm vitest run tests/board/auto-layout.test.ts
```

Expected: 8 / 8 PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/board/auto-layout.ts tests/board/auto-layout.test.ts
git commit -m "feat(board): justified-grid auto-layout with TDD (8 tests, 1000-card <16ms)"
```

---

## Task 6: Add i18n Keys to All 15 Languages

**Files:**
- Modify: `messages/ja.json`, `messages/en.json`, `messages/zh.json`, `messages/ko.json`, `messages/es.json`, `messages/fr.json`, `messages/de.json`, `messages/pt.json`, `messages/it.json`, `messages/nl.json`, `messages/tr.json`, `messages/ru.json`, `messages/ar.json`, `messages/th.json`, `messages/vi.json`

- [ ] **Step 1: Add the same keys to each language file, under `board.theme`**

Required keys:
- `board.theme.dottedNotebook`
- `board.theme.gridPaper`

Translations table:

| Lang | dottedNotebook | gridPaper |
|------|----------------|-----------|
| ja | 点線ノート | 方眼紙 |
| en | Dotted Notebook | Grid Paper |
| zh | 点线笔记本 | 方格纸 |
| ko | 점선 노트 | 모눈종이 |
| es | Cuaderno Punteado | Papel Cuadriculado |
| fr | Carnet Pointillé | Papier Quadrillé |
| de | Punktiertes Notizbuch | Rasterpapier |
| pt | Caderno Pontilhado | Papel Quadriculado |
| it | Quaderno Puntinato | Carta Quadrettata |
| nl | Stippennotitieboek | Ruitjespapier |
| tr | Noktalı Defter | Kareli Kağıt |
| ru | Точечная Тетрадь | Миллиметровая Бумага |
| ar | دفتر منقط | ورق مربعات |
| th | สมุดจุดประ | กระดาษกราฟ |
| vi | Sổ Tay Chấm Bi | Giấy Kẻ Ô |

For each file, locate the top-level JSON object and add or extend a `"board"` key. Example for `messages/ja.json`:

```json
{
  "...existing keys...": "...",
  "board": {
    "theme": {
      "dottedNotebook": "点線ノート",
      "gridPaper": "方眼紙"
    }
  }
}
```

**Important:** if `board` key already exists in the file, merge into the existing object — don't overwrite other board.* keys.

- [ ] **Step 2: Verify all 15 files parse as valid JSON**

```bash
for f in messages/*.json; do
  node -e "JSON.parse(require('fs').readFileSync('$f'))" && echo "$f OK"
done
```

Expected: 15 lines of "OK".

- [ ] **Step 3: Commit**

```bash
git add messages/
git commit -m "i18n: add board.theme.dottedNotebook + board.theme.gridPaper keys (15 languages)"
```

---

## Task 7: Create `CardNode.tsx` (Leaf, Zero Decoration)

**Files:**
- Create: `components/board/CardNode.tsx`
- Create: `components/board/CardNode.module.css`

- [ ] **Step 1: Write CardNode**

```tsx
// components/board/CardNode.tsx
'use client'

import type { ReactNode } from 'react'
import type { CardPosition } from '@/lib/board/types'
import styles from './CardNode.module.css'

type CardNodeProps = {
  readonly id: string
  readonly position: CardPosition
  readonly title: string
  readonly thumbnailUrl?: string
  readonly children?: ReactNode
  readonly onPointerDown?: (e: React.PointerEvent, cardId: string) => void
}

export function CardNode({ id, position, title, thumbnailUrl, children, onPointerDown }: CardNodeProps) {
  return (
    <div
      className={styles.cardNode}
      data-card-id={id}
      style={{
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
        width: `${position.w}px`,
        height: `${position.h}px`,
      }}
      onPointerDown={(e) => onPointerDown?.(e, id)}
    >
      {children ?? (
        <>
          {thumbnailUrl && <img className={styles.thumb} src={thumbnailUrl} alt="" />}
          <div className={styles.title}>{title}</div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Write minimal CSS**

```css
/* components/board/CardNode.module.css */
.cardNode {
  position: absolute;
  top: 0;
  left: 0;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 4px;
  overflow: hidden;
  will-change: transform;
  display: flex;
  flex-direction: column;
  cursor: grab;
}

.cardNode:active {
  cursor: grabbing;
}

.thumb {
  flex: 1 1 auto;
  width: 100%;
  object-fit: cover;
  min-height: 0;
}

.title {
  font-size: 12px;
  line-height: 1.3;
  padding: 4px 6px;
  background: rgba(255, 255, 255, 0.95);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
```

- [ ] **Step 3: Verify TypeScript compile**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add components/board/CardNode.tsx components/board/CardNode.module.css
git commit -m "feat(board): add CardNode leaf component (zero decoration, plain div)"
```

---

## Task 8: Create `ResizeHandle.tsx` (Skeleton)

**Files:**
- Create: `components/board/ResizeHandle.tsx`
- Create: `components/board/ResizeHandle.module.css`

- [ ] **Step 1: Write component**

```tsx
// components/board/ResizeHandle.tsx
'use client'

import { useRef } from 'react'
import { CARD_SIZE_LIMITS } from '@/lib/board/constants'
import styles from './ResizeHandle.module.css'

type ResizeHandleProps = {
  readonly cardId: string
  readonly initialW: number
  readonly initialH: number
  readonly onResize: (cardId: string, w: number, h: number) => void
}

export function ResizeHandle({ cardId, initialW, initialH, onResize }: ResizeHandleProps) {
  const startRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    startRef.current = { x: e.clientX, y: e.clientY, w: initialW, h: initialH }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = startRef.current
    if (!s) return
    const nextW = Math.min(Math.max(s.w + (e.clientX - s.x), CARD_SIZE_LIMITS.MIN_PX), CARD_SIZE_LIMITS.MAX_PX)
    const nextH = Math.min(Math.max(s.h + (e.clientY - s.y), CARD_SIZE_LIMITS.MIN_PX), CARD_SIZE_LIMITS.MAX_PX)
    onResize(cardId, nextW, nextH)
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    startRef.current = null
  }

  return (
    <div
      className={styles.handle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      role="slider"
      aria-label="Resize card"
    />
  )
}
```

- [ ] **Step 2: Write CSS**

```css
/* components/board/ResizeHandle.module.css */
.handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
  background: rgba(0, 0, 0, 0.15);
  border-top-left-radius: 4px;
  touch-action: none;
}

.handle:hover {
  background: rgba(0, 0, 0, 0.3);
}
```

- [ ] **Step 3: Verify compile**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add components/board/ResizeHandle.tsx components/board/ResizeHandle.module.css
git commit -m "feat(board): add ResizeHandle skeleton (min/max clamp, no snap)"
```

---

## Task 9: Create `ThemeLayer.tsx`

**Files:**
- Create: `components/board/ThemeLayer.tsx`

- [ ] **Step 1: Write component**

```tsx
// components/board/ThemeLayer.tsx
'use client'

import { getThemeMeta } from '@/lib/board/theme-registry'
import type { ThemeId } from '@/lib/board/types'
import themeStyles from './themes.module.css'
import { BOARD_Z_INDEX } from '@/lib/board/constants'

type ThemeLayerProps = {
  readonly themeId: ThemeId
  readonly totalWidth: number
  readonly totalHeight: number
}

export function ThemeLayer({ themeId, totalWidth, totalHeight }: ThemeLayerProps) {
  const meta = getThemeMeta(themeId)
  const className = themeStyles[meta.backgroundClassName] ?? ''

  return (
    <div
      className={className}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: `${totalWidth}px`,
        height: `${totalHeight}px`,
        zIndex: BOARD_Z_INDEX.THEME_BG,
        pointerEvents: 'none',
      }}
      data-theme-id={themeId}
    />
  )
}
```

- [ ] **Step 2: Verify compile**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/board/ThemeLayer.tsx
git commit -m "feat(board): add ThemeLayer (renders theme background, pointer-events none)"
```

---

## Task 10: Create `CardsLayer.tsx` with Viewport Culling

**Files:**
- Create: `components/board/CardsLayer.tsx`

- [ ] **Step 1: Write component**

```tsx
// components/board/CardsLayer.tsx
'use client'

import { useMemo } from 'react'
import type { CardPosition, LayoutCard } from '@/lib/board/types'
import { CardNode } from './CardNode'
import { ResizeHandle } from './ResizeHandle'
import { CULLING, BOARD_Z_INDEX } from '@/lib/board/constants'

type CardData = LayoutCard & {
  readonly title: string
  readonly thumbnailUrl?: string
}

type CardsLayerProps = {
  readonly cards: ReadonlyArray<CardData>
  readonly positions: Readonly<Record<string, CardPosition>>
  readonly viewport: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
  readonly onCardPointerDown: (e: React.PointerEvent, cardId: string) => void
  readonly onCardResize: (cardId: string, w: number, h: number) => void
}

export function CardsLayer({ cards, positions, viewport, onCardPointerDown, onCardResize }: CardsLayerProps) {
  const visibleCards = useMemo(() => {
    const bufferX = viewport.w * CULLING.BUFFER_SCREENS
    const bufferY = viewport.h * CULLING.BUFFER_SCREENS
    const minX = viewport.x - bufferX
    const maxX = viewport.x + viewport.w + bufferX
    const minY = viewport.y - bufferY
    const maxY = viewport.y + viewport.h + bufferY

    return cards.filter((c) => {
      const p = positions[c.id]
      if (!p) return false
      return !(p.x + p.w < minX || p.x > maxX || p.y + p.h < minY || p.y > maxY)
    })
  }, [cards, positions, viewport])

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, zIndex: BOARD_Z_INDEX.CARDS, pointerEvents: 'none' }}>
      {visibleCards.map((c) => {
        const p = positions[c.id]
        if (!p) return null
        return (
          <div key={c.id} style={{ position: 'absolute', pointerEvents: 'auto' }}>
            <CardNode
              id={c.id}
              position={p}
              title={c.title}
              thumbnailUrl={c.thumbnailUrl}
              onPointerDown={onCardPointerDown}
            />
            <div
              style={{
                position: 'absolute',
                top: `${p.y}px`,
                left: `${p.x}px`,
                width: `${p.w}px`,
                height: `${p.h}px`,
                pointerEvents: 'none',
              }}
            >
              <ResizeHandle cardId={c.id} initialW={p.w} initialH={p.h} onResize={onCardResize} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Verify compile**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/board/CardsLayer.tsx
git commit -m "feat(board): add CardsLayer with viewport culling (1-screen buffer)"
```

---

## Task 11: Create `InteractionLayer.tsx`

**Files:**
- Create: `components/board/InteractionLayer.tsx`

- [ ] **Step 1: Write component**

```tsx
// components/board/InteractionLayer.tsx
'use client'

import { useCallback, useRef } from 'react'
import { INTERACTION, BOARD_Z_INDEX } from '@/lib/board/constants'
import type { ScrollDirection } from '@/lib/board/types'

type InteractionLayerProps = {
  readonly direction: ScrollDirection
  readonly onScroll: (deltaX: number, deltaY: number) => void
  readonly children?: React.ReactNode
}

export function InteractionLayer({ direction, onScroll, children }: InteractionLayerProps) {
  const dragRef = useRef<{ startX: number; startY: number; active: boolean } | null>(null)

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    // For vertical direction: wheel deltaY → scroll Y
    // Future: horizontal direction → wheel deltaY → scroll X
    const m = INTERACTION.WHEEL_SCROLL_MULTIPLIER
    if (direction === 'horizontal') {
      onScroll(e.deltaY * m, 0)
    } else {
      onScroll(0, e.deltaY * m)
    }
  }, [direction, onScroll])

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Only initiate empty-area drag if target is the interaction layer itself (not a card bubble)
    if (e.target !== e.currentTarget) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startY: e.clientY, active: true }
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || !d.active) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (Math.abs(dx) < INTERACTION.DRAG_THRESHOLD_PX && Math.abs(dy) < INTERACTION.DRAG_THRESHOLD_PX) return
    const m = INTERACTION.EMPTY_DRAG_SCROLL_MULTIPLIER
    if (direction === 'horizontal') {
      onScroll(-dx * m, 0)
    } else {
      onScroll(0, -dy * m)
    }
    d.startX = e.clientX
    d.startY = e.clientY
  }, [direction, onScroll])

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    dragRef.current = null
  }, [])

  return (
    <div
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: BOARD_Z_INDEX.INTERACTION_OVERLAY,
        touchAction: 'none',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Verify compile**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/board/InteractionLayer.tsx
git commit -m "feat(board): add InteractionLayer (wheel + empty-drag → scroll callbacks)"
```

---

## Task 12: Create `BoardRoot.tsx` (Orchestrator)

**Files:**
- Create: `components/board/BoardRoot.tsx`

**Note:** For IndexedDB access reuse the existing storage hook (look in `lib/storage/`). If the existing hook is tightly coupled to the old board-client, extract or create a thin wrapper here. Do NOT import from the old board-client.

- [ ] **Step 1: Inspect existing storage hook**

```bash
ls lib/storage/
grep -l "useBookmarks\|useCards" lib/storage/ components/board/
```

Expected: identify the hook used to load bookmarks (likely `useBookmarks` or similar). Record its signature.

- [ ] **Step 2: Write BoardRoot using that hook**

```tsx
// components/board/BoardRoot.tsx
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { computeAutoLayout } from '@/lib/board/auto-layout'
import { DEFAULT_THEME_ID, getThemeMeta, listThemeIds } from '@/lib/board/theme-registry'
import { LAYOUT_CONFIG } from '@/lib/board/constants'
import type { CardPosition, LayoutCard, ThemeId } from '@/lib/board/types'
import { ThemeLayer } from './ThemeLayer'
import { CardsLayer } from './CardsLayer'
import { InteractionLayer } from './InteractionLayer'
import { useBookmarks } from '@/lib/storage/use-bookmarks' // ← REPLACE with actual hook identified in Step 1

const THEME_LS_KEY = 'booklage.board.themeId'

export function BoardRoot() {
  const { bookmarks, updateBookmark } = useBookmarks() // adjust API to match actual hook
  const [themeId, setThemeId] = useState<ThemeId>(DEFAULT_THEME_ID)
  const [overrides, setOverrides] = useState<Record<string, CardPosition>>({})
  const [viewport, setViewport] = useState({ x: 0, y: 0, w: 1200, h: 800 })
  const containerRef = useRef<HTMLDivElement>(null)

  // Initial theme load from localStorage
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(THEME_LS_KEY) : null
    if (saved && listThemeIds().includes(saved as ThemeId)) {
      setThemeId(saved as ThemeId)
    }
  }, [])

  // Persist theme
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_LS_KEY, themeId)
    }
  }, [themeId])

  // Migrate existing bookmarks' x/y/w/h → userOverridePos
  const layoutCards = useMemo<LayoutCard[]>(() => {
    return bookmarks.map((b) => {
      const override = overrides[b.id] ?? (
        // If bookmark already has explicit position from legacy schema, treat it as override
        (b.x != null && b.y != null && b.w != null && b.h != null)
          ? { x: b.x, y: b.y, w: b.w, h: b.h }
          : undefined
      )
      return {
        id: b.id,
        aspectRatio: b.aspectRatio ?? 1.5,  // fall back to 3:2
        userOverridePos: override,
      }
    })
  }, [bookmarks, overrides])

  // Size tracking
  useEffect(() => {
    const update = () => {
      const el = containerRef.current
      if (!el) return
      setViewport((v) => ({ ...v, w: el.clientWidth, h: el.clientHeight }))
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Compute layout
  const layout = useMemo(() => {
    const meta = getThemeMeta(themeId)
    return computeAutoLayout({
      cards: layoutCards,
      viewportWidth: viewport.w,
      targetRowHeight: meta.layoutParams?.targetRowHeight ?? LAYOUT_CONFIG.TARGET_ROW_HEIGHT_PX,
      gap: meta.layoutParams?.gap ?? LAYOUT_CONFIG.GAP_PX,
      direction: meta.direction,
    })
  }, [layoutCards, viewport.w, themeId])

  const handleScroll = useCallback((dx: number, dy: number) => {
    setViewport((v) => {
      const maxX = Math.max(0, layout.totalWidth - v.w)
      const maxY = Math.max(0, layout.totalHeight - v.h)
      return {
        ...v,
        x: Math.min(Math.max(v.x + dx, 0), maxX),
        y: Math.min(Math.max(v.y + dy, 0), maxY),
      }
    })
  }, [layout.totalHeight, layout.totalWidth])

  const handleCardPointerDown = useCallback((e: React.PointerEvent, cardId: string) => {
    // Drag card implementation
    const startPos = layout.positions[cardId]
    if (!startPos) return
    const startPointer = { x: e.clientX, y: e.clientY }
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)

    const move = (ev: PointerEvent) => {
      const nx = startPos.x + (ev.clientX - startPointer.x)
      const ny = startPos.y + (ev.clientY - startPointer.y)
      setOverrides((prev) => ({ ...prev, [cardId]: { x: nx, y: ny, w: startPos.w, h: startPos.h } }))
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.releasePointerCapture(e.pointerId)
      // Persist: write override back to IndexedDB
      const finalPos = overrides[cardId]
      if (finalPos) {
        updateBookmark(cardId, { x: finalPos.x, y: finalPos.y, w: finalPos.w, h: finalPos.h })
      }
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }, [layout.positions, overrides, updateBookmark])

  const handleCardResize = useCallback((cardId: string, w: number, h: number) => {
    const current = overrides[cardId] ?? layout.positions[cardId]
    if (!current) return
    const next = { ...current, w, h }
    setOverrides((prev) => ({ ...prev, [cardId]: next }))
    updateBookmark(cardId, next)
  }, [overrides, layout.positions, updateBookmark])

  const cardsForLayer = useMemo(() => {
    return bookmarks.map((b) => ({
      id: b.id,
      aspectRatio: b.aspectRatio ?? 1.5,
      title: b.title ?? '',
      thumbnailUrl: b.thumbnailUrl,
    }))
  }, [bookmarks])

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          transform: `translate3d(${-viewport.x}px, ${-viewport.y}px, 0)`,
          willChange: 'transform',
        }}
      >
        <ThemeLayer themeId={themeId} totalWidth={Math.max(viewport.w, layout.totalWidth)} totalHeight={Math.max(viewport.h, layout.totalHeight)} />
        <CardsLayer
          cards={cardsForLayer}
          positions={layout.positions}
          viewport={viewport}
          onCardPointerDown={handleCardPointerDown}
          onCardResize={handleCardResize}
        />
      </div>
      <InteractionLayer direction={getThemeMeta(themeId).direction} onScroll={handleScroll} />
      {/* Theme selector: simple button list for B0 — wire to i18n keys */}
      <div style={{ position: 'fixed', top: 16, right: 16, display: 'flex', gap: 8, zIndex: 1000 }}>
        {listThemeIds().map((id) => (
          <button key={id} onClick={() => setThemeId(id)} data-active={themeId === id}>
            {getThemeMeta(id).labelKey}
          </button>
        ))}
      </div>
    </div>
  )
}
```

**Caveat:** This task assumes `useBookmarks` exists with `{bookmarks, updateBookmark}` shape. If signature differs, adapt the imports at the top and the call sites. If the hook needs to be extracted from the old `board-client.tsx`, extract it into `lib/storage/use-bookmarks.ts` as a separate commit before this task.

- [ ] **Step 3: Verify compile**

```bash
pnpm tsc --noEmit
```

If `useBookmarks` import is unresolved, inspect the codebase:

```bash
grep -rn "bookmarks" lib/storage/ | head -20
```

Adjust import to match.

- [ ] **Step 4: Commit**

```bash
git add components/board/BoardRoot.tsx
git commit -m "feat(board): add BoardRoot orchestrator (IndexedDB load, layout, theme, interaction wiring)"
```

---

## Task 13: Wire `page.tsx` to Use `BoardRoot`

**Files:**
- Modify: `app/(app)/board/page.tsx`

- [ ] **Step 1: Inspect existing page**

```bash
cat app/\(app\)/board/page.tsx
```

Expected: loads `BoardClient` from `./board-client`. We replace this with BoardRoot.

- [ ] **Step 2: Update page**

```tsx
// app/(app)/board/page.tsx
import { BoardRoot } from '@/components/board/BoardRoot'

export default function BoardPage() {
  return <BoardRoot />
}
```

- [ ] **Step 3: Start dev server and smoke-test**

```bash
pnpm dev
# open http://localhost:3000/board in browser, verify page renders without errors
```

Expected: board renders with current bookmarks placed via auto-layout, theme defaults to dotted notebook.

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/board/page.tsx
git commit -m "feat(board): swap /board page to BoardRoot (old board-client now unused)"
```

---

## Task 14: Add Playwright E2E Tests

**Files:**
- Create: `tests/e2e/board-b0.spec.ts`

- [ ] **Step 1: Write test scenarios**

```typescript
// tests/e2e/board-b0.spec.ts
import { test, expect } from '@playwright/test'

test.describe('B0 board skeleton', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/board')
    await page.waitForLoadState('networkidle')
  })

  test('loads with theme background visible', async ({ page }) => {
    const themeBg = page.locator('[data-theme-id="dotted-notebook"]').first()
    await expect(themeBg).toBeVisible()
  })

  test('cards are rendered with non-zero position', async ({ page }) => {
    const card = page.locator('[data-card-id]').first()
    await expect(card).toBeVisible()
    const box = await card.boundingBox()
    expect(box?.width).toBeGreaterThan(0)
    expect(box?.height).toBeGreaterThan(0)
  })

  test('mouse wheel scrolls board vertically', async ({ page }) => {
    const firstCard = page.locator('[data-card-id]').first()
    const before = await firstCard.boundingBox()
    await page.mouse.wheel(0, 200)
    await page.waitForTimeout(100)
    const after = await firstCard.boundingBox()
    expect(after?.y).toBeLessThan(before?.y ?? 0)
  })

  test('empty-area drag scrolls like wheel', async ({ page }) => {
    const firstCard = page.locator('[data-card-id]').first()
    const before = await firstCard.boundingBox()
    // Drag from a point that's unlikely to hit a card (top-left corner with small offset)
    const { innerWidth, innerHeight } = await page.evaluate(() => ({ innerWidth: window.innerWidth, innerHeight: window.innerHeight }))
    await page.mouse.move(innerWidth - 20, innerHeight / 2)
    await page.mouse.down()
    await page.mouse.move(innerWidth - 20, innerHeight / 2 - 200, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(100)
    const after = await firstCard.boundingBox()
    expect(after?.y).toBeLessThan(before?.y ?? 0)
  })

  test('theme switch button changes background', async ({ page }) => {
    const gridBtn = page.locator('button', { hasText: /board\.theme\.gridPaper/ }).first()
    await gridBtn.click()
    await expect(page.locator('[data-theme-id="grid-paper"]').first()).toBeVisible()
  })

  test('card drag moves card', async ({ page }) => {
    const firstCard = page.locator('[data-card-id]').first()
    const before = await firstCard.boundingBox()
    if (!before) throw new Error('no card')
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2)
    await page.mouse.down()
    await page.mouse.move(before.x + before.width / 2 + 150, before.y + before.height / 2 + 100, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(100)
    const after = await firstCard.boundingBox()
    expect(Math.abs((after?.x ?? 0) - before.x)).toBeGreaterThan(50)
  })
})
```

- [ ] **Step 2: Run tests**

```bash
pnpm playwright test tests/e2e/board-b0.spec.ts
```

Expected: 6 / 6 PASS. If failures, debug specific scenarios (common issue: theme button text uses i18n key literal instead of translated — then adjust assertion to match actual render, e.g. use `data-theme-id` attribute).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/board-b0.spec.ts
git commit -m "test(board): add Playwright E2E for scroll, empty-drag, card-drag, theme-switch"
```

---

## Task 15: Delete Obsolete Files

**Files:** (many — listed below)

- [ ] **Step 1: Verify old imports are gone**

```bash
grep -rn "board-client\|DraggableCard\|BookmarkCard\|CardStyleWrapper\|SphereCanvas\|SphereModeToggle\|CustomCursor" app/ components/ lib/ tests/
```

Expected: no results (or only results inside files we're about to delete).

If any result references NEW files, fix the new file first.

- [ ] **Step 2: Delete files**

```bash
rm -r components/board/card-styles/
rm components/board/Canvas.tsx components/board/Canvas.module.css
rm components/board/DraggableCard.tsx components/board/DraggableCard.module.css
rm components/board/BookmarkCard.tsx components/board/BookmarkCard.module.css
rm components/board/CustomCursor.tsx components/board/CustomCursor.module.css
rm components/board/SphereCanvas.tsx components/board/SphereCanvas.module.css
rm components/board/SphereModeToggle.tsx
rm app/\(app\)/board/board-client.tsx
rm -r lib/glass/
rm -r lib/sphere/
```

- [ ] **Step 3: Verify TypeScript still compiles and tests pass**

```bash
pnpm tsc --noEmit
pnpm vitest run
pnpm playwright test tests/e2e/board-b0.spec.ts
```

Expected: all green.

If any import references a deleted file, fix it. Likely culprits: some peripheral components imported CardStyleWrapper or BookmarkCard — simplify them to use CardNode if board-related, or just remove the unused import.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(board): delete obsolete components (old Canvas, card-styles, sphere, custom cursor)"
```

---

## Task 16: Performance Validation

**Files:**
- Create: `docs/private/b0-perf-run.md` (results log — **private** because includes fps numbers that are benchmark data)

**Note:** The results go to `docs/private/` per CLAUDE.md privacy rule (benchmark-specific numbers could be misinterpreted publicly; keep internal).

- [ ] **Step 1: Prepare 1000-card fixture**

Temporarily seed IndexedDB with 1000 synthetic bookmarks. Use a dev-only script:

```typescript
// scripts/seed-board.ts (delete after use)
// In browser console when on /board:
// copy & paste this snippet
(async () => {
  const { openDB } = await import('idb')
  const db = await openDB('booklage', 4)
  const tx = db.transaction('bookmarks', 'readwrite')
  for (let i = 0; i < 1000; i++) {
    await tx.store.put({
      id: `seed-${i}`,
      url: `https://example.com/${i}`,
      title: `Seed card ${i}`,
      aspectRatio: 0.5 + Math.random() * 2.5,
      createdAt: Date.now() - i * 1000,
    })
  }
  await tx.done
  location.reload()
})()
```

- [ ] **Step 2: Measure fps**

1. Chrome DevTools → Performance tab → Record
2. Perform: scroll (wheel) for 10s at full speed
3. Stop recording, inspect frames
4. Record: average fps, dropped frames count, layout time

- [ ] **Step 3: Document results in `docs/private/b0-perf-run.md`**

```markdown
# B0 Performance Run — 2026-04-19

## Fixture
- 1000 synthetic bookmarks
- Random aspect ratios 0.5 ~ 3.0

## Results
| Metric | Target | Actual | Pass |
|--------|--------|--------|------|
| Avg fps (wheel scroll 10s) | ≥ 58 | [実測] | [Y/N] |
| Dropped frames | < 5% | [実測] | [Y/N] |
| 1000-card layout time | < 16ms | [実測] | [Y/N] |
| Visible DOM card count | ≤ 300 (culling) | [実測] | [Y/N] |

## Environment
- Machine: [spec]
- Browser: Chrome [version]
- Screen resolution: [...]

## Observations
- [注目すべき挙動]

## Follow-up
- [Y/N] if fail → which parameter to tune
```

- [ ] **Step 4: If any FAIL, iterate**

Common causes & fixes:
- Layout too slow → memoize `computeAutoLayout` on `layoutCards` + `viewport.w` + `themeId`
- Too many DOM → shrink culling buffer (change `CULLING.BUFFER_SCREENS` from 1.0 to 0.5)
- Frame drops → investigate if `setOverrides` re-renders all cards (use React DevTools Profiler)

Iterate until PASS, then re-run Step 2-3.

- [ ] **Step 5: Clean up seed data, commit results**

Clear seed cards from IndexedDB:

```javascript
(async () => {
  const { openDB } = await import('idb')
  const db = await openDB('booklage', 4)
  const tx = db.transaction('bookmarks', 'readwrite')
  const keys = await tx.store.getAllKeys()
  for (const k of keys) {
    if (typeof k === 'string' && k.startsWith('seed-')) await tx.store.delete(k)
  }
  await tx.done
})()
```

```bash
git add docs/private/b0-perf-run.md
git commit -m "perf(board): document B0 skeleton run on 1000-card fixture"
```

---

## Task 17: Real-Data Validation + Layout Tuning

**Files:**
- Modify (if needed): `lib/board/constants.ts` or `lib/board/theme-registry.ts` or `lib/board/auto-layout.ts`

Per spec B4 「B0 完成度基準」: "実装完了時、既存 IndexedDB のブクマで開いて視覚確認"。

- [ ] **Step 1: Open `/board` with user's real bookmark data**

Review with user (or user reviews alone) — does the layout feel "near-perfect"?

Common tunables if not:
- `TARGET_ROW_HEIGHT_PX`: higher = more airy (try 220). Lower = denser (try 150)
- `GAP_PX`: higher = more breathing room, lower = tighter collage
- Last-row behavior: currently left-aligned; alternative = extend row height to justify single/paired cards

- [ ] **Step 2: If tuning needed, update constants or registry params, commit**

```bash
git add lib/board/constants.ts  # or theme-registry.ts / auto-layout.ts
git commit -m "tune(board): adjust layout params based on real-data visual review"
```

If no tuning needed, skip commit.

---

## Task 18: Update TODO.md + Merge Prep

**Files:**
- Modify: `docs/TODO.md`

- [ ] **Step 1: Update "現在の状態" section**

```markdown
- **ブランチ**: master（rebuild-board merged）
- **進捗**: B0 (board skeleton) 完了 → B1 (装飾レイヤー) へ
- **ビルド・テスト**: ビルド通る、vitest + playwright green
- **B0 成果物**: 6層分離 (BoardRoot/ThemeLayer/CardsLayer/InteractionLayer/CardNode + auto-layout.ts)、テーマ2種（点線ノート、方眼紙）、1000カード 60fps 達成
```

- [ ] **Step 2: Move completed items to `TODO_COMPLETED.md`**

Move the whole「優先度1〜3」セクションが既に completed なのでそこは触らず、新規に追加:

```markdown
## B0 ボード骨組みリビルド（2026-04-19 完了）
- 6層分離: BoardRoot, ThemeLayer, CardsLayer, InteractionLayer, CardNode, ResizeHandle
- 純関数 auto-layout.ts + 8件テスト、1000カード < 16ms
- テーマ: 点線ノート（縦）+ 方眼紙（縦、白格子）
- viewport culling で 10000カード対応
- 装飾完全削除（card-styles, glass, sphere, custom cursor）
- Playwright E2E 6件 green
- 本番品質の justified grid layout
```

- [ ] **Step 3: Commit TODO updates**

```bash
git add docs/TODO.md docs/TODO_COMPLETED.md
git commit -m "docs(todo): mark B0 complete, update current state for next session"
```

---

## Self-Review Checklist

Ran through spec sections against tasks:

- ✅ B1 Architecture (6層) — tasks 2, 3, 4, 7, 8, 9, 10, 11, 12
- ✅ B2 Theme Registry — task 4
- ✅ B3 Background design specs — task 4 (CSS)
- ✅ B4 Justified grid algorithm — task 5 (TDD)
- ✅ B4 Completion quality bar — task 17 (real-data tuning)
- ✅ B5 Interaction model — task 11 + 12
- ✅ B6 Performance 60fps 1000/10000 — task 16
- ✅ B7 Clean code rules — enforced via file size limits in each task
- ✅ B8 Deletion + archival — tasks 1 (archive), 15 (delete)
- ✅ B9 Acceptance criteria — tasks 13, 14, 16
- ✅ B10 Open questions — addressed in task 12 (migration in BoardRoot) and task 17 (tuning)

No unresolved placeholders. Type consistency check: `LayoutCard` / `CardPosition` / `ThemeMeta` used consistently throughout tasks.

---

## Out-of-Scope Reminders

If implementation drifts toward these, STOP and file for next sprint:

- リキッドグラス、ガラス装飾
- カードスタイル（Polaroid/Newspaper/Magnet）
- 3D 球体、3D タイル
- カスタムカーソル
- ブクマ管理（既読/未読、Inbox、フォルダサジェスト）
- 砂浜/水平線テーマ（縦テーマ以外）
- スプリング物理、3D フリップ、周辺リフロー演出
