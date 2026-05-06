# Fullscreen Immersive Mode + Auto-Hide Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `PREVIEW` mode to ShareComposer that expands the modal to viewport 100% and auto-hides 3 chrome panels (header / source / footer) using proximity-progressive handles, controlled by `F` / `H`/`S`/`B` / `Esc` shortcuts.

**Architecture:** Two modes (`'layout' | 'preview'`) on the existing ShareComposer modal. CSS-driven `:hover` proximity reveal with 150ms hover-out delay. Pin states (per-side) tracked in React state and projected to `data-pin-h/s/b` attributes on the modal root. A new pure layout branch in `composer-layout.ts` for `preview` mode (no fitScale on free, viewport-max on preset). Touch devices fall back to LAYOUT-only via `(hover: hover) and (pointer: fine)` media query.

**Tech Stack:** React 19, Next.js 14, Vanilla CSS Modules, `idb` (IndexedDB), Vitest (unit), Playwright (e2e). No new dependencies.

**Spec reference:** [docs/superpowers/specs/2026-05-07-fullscreen-immersive-design.md](../specs/2026-05-07-fullscreen-immersive-design.md)

---

## Pre-flight

- [ ] **Step 1: Verify clean working tree on master**

Run: `rtk git status`
Expected: `master...origin/master` clean, no uncommitted changes.

- [ ] **Step 2: Verify current tests + tsc green**

Run: `pnpm tsc --noEmit && pnpm vitest run`
Expected: 0 tsc errors, all (currently 256) vitest tests pass.

- [ ] **Step 3: Read the spec end-to-end**

Read [docs/superpowers/specs/2026-05-07-fullscreen-immersive-design.md](../specs/2026-05-07-fullscreen-immersive-design.md) before touching code. Section 4 (state) and 6 (CSS) are load-bearing — re-skim if you ever feel lost.

---

## Task 1: composer-layout.ts — add `mode` parameter

**Files:**
- Modify: `lib/share/composer-layout.ts`
- Test: `lib/share/composer-layout.test.ts`

**Goal:** Add a `mode: 'layout' | 'preview'` input to `composeShareLayout`. `layout` keeps existing behavior. `preview + free` skips fitScale (frame height = natural masonry height). `preview + preset` ignores chrome by treating viewport as the full available area (no chrome height subtraction needed because chrome auto-hides).

- [ ] **Step 1: Write failing tests for `preview + free`**

Append to `lib/share/composer-layout.test.ts`:

```typescript
describe('composeShareLayout — preview mode', () => {
  it('preview + free: no fitScale, frame height equals natural masonry height', () => {
    const items = makeItems(50)
    const order = items.map((i) => i.bookmarkId)
    const result = composeShareLayout({
      items,
      order,
      sizeOverrides: new Map(),
      aspect: 'free',
      viewport: { width: 1440, height: 900 },
      mode: 'preview',
    })
    expect(result.didShrink).toBe(false)
    expect(result.shrinkScale).toBe(1)
    // Frame width is the viewport width (logicalW), height is natural masonry height (≥ viewport.height for 50 cards).
    expect(result.frameSize.width).toBe(1440)
    expect(result.frameSize.height).toBeGreaterThan(900)
  })

  it('preview + 1:1: frame fills viewport min dimension, normalized coords inside frame', () => {
    const items = makeItems(8)
    const result = composeShareLayout({
      items,
      order: items.map((i) => i.bookmarkId),
      sizeOverrides: new Map(),
      aspect: '1:1',
      viewport: { width: 1920, height: 1080 },
      mode: 'preview',
    })
    expect(result.frameSize.width).toBe(1080)
    expect(result.frameSize.height).toBe(1080)
    for (const c of result.cards) {
      expect(c.x + c.w).toBeLessThanOrEqual(1.0001)
      expect(c.y + c.h).toBeLessThanOrEqual(1.0001)
    }
  })

  it('preview + 9:16: 9/16 ratio at viewport-fit', () => {
    const r = composeShareLayout({
      items: makeItems(6),
      order: makeItems(6).map((i) => i.bookmarkId),
      sizeOverrides: new Map(),
      aspect: '9:16',
      viewport: { width: 1920, height: 1080 },
      mode: 'preview',
    })
    expect(r.frameSize.height).toBeCloseTo(1080, 0)
    expect(r.frameSize.width).toBeCloseTo(1080 * 9 / 16, 0)
  })

  it('preview + 16:9: width fills viewport, height matches ratio', () => {
    const r = composeShareLayout({
      items: makeItems(6),
      order: makeItems(6).map((i) => i.bookmarkId),
      sizeOverrides: new Map(),
      aspect: '16:9',
      viewport: { width: 1920, height: 1080 },
      mode: 'preview',
    })
    expect(r.frameSize.width).toBeCloseTo(1920, 0)
    expect(r.frameSize.height).toBeCloseTo(1080, 0)
  })

  it('layout mode is unchanged: same input matches existing free-mode behavior', () => {
    const items = makeItems(5)
    const inputBase = {
      items,
      order: items.map((i) => i.bookmarkId),
      sizeOverrides: new Map(),
      aspect: 'free' as const,
      viewport: { width: 800, height: 600 },
    }
    const r = composeShareLayout({ ...inputBase, mode: 'layout' })
    // Layout-mode free still applies fitScale to the natural masonry height.
    expect(r.frameSize.width).toBeLessThanOrEqual(800)
    expect(r.frameSize.height).toBeLessThanOrEqual(600)
  })
})
```

Note: existing tests do NOT pass `mode` — they will fail to typecheck. That's intentional: we'll fix them in Step 4.

- [ ] **Step 2: Run failing tests**

Run: `pnpm vitest run lib/share/composer-layout.test.ts`
Expected: TypeScript error or test failures because `mode` is missing from the type and unused in code.

- [ ] **Step 3: Add `mode` to the input type and the `preview` branch**

Edit `lib/share/composer-layout.ts`:

1. Add the type:

