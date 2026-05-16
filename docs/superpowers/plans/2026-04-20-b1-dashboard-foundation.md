# B1 Dashboard Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add edge-anchored left sidebar with refractive liquid glass, simplify Toolbar to `整列` + `シェア` 2 ボタン, remove layoutMode concept (canvas always free-placement), implement Align action (one-shot re-grid of all cards).

**Architecture:** Sidebar uses SVG `feDisplacementMap` filter for clear refractive glass (Chrome) with blur+opacity fallback (Firefox/Safari). layoutMode state is removed entirely; Task 16's free-drag state machine becomes the default behavior. Align is a GSAP-morph action triggered by Toolbar button, reusing Task 14's morph timeline pattern. Share button in Toolbar is wired to a no-op stub (ShareModal lives in Plan B).

**Tech Stack:** React 19, Next.js 14 App Router, Vanilla CSS + CSS Modules, GSAP (for morph), IndexedDB via idb (v6 → v7 migration), TypeScript strict, vitest, @testing-library/react.

**Scope decomposition:**
- **This plan (A — Foundation):** Sidebar, Toolbar simplification, Align action, IDB migration, cleanup. Ships a working new-UI app.
- **Next plan (B — Share System):** Full-screen ShareModal, frame selection + drag/resize, SNS Web Intents + Web Share API, bookmark URL encoding/decoding, watermark, importer. To be written after Plan A ships.

**Spec:** `docs/superpowers/specs/2026-04-20-b1-dashboard-redesign-design.md`

---

## File Structure

**New files:**
- `components/board/Sidebar.tsx` — Sidebar component (logo, search shell, library, folders placeholder, theme, F-key hint)
- `components/board/Sidebar.module.css` — Sidebar styling
- `components/board/LiquidGlass.tsx` — Reusable SVG filter + glass wrapper
- `components/board/LiquidGlass.module.css` — Glass base styling with fallbacks
- `lib/board/align.ts` — Pure function `alignAllToGrid(items, containerWidth, targetRowHeight, gap)` → new items with freePos set to grid positions
- `lib/board/align.test.ts` — Unit tests for align
- `public/displacement/glass-001.png` — Pre-rendered displacement map (committed asset)

**Modified files:**
- `app/globals.css` — Add new CSS variables (glass, sidebar, corners, accents)
- `components/board/BoardRoot.tsx` — Render Sidebar, offset canvas, F-key listener, handleAlign, remove layoutMode state
- `components/board/Toolbar.tsx` — Prop shape to `{ onAlign, onShare }`, remove theme/export buttons
- `components/board/Toolbar.module.css` — Minor cleanup (unused classes removed)
- `lib/storage/indexeddb.ts` — DB_VERSION bump 6 → 7, migration removes `layoutMode` from BoardConfig
- `lib/storage/board-config.ts` — Remove `layoutMode` from type + loadBoardConfig/saveBoardConfig
- `lib/board/types.ts` — Remove `LayoutMode` export
- `messages/ja.json` — Add sidebar keys, remove stale frame keys

**Deleted files:**
- `components/board/FramePresetPopover.tsx` — Superseded by Plan B's ShareModal
- `components/board/FramePresetPopover.module.css`

---

## Task 1: CSS Variables + Globals

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Read the current globals.css to understand existing vars**

Run: `cat app/globals.css` (or Read tool) and note existing `--color-*` / other vars — **do not remove or rename existing variables**. Only append the new AllMarks-wide block.

- [ ] **Step 2: Append new variable block at the end of `:root`**

Add to `app/globals.css` inside the existing `:root { ... }` block (or create a new `:root` block appended to the file if no clean insertion point):

```css
:root {
  /* === B1 Dashboard Foundation variables (2026-04-20) === */

  /* Liquid glass */
  --glass-clarity: 0.04;                 /* background alpha (0 = fully clear) */
  --glass-blur: 0px;                     /* fallback blur when refract not supported */
  --glass-displacement-scale: 12;        /* feDisplacementMap scale attribute */
  --glass-edge: rgba(255, 255, 255, 0.55);
  --glass-specular: rgba(255, 255, 255, 0.9);

  /* Sidebar geometry */
  --sidebar-width: 240px;
  --sidebar-collapsed: 52px;
  --sidebar-ease: cubic-bezier(0.4, 0, 0.2, 1);
  --sidebar-duration: 340ms;

  /* Asymmetric corners */
  --corner-radius-outer: 24px;
  --corner-radius-inner: 6px;

  /* Accents */
  --accent-primary: #7c5cfc;   /* AllMarks violet (may already exist; dedupe if so) */
  --accent-dark: #1a1a1a;
}
```

**Deduplication check:** If `--accent-primary` or `--color-accent-primary` already exists in `app/globals.css`, do NOT add a duplicate. Keep the existing one. Use it downstream via its existing name; adapt the plan's CSS blocks accordingly.

- [ ] **Step 3: Verify build still passes**

