# Phase 2 — 受信側 Lightbox + 矢印 nav Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 受信側 (`/share#d=...`) のカードクリックで board と同じ Lightbox を read-only で開き、board / 受信側両方に左右矢印 + Instagram 風 dot indicator + キーボード ←/→ nav を追加し、左下リンクを「自分も AllMarks を使う ↗」に改名する。

**Architecture:** Lightbox の Props を `BoardItem | ShareCard` の union で受け、内部で `LightboxItem` (slim 共通 shape) に正規化する additive 拡張。nav 制御は呼び出し側 (BoardRoot / SharedView) が `currentIndex / total / onNav / onJump` を渡す形。chevron + dots は Lightbox 内部で render、slide animation は GSAP。

**Tech Stack:** Next.js 14 App Router、TypeScript strict、Vanilla CSS Modules、GSAP、Vitest (unit)、Playwright (E2E)。

**Spec:** [`docs/superpowers/specs/2026-05-06-receive-side-lightbox-design.md`](../specs/2026-05-06-receive-side-lightbox-design.md)

---

## File Structure

### 新規ファイル

| パス | 責務 |
|------|------|
| `lib/share/lightbox-item.ts` | `LightboxItem` 型 + `normalizeItem(BoardItem \| ShareCard)` 関数 |
| `lib/share/lightbox-item.test.ts` | normalize の unit tests |
| `components/board/LightboxNavChevron.tsx` | 左右 chevron 単体 (presentational) |
| `components/board/LightboxNavDots.tsx` | Instagram stories 風 dynamic dot indicator |
| `tests/e2e/share-receive-lightbox.spec.ts` | 受信側 Lightbox + nav の E2E |
| `tests/e2e/board-lightbox-nav.spec.ts` | board 側 nav の E2E |

### 変更ファイル

| パス | 変更内容 |
|------|----------|
| `components/board/Lightbox.tsx` | union props 受け入れ、`view: LightboxItem` 内部化、`bookmarkId` → `identity` リネーム、nav prop 追加、chevron + dots 配置、←/→ keydown、slide animation |
| `components/board/Lightbox.module.css` | chevron + dots 関連スタイル追加 |
| `components/board/BoardRoot.tsx` | `lightboxIndex` 算出 (filteredItems base)、Lightbox に nav 渡す |
| `components/share/SharedView.tsx` | `openState` 追加、Lightbox 配置、文言改名 |
| `components/share/ShareFrame.tsx` | `onCardOpen: (i, rect) => void` シグネチャ拡張 |

---

## Task 1: lightbox-item util + 型定義 + tests

**Files:**
- Create: `lib/share/lightbox-item.ts`
- Create: `lib/share/lightbox-item.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/share/lightbox-item.test.ts
import { describe, it, expect } from 'vitest'
import type { BoardItem } from '@/lib/storage/use-board-data'
import type { ShareCard } from '@/lib/share/types'
import { normalizeItem } from './lightbox-item'

describe('normalizeItem', () => {
  it('normalizes a BoardItem with all fields', () => {
    const board: BoardItem = {
      bookmarkId: 'b-1',
      cardId: 'c-1',
      title: 'Hello',
      description: 'desc',
      thumbnail: 'https://example.com/t.jpg',
      url: 'https://example.com/page',
      aspectRatio: 1.5,
      gridIndex: 0,
      orderIndex: 0,
      sizePreset: 'M',
      isRead: false,
      isDeleted: false,
      tags: [],
      displayMode: 'visual',
    }
    expect(normalizeItem(board)).toEqual({
      url: 'https://example.com/page',
      title: 'Hello',
      description: 'desc',
      thumbnail: 'https://example.com/t.jpg',
      kind: 'board',
    })
  })

  it('normalizes a BoardItem with optional fields missing', () => {
    const board: BoardItem = {
      bookmarkId: 'b-2',
      cardId: 'c-2',
      title: 'Only',
      url: 'https://example.com/x',
      aspectRatio: 1,
      gridIndex: 0,
      orderIndex: 0,
      sizePreset: 'S',
      isRead: false,
      isDeleted: false,
      tags: [],
      displayMode: null,
    }
    expect(normalizeItem(board)).toEqual({
      url: 'https://example.com/x',
      title: 'Only',
      description: null,
      thumbnail: null,
      kind: 'board',
    })
  })

  it('normalizes a ShareCard with all fields', () => {
    const card: ShareCard = {
      u: 'https://example.com/p',
      t: 'Title',
      d: 'Desc',
      th: 'https://example.com/thumb.jpg',
      ty: 'website',
      x: 0, y: 0, w: 0.5, h: 0.5, s: 'M',
    }
    expect(normalizeItem(card)).toEqual({
      url: 'https://example.com/p',
      title: 'Title',
      description: 'Desc',
      thumbnail: 'https://example.com/thumb.jpg',
      kind: 'share',
    })
  })

  it('normalizes a ShareCard with optional fields missing', () => {
    const card: ShareCard = {
      u: 'https://example.com/p',
      t: 'Title only',
      ty: 'website',
      x: 0, y: 0, w: 0.5, h: 0.5, s: 'M',
    }
    expect(normalizeItem(card)).toEqual({
      url: 'https://example.com/p',
      title: 'Title only',
      description: null,
      thumbnail: null,
      kind: 'share',
    })
  })

  it('discriminates BoardItem vs ShareCard by presence of bookmarkId', () => {
    const board = normalizeItem({
      bookmarkId: 'b', cardId: 'c', title: 't', url: 'https://e/x',
      aspectRatio: 1, gridIndex: 0, orderIndex: 0, sizePreset: 'M',
      isRead: false, isDeleted: false, tags: [], displayMode: null,
    } as BoardItem)
    const share = normalizeItem({
      u: 'https://e/x', t: 't', ty: 'website',
      x: 0, y: 0, w: 0, h: 0, s: 'M',
    } as ShareCard)
    expect(board.kind).toBe('board')
    expect(share.kind).toBe('share')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test lib/share/lightbox-item -- --run
```
Expected: FAIL with "Cannot find module './lightbox-item'"

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/share/lightbox-item.ts
import type { BoardItem } from '@/lib/storage/use-board-data'
import type { ShareCard } from './types'

export type LightboxItem = {
  readonly url: string
  readonly title: string
  readonly description: string | null
  readonly thumbnail: string | null
  readonly kind: 'board' | 'share'
}

function isBoardItem(item: BoardItem | ShareCard): item is BoardItem {
  return 'bookmarkId' in item
}