```typescript
export type ShareMode = 'layout' | 'preview'

export type ComposerLayoutInput = {
  readonly items: ReadonlyArray<ComposerItem>
  readonly order: ReadonlyArray<string>
  readonly sizeOverrides: ReadonlyMap<string, ShareSize>
  readonly aspect: ShareAspect
  readonly viewport: { readonly width: number; readonly height: number }
  readonly mode: ShareMode
}
```

2. In `composeShareLayout`, destructure `mode` from input and replace the final fitScale block:

```typescript
export function composeShareLayout(input: ComposerLayoutInput): ComposerLayoutResult {
  const { items, order, sizeOverrides, aspect, viewport, mode } = input
  // ... ordering / masonryCards / isFree / logicalW / innerW unchanged ...

  let masonry: MasonryResult
  let logicalH: number

  if (isFree) {
    masonry = computeColumnMasonry({
      cards: masonryCards,
      containerWidth: innerW,
      gap,
      targetColumnUnit: COLUMN_MASONRY.TARGET_COLUMN_UNIT_PX,
    })
    logicalH = masonry.totalHeight + 2 * pad
  } else {
    const innerH = Math.max(60, presetSize.height - 2 * pad)
    masonry = findFitMasonry(masonryCards, innerW, innerH, gap, COLUMN_MASONRY.TARGET_COLUMN_UNIT_PX)
    logicalH = presetSize.height
  }

  // Mode branch: layout = fit-to-viewport overview; preview = natural size,
  // viewport scrolls (free) or preset fills the viewport (1:1/9:16/16:9).
  const fitScale = mode === 'preview'
    ? 1
    : Math.min(viewport.width / logicalW, viewport.height / logicalH, 1)

  const frameW = logicalW * fitScale
  const frameH = logicalH * fitScale
  const didShrink = fitScale < 1

  // ... rest unchanged: cards / cardIds / return statement ...
}
```

- [ ] **Step 4: Update existing test cases to pass `mode: 'layout'`**

Find every existing test in `lib/share/composer-layout.test.ts` that calls `composeShareLayout({ ... })` and add `mode: 'layout',` to the input object. Search the file for `composeShareLayout({` and add the field everywhere it's missing.

- [ ] **Step 5: Run tests, expect green**

Run: `pnpm vitest run lib/share/composer-layout.test.ts`
Expected: All composer-layout tests pass (existing + 4 new preview tests).

- [ ] **Step 6: Update the only remaining caller in `ShareComposer.tsx`**

Edit `components/share/ShareComposer.tsx`. Find the `composeShareLayout` call and add a temporary `mode: 'layout'` so the type checks. The hook integration in Task 4 will replace this with real state.

```typescript
const layout = useMemo(
  () =>
    composeShareLayout({
      items: composerItems,
      order: cardOrder,
      sizeOverrides,
      aspect,
      viewport: frameViewport,
      mode: 'layout', // TODO Task 3: replace with `mode` from useShareFullscreen
    }),
  [composerItems, cardOrder, sizeOverrides, aspect, frameViewport],
)
```

- [ ] **Step 7: Run full type check + tests**

Run: `pnpm tsc --noEmit && pnpm vitest run`
Expected: 0 errors, all tests green.

- [ ] **Step 8: Commit**

```bash
rtk git add lib/share/composer-layout.ts lib/share/composer-layout.test.ts components/share/ShareComposer.tsx
rtk git commit -m "$(cat <<'EOF'
feat(share): add preview mode to composer layout

preview + free → natural masonry height, no fitScale (caller scrolls).
preview + preset → viewport-fit ratio (chrome auto-hides, no subtraction).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: useShareFullscreen hook

**Files:**
- Create: `components/share/use-share-fullscreen.ts`
- Test: `components/share/use-share-fullscreen.test.ts`

**Goal:** Encapsulate `mode` + `pinned` state, keyboard listeners, flash trigger, and touch detection.

- [ ] **Step 1: Write failing tests for the pure parts (touch detection, default state)**

Create `components/share/use-share-fullscreen.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useShareFullscreen } from './use-share-fullscreen'

function mockMatchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

describe('useShareFullscreen', () => {
  const noop = (): void => {}

  beforeEach(() => {
    mockMatchMedia(true)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts in layout mode with no pins', () => {
    const { result } = renderHook(() => useShareFullscreen({ open: true, onCloseModal: noop }))
    expect(result.current.mode).toBe('layout')
    expect(result.current.pinned).toEqual({ h: false, s: false, b: false })
    expect(result.current.canUseFullscreen).toBe(true)
  })

  it('toggleMode flips between layout and preview, resetting pins', () => {
    const { result } = renderHook(() => useShareFullscreen({ open: true, onCloseModal: noop }))
    act(() => { result.current.toggleMode() })
    expect(result.current.mode).toBe('preview')
    act(() => { result.current.togglePin('h') })
    expect(result.current.pinned.h).toBe(true)
    act(() => { result.current.toggleMode() })
    expect(result.current.mode).toBe('layout')
    expect(result.current.pinned).toEqual({ h: false, s: false, b: false })
  })

  it('togglePin only works in preview mode', () => {
    const { result } = renderHook(() => useShareFullscreen({ open: true, onCloseModal: noop }))
    act(() => { result.current.togglePin('h') }) // no-op in layout
    expect(result.current.pinned.h).toBe(false)
    act(() => { result.current.toggleMode() })
    act(() => { result.current.togglePin('h') })
    expect(result.current.pinned.h).toBe(true)
  })

  it('exitPreview returns to layout and resets pins', () => {
    const { result } = renderHook(() => useShareFullscreen({ open: true, onCloseModal: noop }))
    act(() => { result.current.toggleMode() })
    act(() => { result.current.togglePin('s') })
    act(() => { result.current.exitPreview() })
    expect(result.current.mode).toBe('layout')
    expect(result.current.pinned.s).toBe(false)
  })

  it('canUseFullscreen is false when (hover: hover) and (pointer: fine) does not match', () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => useShareFullscreen({ open: true, onCloseModal: noop }))
    expect(result.current.canUseFullscreen).toBe(false)
    act(() => { result.current.toggleMode() })
    expect(result.current.mode).toBe('layout') // touch fallback: toggleMode is no-op
  })
})
```

- [ ] **Step 2: Run failing tests**

Run: `pnpm vitest run components/share/use-share-fullscreen.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement the hook**