Run: `rtk pnpm tsc --noEmit`
Expected: PASS (CSS changes don't affect TS).

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "feat(styles): CSS variables for B1 dashboard foundation (glass, sidebar, corners)"
```

---

## Task 2: Displacement Map Asset

**Files:**
- Create: `public/displacement/glass-001.png`

- [ ] **Step 1: Generate the displacement map**

The displacement map is a 512x512 PNG where R channel encodes X displacement, G encodes Y. For MVP, use a simple radial-gradient-based noise pattern. Use this Node one-liner (requires `sharp`; already a dep transitively via `next/image`):

Create `scripts/generate-displacement-map.mjs`:

```javascript
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

const SIZE = 512
const buf = Buffer.alloc(SIZE * SIZE * 4)

// Simple radial gradient with gentle sine wave distortion.
// R channel: x displacement. G channel: y displacement.
// Both centered at 128 (= 0.5 in 0-255 space, ≈ neutral).
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4
    const cx = SIZE / 2, cy = SIZE / 2
    const dx = x - cx, dy = y - cy
    const r = Math.sqrt(dx * dx + dy * dy) / (SIZE / 2)

    // Radial base + mild angular ripple
    const angle = Math.atan2(dy, dx)
    const rippleX = Math.sin(angle * 3 + r * 6) * 40
    const rippleY = Math.cos(angle * 3 + r * 6) * 40

    buf[i] = Math.max(0, Math.min(255, 128 + rippleX))     // R (x displacement)
    buf[i + 1] = Math.max(0, Math.min(255, 128 + rippleY)) // G (y displacement)
    buf[i + 2] = 0
    buf[i + 3] = 255
  }
}

mkdirSync('public/displacement', { recursive: true })
await sharp(buf, { raw: { width: SIZE, height: SIZE, channels: 4 } })
  .png()
  .toFile('public/displacement/glass-001.png')

console.log('Wrote public/displacement/glass-001.png (512x512, radial ripple)')
```

- [ ] **Step 2: Run it**

Run: `node scripts/generate-displacement-map.mjs`
Expected: `Wrote public/displacement/glass-001.png (512x512, radial ripple)`
Verify: file exists at `public/displacement/glass-001.png` and is ~50-200KB.

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-displacement-map.mjs public/displacement/glass-001.png
git commit -m "chore(assets): generate initial displacement map for liquid glass (radial ripple)"
```

**Note for polish phase:** this PNG is intentionally simple. Later iteration can replace it with a hand-crafted map (e.g., from Figma using the feDisplacementMap preview).

---

## Task 3: LiquidGlass Component

**Files:**
- Create: `components/board/LiquidGlass.tsx`
- Create: `components/board/LiquidGlass.module.css`

- [ ] **Step 1: Write CSS**

Create `components/board/LiquidGlass.module.css`:

```css
/* Clear refractive glass (Chrome/Edge with backdrop-filter: url(#...)) */
.glass {
  position: relative;
  background: rgba(255, 255, 255, var(--glass-clarity));
  border: 1px solid var(--glass-edge);
  box-shadow:
    inset 0 1px 0 var(--glass-specular),
    inset 0 -1px 0 rgba(255, 255, 255, 0.2),
    0 20px 60px rgba(0, 0, 0, 0.12),
    0 2px 6px rgba(0, 0, 0, 0.05);
  backdrop-filter: url(#booklage-refract);
  -webkit-backdrop-filter: url(#booklage-refract);
}

/* Fallback: browsers that don't support url() in backdrop-filter */
@supports not (backdrop-filter: url(#test)) {
  .glass {
    background: rgba(255, 255, 255, 0.58);
    backdrop-filter: blur(18px) saturate(180%);
    -webkit-backdrop-filter: blur(18px) saturate(180%);
  }
}

/* SVG defs container — hidden but must be in DOM */
.svgDefs {
  position: absolute;
  width: 0;
  height: 0;
  pointer-events: none;
}
```

- [ ] **Step 2: Write the component**

Create `components/board/LiquidGlass.tsx`:

```tsx
'use client'

import type { ReactElement, ReactNode } from 'react'
import styles from './LiquidGlass.module.css'

type Props = {
  readonly children: ReactNode
  readonly className?: string
}

/**
 * Refractive liquid glass wrapper. Uses SVG feDisplacementMap for true
 * refraction (Chrome/Edge). Firefox/Safari fall back to blur+opacity.
 *
 * Requires `/displacement/glass-001.png` to exist in public/.
 *
 * Renders the SVG filter defs inline so the component is self-contained.
 * Multiple mounts are fine — duplicate ids are tolerated by browsers for defs,
 * but we guard via a stable id.
 */
export function LiquidGlass({ children, className }: Props): ReactElement {
  return (
    <>
      <svg className={styles.svgDefs} aria-hidden="true">
        <defs>
          <filter id="booklage-refract" x="0%" y="0%" width="100%" height="100%">
            <feImage
              href="/displacement/glass-001.png"
              result="dmap"
              preserveAspectRatio="xMidYMid slice"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="dmap"
              scale="var(--glass-displacement-scale, 12)"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>
      <div className={`${styles.glass} ${className ?? ''}`.trim()}>
        {children}
      </div>
    </>
  )
}
```

**Note:** `scale="var(...)"` in SVG is not standard — SVG attributes don't resolve CSS vars. Implementers: change the scale attribute to a static `12` and expose dynamic scale via the CSS variable routed through a wrapper CSS class that sets `filter` at the consuming element level when animation is needed (Plan B polish). For Plan A, the static `12` is sufficient.

Update the component to use literal:

```tsx
<feDisplacementMap
  in="SourceGraphic"
  in2="dmap"
  scale="12"
  xChannelSelector="R"
  yChannelSelector="G"
/>
```

- [ ] **Step 3: Verify build**

Run: `rtk pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/board/LiquidGlass.tsx components/board/LiquidGlass.module.css
git commit -m "feat(board): LiquidGlass component with feDisplacementMap refraction + blur fallback"
```

---

## Task 4: Sidebar Shell + Toggle Animation

**Files:**
- Create: `components/board/Sidebar.tsx`
- Create: `components/board/Sidebar.module.css`

This task creates the sidebar with expand/collapse animation but no content yet (placeholder text inside). Content is Task 5.

- [ ] **Step 1: Write CSS**

Create `components/board/Sidebar.module.css`:

```css
.sidebar {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  width: var(--sidebar-width);
  z-index: 50;
  transition: transform var(--sidebar-duration) var(--sidebar-ease);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif;
  font-size: 13px;
  color: #1a1a1a;
  box-sizing: border-box;
}

/* Inner padding area (so asymmetric corners don't clip icon content) */
.inner {
  position: absolute;
  inset: 0;
  padding: 20px 16px 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Collapsed: slide left so only 52px icon rail remains visible */
.collapsed {
  transform: translateX(calc(-1 * (var(--sidebar-width) - var(--sidebar-collapsed))));
}

/* Asymmetric corners (soft left, tight right) */
.sidebar :global(.glass) {
  border-radius:
    var(--corner-radius-outer)
    var(--corner-radius-inner)
    var(--corner-radius-inner)
    var(--corner-radius-outer);
  height: 100%;
}

.placeholder {
  color: #888;
  font-size: 12px;
  padding: 10px;
}
```

- [ ] **Step 2: Write the component**

Create `components/board/Sidebar.tsx`:

```tsx
'use client'

import { useEffect, type ReactElement } from 'react'
import { LiquidGlass } from './LiquidGlass'
import styles from './Sidebar.module.css'

type Props = {
  readonly collapsed: boolean
  readonly onToggle: () => void
}

/**
 * Left edge-anchored sidebar. Expanded 240px, collapsed slides to 52px icon rail.
 * F key toggles collapse state (wired in BoardRoot).
 */
export function Sidebar({ collapsed, onToggle }: Props): ReactElement {
  // Attach Escape-free, minimal behaviour. F key is owned by BoardRoot,
  // but local click toggling is also exposed via onToggle.
  useEffect(() => {
    // No-op here — kept for future hover behaviours.
  }, [])

  return (
    <aside
      className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`.trim()}
      data-testid="board-sidebar"
      aria-label="ボードナビゲーション"
    >
      <LiquidGlass>
        <div className={styles.inner}>
          <div className={styles.placeholder}>
            Sidebar placeholder — content lands in Task 5.
          </div>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onToggle}
            style={{ padding: 4, fontSize: 11 }}
          >
            {collapsed ? '展開 (F)' : '折り畳む (F)'}
          </button>
        </div>
      </LiquidGlass>
    </aside>
  )
}
```

- [ ] **Step 3: Verify build**

Run: `rtk pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/board/Sidebar.tsx components/board/Sidebar.module.css
git commit -m "feat(board): Sidebar shell with expand/collapse transform animation"
```

---

## Task 5: Sidebar Content (Logo, Search shell, Library, Theme, Folders placeholder)

**Files:**
- Modify: `components/board/Sidebar.tsx`
- Modify: `components/board/Sidebar.module.css`
- Modify: `messages/ja.json`

This task fills in the content: logo, search input (non-functional shell, labeled "B2 で実装"), Library section with 3 items + counts, Folders placeholder, Theme at bottom, vertical signature, F-to-hide hint.

- [ ] **Step 1: Add i18n keys to `messages/ja.json`**

Add under the existing `board` object (keep existing `board.mode`, `board.toolbar`, `board.frame` keys — they'll be cleaned up in Task 8):

```json
{
  "board": {
    "sidebar": {
      "searchPlaceholder": "検索...",
      "searchHint": "⌘K",
      "libraryHeader": "LIBRARY",
      "all": "すべて",
      "unread": "未読",
      "read": "既読",
      "foldersHeader": "FOLDERS",
      "foldersPlaceholder": "B2 で実装",
      "themeLabel": "テーマ",
      "settingsLabel": "設定",
      "hideHint": "F で隠す",
      "collapseAria": "折り畳む",
      "expandAria": "展開",
      "signature": "BOARD · 2026"
    }
  }
}
```

- [ ] **Step 2: Replace `Sidebar.module.css` with full content styles**

Rewrite `components/board/Sidebar.module.css`:

```css
.sidebar {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  width: var(--sidebar-width);
  z-index: 50;
  transition: transform var(--sidebar-duration) var(--sidebar-ease);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif;
  font-size: 13px;
  color: #1a1a1a;
  box-sizing: border-box;
}