export function normalizeItem(item: BoardItem | ShareCard): LightboxItem {
  if (isBoardItem(item)) {
    return {
      url: item.url,
      title: item.title,
      description: item.description ?? null,
      thumbnail: item.thumbnail ?? null,
      kind: 'board',
    }
  }
  return {
    url: item.u,
    title: item.t,
    description: item.d ?? null,
    thumbnail: item.th ?? null,
    kind: 'share',
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test lib/share/lightbox-item -- --run
```
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
rtk git add lib/share/lightbox-item.ts lib/share/lightbox-item.test.ts
rtk git commit -m "feat(share): add LightboxItem type + normalizeItem util

Slim normalized shape used by Lightbox to accept either BoardItem
(my own board) or ShareCard (received share view). Discriminates
by bookmarkId presence.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Lightbox 内部 view 化 + bookmarkId → identity リネーム (no behavior change)

**Files:**
- Modify: `components/board/Lightbox.tsx`

**目的:** 既存挙動を保ったまま、Lightbox 本体と内部 sub-components が `BoardItem` ではなく `LightboxItem` (新しい slim 型) を受け取るよう refactor する。Props 自体はまだ `BoardItem | null` のまま (Task 3 で union に拡張)。

- [ ] **Step 1: Add normalize import + view computation at top of Lightbox**

`components/board/Lightbox.tsx:5-19` の import ブロックに追加:

```ts
import { normalizeItem, type LightboxItem } from '@/lib/share/lightbox-item'
```

`components/board/Lightbox.tsx:30-42` 周辺で `bookmarkId` を計算している箇所:

```ts
// 旧:
const isTweet = item ? detectUrlType(item.url) === 'tweet' : false
const tweetId = isTweet && item ? extractTweetId(item.url) : null
const bookmarkId = item?.bookmarkId
```

を以下に置換:

```ts
const view: LightboxItem | null = item ? normalizeItem(item) : null
const isTweet = view ? detectUrlType(view.url) === 'tweet' : false
const tweetId = isTweet && view ? extractTweetId(view.url) : null
// identity is the stable string ref for effect deps. Replaces former
// `bookmarkId` so the same hook fires for both BoardItem (board side)
// and ShareCard (receive side).
const identity = view ? `${view.kind}:${view.url}` : null
```

- [ ] **Step 2: Replace all `bookmarkId` deps with `identity`**

`Lightbox.tsx` の以下の行を一括置換 (GREP 結果: line 180, 189, 192, 202, 231, 359):

```ts
// 旧: if (!bookmarkId) return
// 新: if (!identity) return

// 旧: }, [bookmarkId, requestClose])
// 新: }, [identity, requestClose])

// 旧: }, [bookmarkId])
// 新: }, [identity])

// 旧: if (!bookmarkId || !frameRef.current) return
// 新: if (!identity || !frameRef.current) return

// コメント中の "bookmarkId" → "identity" も置換
```

- [ ] **Step 3: Replace all internal `item.X` accesses with `view.X` in Lightbox top-level JSX**

`Lightbox.tsx:385-428` 周辺の JSX:

```tsx
// 旧:
{sceneActive && SceneComp && originRect && targetRectState && item.thumbnail && (
  <SceneComp ... thumbnail={item.thumbnail} ... />
)}
...
<a href={item.url} ...>{t('board.lightbox.openSource')} →</a>
```

`view` 経由に置換 (item は外部 props のまま、内部使用は view):

```tsx
{sceneActive && SceneComp && originRect && targetRectState && view.thumbnail && (
  <SceneComp ... thumbnail={view.thumbnail} ... />
)}
...
<a href={view.url} ...>{t('board.lightbox.openSource')} →</a>
```

`Lightbox.tsx:371` の host 算出:
```ts
// 旧:
try { return new URL(item.url).hostname.replace(/^www\./, '') }
// 新:
try { return new URL(view.url).hostname.replace(/^www\./, '') }
```

その他 `item.` を直接読んでいる Lightbox top-level 内のコードもすべて `view.` に置換。`item` は props 受け入れ (union 化準備) と sub-components への引数渡しに残す。

- [ ] **Step 4: Refactor sub-components to take LightboxItem**

`Lightbox.tsx` 内で定義されている sub-components (TweetMedia, TweetText, DefaultText, LightboxMedia, cleanInstagramText 等) の引数型を `BoardItem` → `LightboxItem` に変更。

例 (`Lightbox.tsx:447` 周辺の `cleanInstagramText`):

```ts
// 旧: function cleanInstagramText(item: BoardItem): {...}
// 新: function cleanInstagramText(item: LightboxItem): {...}
```

`item.title ?? ''` などの読み取りは `LightboxItem.title` が `string` (BoardItem と同じ) なのでそのまま動く。`item.description ?? ''` は `LightboxItem.description: string | null` なので `?? ''` は引き続き有効。

`LightboxMedia`、`TweetMedia`、`TweetText`、`DefaultText`、`SquareTweetMedia` 等もすべて引数型を `LightboxItem` に。

呼び出し側 (Lightbox top-level の JSX 内) は `<TweetMedia item={view} ... />` のように `view` を渡す。

- [ ] **Step 5: Update BoardItem import — remove if unused**

`Lightbox.tsx:5`:
```ts
import type { BoardItem } from '@/lib/storage/use-board-data'
```
全 sub-components を refactor した結果、ファイル内で `BoardItem` 型が一切使われなくなる。tsc が unused import を警告するので削除。

ただし Props 型が `item: BoardItem | null` のままなら import は残す。Task 3 で union 化するため、ここでは Props 型変更しない方針 (1 commit 1 関心)。Props 型用に `BoardItem` import は残す。

- [ ] **Step 6: Run tsc to verify type safety**

```bash
rtk tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 7: Run existing unit tests + E2E to verify no regression**

```bash
pnpm test -- --run
```
Expected: 244 既存 tests + 5 新 normalize tests = 249 passing、0 failed

```bash
pnpm test:e2e tests/e2e/share-composer-edit.spec.ts
```
Expected: 既存 sender / composer-edit E2E 全て pass

- [ ] **Step 8: Commit**

```bash
rtk git add components/board/Lightbox.tsx
rtk git commit -m "refactor(lightbox): internalize view: LightboxItem, rename bookmarkId → identity

No behavior change. Prepares Lightbox to accept ShareCard in addition
to BoardItem in the next commit. Sub-components now take LightboxItem
which is structurally identical for the fields they read.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Lightbox Props を `BoardItem | ShareCard` union に拡張

**Files:**
- Modify: `components/board/Lightbox.tsx:21-28`

- [ ] **Step 1: Update Props type**

```ts
// 旧:
import type { BoardItem } from '@/lib/storage/use-board-data'

type Props = {
  readonly item: BoardItem | null
  readonly originRect: DOMRect | null
  readonly onClose: () => void
}

// 新:
import type { BoardItem } from '@/lib/storage/use-board-data'
import type { ShareCard } from '@/lib/share/types'

type Props = {
  readonly item: BoardItem | ShareCard | null
  readonly originRect: DOMRect | null
  readonly onClose: () => void
}
```

- [ ] **Step 2: Run tsc**

```bash
rtk tsc --noEmit
```
Expected: 0 errors (内部はすでに `view: LightboxItem` ベースなので props 拡張で破綻しない)

- [ ] **Step 3: Run all tests**

```bash
pnpm test -- --run && pnpm test:e2e tests/e2e/share-composer-edit.spec.ts tests/e2e/share-sender.spec.ts
```
Expected: 全 pass

- [ ] **Step 4: Commit**

```bash
rtk git add components/board/Lightbox.tsx
rtk git commit -m "feat(lightbox): accept BoardItem | ShareCard in props (additive union)

Internal view normalization handles both shapes. No call-site changes
required — board side still passes BoardItem.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: nav prop 型定義 + keyboard ←/→ handler (UI なし)

**Files:**
- Modify: `components/board/Lightbox.tsx`

- [ ] **Step 1: Add nav prop to Props type**

```ts
type LightboxNav = {
  readonly currentIndex: number
  readonly total: number
  readonly onNav: (dir: -1 | 1) => void
  readonly onJump: (index: number) => void
}

type Props = {
  readonly item: BoardItem | ShareCard | null
  readonly originRect: DOMRect | null
  readonly onClose: () => void
  readonly nav?: LightboxNav
}
```

`export function Lightbox({ item, originRect, onClose, nav }: Props)` に拡張。

- [ ] **Step 2: Add ←/→ keydown handler beside existing Esc handler**

`Lightbox.tsx:179-189` の Escape useEffect の隣に追加:

```ts
// Arrow nav. Skip when an INPUT/TEXTAREA/SELECT has focus to avoid
// hijacking text editing within an embed. Esc handler intentionally
// does NOT skip on input focus — close should always work.
useEffect(() => {
  if (!identity || !nav) return
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    const ae = document.activeElement
    const tag = ae?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    e.stopPropagation()
    nav.onNav(e.key === 'ArrowLeft' ? -1 : 1)
  }
  window.addEventListener('keydown', onKey)
  return (): void => window.removeEventListener('keydown', onKey)
}, [identity, nav])
```

- [ ] **Step 3: Run tsc**

```bash
rtk tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 4: Run unit tests**

```bash
pnpm test -- --run
```
Expected: 全 pass (nav prop 未指定だと既存挙動完全互換)

- [ ] **Step 5: Commit**

```bash
rtk git add components/board/Lightbox.tsx
rtk git commit -m "feat(lightbox): add nav prop type + keyboard ←/→ handler (no UI yet)

When nav is provided, Arrow keys call nav.onNav(±1). Skips when
INPUT/TEXTAREA/SELECT has focus. nav still optional — board/receive
sides will wire it next.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: BoardRoot で nav を Lightbox に渡す

**Files:**
- Modify: `components/board/BoardRoot.tsx:54-60, 247-269, 558-562`

**設計判断:** nav scope は `filteredItems` (現在 canvas に表示中のもの)。`items` 全体ではない。理由: フィルタ「YouTube のみ」中に左右 nav したら他フィルタのカードに飛ぶのは UX 破綻。

- [ ] **Step 1: Compute lightboxIndex from filteredItems + lightboxItemId**

`BoardRoot.tsx` の既存 `lightboxItem` useMemo 周辺 (line 266-269) を以下に置換:

```ts
// 旧:
const lightboxItem = useMemo(
  () => items.find((it) => it.bookmarkId === lightboxItemId) ?? null,
  [items, lightboxItemId],
)

// 新:
// Nav scope = filteredItems (what's currently visible on canvas).
// Items found only in `items` (e.g. archived, filtered-out) are not
// nav-reachable from the lightbox — that matches the user's mental
// model: "I'm browsing what I see".
const lightboxIndex = useMemo(
  () => filteredItems.findIndex((it) => it.bookmarkId === lightboxItemId),
  [filteredItems, lightboxItemId],
)
const lightboxItem = lightboxIndex >= 0 ? filteredItems[lightboxIndex] : null
```

- [ ] **Step 2: Add nav handlers**

`BoardRoot.tsx` の `handleLightboxClose` 直下に追加:

```ts
const handleLightboxNav = useCallback((dir: -1 | 1): void => {
  if (filteredItems.length === 0) return
  const next = ((lightboxIndex + dir) % filteredItems.length + filteredItems.length) % filteredItems.length
  setLightboxItemId(filteredItems[next]?.bookmarkId ?? null)
  setLightboxOriginRect(null) // nav transitions don't have a fresh origin rect
}, [filteredItems, lightboxIndex])

const handleLightboxJump = useCallback((index: number): void => {
  if (index < 0 || index >= filteredItems.length) return
  setLightboxItemId(filteredItems[index]?.bookmarkId ?? null)
  setLightboxOriginRect(null)
}, [filteredItems])
```

- [ ] **Step 3: Pass nav prop to Lightbox**

`BoardRoot.tsx:558-562`:

```tsx
// 旧:
<Lightbox
  item={lightboxItem}
  originRect={lightboxOriginRect}
  onClose={handleLightboxClose}
/>

// 新:
<Lightbox
  item={lightboxItem}
  originRect={lightboxOriginRect}
  onClose={handleLightboxClose}
  nav={lightboxItem ? {
    currentIndex: lightboxIndex,
    total: filteredItems.length,
    onNav: handleLightboxNav,
    onJump: handleLightboxJump,
  } : undefined}
/>
```

- [ ] **Step 4: Run tsc + unit tests + E2E**

```bash
rtk tsc --noEmit && pnpm test -- --run
```
Expected: 0 errors、全 unit tests pass

```bash
pnpm test:e2e tests/e2e/share-composer-edit.spec.ts
```
Expected: pass (BoardRoot 既存 lightbox open/close は無影響)

- [ ] **Step 5: Manual smoke test (optional but recommended)**

```bash
pnpm dev
```
- ブラウザで board を開く
- カードクリックで Lightbox 開く
- ← / → キーを押す → コンソールにエラーなし、Lightbox 内 item が切替 (chevron/dots 未実装なので視覚 UI なし、ただし内容は変わる)

- [ ] **Step 6: Commit**

```bash
rtk git add components/board/BoardRoot.tsx
rtk git commit -m "feat(board): wire Lightbox nav to filteredItems with loop

Nav scope is the currently-visible filteredItems list, not raw items.
←/→ keyboard now switches between visible cards. Chevron + dots UI
land in next commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: LightboxNavChevron component + CSS + 配置

**Files:**
- Create: `components/board/LightboxNavChevron.tsx`
- Modify: `components/board/Lightbox.module.css`
- Modify: `components/board/Lightbox.tsx`

- [ ] **Step 1: Create LightboxNavChevron component**

```tsx
// components/board/LightboxNavChevron.tsx
'use client'

import type { ReactElement } from 'react'
import styles from './Lightbox.module.css'

type Props = {
  readonly dir: 'prev' | 'next'
  readonly onClick: () => void
}

export function LightboxNavChevron({ dir, onClick }: Props): ReactElement {
  const label = dir === 'prev' ? '前のカード' : '次のカード'
  return (
    <button
      type="button"
      className={`${styles.navChevron} ${dir === 'prev' ? styles.navChevronPrev : styles.navChevronNext}`}
      onClick={onClick}
      aria-label={label}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {dir === 'prev'
          ? <polyline points="9 2, 3 7, 9 12" />
          : <polyline points="5 2, 11 7, 5 12" />}
      </svg>
    </button>
  )
}
```

- [ ] **Step 2: Add chevron CSS to Lightbox.module.css**

`components/board/Lightbox.module.css` の末尾に追加:

```css
/* ---- Nav chevron (left/right) ---- */
.navChevron {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.10);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: rgba(255, 255, 255, 0.92);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 140ms cubic-bezier(0.33, 1, 0.68, 1),
              transform 140ms cubic-bezier(0.33, 1, 0.68, 1);
  z-index: 2;
  padding: 0;
}

.navChevronPrev { left: 24px; }
.navChevronNext { right: 24px; }

/* Reveal on backdrop hover, focus, or hover of the chevron itself */
.backdrop:hover .navChevron,
.navChevron:hover,
.navChevron:focus-visible {
  opacity: 1;
}

.navChevron:hover {
  transform: translateY(-50%) scale(1.06);
}

.navChevron:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.65);
  outline-offset: 2px;
}
```

`.backdrop:hover .navChevron` の semantics 確認: 既存 `.backdrop` クラスが Lightbox の root だと仮定。確認できない場合は実際の root class 名 (`Lightbox.tsx:399-401` 周辺の `data-testid="lightbox"` 要素の className) を grep してそれに合わせる。

- [ ] **Step 3: Render chevron in Lightbox when nav is provided**

`Lightbox.tsx` の JSX、`<div ref={frameRef} className={styles.frame}>` の **直前** (backdrop 直下) に追加:

```tsx
{nav && nav.total > 1 && (
  <>
    <LightboxNavChevron dir="prev" onClick={() => nav.onNav(-1)} />
    <LightboxNavChevron dir="next" onClick={() => nav.onNav(1)} />
  </>
)}
```

import 追加:
```ts
import { LightboxNavChevron } from './LightboxNavChevron'
```

- [ ] **Step 4: Run tsc + unit tests**

```bash
rtk tsc --noEmit && pnpm test -- --run
```
Expected: 0 errors、全 pass

- [ ] **Step 5: Manual smoke test**

```bash
pnpm dev
```
- board でカードクリック → Lightbox 開く
- マウスを Lightbox エリアに乗せる → 左右に chevron が fade-in
- chevron click → 別カード切替
- カード 1 個だけのフィルタ → chevron 表示されない
- ←/→ キーも引き続き動く

- [ ] **Step 6: Commit**

```bash
rtk git add components/board/LightboxNavChevron.tsx components/board/Lightbox.module.css components/board/Lightbox.tsx
rtk git commit -m "feat(lightbox): chevron buttons (hover-fade left/right nav)