Create `components/share/use-share-fullscreen.ts`:

```typescript
'use client'

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { ShareMode } from '@/lib/share/composer-layout'

export type PinnedSides = {
  readonly h: boolean
  readonly s: boolean
  readonly b: boolean
}

export type ShareFullscreenAPI = {
  readonly mode: ShareMode
  readonly pinned: PinnedSides
  readonly canUseFullscreen: boolean
  readonly helpVisible: boolean
  readonly toggleMode: () => void
  readonly togglePin: (side: 'h' | 's' | 'b') => void
  readonly exitPreview: () => void
  readonly toggleHelp: () => void
  readonly closeHelp: () => void
  readonly flashSide: 'h' | 's' | 'b' | null
}

type State = {
  readonly mode: ShareMode
  readonly pinned: PinnedSides
  readonly helpVisible: boolean
  readonly flashSide: 'h' | 's' | 'b' | null
  readonly flashId: number
}

type Action =
  | { readonly type: 'toggle-mode' }
  | { readonly type: 'toggle-pin'; readonly side: 'h' | 's' | 'b' }
  | { readonly type: 'exit-preview' }
  | { readonly type: 'toggle-help' }
  | { readonly type: 'close-help' }
  | { readonly type: 'clear-flash'; readonly id: number }

const INIT: State = {
  mode: 'layout',
  pinned: { h: false, s: false, b: false },
  helpVisible: false,
  flashSide: null,
  flashId: 0,
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'toggle-mode':
      return { ...s, mode: s.mode === 'layout' ? 'preview' : 'layout', pinned: INIT.pinned }
    case 'toggle-pin': {
      if (s.mode !== 'preview') return s
      const next = { ...s.pinned, [a.side]: !s.pinned[a.side] }
      return { ...s, pinned: next, flashSide: a.side, flashId: s.flashId + 1 }
    }
    case 'exit-preview':
      return { ...s, mode: 'layout', pinned: INIT.pinned }
    case 'toggle-help':
      return { ...s, helpVisible: !s.helpVisible }
    case 'close-help':
      return { ...s, helpVisible: false }
    case 'clear-flash':
      return s.flashId === a.id ? { ...s, flashSide: null } : s
    default:
      return s
  }
}

export function useShareFullscreen(opts: {
  readonly open: boolean
  readonly onCloseModal: () => void
}): ShareFullscreenAPI {
  const [state, dispatch] = useReducer(reducer, INIT)
  const [canUseFullscreen, setCanUse] = useState<boolean>(true)

  // Touch detection: evaluate once on mount.
  useEffect((): void => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia('(hover: hover) and (pointer: fine)')
    setCanUse(mql.matches)
  }, [])

  const toggleMode = useCallback((): void => {
    if (!canUseFullscreen) return
    dispatch({ type: 'toggle-mode' })
  }, [canUseFullscreen])

  const togglePin = useCallback((side: 'h' | 's' | 'b'): void => {
    if (!canUseFullscreen) return
    dispatch({ type: 'toggle-pin', side })
  }, [canUseFullscreen])

  const exitPreview = useCallback((): void => {
    dispatch({ type: 'exit-preview' })
  }, [])

  const toggleHelp = useCallback((): void => {
    dispatch({ type: 'toggle-help' })
  }, [])

  const closeHelp = useCallback((): void => {
    dispatch({ type: 'close-help' })
  }, [])

  // Flash auto-clear: 440ms after each pin toggle, clear flashSide.
  const lastFlashId = useRef<number>(0)
  useEffect((): undefined | (() => void) => {
    if (state.flashSide == null) return undefined
    const id = state.flashId
    lastFlashId.current = id
    const timer = setTimeout(() => dispatch({ type: 'clear-flash', id }), 440)
    return (): void => clearTimeout(timer)
  }, [state.flashSide, state.flashId])

  // Keyboard listener: only mount when modal open + non-touch.
  useEffect((): undefined | (() => void) => {
    if (!opts.open || !canUseFullscreen) return undefined

    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const k = e.key.toLowerCase()
      if (k === 'f') { e.preventDefault(); dispatch({ type: 'toggle-mode' }); return }
      if (k === '?') { e.preventDefault(); dispatch({ type: 'toggle-help' }); return }
      if (k === 'escape') {
        e.preventDefault()
        if (state.helpVisible) { dispatch({ type: 'close-help' }); return }
        if (state.mode === 'preview') { dispatch({ type: 'exit-preview' }); return }
        opts.onCloseModal()
        return
      }
      if (state.mode !== 'preview') return
      if (k === 'h' || k === 's' || k === 'b') {
        e.preventDefault()
        dispatch({ type: 'toggle-pin', side: k })
      }
    }

    document.addEventListener('keydown', onKey)
    return (): void => document.removeEventListener('keydown', onKey)
  }, [opts, canUseFullscreen, state.mode, state.helpVisible])

  return {
    mode: canUseFullscreen ? state.mode : 'layout',
    pinned: state.pinned,
    canUseFullscreen,
    helpVisible: state.helpVisible,
    toggleMode,
    togglePin,
    exitPreview,
    toggleHelp,
    closeHelp,
    flashSide: state.flashSide,
  }
}
```

- [ ] **Step 4: Run tests, expect green**

Run: `pnpm vitest run components/share/use-share-fullscreen.test.ts`
Expected: All 5 tests pass.

- [ ] **Step 5: Run full test + tsc**

Run: `pnpm tsc --noEmit && pnpm vitest run`
Expected: 0 errors, all tests green.

- [ ] **Step 6: Commit**