.inner {
  position: absolute;
  inset: 0;
  padding: 20px 16px 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.collapsed {
  transform: translateX(calc(-1 * (var(--sidebar-width) - var(--sidebar-collapsed))));
}

.sidebar :global(.glass) {
  border-radius:
    var(--corner-radius-outer)
    var(--corner-radius-inner)
    var(--corner-radius-inner)
    var(--corner-radius-outer);
  height: 100%;
}

/* --- Brand --- */
.brand {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 18px;
  padding: 0 4px;
}
.brandName {
  font-family: 'Playfair Display', 'Hiragino Mincho ProN', serif;
  font-style: italic;
  font-weight: 700;
  font-size: 20px;
  letter-spacing: -0.02em;
}
.brandMono {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 9px;
  color: #777;
  letter-spacing: 0.1em;
}
.collapseBtn {
  margin-left: auto;
  width: 26px; height: 26px;
  border: none; background: transparent;
  border-radius: 6px;
  cursor: pointer;
  color: #999;
  font-size: 14px;
}
.collapseBtn:hover { background: rgba(0, 0, 0, 0.05); color: #333; }

/* --- Search (shell) --- */
.search {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 2px 8px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.2);
  margin-bottom: 22px;
  color: #666;
  font-size: 12px;
}
.searchIcon { opacity: 0.5; }
.searchPlaceholder { flex: 1; }
.searchHint {
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 9px; color: #999;
}

/* --- Section header --- */
.sectionHeader {
  font-size: 10px;
  color: #999;
  letter-spacing: 0.08em;
  margin: 16px 2px 6px;
  text-transform: uppercase;
  font-weight: 600;
}

/* --- Nav item --- */
.navItem {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 10px 6px;
  border-left: 2px solid transparent;
  cursor: pointer;
  color: #555;
  font-size: 13px;
  transition: background 100ms ease;
  text-align: left;
  width: 100%;
  background: transparent;
  border-top: none;
  border-right: none;
  border-bottom: none;
  font-family: inherit;
}
.navItem:hover { background: rgba(0, 0, 0, 0.04); }
.navItem.active {
  border-left-color: var(--accent-primary);
  background: linear-gradient(90deg, rgba(124, 92, 252, 0.1), transparent);
  color: #1a1a1a;
  font-weight: 500;
}
.navLabel { flex: 1; }
.navCount {
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 11px;
  color: #999;
}

/* --- Folders placeholder --- */
.foldersPlaceholder {
  padding: 8px 10px;
  border: 1px dashed rgba(0, 0, 0, 0.15);
  border-radius: 6px;
  font-size: 10px;
  color: #999;
  text-align: center;
  letter-spacing: 0.05em;
  margin: 4px 2px;
}

/* --- Bottom controls --- */
.spacer { flex: 1; }
.footRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 10px;
  font-size: 11px;
  color: #777;
}
.themeBtn {
  background: none;
  border: none;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  color: inherit;
  font-size: inherit;
  font-family: inherit;
}
.themeBtn:hover { background: rgba(0, 0, 0, 0.04); }
.hideHint {
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 9px;
  color: #aaa;
}

/* --- Vertical signature --- */
.signature {
  position: absolute;
  right: -8px;
  top: 80px;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 9px;
  letter-spacing: 0.35em;
  color: #999;
  text-transform: uppercase;
  opacity: 0.6;
  pointer-events: none;
}
```

- [ ] **Step 3: Rewrite `components/board/Sidebar.tsx` with full content**

Replace the Sidebar component body:

```tsx
'use client'

import type { ReactElement } from 'react'
import { LiquidGlass } from './LiquidGlass'
import { t } from '@/lib/i18n/t'
import styles from './Sidebar.module.css'

type Props = {
  readonly collapsed: boolean
  readonly onToggle: () => void
  readonly counts: {
    readonly all: number
    readonly unread: number
    readonly read: number
  }
  readonly onThemeClick: () => void
}