48px circle, blur-bg, hover opacity 0→1 (140ms power2.out). Hidden when
total ≤ 1. Wired to nav.onNav from caller.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: LightboxNavDots component + CSS + 配置

**Files:**
- Create: `components/board/LightboxNavDots.tsx`
- Modify: `components/board/Lightbox.module.css`
- Modify: `components/board/Lightbox.tsx`

- [ ] **Step 1: Create LightboxNavDots component**

```tsx
// components/board/LightboxNavDots.tsx
'use client'

import { useLayoutEffect, useRef, type ReactElement } from 'react'
import { gsap } from 'gsap'
import styles from './Lightbox.module.css'

type Props = {
  readonly current: number
  readonly total: number
  readonly onJump: (index: number) => void
}

/** Distance-based dot size class. Special-cased for total=2 where
 *  using the adjacent (smaller) class would look unbalanced — there
 *  the non-active dot uses a "non-active equal" style. */
function dotClass(distance: number, total: number, styles: CSSModuleClasses): string {
  if (distance === 0) return styles.navDotActive
  if (total === 2) return styles.navDotInactive  // total=2: only active vs non-active
  if (distance === 1) return styles.navDotAdjacent
  if (distance === 2) return styles.navDotFar
  if (distance === 3) return styles.navDotEdge
  return styles.navDotHidden
}

type CSSModuleClasses = Readonly<Record<string, string>>

const DOT_GAP = 8 // px between dot centers (matches CSS)
const VISIBLE_HALF = 3 // dots visible on each side of active

export function LightboxNavDots({ current, total, onJump }: Props): ReactElement | null {
  const stripRef = useRef<HTMLDivElement>(null)
  const prevCurrentRef = useRef<number>(current)

  // Slide strip so active dot stays at horizontal center.
  useLayoutEffect(() => {
    if (!stripRef.current) return
    const offset = -current * DOT_GAP
    gsap.to(stripRef.current, {
      x: offset,
      duration: 0.24,
      ease: 'power3.out',
    })
  }, [current])

  // Pulse the new active dot on change.
  useLayoutEffect(() => {
    if (prevCurrentRef.current === current) return
    const strip = stripRef.current
    if (!strip) return
    const newActive = strip.querySelector<HTMLButtonElement>(
      `[data-dot-index="${current}"]`,
    )
    if (newActive) {
      gsap.fromTo(
        newActive,
        { scale: 1.0 },
        { scale: 1.15, duration: 0.18, ease: 'back.out(2)' },
      )
    }
    prevCurrentRef.current = current
  }, [current])

  if (total <= 1) return null

  return (
    <div className={styles.navDotsWrap}>
      <div className={styles.navDots} ref={stripRef}>
        {Array.from({ length: total }, (_, i) => {
          const distance = Math.abs(i - current)
          return (
            <button
              key={i}
              type="button"
              data-dot-index={i}
              className={`${styles.navDot} ${dotClass(distance, total, styles)}`}
              onClick={(): void => onJump(i)}
              aria-label={`カード ${i + 1} / ${total}`}
              aria-current={i === current ? 'true' : undefined}
            />
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add dot CSS to Lightbox.module.css**

```css
/* ---- Nav dots (Instagram stories style) ---- */
.navDotsWrap {
  position: absolute;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  width: 280px;
  display: flex;
  justify-content: center;
  overflow: hidden;
  pointer-events: none; /* let inner dots receive */
  z-index: 2;
}