```bash
rtk git add components/share/use-share-fullscreen.ts components/share/use-share-fullscreen.test.ts
rtk git commit -m "$(cat <<'EOF'
feat(share): useShareFullscreen hook (mode/pin state + keyboard + touch detect)

Pure reducer for testability. F/H/S/B/Esc/? handler with input-focus and
modifier-key guards. (hover: hover) and (pointer: fine) gates the whole
feature on touch — toggleMode/togglePin become no-ops.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: ShareComposer wiring (state + ⛶ button + mode chip + help overlay)

**Files:**
- Modify: `components/share/ShareComposer.tsx`

**Goal:** Replace the temporary `mode: 'layout'` from Task 1 with hook-driven mode. Add the `⛶` button, `LAYOUT`/`PREVIEW` chip in the header, the inline `?` help overlay, and the data attributes (`data-mode`, `data-pin-h/s/b`, `data-flash-side`) the CSS will key off.

- [ ] **Step 1: Wire the hook into ShareComposer**

Edit `components/share/ShareComposer.tsx`:

1. Import the hook at the top:

```typescript
import { useShareFullscreen } from './use-share-fullscreen'
```

2. Inside the `ShareComposer` function (right after `useState` for `cardOrder` etc.), add:

```typescript
const fullscreen = useShareFullscreen({ open, onCloseModal: onClose })
```

3. Replace the temporary `mode: 'layout'` in the `composeShareLayout` call:

```typescript
const layout = useMemo(
  () =>
    composeShareLayout({
      items: composerItems,
      order: cardOrder,
      sizeOverrides,
      aspect,
      viewport: frameViewport,
      mode: fullscreen.mode,
    }),
  [composerItems, cardOrder, sizeOverrides, aspect, frameViewport, fullscreen.mode],
)
```

- [ ] **Step 2: Add data attributes + class to the modal root**

In the JSX, change:

```tsx
<div
  className={styles.modal}
  role="dialog"
  aria-label="Share composer"
  data-testid="share-composer"
>
```

to:

```tsx
<div
  className={`${styles.modal} ${fullscreen.mode === 'preview' ? styles.preview : ''}`}
  role="dialog"
  aria-label="Share composer"
  data-testid="share-composer"
  data-mode={fullscreen.mode}
  data-pin-h={fullscreen.pinned.h}
  data-pin-s={fullscreen.pinned.s}
  data-pin-b={fullscreen.pinned.b}
  data-flash-side={fullscreen.flashSide ?? ''}
>
```

- [ ] **Step 3: Replace the header to add mode chip + ⛶ button**

Find the existing `<header>` and replace it with:

```tsx
<header className={styles.header}>
  <span className={styles.modeChip} aria-label={`Mode: ${fullscreen.mode}`}>
    {fullscreen.mode === 'preview' ? 'PREVIEW' : 'LAYOUT'}
  </span>
  <ShareAspectSwitcher value={aspect} onChange={setAspect} />
  {fullscreen.canUseFullscreen && (
    <button
      type="button"
      className={styles.fsBtn}
      onClick={fullscreen.toggleMode}
      aria-label={fullscreen.mode === 'preview' ? 'Exit fullscreen' : 'Enter fullscreen'}
      data-testid="share-fullscreen-btn"
    >
      ⛶
    </button>
  )}
  <button
    type="button"
    className={styles.closeBtn}
    onClick={onClose}
    aria-label="Close"
  >
    ×
  </button>
</header>
```

(Removes the previous `<h2 className={styles.title}>シェア用ボードを組む</h2>` — the chip replaces it for design-tool minimalism.)

- [ ] **Step 4: Add hover-zones + handles at the TOP of the modal DOM**

Zones must come BEFORE `<header>` in DOM order so the `~` sibling selector works (`.zoneTop:hover ~ .header`). Insert immediately after `<div className={...modal}...>`'s opening tag, BEFORE `<header>`:

```tsx
<div
  className={`${styles.modal} ${fullscreen.mode === 'preview' ? styles.preview : ''}`}
  ...all the data attributes from Step 2...
>
  {fullscreen.canUseFullscreen && (
    <>
      <div className={styles.zoneTop}    aria-hidden="true" />
      <div className={styles.zoneRight}  aria-hidden="true" />
      <div className={styles.zoneBottom} aria-hidden="true" />
      <div className={`${styles.handle} ${styles.handleTop}    ${fullscreen.flashSide === 'h' ? styles.flash : ''}`} aria-hidden="true" />
      <div className={`${styles.handle} ${styles.handleRight}  ${fullscreen.flashSide === 's' ? styles.flash : ''}`} aria-hidden="true" />
      <div className={`${styles.handle} ${styles.handleBottom} ${fullscreen.flashSide === 'b' ? styles.flash : ''}`} aria-hidden="true" />
    </>
  )}
  <header className={styles.header}>
    ...
  </header>
  <div className={styles.body}>
    ...
  </div>
  <footer className={styles.footer}>
    ...
  </footer>
  {fullscreen.helpVisible && (
    <div className={styles.helpOverlay} role="dialog" aria-label="Keyboard shortcuts" onClick={fullscreen.closeHelp}>
      <div className={styles.helpCard} onClick={(e): void => e.stopPropagation()}>
        <h3 className={styles.helpTitle}>Keyboard shortcuts</h3>
        <ul className={styles.helpList}>
          <li><kbd>F</kbd>      Toggle preview mode</li>
          <li><kbd>H S B</kbd>  Pin header / source / footer</li>
          <li><kbd>Esc</kbd>    Exit preview / close</li>
          <li><kbd>?</kbd>      Toggle this help</li>
        </ul>
      </div>
    </div>
  )}
</div>  {/* end .modal */}
```

DOM order matters: `zoneTop / zoneRight / zoneBottom / handle×3 / header / body / footer / helpOverlay`. The `~` sibling selectors in CSS rely on zones being BEFORE chrome.

- [ ] **Step 5: Run typecheck**

Run: `pnpm tsc --noEmit`
Expected: 0 errors. (Tests will be green because no behavior change yet — only structure.)

- [ ] **Step 6: Run unit tests**

Run: `pnpm vitest run`
Expected: All tests green.

- [ ] **Step 7: Commit**

```bash
rtk git add components/share/ShareComposer.tsx
rtk git commit -m "$(cat <<'EOF'
feat(share): wire useShareFullscreen into ShareComposer

Mode chip (LAYOUT/PREVIEW) replaces title text; ⛶ button gated by
canUseFullscreen; data-mode + data-pin-h/s/b + data-flash-side projected
onto the modal root for CSS to key off; ? help overlay inline.
Visual styling lands in the next CSS task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: ShareComposer.module.css — preview mode styles