export function Sidebar({ collapsed, onToggle, counts, onThemeClick }: Props): ReactElement {
  return (
    <aside
      className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`.trim()}
      data-testid="board-sidebar"
      aria-label="ボードナビゲーション"
    >
      <LiquidGlass>
        <div className={styles.inner}>
          {/* Brand */}
          <div className={styles.brand}>
            <span className={styles.brandName}>AllMarks</span>
            <span className={styles.brandMono}>v1</span>
            <button
              type="button"
              className={styles.collapseBtn}
              onClick={onToggle}
              aria-label={collapsed ? t('board.sidebar.expandAria') : t('board.sidebar.collapseAria')}
            >
              {collapsed ? '⇥' : '⇤'}
            </button>
          </div>

          {/* Search (shell — functional in B2) */}
          <div className={styles.search}>
            <span className={styles.searchIcon}>🔍</span>
            <span className={styles.searchPlaceholder}>{t('board.sidebar.searchPlaceholder')}</span>
            <span className={styles.searchHint}>{t('board.sidebar.searchHint')}</span>
          </div>

          {/* Library */}
          <div className={styles.sectionHeader}>{t('board.sidebar.libraryHeader')}</div>
          <button type="button" className={`${styles.navItem} ${styles.active}`.trim()}>
            <span className={styles.navLabel}>{t('board.sidebar.all')}</span>
            <span className={styles.navCount}>{counts.all}</span>
          </button>
          <button type="button" className={styles.navItem}>
            <span className={styles.navLabel}>{t('board.sidebar.unread')}</span>
            <span className={styles.navCount}>{counts.unread}</span>
          </button>
          <button type="button" className={styles.navItem}>
            <span className={styles.navLabel}>{t('board.sidebar.read')}</span>
            <span className={styles.navCount}>{counts.read}</span>
          </button>

          {/* Folders (placeholder) */}
          <div className={styles.sectionHeader}>{t('board.sidebar.foldersHeader')}</div>
          <div className={styles.foldersPlaceholder}>{t('board.sidebar.foldersPlaceholder')}</div>

          <div className={styles.spacer} />

          {/* Bottom: theme + hide hint */}
          <div className={styles.footRow}>
            <button type="button" className={styles.themeBtn} onClick={onThemeClick}>
              🎨 {t('board.sidebar.themeLabel')}
            </button>
            <span className={styles.hideHint}>{t('board.sidebar.hideHint')}</span>
          </div>

          {/* Vertical signature */}
          <div className={styles.signature}>{t('board.sidebar.signature')}</div>
        </div>
      </LiquidGlass>
    </aside>
  )
}
```

- [ ] **Step 4: Verify build**

Run: `rtk pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/board/Sidebar.tsx components/board/Sidebar.module.css messages/ja.json
git commit -m "feat(board): Sidebar content — logo, search shell, library counts, theme, signature"
```

---

## Task 6: Remove layoutMode (IDB migration + type cleanup + BoardRoot state)

**Files:**
- Modify: `lib/storage/indexeddb.ts` — DB_VERSION 6 → 7, migration
- Modify: `lib/storage/board-config.ts` — remove layoutMode from BoardConfig
- Modify: `lib/board/types.ts` — remove LayoutMode export
- Modify: `components/board/BoardRoot.tsx` — remove layoutMode state + hydration + callback

- [ ] **Step 1: Update types**

In `lib/board/types.ts`, **remove** the `LayoutMode` export and any references. Keep `FrameRatio` / `SnapGuideLine` / other exports intact (Plan B still needs them).

Specifically delete the line(s):
```ts
export type LayoutMode = 'grid' | 'free'
```

- [ ] **Step 2: Update BoardConfig schema**

In `lib/storage/board-config.ts`:

```ts
// BEFORE
export type BoardConfig = {
  readonly layoutMode: LayoutMode
  readonly frameRatio: FrameRatio
  readonly themeId: string
}

// AFTER
export type BoardConfig = {
  readonly frameRatio: FrameRatio
  readonly themeId: string
}

export const DEFAULT_BOARD_CONFIG: BoardConfig = {
  frameRatio: { kind: 'preset', presetId: 'ig-square' },
  themeId: 'dotted-notebook',
}
```

Remove the `LayoutMode` import at the top of the file.

`loadBoardConfig` / `saveBoardConfig` stay as-is (they serialize the whole object; reducing a field is backward-safe — migration strips it).

- [ ] **Step 3: IDB migration v6 → v7**

In `lib/storage/indexeddb.ts`, bump `DB_VERSION` and add an upgrade case:

```ts
export const DB_VERSION = 7

// Inside the upgrade callback:
if (oldVersion < 7) {
  // Strip `layoutMode` from existing BoardConfig records (if any).
  // BoardConfig lives in the `config` objectStore keyed by 'main'.
  const configStore = tx.objectStore('config')
  const req = configStore.get('main')
  req.onsuccess = () => {
    const cur = req.result as Record<string, unknown> | undefined
    if (cur && 'layoutMode' in cur) {
      const { layoutMode: _drop, ...rest } = cur
      void _drop  // silence unused — intentional strip
      configStore.put(rest, 'main')
    }
  }
}
```

**Verify the keyPath + objectStore name match your existing code.** If `BoardConfig` is stored differently (e.g., keyPath: 'id'), adapt accordingly. Read the existing `lib/storage/indexeddb.ts` upgrade callback structure first to match its conventions.

- [ ] **Step 4: Update BoardRoot — remove layoutMode state**

In `components/board/BoardRoot.tsx`:

1. Remove `const [layoutMode, setLayoutMode] = useState<LayoutMode>('grid')`
2. Remove hydration `useEffect` that loads layoutMode from board-config
3. Remove `handleModeChange` callback
4. In the call to `<CardsLayer>`, drop `layoutMode={layoutMode}` prop (see Task 7 where CardsLayer is updated)
5. Remove `LayoutMode` import from types
6. In Toolbar usage, drop `layoutMode` + `onModeChange` props (see Task 9 for new Toolbar shape)

- [ ] **Step 5: Update CardsLayer to always render free**

In `components/board/CardsLayer.tsx` (preserving Task 14-16 infrastructure):

1. Remove the `layoutMode` prop from `Props` type.
2. Remove any `layoutMode === 'grid'` branches. The `activePositions` computation now always uses `freeLayoutPositions` (Task 14 of prior work already set this path up; confirm the conditional is removed).
3. The `morph useEffect` that fired on layoutMode change is no longer relevant — remove the `prevModeRef` tracking. Keep `morphTimelineRef` — it's reused by the Align action in Task 10.
4. `handleCardPointerDown` should unconditionally run the free-drag state machine (no longer branching on mode).

**Do not remove Task 16's free-drag state machine** — just make it the only path.

- [ ] **Step 6: Run tests + typecheck**

Run: `rtk pnpm tsc --noEmit`
Expected: PASS.

Run: `rtk pnpm vitest run`
Expected: 82 pass / 0 fail (existing tests stable; no tests directly reference `layoutMode` — if any do, update them in this step).

If a test references `LayoutMode` or `layoutMode`:
- Delete the test if it was validating mode-switching behaviour (no longer a concept)
- Or adapt it to validate free-placement default behaviour

- [ ] **Step 7: Commit**

```bash
git add lib/board/types.ts lib/storage/board-config.ts lib/storage/indexeddb.ts components/board/BoardRoot.tsx components/board/CardsLayer.tsx
git commit -m "refactor(board): remove layoutMode concept, always-free canvas (IDB v6→v7)"
```

---

## Task 7: Align pure function + tests

**Files:**
- Create: `lib/board/align.ts`
- Create: `lib/board/align.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/board/align.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { alignAllToGrid } from './align'

type Item = {
  readonly id: string
  readonly aspectRatio: number
  readonly freePos: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null
}

describe('alignAllToGrid', () => {
  it('returns items with freePos filled in grid positions', () => {
    const items: Item[] = [
      { id: 'a', aspectRatio: 1, freePos: null },
      { id: 'b', aspectRatio: 1.5, freePos: null },
      { id: 'c', aspectRatio: 0.75, freePos: null },
    ]

    const out = alignAllToGrid(items, { containerWidth: 1200, targetRowHeight: 180, gap: 4 })

    expect(out).toHaveLength(3)
    for (const it of out) {
      expect(it.freePos).not.toBeNull()
      expect(it.freePos!.x).toBeGreaterThanOrEqual(0)
      expect(it.freePos!.y).toBeGreaterThanOrEqual(0)
      expect(it.freePos!.width).toBeGreaterThan(0)
      expect(it.freePos!.height).toBeGreaterThan(0)
    }
  })

  it('preserves item ordering', () => {
    const items: Item[] = [
      { id: 'a', aspectRatio: 1, freePos: null },
      { id: 'b', aspectRatio: 1, freePos: null },
    ]
    const out = alignAllToGrid(items, { containerWidth: 1200, targetRowHeight: 180, gap: 4 })
    expect(out.map(i => i.id)).toEqual(['a', 'b'])
  })

  it('replaces any existing freePos (non-destructive merge for other fields)', () => {
    const items: Item[] = [
      { id: 'a', aspectRatio: 1, freePos: { x: 999, y: 999, width: 50, height: 50 } },
    ]
    const out = alignAllToGrid(items, { containerWidth: 1200, targetRowHeight: 180, gap: 4 })
    expect(out[0]!.freePos!.x).not.toBe(999)
  })

  it('handles empty list', () => {
    const out = alignAllToGrid([], { containerWidth: 1200, targetRowHeight: 180, gap: 4 })
    expect(out).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk pnpm vitest run lib/board/align.test.ts`
Expected: FAIL with "alignAllToGrid is not a function" or similar.

- [ ] **Step 3: Implement `lib/board/align.ts`**

```ts
import { computeAutoLayout } from './auto-layout'

export type AlignableItem = {
  readonly id: string
  readonly aspectRatio: number
  readonly freePos: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null
}

export type AlignOptions = {
  readonly containerWidth: number
  readonly targetRowHeight: number
  readonly gap: number
}

/**
 * Re-aligns all items into a masonry grid by calling computeAutoLayout and
 * writing the result into each item's `freePos`. Pure function — returns new
 * array, no mutation.
 */
export function alignAllToGrid<T extends AlignableItem>(items: readonly T[], opts: AlignOptions): T[] {
  if (items.length === 0) return []

  const layout = computeAutoLayout(
    items.map(it => ({ id: it.id, aspectRatio: it.aspectRatio })),
    opts.containerWidth,
    opts.targetRowHeight,
    opts.gap
  )
  // computeAutoLayout returns a map or array of { id, x, y, width, height }
  // Adapt based on the actual shape of computeAutoLayout's return (check signature).

  const byId = new Map(layout.map(p => [p.id, p]))

  return items.map(it => {
    const p = byId.get(it.id)
    if (!p) return it
    return {
      ...it,
      freePos: { x: p.x, y: p.y, width: p.width, height: p.height },
    }
  })
}
```

**IMPORTANT:** Before writing the implementation, Read `lib/board/auto-layout.ts` to confirm the signature of `computeAutoLayout`. Adapt `alignAllToGrid` to match (the above assumes `(items, containerWidth, rowHeight, gap) => Position[]`; adjust parameter order / destructuring as needed).

- [ ] **Step 4: Run tests — verify pass**

Run: `rtk pnpm vitest run lib/board/align.test.ts`
Expected: 4 pass / 0 fail.

Run: `rtk pnpm vitest run` (full suite)
Expected: 86 pass / 0 fail (82 existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add lib/board/align.ts lib/board/align.test.ts
git commit -m "feat(board): alignAllToGrid pure function + 4 tests (reuses computeAutoLayout)"
```

---

## Task 8: Simplify Toolbar + remove FramePresetPopover

**Files:**
- Modify: `components/board/Toolbar.tsx`
- Modify: `components/board/Toolbar.module.css`
- Delete: `components/board/FramePresetPopover.tsx`
- Delete: `components/board/FramePresetPopover.module.css`
- Modify: `messages/ja.json` — remove unused keys

- [ ] **Step 1: Rewrite Toolbar.tsx**

Replace `components/board/Toolbar.tsx` entirely with:

```tsx
'use client'

import type { ReactElement } from 'react'
import { t } from '@/lib/i18n/t'
import styles from './Toolbar.module.css'

type Props = {
  readonly onAlign: () => void
  readonly onShare: () => void
}

/**
 * Top-center floating toolbar: two primary actions — 整列 (align all) + シェア
 * (open ShareModal, implemented in Plan B). Theme moved to Sidebar.
 */
export function Toolbar({ onAlign, onShare }: Props): ReactElement {
  return (
    <div className={styles.container} data-testid="board-toolbar">
      <button
        type="button"
        className={styles.button}
        onClick={onAlign}
        data-toolbar-button="align"
      >
        ⚡ {t('board.toolbar.align')}
      </button>
      <div className={styles.sep} role="separator" aria-orientation="vertical" />
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

- [ ] **Step 2: Trim Toolbar.module.css**

Remove unused classes (`.active`). Ensure these remain:

```css
.container {
  position: fixed;
  top: 12px;
  left: calc(50% + var(--sidebar-width) / 2);
  transform: translateX(-50%);
  display: flex;
  gap: 2px;
  align-items: center;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(10px);
  border-radius: 999px;
  padding: 4px;
  box-shadow: 0 4px 16px rgba(15, 15, 25, 0.1);
  z-index: 110;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif;
  font-size: 13px;
  letter-spacing: -0.01em;
  transition: left var(--sidebar-duration) var(--sidebar-ease);
}

/* Collapsed sidebar — recenter over full canvas area */
:global(.sidebar-collapsed) ~ * .container,
.container.sidebarCollapsed {
  left: calc(50% + var(--sidebar-collapsed) / 2);
}

.button {
  background: transparent;
  border: none;
  border-radius: 999px;
  padding: 6px 14px;
  cursor: pointer;
  color: #555;
  font-size: inherit;
  font-family: inherit;
  letter-spacing: inherit;
  transition: background 120ms ease, color 120ms ease;
}
.button:hover { background: rgba(0, 0, 0, 0.05); }

.button.primary {
  background: #1a1a1a;
  color: white;
}
.button.primary:hover { background: #000; }

.sep {
  width: 1px;
  height: 20px;
  background: rgba(0, 0, 0, 0.1);
  margin: 0 4px;
}
```

**Note on centering:** Keeping Toolbar perfectly centered over the canvas area (i.e., the viewport minus sidebar width) is best done with a JS-computed `left` value passed via inline style or a CSS variable. For Plan A MVP, the `calc(50% + var(--sidebar-width) / 2)` approximation is acceptable. Exact centering during sidebar animation is Plan B polish.

- [ ] **Step 3: Update messages/ja.json — trim frame keys**

In `messages/ja.json`:

1. Keep `board.toolbar` — but change `export` → `align` and keep `share`:
```json
"toolbar": {
  "align": "整列",
  "share": "シェア"
}
```
2. **Delete the `board.mode` key entirely** (grid/free strings no longer surfaced anywhere).
3. **Delete the `board.frame` key entirely** (Task 20 popover is being removed; Plan B's ShareModal will reintroduce `board.share.*` keys).

- [ ] **Step 4: Delete FramePresetPopover files**

```bash
git rm components/board/FramePresetPopover.tsx components/board/FramePresetPopover.module.css
```

- [ ] **Step 5: Verify build + tests**

Run: `rtk pnpm tsc --noEmit`
Expected: PASS (any import of `FramePresetPopover` from Toolbar is already gone from Step 1).

Run: `rtk pnpm vitest run`
Expected: 86 pass / 0 fail.

- [ ] **Step 6: Commit**

```bash
git add components/board/Toolbar.tsx components/board/Toolbar.module.css messages/ja.json
# the git rm above already staged the deletions
git commit -m "refactor(board): Toolbar → 整列/シェア 2ボタン, delete FramePresetPopover"
```

---

## Task 9: BoardRoot integration (Sidebar render + F-key + align handler + share stub)

**Files:**
- Modify: `components/board/BoardRoot.tsx`

- [ ] **Step 1: Add Sidebar state + F-key listener**

In `components/board/BoardRoot.tsx`, inside the component function body, add:

```tsx
import { Sidebar } from './Sidebar'
import { alignAllToGrid } from '@/lib/board/align'
import { LAYOUT_CONFIG, BOARD_INNER } from '@/lib/board/constants'
// ... existing imports

// Inside the component:
const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false)

const handleSidebarToggle = useCallback((): void => {
  setSidebarCollapsed(prev => !prev)
}, [])

// F key toggles sidebar (but not when typing in an input/textarea)
useEffect(() => {
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'f' && e.key !== 'F') return
    const target = e.target as HTMLElement | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
    e.preventDefault()
    setSidebarCollapsed(prev => !prev)
  }
  window.addEventListener('keydown', onKey)
  return () => { window.removeEventListener('keydown', onKey) }
}, [])
```

- [ ] **Step 2: Compute counts for Sidebar**

Add derived counts from `items` (comes from `useBoardData`):

```tsx
const counts = useMemo(() => {
  const all = items.length
  const unread = items.filter(i => !i.isRead && !i.isDeleted).length
  const read = items.filter(i => i.isRead && !i.isDeleted).length
  return { all, unread, read }
}, [items])
```

- [ ] **Step 3: Implement handleAlign**

```tsx
const handleAlign = useCallback((): void => {
  if (items.length === 0) return

  const containerWidth = Math.min(
    window.innerWidth - (sidebarCollapsed ? /* sidebar var */ 52 : 240) - BOARD_INNER.SIDE_PADDING_PX * 2,
    BOARD_INNER.MAX_WIDTH_PX
  )

  const aligned = alignAllToGrid(
    items.map(it => ({ id: it.bookmarkId, aspectRatio: it.aspectRatio ?? 1, freePos: it.freePos ?? null })),
    {
      containerWidth,
      targetRowHeight: LAYOUT_CONFIG.TARGET_ROW_HEIGHT_PX,
      gap: LAYOUT_CONFIG.GAP_PX,
    }
  )

  // Optimistically update items (triggers CardsLayer morph via displayedPositions flow)
  setItems(prevItems => prevItems.map(prev => {
    const match = aligned.find(a => a.id === prev.bookmarkId)
    if (!match || !match.freePos) return prev
    return { ...prev, freePos: match.freePos }
  }))

  // Persist each new freePos to IDB (fire-and-forget).
  for (const a of aligned) {
    if (a.freePos) {
      void persistFreePosition(a.id, a.freePos)
    }
  }
}, [items, setItems, sidebarCollapsed, persistFreePosition])
```

**Note:** adapt to the actual `useBoardData` return shape. If `setItems` is not exposed, there's an existing `setItems` equivalent (see Task 16's `freeDragStateRef` commits). Read `lib/storage/use-board-data.ts` first to confirm names.

- [ ] **Step 4: Implement handleShare stub**

```tsx
const handleShare = useCallback((): void => {
  // Plan B (ShareModal) not yet implemented. For now, log + noop.
  if (process.env.NODE_ENV === 'development') {
    console.warn('[AllMarks] Share modal coming in Plan B (2026-04-21)')
  }
}, [])
```

- [ ] **Step 5: Render Sidebar + update Toolbar call + re-parent canvas**

In BoardRoot's JSX:

```tsx
return (
  <>
    <Sidebar
      collapsed={sidebarCollapsed}
      onToggle={handleSidebarToggle}
      counts={counts}
      onThemeClick={handleThemeClick}
    />

    {/* Offset canvas by current sidebar width */}
    <div
      style={{
        marginLeft: sidebarCollapsed
          ? 'var(--sidebar-collapsed)'
          : 'var(--sidebar-width)',
        transition: 'margin-left var(--sidebar-duration) var(--sidebar-ease)',
      }}
    >
      {/* existing ThemeLayer + canvas wrapper */}
      <ThemeLayer themeId={themeId}>
        {/* InteractionLayer, CardsLayer, Toolbar, etc. */}
        <Toolbar onAlign={handleAlign} onShare={handleShare} />
        {/* ...rest of existing canvas tree... */}
      </ThemeLayer>
    </div>
  </>
)
```

Replace the current Toolbar invocation (which had `layoutMode`, `frameRatio`, `themeId`, etc.) with the new 2-prop shape.

Remove `themeId` / `layoutMode` props being passed down unless still needed by `ThemeLayer` (ThemeLayer still needs `themeId`).

- [ ] **Step 6: Build + test**

Run: `rtk pnpm tsc --noEmit`
Expected: PASS.

Run: `rtk pnpm vitest run`
Expected: 86 pass / 0 fail.

- [ ] **Step 7: Commit**

```bash
git add components/board/BoardRoot.tsx
git commit -m "feat(board): wire Sidebar + F-key toggle + Align action + share stub in BoardRoot"
```

---

## Task 10: Deploy + manual verification + plan B handoff note

**Files:**
- Modify: `docs/TODO.md` (progress note)

- [ ] **Step 1: Full build verification**

```bash
rtk pnpm tsc --noEmit
rtk pnpm vitest run
rtk pnpm build
```
All three must pass. `pnpm build` produces `out/` with static export.

- [ ] **Step 2: Deploy to production**

```bash
npx wrangler pages deploy out/ --project-name=booklage --branch=master --commit-dirty=true
```

Expected: Deployment appears as "Production / master" in `wrangler pages deployment list`. `booklage.pages.dev` serves the new UI.

- [ ] **Step 3: Manual verification on `booklage.pages.dev`**

Test in both Chrome and Firefox (or Safari) with a hard-reload:

- [ ] Sidebar visible, edge-anchored (no margin from left edge)
- [ ] Ctrl+Shift+R reloads the app; sidebar still there
- [ ] Brand "AllMarks" uses serif italic; version pill "v1" uses monospace
- [ ] Search shell shows "⌘K" hint
- [ ] Library section shows real counts (すべて / 未読 / 既読) — verify by adding a bookmark and reloading
- [ ] "すべて" item has violet left border + gradient wash background
- [ ] Folders section shows dashed "B2 で実装" placeholder
- [ ] Theme button at bottom cycles themes on click
- [ ] Vertical "BOARD · 2026" signature visible at right inner edge
- [ ] `F` key toggles sidebar collapse — animation is smooth (~340ms), no hitch
- [ ] Collapsed state: only 52px wide, canvas fills the rest
- [ ] Click the collapse chevron — same animation
- [ ] Chrome: background cards visibly refract through the sidebar glass (not blur)
- [ ] Firefox/Safari: fallback blur works, sidebar is still readable
- [ ] Toolbar pill at top-center has only 整列 + シェア (no grid/free, no theme, no export)
- [ ] Click 整列 — all cards re-align to masonry in a smooth morph
- [ ] Click シェア — no visible effect (console warning in dev) — Plan B placeholder
- [ ] Card drag, resize, rotation (Tasks 15-18) still work
- [ ] Multi-bookmark workflow: add 3-5 bookmarks, drag them around freely, click 整列 → they snap back to grid

- [ ] **Step 4: Update docs/TODO.md**

Append a new section under "直近の作業":

```markdown
### B1 Dashboard Foundation 完了 (2026-04-20)

- Plan A (10 タスク) を subagent-driven-development で ship 済
- Sidebar (edge-anchored, 屈折ガラス, 折り畳み可) + Toolbar 縮小 (整列/シェア) + Align アクション + IDB v6→v7 migration + FramePresetPopover 削除
- 本番 deploy 済 (booklage.pages.dev)
- 次: Plan B (Share System) を書き起こす — ShareModal + URL 埋込み + SNS Web Intents + importer
- plan B の前に、Plan A 実機フィードバックで調整点を洗い出す
```

Update the "現在の状態" header progress line to reflect Plan A completion.

- [ ] **Step 5: Commit + push**

```bash
git add docs/TODO.md
git commit -m "docs(todo): B1 Dashboard Foundation Plan A 完了 (10 tasks + deploy)"
git push
```

---

## Completion criteria (plan A done when)

All 10 tasks completed, all MVP items from spec §7 that fall in Plan A's scope pass:

- [x] (spec §7.1) Sidebar visible + edge-anchored
- [x] (spec §7.2) Counts shown
- [x] (spec §7.3) F-key / button toggle with smooth animation
- [x] (spec §7.4) Chrome refraction visible
- [x] (spec §7.5) Firefox/Safari fallback works
- [x] (spec §7.6) Toolbar pill has 整列 + シェア only
- [x] (spec §7.7) Align morphs all cards in 400ms

Items from spec §7.8-13 (share modal, URL encoding, watermark, importer) are **deferred to Plan B**.

---

## Post-Plan-A: feedback gathering before Plan B

Before writing Plan B, conduct an in-session review with the user covering:

1. Does the sidebar feel distinctly different from Lopoly/miti on real device?
2. Refraction quality — too much / too little / wrong displacement pattern?
3. Font choice (Playfair italic) feels right for brand?
4. Animation timing (340ms ease-out) feels right or needs adjustment?
5. Align action UX — does the 400ms morph feel satisfying?
6. Any copy changes (labels, Library naming, signature content)?

These findings feed into Plan B's opening section and possibly a "Plan A polish" micro-plan.