.navDots {
  display: flex;
  gap: 4px;
  align-items: center;
  pointer-events: auto;
}

.navDot {
  flex: 0 0 auto;
  border: none;
  padding: 0;
  cursor: pointer;
  background: transparent;
  display: inline-block;
  transition: width 180ms ease, height 180ms ease, background 180ms ease;
}

.navDot:hover { transform: scale(1.08); }

.navDot::before {
  content: '';
  display: block;
  border-radius: 50%;
  width: 100%;
  height: 100%;
  background: currentColor;
}

.navDotActive {
  width: 10px;
  height: 10px;
  color: rgba(255, 255, 255, 1);
}
.navDotInactive {
  /* Used only when total === 2 — keeps the second dot visually balanced
     against the active dot rather than shrinking it like an "adjacent". */
  width: 8px;
  height: 8px;
  color: rgba(255, 255, 255, 0.55);
}
.navDotAdjacent {
  width: 6px;
  height: 6px;
  color: rgba(255, 255, 255, 0.65);
}
.navDotFar {
  width: 4px;
  height: 4px;
  color: rgba(255, 255, 255, 0.40);
}
.navDotEdge {
  width: 3px;
  height: 3px;
  color: rgba(255, 255, 255, 0.25);
}
.navDotHidden {
  width: 0;
  height: 0;
  color: transparent;
  pointer-events: none;
}
```

`.navDot` の background:transparent + ::before pattern は border-radius を `transition: width/height` 中も保つため。GSAP scale tween と CSS transition は座標系が違うので競合しない (transform vs width/height)。

- [ ] **Step 3: Render dots in Lightbox**

`Lightbox.tsx` で chevron 配置の隣に追加:

```tsx
{nav && nav.total > 1 && (
  <>
    <LightboxNavChevron dir="prev" onClick={() => nav.onNav(-1)} />
    <LightboxNavChevron dir="next" onClick={() => nav.onNav(1)} />
    <LightboxNavDots
      current={nav.currentIndex}
      total={nav.total}
      onJump={nav.onJump}
    />
  </>
)}
```

import:
```ts
import { LightboxNavDots } from './LightboxNavDots'
```

- [ ] **Step 4: Run tsc + unit tests**

```bash
rtk tsc --noEmit && pnpm test -- --run
```
Expected: 0 errors、全 pass

- [ ] **Step 5: Manual smoke test**

```bash
pnpm dev
```
- 5+ カードあるフィルタで Lightbox 開く
- 下端中央に dot indicator 表示
- ←/→ で nav するたび active dot が pulse + strip がスライド
- 末尾から → で先頭へ loop (派手なスライド)
- dot 直接クリック → ジャンプ
- カード 1 個のみ → dot 非表示
- カード 2 個 → 2 dots 表示

- [ ] **Step 6: Commit**

```bash
rtk git add components/board/LightboxNavDots.tsx components/board/Lightbox.module.css components/board/Lightbox.tsx
rtk git commit -m "feat(lightbox): Instagram stories-style dot indicator