**Files:**
- Modify: `components/share/ShareComposer.module.css`

**Goal:** Add the modal-morph (Scale + 角丸 360ms), handles (proximity progressive), hover-zones, chrome auto-hide with 150ms hover-out delay, mode chip, ⛶ button, flash keyframes, help overlay.

- [ ] **Step 1: Add `.preview` modal morph rules**

Append to `components/share/ShareComposer.module.css`:

```css
/* === Preview (immersive) mode ============================================ */

/* Modal morph: layout (current) → preview (viewport 100%, no radius/shadow). */
.modal {
  transition:
    width 360ms cubic-bezier(0.16, 1, 0.3, 1),
    height 360ms cubic-bezier(0.16, 1, 0.3, 1),
    border-radius 360ms cubic-bezier(0.16, 1, 0.3, 1),
    box-shadow 360ms cubic-bezier(0.16, 1, 0.3, 1);
}

.modal.preview {
  width: 100vw;
  height: 100vh;
  border-radius: 0;
  box-shadow: none;
}

/* In preview, the body stays as-is (canvasArea fills). The source panel is
   moved out of the grid via its own .module.css rule (Task 5). */
.modal.preview .body {
  grid-template-columns: 1fr;
}
```

- [ ] **Step 2: Add hover-zones (transparent, proximity sensors)**

```css
.zoneTop, .zoneRight, .zoneBottom {
  position: absolute;
  background: transparent;
  pointer-events: none;
  z-index: 2;
}
.zoneTop    { top: 0;    left: 0;  right: 0;  height: 80px; }
.zoneBottom { bottom: 0; left: 0;  right: 0;  height: 80px; }
.zoneRight  { top: 0;    right: 0; bottom: 0; width:  80px; }

/* Zones only listen in preview mode. */
.modal.preview .zoneTop,
.modal.preview .zoneRight,
.modal.preview .zoneBottom { pointer-events: auto; }
```

- [ ] **Step 3: Add handle base + variants (top / right / bottom)**

```css
.handle {
  position: absolute;
  background: rgba(255, 255, 255, 0);
  pointer-events: none;
  opacity: 0;
  z-index: 3;
  transition:
    background 200ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 200ms ease-out;
}
.modal.preview .handle { opacity: 1; }

.handleTop, .handleBottom {
  left: 50%;
  transform: translateX(-50%);
  width: 56px;
  height: 5px;
}
.handleTop    { top: 0;    border-radius: 0 0 3px 3px; }
.handleBottom { bottom: 0; border-radius: 3px 3px 0 0; }
.handleRight {
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 5px;
  height: 56px;
  border-radius: 3px 0 0 3px;
}

/* Proximity hover → handle visible (semi-transparent). */
.modal.preview .zoneTop:hover    ~ .handleTop    { background: rgba(255, 255, 255, 0.42); }
.modal.preview .zoneRight:hover  ~ .handleRight  { background: rgba(255, 255, 255, 0.42); }
.modal.preview .zoneBottom:hover ~ .handleBottom { background: rgba(255, 255, 255, 0.42); }

/* Pinned → handle blue, always visible. */
.modal.preview[data-pin-h="true"] .handleTop    { background: rgba(79, 158, 255, 0.85); }
.modal.preview[data-pin-s="true"] .handleRight  { background: rgba(79, 158, 255, 0.85); }
.modal.preview[data-pin-b="true"] .handleBottom { background: rgba(79, 158, 255, 0.85); }
```

- [ ] **Step 4: Add chrome auto-hide with 150ms hover-out delay**

```css
/* Position the chrome panels absolute in preview so they slide over the canvas. */
.modal.preview .header {
  position: absolute;
  top: 0; left: 0; right: 0;
  z-index: 4;
  transform: translateY(-100%);
  transition: transform 210ms cubic-bezier(0.16, 1, 0.3, 1) 150ms; /* hide: 150ms delay */
}
.modal.preview .footer {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  z-index: 4;
  transform: translateY(100%);
  transition: transform 210ms cubic-bezier(0.16, 1, 0.3, 1) 150ms;
}

/* Hover (zone OR chrome itself) → reveal, no delay, faster duration. */
.modal.preview .zoneTop:hover ~ .header,
.modal.preview .header:hover {
  transform: translateY(0);
  transition: transform 260ms cubic-bezier(0.16, 1, 0.3, 1) 0ms;
}
.modal.preview .zoneBottom:hover ~ .footer,
.modal.preview .footer:hover {
  transform: translateY(0);
  transition: transform 260ms cubic-bezier(0.16, 1, 0.3, 1) 0ms;
}

/* Pinned overrides reveal — instant, no delay either side. */
.modal.preview[data-pin-h="true"] .header { transform: translateY(0); transition-delay: 0ms; }
.modal.preview[data-pin-b="true"] .footer { transform: translateY(0); transition-delay: 0ms; }

/* When body grid switches to 1fr in preview, give the canvasArea full bleed. */
.modal.preview .canvasArea {
  padding: 0;
  background: var(--bg-dark, #0a0a0a);
}
.modal.preview .frameWrap {
  border-radius: 0;
  box-shadow: none;
}
```