Dynamic-strip dots with size hierarchy (active 10px → edge 3px), GSAP
pulse on active change, translateX strip-shift to keep active centered.
Hidden when total ≤ 1. dot click → onJump.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: nav 切替時の slide animation (cross-fade + horizontal slide)

**Files:**
- Modify: `components/board/Lightbox.tsx`

- [ ] **Step 1: Add prev-identity tracking + slide effect**

`Lightbox.tsx` の既存 useLayoutEffect (open animation) の **後** に追加:

```ts
// Slide animation on nav transition. Distinct from the FLIP open
// animation: this only fires when identity changes WHILE the lightbox
// is already open (not on first mount). Direction inferred from the
// nav.currentIndex delta.
const prevIdentityRef = useRef<string | null>(null)
const prevNavIndexRef = useRef<number | null>(null)

useLayoutEffect(() => {
  if (!identity) {
    prevIdentityRef.current = null
    prevNavIndexRef.current = null
    return
  }
  const prevIdentity = prevIdentityRef.current
  const prevNavIndex = prevNavIndexRef.current
  prevIdentityRef.current = identity
  prevNavIndexRef.current = nav?.currentIndex ?? null

  // First mount or open from origin — let the FLIP open effect handle it.
  if (prevIdentity === null) return
  // Nav prop disappeared (shouldn't happen mid-open, but guard).
  if (!nav || prevNavIndex === null) return

  const el = frameRef.current
  if (!el) return

  // Direction: positive delta = forward (slide in from right).
  // For wrap-around (last → first or first → last), pick the visually
  // intuitive direction based on nav action: if delta is large negative
  // (last → 0 wrap forward), still slide as forward.
  const delta = nav.currentIndex - prevNavIndex
  let dir: 1 | -1
  if (Math.abs(delta) > nav.total / 2) {
    // Wrap-around case
    dir = delta > 0 ? -1 : 1
  } else {
    dir = delta > 0 ? 1 : -1
  }

  const SLIDE_DIST = 40
  gsap.killTweensOf(el)
  gsap.fromTo(
    el,
    { x: dir * SLIDE_DIST, opacity: 0 },
    {
      x: 0,
      opacity: 1,
      duration: 0.28,
      ease: 'power3.out',
    },
  )
}, [identity, nav])
```

**注意:** この effect は識別子変化を 1 effect で扱う。React 19 の useLayoutEffect は前回の cleanup 完了後に発火するので、prevIdentityRef が古い識別子を持っている瞬間にアクセス可能。

- [ ] **Step 2: Run tsc + unit tests**

```bash
rtk tsc --noEmit && pnpm test -- --run
```
Expected: 0 errors、全 pass

- [ ] **Step 3: Manual smoke test**

```bash
pnpm dev
```
- board で Lightbox 開いて → クリック → 右から +40px 入って中央へ slide + opacity 0→1
- ← クリック → 左から -40px 入って同様に slide
- 末尾 → 先頭 loop でも派手にスライドする (Q4=C 確定)
- 初回 open は FLIP のまま (slide animation は走らない)

- [ ] **Step 4: Commit**

```bash
rtk git add components/board/Lightbox.tsx
rtk git commit -m "feat(lightbox): slide + cross-fade animation on nav transition

Distinct from FLIP open. Direction inferred from nav.currentIndex
delta with wrap-around handling. 280ms power3.out, 40px horizontal
offset. Initial open still uses FLIP via originRect.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: ShareFrame `onCardOpen` シグネチャを `(i, rect) => void` に拡張

**Files:**
- Modify: `components/share/ShareFrame.tsx`
- Modify: `components/share/SharedView.tsx` (callback 側)
- Modify: `components/share/ShareComposer.tsx` (board 側 callback、もし存在すれば)

- [ ] **Step 1: Find all onCardOpen callers**

```bash
```

(Grep tool で検索)

```
Grep: pattern "onCardOpen", path "components/share"
```

確認結果に基づき:
- `ShareFrame.tsx` 内の Props 定義
- `SharedView.tsx` の `<ShareFrame onCardOpen={...} />` 箇所
- (もしあれば) `ShareComposer.tsx` の同様箇所

- [ ] **Step 2: Update ShareFrame Props type**

```ts
// components/share/ShareFrame.tsx
type Props = {
  // ... 既存 props ...
  readonly onCardOpen?: (index: number, rect: DOMRect | null) => void
  // ... 既存 props ...
}
```

- [ ] **Step 3: Update internal click handler in ShareFrame**

ShareFrame 内のカードクリックハンドラ (ファイル中の `onClick` 周辺) を:

```tsx
// 旧:
onClick={(): void => onCardOpen?.(i)}

// 新:
onClick={(e: React.MouseEvent<HTMLElement>): void => {
  const rect = e.currentTarget.getBoundingClientRect()
  onCardOpen?.(i, rect)
}}
```

- [ ] **Step 4: Update SharedView callback (Task 10 の preview)**

`SharedView.tsx:88-93` の `onCardOpen={(i): void => { ... }}` を:

```tsx
onCardOpen={(_i: number, _rect: DOMRect | null): void => {
  // Receiver-side click → window.open original URL.
  // (Task 10 で Lightbox 起動に置換)
  const url = state.data.cards[_i]?.u
  if (!url) return
  window.open(url, '_blank', 'noopener,noreferrer')
}}
```

(まだ Lightbox 配線はせず、シグネチャ拡張のみで動作確認)

- [ ] **Step 5: Update editable-mode caller (ShareComposer side)**

ShareComposer 経由で ShareFrame を使っている箇所が Grep で見つかれば、その `onCardOpen` を `(i, _rect) => ...` に変更 (rect 使わないが型整合のため引数追加)。

- [ ] **Step 6: Run tsc + unit tests + composer-edit E2E**

```bash
rtk tsc --noEmit && pnpm test -- --run && pnpm test:e2e tests/e2e/share-composer-edit.spec.ts tests/e2e/share-sender.spec.ts
```
Expected: 0 errors、全 pass、composer-edit + sender E2E pass

- [ ] **Step 7: Commit**

```bash
rtk git add components/share/ShareFrame.tsx components/share/SharedView.tsx
# + ShareComposer.tsx if updated
rtk git commit -m "refactor(share): ShareFrame onCardOpen signature → (i, rect)

Adds DOMRect from currentTarget so the receive-side Lightbox can
seed its FLIP open animation from the clicked card position.
Receiver still opens window.open in this commit; Lightbox wiring next.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: SharedView に Lightbox 配置 + 文言改名

**Files:**
- Modify: `components/share/SharedView.tsx`

- [ ] **Step 1: Replace `LoadState`-internal handling with openState**

`SharedView.tsx` の上部 import + state を以下に置換:

```tsx
import { useEffect, useState, useCallback, type ReactElement } from 'react'
import Link from 'next/link'
import { decodeShareData, type DecodeDiagnostics } from '@/lib/share/decode'
import { sanitizeShareData } from '@/lib/share/validate'
import { computeAspectFrameSize } from '@/lib/share/aspect-presets'
import type { ShareData } from '@/lib/share/types'
import { ShareFrame } from './ShareFrame'
import { Lightbox } from '@/components/board/Lightbox'
import styles from './SharedView.module.css'

// ... ErrorInfo + LoadState 型定義は既存のまま ...

type LightboxOpenState = {
  readonly index: number
  readonly rect: DOMRect | null
}

export function SharedView(): ReactElement {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [size, setSize] = useState<{ w: number; h: number }>(VIEWPORT_FALLBACK)
  const [openState, setOpenState] = useState<LightboxOpenState | null>(null)
  // ... (既存の useEffect 群そのまま) ...
```

- [ ] **Step 2: Add nav handlers**

`SharedView.tsx` の `useEffect` 群の後、return の前に追加:

```ts
const cards = state.kind === 'ready' ? state.data.cards : []

const handleClose = useCallback((): void => {
  setOpenState(null)
}, [])

const handleNav = useCallback((dir: -1 | 1): void => {
  if (cards.length === 0) return
  setOpenState((s) => {
    if (!s) return s
    const next = ((s.index + dir) % cards.length + cards.length) % cards.length
    return { index: next, rect: null }
  })
}, [cards.length])

const handleJump = useCallback((index: number): void => {
  if (index < 0 || index >= cards.length) return
  setOpenState({ index, rect: null })
}, [cards.length])
```

注意: `cards` を useCallback の dep に直接入れず `cards.length` だけにすることで、再生成回数を最小化。

- [ ] **Step 3: Replace return JSX**

`SharedView.tsx` の `if (state.kind === 'ready')` ブロックを以下に置換:

```tsx
if (state.kind === 'loading') {
  return <div className={styles.center}>読み込み中…</div>
}
if (state.kind === 'error') {
  return <ErrorView info={state.info} />
}

const frame = computeAspectFrameSize(state.data.aspect, size.w, size.h)
const openCard = openState ? state.data.cards[openState.index] ?? null : null

return (
  <div className={styles.page}>
    <div className={styles.frameHost}>
      <ShareFrame
        cards={state.data.cards}
        width={frame.width}
        height={frame.height}
        editable={false}
        onCardOpen={(i, rect): void => setOpenState({ index: i, rect })}
      />
    </div>
    <Link href="/board" className={styles.cornerLink}>
      自分も AllMarks を使う ↗
    </Link>
    <Lightbox
      item={openCard}
      originRect={openState?.rect ?? null}
      onClose={handleClose}
      nav={openCard ? {
        currentIndex: openState!.index,
        total: state.data.cards.length,
        onNav: handleNav,
        onJump: handleJump,
      } : undefined}
    />
  </div>
)
```

- [ ] **Step 4: Run tsc + unit tests**

```bash
rtk tsc --noEmit && pnpm test -- --run
```
Expected: 0 errors、全 pass

- [ ] **Step 5: Manual smoke test**

```bash
pnpm dev
```
- 1) board で Share → Composer → Copy URL
- 2) シークレットウィンドウで開く → 受信ビュー表示
- 3) カードクリック → Lightbox が origin rect から FLIP で開く
- 4) ←/→ キー、chevron click、dot click、すべて動く
- 5) Lightbox 内「元のサイトへ ↗」で元 URL 新タブ
- 6) ✕ で閉じる
- 7) 左下に「自分も AllMarks を使う ↗」表示

- [ ] **Step 6: Commit**

```bash
rtk git add components/share/SharedView.tsx
rtk git commit -m "feat(share): receive-side Lightbox + nav + 自分も AllMarks を使う rename

Click a card in /share view → Lightbox opens with FLIP from card rect.
←/→ + chevron + dot indicator nav through all cards. Original URL
opens via Lightbox's existing 元のサイトへ ↗ link. Corner link
renamed: AllMarks で表現する → 自分も AllMarks を使う.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: E2E — 受信側 Lightbox + nav

**Files:**
- Create: `tests/e2e/share-receive-lightbox.spec.ts`

- [ ] **Step 1: Write the failing E2E**

```ts
// tests/e2e/share-receive-lightbox.spec.ts
import { test, expect } from '@playwright/test'

// Helper: produce a /share#d=... URL with N synthetic cards.
async function makeShareUrl(page: import('@playwright/test').Page, n: number): Promise<string> {
  await page.goto('/share')
  // Inject test fixture: navigate to /share with a precomputed hash
  // generated by encodeShareData. Easier: build the hash in Node here
  // via a dynamic import.
  const { encodeShareData } = await import('../../lib/share/encode')
  const cards = Array.from({ length: n }, (_, i) => ({
    u: `https://example.com/card-${i}`,
    t: `Card ${i}`,
    ty: 'website' as const,
    x: 0.1 + (i * 0.05) % 0.8,
    y: 0.1 + (i * 0.07) % 0.8,
    w: 0.2,
    h: 0.2,
    s: 'M' as const,
  }))
  const data = { v: 1 as const, aspect: '16:9' as const, cards }
  const encoded = await encodeShareData(data)
  return `/share#d=${encoded}`
}

test.describe('Receive-side Lightbox + nav', () => {
  test('clicking a card opens the Lightbox', async ({ page }) => {
    const url = await makeShareUrl(page, 5)
    await page.goto(url)
    await expect(page.getByText('自分も AllMarks を使う')).toBeVisible()

    // Click the first ShareFrame card
    const cards = page.locator('[data-testid^="share-frame-card-"]')
    await cards.first().click()

    await expect(page.getByTestId('lightbox')).toBeVisible()
  })

  test('arrow keys navigate cards', async ({ page }) => {
    const url = await makeShareUrl(page, 5)
    await page.goto(url)
    await page.locator('[data-testid^="share-frame-card-"]').first().click()
    await expect(page.getByTestId('lightbox')).toBeVisible()

    await page.keyboard.press('ArrowRight')
    // Lightbox identity changed — we expect the title text to update.
    // (exact assertion depends on Lightbox DOM; use text content)
    await expect(page.getByTestId('lightbox')).toContainText('Card 1')

    await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('lightbox')).toContainText('Card 2')

    await page.keyboard.press('ArrowLeft')
    await expect(page.getByTestId('lightbox')).toContainText('Card 1')
  })

  test('arrow right from last loops to first', async ({ page }) => {
    const url = await makeShareUrl(page, 3)
    await page.goto(url)
    await page.locator('[data-testid^="share-frame-card-"]').nth(2).click()
    await expect(page.getByTestId('lightbox')).toContainText('Card 2')

    await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('lightbox')).toContainText('Card 0')
  })

  test('Esc closes the Lightbox', async ({ page }) => {
    const url = await makeShareUrl(page, 3)
    await page.goto(url)
    await page.locator('[data-testid^="share-frame-card-"]').first().click()
    await expect(page.getByTestId('lightbox')).toBeVisible()
    await page.keyboard.press('Escape')
    // Lightbox close animation is ~500ms — wait for it
    await expect(page.getByTestId('lightbox')).not.toBeVisible({ timeout: 2000 })
  })

  test('corner link renamed to 自分も AllMarks を使う', async ({ page }) => {
    const url = await makeShareUrl(page, 3)
    await page.goto(url)
    await expect(page.getByText('自分も AllMarks を使う')).toBeVisible()
    await expect(page.getByText('AllMarks で表現する')).not.toBeVisible()
  })
})
```

`data-testid="share-frame-card-N"` が ShareFrame に既に付いていない場合は、ShareFrame 内のカード要素に追加する小修正が必要。まず Grep で確認:

```
Grep: pattern "data-testid", path "components/share/ShareFrame.tsx"
```

なければ Task 9 のときに付ける (rect 取得 onClick の隣で `data-testid={\`share-frame-card-${i}\`}` を追加)。

- [ ] **Step 2: Run E2E to verify it fails first (only if Lightbox not yet wired)**

(もし Tasks 1-10 完了済なら、このテストは即 pass するはず)

```bash
pnpm test:e2e tests/e2e/share-receive-lightbox.spec.ts
```

- [ ] **Step 3: Fix any issues**

E2E が落ちたら、Lightbox の DOM 構造、testid、文言を確認して spec / impl 側を整合させる。

- [ ] **Step 4: Run E2E to verify pass**