(Note: source panel's own translate + transition lives in `ShareSourceList.module.css` — Task 5 handles it.)

- [ ] **Step 5: Add flash keyframes**

```css
@keyframes handle-flash-h {
  0%   { background: rgba(255, 255, 255, 0.4);  width: 56px; height: 5px; }
  20%  { background: rgba(255, 255, 255, 1.0);  width: 84px; height: 9px; }
  100% { background: rgba(255, 255, 255, 0.4);  width: 56px; height: 5px; }
}
@keyframes handle-flash-v {
  0%   { background: rgba(255, 255, 255, 0.4);  width: 5px;  height: 56px; }
  20%  { background: rgba(255, 255, 255, 1.0);  width: 9px;  height: 84px; }
  100% { background: rgba(255, 255, 255, 0.4);  width: 5px;  height: 56px; }
}

.modal.preview .handle.flash.handleTop,
.modal.preview .handle.flash.handleBottom {
  animation: handle-flash-h 420ms cubic-bezier(0.16, 1, 0.3, 1);
}
.modal.preview .handle.flash.handleRight {
  animation: handle-flash-v 420ms cubic-bezier(0.16, 1, 0.3, 1);
}
```

- [ ] **Step 6: Add mode chip + ⛶ button styles**

```css
.modeChip {
  font-family: ui-monospace, Menlo, monospace;
  font-size: 11px;
  letter-spacing: 0.12em;
  padding: 4px 10px;
  border-radius: 100px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.04);
  flex: 0 0 auto;
}

.fsBtn {
  background: transparent;
  border: none;
  color: var(--share-pill-text);
  font-size: 16px;
  cursor: pointer;
  padding: 4px 10px;
  transition: color var(--share-transition-fast);
}
.fsBtn:hover {
  color: var(--share-pill-text-active);
}
```

(Also: the existing `.title { flex: 1; }` rule had been removed alongside the title element in Task 3. If any leftover `.title` rule lingers in the CSS, leave it — unused rules don't break.)

- [ ] **Step 7: Add help overlay styles**

```css
.helpOverlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  animation: helpFade 180ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes helpFade {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.helpCard {
  background: var(--share-modal-bg);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 24px 32px;
  min-width: 280px;
  color: var(--share-pill-text-active);
}

.helpTitle {
  margin: 0 0 12px;
  font-size: 13px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
}

.helpList {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 13px;
  line-height: 2;
}
.helpList kbd {
  display: inline-block;
  padding: 2px 7px;
  margin-right: 8px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 4px;
  font-family: ui-monospace, Menlo, monospace;
  font-size: 11px;
}
```

- [ ] **Step 8: Run dev server, smoke check**

Run (in another terminal): `pnpm dev`
Open: `http://localhost:3000/board`
- Add 5+ bookmarks via bookmarklet flow (or use board state if seeded).
- Click Share pill → Composer opens. Click ⛶ → modal expands, chrome disappears.
- Hover top edge → handle appears, then header slides in.
- Press F (with composer focused) → toggle works.
- Press H/S/B → handle flashes, chrome stays.
- Press Esc → returns to LAYOUT.
- Press ? → help overlay appears.

If any visible bug, fix CSS inline before committing.

- [ ] **Step 9: Commit**

```bash
rtk git add components/share/ShareComposer.module.css
rtk git commit -m "$(cat <<'EOF'
feat(share): preview-mode CSS — morph, handles, auto-hide, mode chip, help

Modal scales to viewport with corner morph (360ms ease-out). Handles
proximity-revealed via :hover on transparent zones. Chrome panels
auto-hide with 150ms hover-out delay; pin overrides cancel the delay.
Flash keyframe (420ms) for keyboard pin feedback. Help overlay inline.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: ShareSourceList.module.css — preview overlay styling

**Files:**
- Modify: `components/share/ShareSourceList.module.css`
- Modify: `components/share/ShareSourceList.tsx` (single line: accept a `data-preview` prop or read parent context)

**Goal:** When the modal is in preview mode, the source list becomes an absolute-positioned overlay on the right with shadow, hidden by default and revealed via the right zone's `:hover` (mirrored from chrome behavior). Width grows from 200px → 240px in preview.

We key the override off the parent's `data-mode="preview"` attribute (the `.modal` carries it from Task 3). This avoids prop drilling.

- [ ] **Step 1: Append preview overrides to `ShareSourceList.module.css`**

The source `panel` is nested inside `.body`, NOT a sibling of `.zoneRight` (which lives at modal-root level). Use `:has()` (well-supported in 2025) to break out of the sibling-only constraint:

```css
/* === Preview-mode overlay ================================================
   The source list sits over the canvas instead of in the body grid.
   Mirrors header/footer chrome auto-hide (150ms hide delay, faster reveal). */

[data-mode="preview"] .panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 240px;
  z-index: 4;
  background: rgba(20, 20, 22, 0.96);
  border-left: 1px solid rgba(255, 255, 255, 0.10);
  box-shadow: -16px 0 32px rgba(0, 0, 0, 0.35);
  transform: translateX(100%);
  transition: transform 210ms cubic-bezier(0.16, 1, 0.3, 1) 150ms;
}

/* Hover (right zone via :has, or panel itself) → reveal.
   :has() lets us match across non-sibling DOM. CSS modules hash the
   zoneRight class so we substring-match with [class*="zoneRight"]. */
[data-mode="preview"]:has([class*="zoneRight"]:hover) .panel,
[data-mode="preview"] .panel:hover {
  transform: translateX(0);
  transition: transform 260ms cubic-bezier(0.16, 1, 0.3, 1) 0ms;
}

/* Pinned source → instant reveal, no delay. */
[data-mode="preview"][data-pin-s="true"] .panel {
  transform: translateX(0);
  transition-delay: 0ms;
}
```

- [ ] **Step 2: Run dev server smoke check**

Run: `pnpm dev` → reload `/board`. Open Composer → ⛶. Hover right edge → source list slides in from the right with shadow. Stop hovering → 150ms wait → slides back out. Press `S` → flash + pinned (stays). Press `S` again → slides out.

- [ ] **Step 3: Commit**

```bash
rtk git add components/share/ShareSourceList.module.css
rtk git commit -m "$(cat <<'EOF'
feat(share): source-panel overlay in preview mode

Position absolute, width 240px, slides in from the right with shadow.
Selector keys off [data-mode="preview"] on the parent modal to avoid
prop drilling. 150ms hover-out delay; pin cancels delay.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: E2E spec — share-fullscreen.spec.ts

**Files:**
- Create: `tests/e2e/share-fullscreen.spec.ts`

**Goal:** Cover the 9 scenarios listed in the design spec section 9.

- [ ] **Step 1: Write the spec**

Create `tests/e2e/share-fullscreen.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'

/* These tests assume:
 *  - The board /board page loads the share button.
 *  - Some bookmarks exist (re-uses share-composer-edit fixture pattern).
 *  - The viewport is desktop (1280x800) by default in playwright.config.
 */

const openComposer = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.goto('/board')
  await page.waitForSelector('[data-testid="board-toolbar"]', { timeout: 10000 })
  await page.locator('[data-testid="share-pill"]').click()
  await expect(page.locator('[data-testid="share-composer"]')).toBeVisible({ timeout: 10000 })
}

test.describe('Share composer — fullscreen / preview mode', () => {
  test('⛶ button toggles preview mode (modal expands, chrome auto-hides)', async ({ page }) => {
    await openComposer(page)
    const modal = page.locator('[data-testid="share-composer"]')
    await expect(modal).toHaveAttribute('data-mode', 'layout')

    await page.locator('[data-testid="share-fullscreen-btn"]').click()
    await expect(modal).toHaveAttribute('data-mode', 'preview')

    // Modal should fill the viewport (within transition tolerance).
    const box = await modal.boundingBox()
    expect(box?.width).toBeGreaterThan(1200)
    expect(box?.height).toBeGreaterThan(700)
  })

  test('F key toggles preview mode', async ({ page }) => {
    await openComposer(page)
    const modal = page.locator('[data-testid="share-composer"]')

    await page.keyboard.press('f')
    await expect(modal).toHaveAttribute('data-mode', 'preview')

    await page.keyboard.press('f')
    await expect(modal).toHaveAttribute('data-mode', 'layout')
  })

  test('Esc cascade: preview → layout → close', async ({ page }) => {
    await openComposer(page)
    const modal = page.locator('[data-testid="share-composer"]')

    await page.keyboard.press('f')
    await expect(modal).toHaveAttribute('data-mode', 'preview')

    await page.keyboard.press('Escape')
    await expect(modal).toHaveAttribute('data-mode', 'layout')

    await page.keyboard.press('Escape')
    await expect(modal).not.toBeVisible()
  })

  test('H/S/B keys pin individual chrome (preview only)', async ({ page }) => {
    await openComposer(page)
    const modal = page.locator('[data-testid="share-composer"]')

    // In layout mode, H/S/B do nothing.
    await page.keyboard.press('h')
    await expect(modal).toHaveAttribute('data-pin-h', 'false')

    await page.keyboard.press('f') // → preview
    await page.keyboard.press('h')
    await expect(modal).toHaveAttribute('data-pin-h', 'true')

    await page.keyboard.press('s')
    await expect(modal).toHaveAttribute('data-pin-s', 'true')

    await page.keyboard.press('b')
    await expect(modal).toHaveAttribute('data-pin-b', 'true')

    // Toggle off
    await page.keyboard.press('h')
    await expect(modal).toHaveAttribute('data-pin-h', 'false')
  })

  test('toggleMode resets pins', async ({ page }) => {
    await openComposer(page)
    const modal = page.locator('[data-testid="share-composer"]')

    await page.keyboard.press('f') // preview
    await page.keyboard.press('h')
    await page.keyboard.press('s')
    await expect(modal).toHaveAttribute('data-pin-h', 'true')

    await page.keyboard.press('f') // layout
    await expect(modal).toHaveAttribute('data-pin-h', 'false')
    await expect(modal).toHaveAttribute('data-pin-s', 'false')
  })

  test('? toggles help overlay; Esc closes help before falling through', async ({ page }) => {
    await openComposer(page)
    const help = page.locator('[role="dialog"][aria-label="Keyboard shortcuts"]')
    const modal = page.locator('[data-testid="share-composer"]')

    await expect(help).toHaveCount(0)
    await page.keyboard.press('?')
    await expect(help).toBeVisible()

    // Even in preview mode, Esc should close help first, NOT exit preview.
    await page.keyboard.press('f')
    await expect(modal).toHaveAttribute('data-mode', 'preview')
    await page.keyboard.press('?')
    await expect(help).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(help).toHaveCount(0)
    await expect(modal).toHaveAttribute('data-mode', 'preview') // still preview
  })

  test('aspect switcher reachable in preview via header pin', async ({ page }) => {
    await openComposer(page)
    const modal = page.locator('[data-testid="share-composer"]')

    await page.keyboard.press('f') // preview
    await page.keyboard.press('h') // pin header so aspect switcher is reachable
    await expect(modal).toHaveAttribute('data-pin-h', 'true')

    const frame = page.locator('[data-testid="share-frame"]')
    const before = await frame.boundingBox()
    await page.locator('button:has-text("9:16")').click()
    await page.waitForTimeout(400) // allow reflow
    const after = await frame.boundingBox()
    // 9:16 frame is taller than wide; before (free / wide viewport) should differ.
    expect(after?.width).not.toBe(before?.width)
  })

  test('source panel overlays canvas in preview (board card positions stable)', async ({ page }) => {
    await openComposer(page)
    const modal = page.locator('[data-testid="share-composer"]')

    await page.keyboard.press('f')
    // Capture a representative card position BEFORE pinning source.
    const card = page.locator('[data-card-id]').first()
    const beforeCount = await card.count()
    if (beforeCount === 0) {
      // Empty board — skip this assertion gracefully.
      test.skip(true, 'No bookmarks present; cannot verify card position stability')
      return
    }
    const posBefore = await card.boundingBox()

    await page.keyboard.press('s') // pin source list
    await expect(modal).toHaveAttribute('data-pin-s', 'true')
    await page.waitForTimeout(400)

    const posAfter = await card.boundingBox()
    // Overlay behavior: card position must NOT shift when source pins in.
    expect(posAfter?.x).toBeCloseTo(posBefore?.x ?? 0, 0)
    expect(posAfter?.y).toBeCloseTo(posBefore?.y ?? 0, 0)
  })

  test('keyboard shortcuts ignored when typing in inputs', async ({ page }) => {
    await openComposer(page)
    const modal = page.locator('[data-testid="share-composer"]')

    // The composer has no top-level input by default. Inject a temporary
    // input to verify the focus-guard. (If the composer adds inputs later,
    // assert against the real one.)
    await page.evaluate(() => {
      const input = document.createElement('input')
      input.id = '__test_input'
      input.type = 'text'
      document.body.appendChild(input)
      input.focus()
    })

    await page.keyboard.press('f')
    await expect(modal).toHaveAttribute('data-mode', 'layout') // F was swallowed by input

    await page.evaluate(() => document.getElementById('__test_input')?.remove())
  })

  test('touch / coarse pointer hides ⛶ button', async ({ browser }) => {
    const context = await browser.newContext({ hasTouch: true, isMobile: false })
    const page = await context.newPage()
    // Force the matchMedia result; Playwright's hasTouch may not be enough
    // on its own to flip (hover: hover) and (pointer: fine). Use addInitScript.
    await page.addInitScript(() => {
      const original = window.matchMedia
      window.matchMedia = (q: string) => {
        if (q.includes('hover: hover') || q.includes('pointer: fine')) {
          return { ...original(q), matches: false } as MediaQueryList
        }
        return original(q)
      }
    })
    await page.goto('/board')
    await page.waitForSelector('[data-testid="board-toolbar"]', { timeout: 10000 })
    await page.locator('[data-testid="share-pill"]').click()
    await expect(page.locator('[data-testid="share-composer"]')).toBeVisible()

    await expect(page.locator('[data-testid="share-fullscreen-btn"]')).toHaveCount(0)

    // F key has no effect either.
    await page.keyboard.press('f')
    await expect(page.locator('[data-testid="share-composer"]')).toHaveAttribute('data-mode', 'layout')

    await context.close()
  })
})
```

- [ ] **Step 2: Run the new spec only first**

Run: `pnpm playwright test tests/e2e/share-fullscreen.spec.ts`
Expected: all green. If any fails, debug — most likely failure is the `[class*="zoneRight"]` substring selector or timing of CSS modules hashing in the test build. Add `await page.waitForTimeout(400)` after `f` keypress only if a transition-related flake appears.

- [ ] **Step 3: Run the full test suite (regression check)**

Run: `pnpm tsc --noEmit && pnpm vitest run && pnpm playwright test`
Expected: 0 tsc errors, all vitest tests pass, all playwright tests pass.

- [ ] **Step 4: Commit**

```bash
rtk git add tests/e2e/share-fullscreen.spec.ts
rtk git commit -m "$(cat <<'EOF'
test(share): e2e for fullscreen / preview mode

Covers ⛶ button, F key, Esc cascade, H/S/B pin, mode reset on toggle,
? help overlay, input focus guard, touch fallback (⛶ hidden + F no-op).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: TODO.md update + production deploy

**Files:**
- Modify: `docs/TODO.md`

**Goal:** Move the "次セッション最優先" section to a "完了" log, update "現在の状態", deploy to Cloudflare Pages.

- [ ] **Step 1: Update `docs/TODO.md`**

Open `docs/TODO.md`. Replace the "🚨 次セッション最優先: フルスクリーンモード + 突起ホバー UX" block with a "今セッション完了" entry summarizing what shipped:

```markdown
### 🎯 今セッション (2026-05-07 続き) の到達点 — Fullscreen Immersive Mode

⛶ ボタン or F キーで PREVIEW モードに切替、3 辺 chrome を proximity progressive で auto-hide。

**実装内容**:
- composer-layout.ts に mode: 'layout' | 'preview' 追加 (preview + free は fitScale 無効、preset は viewport-fit)
- useShareFullscreen hook 新設 (mode/pin state、F/H/S/B/Esc/? keyboard、touch detection)
- ShareComposer に ⛶ ボタン + LAYOUT/PREVIEW chip + 3 辺 hover-zone + handle + help overlay
- Modal 360ms scale + 角丸 morph、chrome 150ms hover-out delay、handle 420ms flash
- ShareSourceList が preview 中 overlay 化 (240px、shadow、絶対配置)
- touch (`@media (hover: hover) and (pointer: fine)` false) 環境では ⛶ 非表示、F 無効
- E2E spec 追加 (8 ケース)

**変更ファイル**:
- lib/share/composer-layout.ts + composer-layout.test.ts (preview 分岐)
- components/share/use-share-fullscreen.ts + .test.ts (新規 hook)
- components/share/ShareComposer.tsx (state wiring + chip + ⛶ + handle/zone DOM)
- components/share/ShareComposer.module.css (preview スタイル全部)
- components/share/ShareSourceList.module.css (overlay)
- tests/e2e/share-fullscreen.spec.ts (新規 8 spec)
```

Update the "現在の状態" block at the top to reflect SW version bump and "PREVIEW モード搭載済み".

- [ ] **Step 2: Build + deploy**

```bash
rtk pnpm build
npx wrangler pages deploy out/ --project-name=booklage --branch=master --commit-dirty=true
```

- [ ] **Step 3: Verify on `https://booklage.pages.dev`**

Hard-reload the production URL. Open the Share modal, click ⛶, verify:
- Modal expands to viewport, chrome disappears with smooth morph
- Hovering top/right/bottom edges reveals handle then chrome
- F/H/S/B/Esc keys all work
- Press ? → help overlay shows

- [ ] **Step 4: Commit + push the TODO update**

```bash
rtk git add docs/TODO.md
rtk git commit -m "$(cat <<'EOF'
docs(todo): log fullscreen immersive mode shipped

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
rtk git push origin master
```

---

## 受け入れ基準 (final verification before declaring done)

- [ ] `pnpm tsc --noEmit` — 0 errors
- [ ] `pnpm vitest run` — all tests pass (was 256, +5 in composer-layout, +5 in use-share-fullscreen ≈ 266)
- [ ] `pnpm playwright test` — all e2e pass (existing + 8 new in share-fullscreen)
- [ ] Production `https://booklage.pages.dev`:
  - LAYOUT モードは現行と完全互換 (regression なし)
  - ⛶ クリック / F キーで modal が viewport 100% に滑らかに広がる (360ms)
  - PREVIEW 中、handles は resting で完全不可視
  - 80px 圏内の cursor で handle フェードイン → さらに近づくと chrome 全展開
  - chrome から離れて 150ms 後に hide
  - H/S/B で個別 pin、handle 420ms 白フラッシュ → 青常時表示
  - Esc → PREVIEW→LAYOUT、もう一度 → close
  - 上端 hover で header 出現 → アスペクト切替可能
  - 右端 hover で source list overlay → board の card 位置不動
  - ? で help overlay
  - touch device (DevTools の "Toggle device toolbar" でモバイル表示) では ⛶ 非表示、F 無効