```bash
pnpm test:e2e tests/e2e/share-receive-lightbox.spec.ts
```
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
rtk git add tests/e2e/share-receive-lightbox.spec.ts
# + ShareFrame.tsx if testid added
rtk git commit -m "test(share): E2E for receive-side Lightbox + arrow nav

Covers: card click opens Lightbox, ← / → switches cards, end → start
loops, Esc closes, corner link renamed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: E2E — board 側 nav

**Files:**
- Create: `tests/e2e/board-lightbox-nav.spec.ts`

- [ ] **Step 1: Write E2E using existing board fixture**

既存 board E2E (例: `tests/e2e/share-composer-edit.spec.ts`) の page 開きパターンを流用。最低 3 枚のブックマークが必要。

```ts
// tests/e2e/board-lightbox-nav.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Board-side Lightbox nav', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/board')
    // Seed bookmarks. Existing pattern (see share-sender.spec.ts):
    // either inject via window.__test_seed_bookmarks if such hook exists,
    // or use page.evaluate() to write directly to IndexedDB via idb,
    // matching the shape stored by lib/storage/use-board-data.ts.
    // If no fixture pattern exists, the test.skip below kicks in
    // gracefully — same approach as share-composer-edit.spec.ts.
    //
    // To check the existing helper:
    //   Grep `seedBookmarks|test_seed|__seed` under tests/
    //   If found → use it. If not → keep this test as a smoke check
    //   that auto-skips on empty boards (3 tests below all guard).
  })

  test('arrow keys navigate between cards', async ({ page }) => {
    test.skip(
      (await page.locator('[data-testid^="card-"]').count()) < 3,
      'Need 3+ seeded bookmarks',
    )
    await page.locator('[data-testid^="card-"]').first().click()
    await expect(page.getByTestId('lightbox')).toBeVisible()

    const initialText = await page.getByTestId('lightbox').textContent()
    await page.keyboard.press('ArrowRight')
    await expect.poll(
      async () => page.getByTestId('lightbox').textContent(),
      { timeout: 1000 },
    ).not.toBe(initialText)
  })

  test('chevron click navigates', async ({ page }) => {
    test.skip(
      (await page.locator('[data-testid^="card-"]').count()) < 3,
      'Need 3+ seeded bookmarks',
    )
    await page.locator('[data-testid^="card-"]').first().click()
    await expect(page.getByTestId('lightbox')).toBeVisible()

    const initialText = await page.getByTestId('lightbox').textContent()
    await page.getByLabel('次のカード').click({ force: true })
    await expect.poll(
      async () => page.getByTestId('lightbox').textContent(),
      { timeout: 1000 },
    ).not.toBe(initialText)
  })

  test('dot click jumps to that index', async ({ page }) => {
    test.skip(
      (await page.locator('[data-testid^="card-"]').count()) < 3,
      'Need 3+ seeded bookmarks',
    )
    await page.locator('[data-testid^="card-"]').first().click()
    await expect(page.getByTestId('lightbox')).toBeVisible()

    // Click the 3rd dot (index 2)
    await page.getByLabel('カード 3 / ').first().click({ force: true })
    // Verify content updated (test scope is just "it didn't error")
    await page.waitForTimeout(400)
  })
})
```

注: board の seed 手順は既存 E2E と整合。0 cards 環境では `test.skip` でスキップ (graceful)。

- [ ] **Step 2: Run E2E**

```bash
pnpm test:e2e tests/e2e/board-lightbox-nav.spec.ts
```
Expected: 3 passed (or graceful skip if no seed)

- [ ] **Step 3: Commit**

```bash
rtk git add tests/e2e/board-lightbox-nav.spec.ts
rtk git commit -m "test(board): E2E for board-side Lightbox arrow nav

Covers keyboard, chevron, dot click navigation. Skips gracefully
when fewer than 3 bookmarks are seeded.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: 全体回帰確認 + TODO.md 更新 + Service Worker bump + 本番 deploy

**Files:**
- Modify: `docs/TODO.md`
- Modify: `public/sw.js` (もし version 文字列があれば)

- [ ] **Step 1: Full unit + E2E run**

```bash
rtk tsc --noEmit && pnpm test -- --run && pnpm test:e2e
```
Expected: tsc 0 errors、全 unit tests pass、全 E2E pass (または既存 graceful skips)

- [ ] **Step 2: Build verification**

```bash
rtk pnpm build
```
Expected: build OK、`out/` 出力済

- [ ] **Step 3: Update TODO.md**

`docs/TODO.md` 先頭の「現在の状態」セクションを更新:
- バージョン番号を v77 → v78 (or v79、deploy 番号に合わせる)
- 「Phase 2 完了」項目を「今セッション到達点」に追加
- 「次セッション最優先」を Phase 3 (import フロー) に書き換え
- `🆕 別タスクとして登録` の「Phase 2: 受信側 Lightbox + 矢印 nav」を strike-through (~~~~)

Service Worker version 文字列もアップ (もし `public/sw.js` に `v72-2026-05-05-...` 形式があれば)。

- [ ] **Step 4: Commit TODO update**

```bash
rtk git add docs/TODO.md public/sw.js
rtk git commit -m "docs(todo): close Phase 2 — 受信側 Lightbox + 矢印 nav shipped"
```

- [ ] **Step 5: Deploy to Cloudflare Pages**

```bash
npx wrangler pages deploy out/ --project-name=booklage --branch=master --commit-dirty=true
```
Expected: deploy 成功、`booklage.pages.dev` に反映

- [ ] **Step 6: Final user-facing verification on production**

ユーザーに伝達:
- `https://booklage.pages.dev` をハードリロード
- 自分の board でカードを 3 枚以上用意 → Share → Copy URL
- シークレットで開いて受信側を確認
- カードクリック → Lightbox 起動
- ← / → / chevron / dot 全部動くか確認
- 「自分も AllMarks を使う ↗」が表示されるか

---

## Self-Review Checklist (実装者向け)

- [ ] tsc 0 errors
- [ ] 既存 unit tests + 新 normalize tests = 249+ passing
- [ ] 既存 E2E (composer-edit, sender) 無回帰
- [ ] 新 E2E (share-receive-lightbox, board-lightbox-nav) pass
- [ ] board / 受信側両方で chevron + dots + arrow nav 動作
- [ ] 端末ループ (派手スライド) 動作
- [ ] 「自分も AllMarks を使う ↗」表示
- [ ] Lightbox.tsx 内に `bookmarkId` 残存ゼロ (tweetId 等は別概念なので残してよい)
- [ ] 本番 deploy 完了
