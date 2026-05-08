# Bookmarklet Final Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the bookmarklet save popup to its absolute limit — square 320×320 window in the bottom-right corner, full-black canvas with no flicker, central animation that progresses through Awaken → Save → Reveal → Recede, with OGP thumbnail used as a blurred background overlay when available.

**Architecture:** Three layers. (1) `lib/utils/bookmarklet.ts` updates the `window.open` features string to position 320×320 at bottom-right. (2) New `app/save/layout.tsx` route-segment layout writes `background:#000` inline on `<html>` and `<body>` so the popup's first paint is already black — no white flash, no FOUC. (3) `components/bookmarklet/SaveToast.tsx` is rewritten as a stage-driven component (`saving` → `saved` → `recede` → `error`) with a new full-canvas layout: optional `<img>` background (blurred + dimmed) + radial glow + centered indicator + brand wordmark + label.

**Tech Stack:** Next.js 14 App Router (route-segment layouts), TypeScript strict, Vanilla CSS Modules, `@chenglou/pretext`-free (no measuring needed), Vitest + React Testing Library for component tests, Playwright for E2E.

**Spec:** `docs/superpowers/specs/2026-05-09-bookmarklet-final-polish-design.md`

---

## File Structure

| Path | Action | Responsibility |
|------|--------|----------------|
| `app/save/layout.tsx` | Create | Route-segment layout that paints `<html>` and `<body>` with `background:#000` inline so the popup's first paint is black. Isolated from app's root layout. |
| `lib/utils/bookmarklet.ts` | Modify | Update `BOOKMARKLET_SOURCE` window.open features: 320×320, bottom-right (`screen.availWidth - 320 - 20`, `screen.availHeight - 320 - 20`). |
| `lib/utils/bookmarklet.test.ts` | Modify | Update unit tests to assert new dimensions and position formulas in the generated URI. |
| `components/bookmarklet/SaveToast.tsx` | Modify (full rewrite) | New stage-driven structure. Removes `useTransparentPopupShell`. Adds `recede` state set 1250ms after `saved` for the fade-out transition. Renders optional bg `<img>` only when `image` param is non-empty. |
| `components/bookmarklet/SaveToast.module.css` | Modify (full rewrite) | Full-canvas stage with `position:fixed; inset:0; background:#000`. New keyframes: `bgFadeIn`, `ringSpin`, `checkDraw`, `letterIn`, `recede`. `prefers-reduced-motion` guard. |
| `components/bookmarklet/SaveToast.test.tsx` | Create | Component tests for: saving state shows ring, saved state shows checkmark + label, image param renders bg `<img>`, no image renders no `<img>`, error state shows error mark, no-url fallback shows hint. |

**Out of scope (do NOT touch):**
- `app/layout.tsx` (root)
- `tests/e2e/bookmarklet-save.spec.ts` — already uses `data-testid="save-toast"` and `data-state="saved"` attributes which the new component preserves; pre-existing `DB_VERSION = 9` mismatch with current v11 is unrelated to this work
- i18n strings — keep existing `bookmarklet.toast.{saving,saved,error}` keys and translations

---

## Task 1: Update bookmarklet `window.open` features

**Files:**
- Modify: `lib/utils/bookmarklet.ts:44`
- Test: `lib/utils/bookmarklet.test.ts`

- [ ] **Step 1: Read existing test file to confirm assertion style**

Run: `Read lib/utils/bookmarklet.test.ts`

Look for existing assertions on `width=240,height=130` or `screen.height` math. We will modify those.

- [ ] **Step 2: Write the failing test for new geometry**

In `lib/utils/bookmarklet.test.ts`, add (or replace existing geometry test):

```typescript
import { describe, it, expect } from 'vitest'
import { generateBookmarkletUri } from './bookmarklet'

describe('generateBookmarkletUri — popup geometry', () => {
  it('opens a 320×320 window pinned to bottom-right (20px inset)', () => {
    const uri = generateBookmarkletUri('https://booklage.pages.dev')
    // The features string is built inline inside the IIFE.
    expect(uri).toContain("width=320,height=320")
    // Left = availWidth - 320 - 20; Top = availHeight - 320 - 20
    expect(uri).toContain("screen.availWidth-340")
    expect(uri).toContain("screen.availHeight-340")
    // Old centred-bottom math must be gone
    expect(uri).not.toContain("(screen.width-240)/2")
    expect(uri).not.toContain("sh-154")
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run lib/utils/bookmarklet.test.ts`
Expected: FAIL — old `width=240,height=130` is in the URI.

- [ ] **Step 4: Update `BOOKMARKLET_SOURCE` in `lib/utils/bookmarklet.ts`**

Replace line 44 (the `BOOKMARKLET_SOURCE` constant). Change the trailing `window.open(...)` portion to use:

```javascript
'width=320,height=320,left='+Math.max(0,(screen.availWidth-340))+',top='+Math.max(0,(screen.availHeight-340))+',toolbar=0,menubar=0,location=0,status=0,resizable=0,scrollbars=0'
```

The full updated `BOOKMARKLET_SOURCE` constant:

```typescript
const BOOKMARKLET_SOURCE = `(function(){var d=document,l=location,m=function(s){var e=d.querySelector(s);return e?e.getAttribute('content')||'':'';},k=function(s){var e=d.querySelector(s);return e?e.getAttribute('href')||'':'';},u=l.href,t=m('meta[property="og:title"]')||d.title||u,i=m('meta[property="og:image"]')||m('meta[name="twitter:image"]')||'',ds=(m('meta[property="og:description"]')||m('meta[name="description"]')||'').slice(0,200),sn=m('meta[property="og:site_name"]')||l.hostname,f=k('link[rel="icon"]')||k('link[rel="shortcut icon"]')||'/favicon.ico';if(f&&!/^https?:/.test(f)){try{f=new URL(f,u).href}catch(e){f=''}}var p=new URLSearchParams({url:u,title:t,image:i,desc:ds,site:sn,favicon:f});window.open('__APP_URL__/save?'+p.toString(),'booklage-save','width=320,height=320,left='+Math.max(0,(screen.availWidth-340))+',top='+Math.max(0,(screen.availHeight-340))+',toolbar=0,menubar=0,location=0,status=0,resizable=0,scrollbars=0')})();`
```

(The `var sh=screen.availHeight||screen.height,` part is removed since we now use `screen.availHeight` directly inline.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run lib/utils/bookmarklet.test.ts`
Expected: PASS for the new geometry test, all other tests still pass.

- [ ] **Step 6: Verify URI length is still under 2000 chars**

```typescript
// In the same test file, add or update:
it('stays under the 2000-char javascript: URI limit', () => {
  const uri = generateBookmarkletUri('https://booklage.pages.dev')
  expect(uri.length).toBeLessThan(2000)
})
```

Run: `pnpm vitest run lib/utils/bookmarklet.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/utils/bookmarklet.ts lib/utils/bookmarklet.test.ts
git commit -m "feat(bookmarklet): pin popup 320x320 to bottom-right corner"
```

---

## Task 2: Create `/save` route-segment layout for black-canvas first paint

**Files:**
- Create: `app/save/layout.tsx`

- [ ] **Step 1: Write the file**

```typescript
import type { ReactNode } from 'react'

/**
 * Route-segment layout for the bookmarklet save popup.
 * Paints html + body black inline so the popup's first paint is already
 * dark — no white flash, no FOUC during Next.js hydration.
 *
 * Isolated from app/layout.tsx (root) so the rest of Booklage is unaffected.
 */
export default function SaveLayout({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <html lang="ja" style={{ background: '#000' }}>
      <head>
        <style>{`
          html, body { background: #000; margin: 0; padding: 0; overflow: hidden; }
        `}</style>
      </head>
      <body style={{ background: '#000', margin: 0, padding: 0, overflow: 'hidden' }}>
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Verify Next.js builds with the new route-segment layout**

Run: `pnpm build`
Expected: Build succeeds. The `/save` route should be listed in the output as a static or dynamic route.

If build fails with "two `<html>` tags" or similar, check that root `app/layout.tsx` isn't being inherited — Next.js App Router allows nested `<html>` declarations in route-segment layouts when the segment has its own `layout.tsx`. If Next.js complains, the fix is to ensure `app/save/layout.tsx` is a sibling layout (which it is). If still failing, fall back to: keep root layout's `<html>`, and add the inline `<style>` via `<head>` injection in `app/save/layout.tsx` without re-declaring `<html>`/`<body>`.

- [ ] **Step 3: Commit**

```bash
git add app/save/layout.tsx
git commit -m "feat(bookmarklet): add /save route-segment layout with black canvas"
```

---

## Task 3: Rewrite `SaveToast.module.css`

**Files:**
- Modify (full rewrite): `components/bookmarklet/SaveToast.module.css`

This task is CSS-only; no failing test first. Verification is visual + tsc-build.

- [ ] **Step 1: Replace the file contents in full**

```css
/* Bookmarklet save popup — full-canvas stage that fills the 320×320 window.
 * Stages (driven by [data-state]):
 *   saving  → ring + brand + "保存中…"
 *   saved   → optional bg image + checkmark draw + brand + "Inbox に保存しました"
 *   recede  → fade-out + scale-down (final 250ms before window.close)
 *   error   → error mark + brand + error label
 */

.stage {
  position: fixed;
  inset: 0;
  background: #000;
  overflow: hidden;
  font-family: var(--font-geist), system-ui, -apple-system, sans-serif;
  color: rgba(255, 255, 255, 0.94);
  transition: opacity 250ms ease-out, transform 250ms ease-out;
  transform: scale(1);
  opacity: 1;
}

.stage[data-state="recede"] {
  opacity: 0;
  transform: scale(0.96);
}

.bgThumb {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: blur(6px) brightness(0.55);
  opacity: 0;
  pointer-events: none;
  will-change: opacity;
}

.stage[data-state="saved"] .bgThumb,
.stage[data-state="recede"] .bgThumb {
  animation: bgFadeIn 250ms ease-out forwards;
}

@keyframes bgFadeIn {
  to { opacity: 1; }
}

.glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.06) 0%, transparent 60%);
  pointer-events: none;
}

.center {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 16px;
  z-index: 1;
  padding: 0 24px;
  text-align: center;
}

.indicator {
  width: 64px;
  height: 64px;
  display: grid;
  place-items: center;
  will-change: transform, opacity;
}

.ring {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.18);
  border-top-color: #fff;
  animation: ringSpin 1.4s linear infinite;
  will-change: transform;
}

@keyframes ringSpin {
  to { transform: rotate(360deg); }
}

.checkmark {
  width: 56px;
  height: 56px;
  display: block;
}

.checkmark path {
  fill: none;
  stroke: #fff;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 30;
  stroke-dashoffset: 30;
  animation: checkDraw 300ms ease-out forwards;
}

@keyframes checkDraw {
  to { stroke-dashoffset: 0; }
}

.errorMark {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: #d04a4a;
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 28px;
}

.brand {
  font-weight: 600;
  font-size: 18px;
  letter-spacing: 0.02em;
  color: #fff;
  opacity: 0;
  transform: translateY(8px);
  animation: brandIn 320ms cubic-bezier(0.16, 1, 0.3, 1) 80ms forwards;
  will-change: transform, opacity;
}

@keyframes brandIn {
  to { opacity: 1; transform: translateY(0); }
}

.label {
  font-weight: 400;
  font-size: 13px;
  line-height: 1.3;
  color: rgba(255, 255, 255, 0.78);
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0;
}

.label.saved {
  color: rgba(255, 255, 255, 0.96);
}

.label.error {
  color: #ff8a8a;
}

.label > span {
  display: inline-block;
  opacity: 0;
  transform: translateY(4px);
  will-change: transform, opacity;
}

.stage[data-state="saving"] .label > span {
  animation: letterIn 240ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.stage[data-state="saved"] .label > span,
.stage[data-state="error"] .label > span {
  animation: letterIn 240ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes letterIn {
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .ring { animation: none; }
  .checkmark path { stroke-dashoffset: 0; animation: none; }
  .brand,
  .label > span,
  .bgThumb { animation: none; opacity: 1; transform: none; }
  .stage,
  .stage[data-state="recede"] { transition: opacity 80ms linear, transform 0s; }
}
```

- [ ] **Step 2: Verify the file is parseable by Vitest's CSS module transformer**

Run: `pnpm vitest run components/bookmarklet/ 2>&1 | head -30`
Expected: No CSS parse errors. Existing tests in this dir may still pass or fail depending on Task 4 progress — that's OK.

- [ ] **Step 3: Commit**

```bash
git add components/bookmarklet/SaveToast.module.css
git commit -m "feat(bookmarklet): rewrite SaveToast styles for full-canvas stage"
```

---

## Task 4: Rewrite `SaveToast.tsx` with stage-driven structure

**Files:**
- Modify (full rewrite): `components/bookmarklet/SaveToast.tsx`
- Create: `components/bookmarklet/SaveToast.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create `components/bookmarklet/SaveToast.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SaveToast } from './SaveToast'

// Mock next/navigation
let mockParams = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockParams,
}))

// Mock IDB layer — addBookmark resolves with a fake bookmark
vi.mock('@/lib/storage/indexeddb', () => ({
  initDB: vi.fn().mockResolvedValue({}),
  addBookmark: vi.fn().mockResolvedValue({ id: 'bm-test-1' }),
}))

vi.mock('@/lib/board/channel', () => ({
  postBookmarkSaved: vi.fn(),
}))

describe('SaveToast', () => {
  beforeEach(() => {
    mockParams = new URLSearchParams()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('shows a hint when opened with no url param', () => {
    render(<SaveToast />)
    expect(screen.getByText(/ブックマークレットから開いてください/)).toBeInTheDocument()
  })

  it('renders saving state with ring indicator initially', () => {
    mockParams = new URLSearchParams({
      url: 'https://example.com',
      title: 'Example',
    })
    render(<SaveToast />)
    const stage = screen.getByTestId('save-toast')
    expect(stage).toHaveAttribute('data-state', 'saving')
    expect(stage.querySelector('[data-role="ring"]')).toBeTruthy()
  })

  it('transitions to saved state after IDB write + 600ms hold', async () => {
    mockParams = new URLSearchParams({
      url: 'https://example.com',
      title: 'Example',
    })
    render(<SaveToast />)
    // Let the async addBookmark resolve
    await vi.runOnlyPendingTimersAsync()
    // Advance past the 600ms hold
    await vi.advanceTimersByTimeAsync(700)
    const stage = screen.getByTestId('save-toast')
    expect(stage).toHaveAttribute('data-state', 'saved')
    expect(stage.querySelector('[data-role="checkmark"]')).toBeTruthy()
  })

  it('renders bg image when image param is provided', async () => {
    mockParams = new URLSearchParams({
      url: 'https://example.com',
      title: 'Example',
      image: 'https://example.com/og.png',
    })
    render(<SaveToast />)
    await vi.runOnlyPendingTimersAsync()
    await vi.advanceTimersByTimeAsync(700)
    const img = screen.getByTestId('save-toast').querySelector('img[data-role="bg-thumb"]')
    expect(img).toBeTruthy()
    expect(img?.getAttribute('src')).toBe('https://example.com/og.png')
  })

  it('does not render bg image when image param is empty', async () => {
    mockParams = new URLSearchParams({
      url: 'https://example.com',
      title: 'Example',
    })
    render(<SaveToast />)
    await vi.runOnlyPendingTimersAsync()
    await vi.advanceTimersByTimeAsync(700)
    const img = screen.getByTestId('save-toast').querySelector('img[data-role="bg-thumb"]')
    expect(img).toBeNull()
  })

  it('transitions saved → recede → close at the right times', async () => {
    mockParams = new URLSearchParams({
      url: 'https://example.com',
      title: 'Example',
    })
    const closeMock = vi.fn()
    Object.defineProperty(window, 'close', { value: closeMock, configurable: true, writable: true })

    render(<SaveToast />)
    await vi.runOnlyPendingTimersAsync()
    await vi.advanceTimersByTimeAsync(600)  // saved fires
    expect(screen.getByTestId('save-toast')).toHaveAttribute('data-state', 'saved')

    await vi.advanceTimersByTimeAsync(1250) // recede fires (1250ms after saved)
    expect(screen.getByTestId('save-toast')).toHaveAttribute('data-state', 'recede')
    expect(closeMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(250) // close fires (250ms after recede start)
    expect(closeMock).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run components/bookmarklet/SaveToast.test.tsx`
Expected: FAIL — current `SaveToast.tsx` does not have `data-role` attributes, no `recede` state, etc.

- [ ] **Step 3: Replace `components/bookmarklet/SaveToast.tsx` in full**

```typescript
'use client'

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useSearchParams } from 'next/navigation'
import { initDB, addBookmark } from '@/lib/storage/indexeddb'
import { detectUrlType } from '@/lib/utils/url'
import { postBookmarkSaved } from '@/lib/board/channel'
import { t } from '@/lib/i18n/t'
import styles from './SaveToast.module.css'

type State = 'saving' | 'saved' | 'recede' | 'error'

const SAVING_HOLD_MS = 600
const SAVED_VISIBLE_MS = 1250
const RECEDE_DURATION_MS = 250
const ERROR_CLOSE_MS = 2600

/**
 * Render the label text as one <span> per character so each letter can fade
 * up via stagger animation. Whitespace is preserved as a non-breaking space.
 */
function StaggeredLabel({ text }: { text: string }): ReactElement {
  const chars = useMemo(() => Array.from(text), [text])
  return (
    <>
      {chars.map((ch, i) => (
        <span key={`${i}-${ch}`} style={{ animationDelay: `${i * 40}ms` }}>
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </>
  )
}

export function SaveToast(): ReactElement {
  const params = useSearchParams()
  const url = params.get('url') ?? ''
  const title = params.get('title') || url
  const desc = params.get('desc') ?? ''
  const image = params.get('image') ?? ''
  const site = params.get('site') ?? ''
  const favicon = params.get('favicon') ?? ''

  const [state, setState] = useState<State>('saving')
  const savedRef = useRef(false)

  useEffect(() => {
    if (!url || savedRef.current) return
    savedRef.current = true
    const timers: ReturnType<typeof setTimeout>[] = []

    ;(async (): Promise<void> => {
      try {
        const db = await initDB()
        const bm = await addBookmark(db, {
          url,
          title,
          description: desc,
          thumbnail: image,
          favicon,
          siteName: site,
          type: detectUrlType(url),
          tags: [],
        })
        postBookmarkSaved({ bookmarkId: bm.id })

        // Hold the spinner ~600ms so the success state never just flashes by.
        timers.push(setTimeout(() => setState('saved'), SAVING_HOLD_MS))
        // SAVED_VISIBLE_MS after switching to 'saved', start the recede.
        timers.push(setTimeout(() => setState('recede'), SAVING_HOLD_MS + SAVED_VISIBLE_MS))
        // Close after the recede transition completes.
        timers.push(setTimeout(() => {
          try { window.close() } catch { /* browser blocked */ }
        }, SAVING_HOLD_MS + SAVED_VISIBLE_MS + RECEDE_DURATION_MS))
      } catch {
        setState('error')
        timers.push(setTimeout(() => {
          try { window.close() } catch { /* ignore */ }
        }, ERROR_CLOSE_MS))
      }
    })()

    return () => { for (const t of timers) clearTimeout(t) }
  }, [url, title, desc, image, site, favicon])

  // No-URL fallback — popup opened directly without query params.
  if (!url) {
    return (
      <div className={styles.stage} data-state="saving" data-testid="save-toast">
        <div className={styles.glow} />
        <div className={styles.center}>
          <div className={styles.indicator}>
            <div className={styles.ring} data-role="ring" />
          </div>
          <div className={styles.brand}>Booklage</div>
          <div className={styles.label} aria-live="polite">
            <StaggeredLabel text="ブックマークレットから開いてください" />
          </div>
        </div>
      </div>
    )
  }

  const labelText =
    state === 'error' ? t('bookmarklet.toast.error') :
    state === 'saved' || state === 'recede' ? t('bookmarklet.toast.saved') :
    t('bookmarklet.toast.saving')

  const labelClass =
    state === 'saved' || state === 'recede' ? `${styles.label} ${styles.saved}` :
    state === 'error' ? `${styles.label} ${styles.error}` :
    styles.label

  const showImage = (state === 'saved' || state === 'recede') && image !== ''

  return (
    <div className={styles.stage} data-state={state} data-testid="save-toast">
      {showImage && (
        <img
          className={styles.bgThumb}
          src={image}
          alt=""
          aria-hidden="true"
          data-role="bg-thumb"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
      )}
      <div className={styles.glow} />
      <div className={styles.center}>
        <div className={styles.indicator}>
          {state === 'saving' && <div className={styles.ring} data-role="ring" />}
          {(state === 'saved' || state === 'recede') && (
            <svg
              className={styles.checkmark}
              viewBox="0 0 24 24"
              role="img"
              aria-label={t('bookmarklet.toast.saved')}
              data-role="checkmark"
            >
              <path d="M5 12 L10 17 L19 7" />
            </svg>
          )}
          {state === 'error' && (
            <div
              className={styles.errorMark}
              role="img"
              aria-label={t('bookmarklet.toast.error')}
              data-role="error-mark"
            >!</div>
          )}
        </div>
        <div className={styles.brand}>Booklage</div>
        <div className={labelClass} aria-live="polite">
          <StaggeredLabel text={labelText} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run components/bookmarklet/SaveToast.test.tsx`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Run the whole test suite to verify nothing else broke**

Run: `pnpm vitest run`
Expected: All previously-passing tests still pass. tsc must be 0 errors:
Run: `pnpm tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add components/bookmarklet/SaveToast.tsx components/bookmarklet/SaveToast.test.tsx
git commit -m "feat(bookmarklet): rewrite SaveToast for full-canvas staged animation"
```

---

## Task 5: Build, smoke-test locally, deploy, and verify

**Files:** none (verification only)

- [ ] **Step 1: Build**

Run: `pnpm build`
Expected: Build succeeds, `out/` is generated, no warnings about route conflicts on `/save`.

- [ ] **Step 2: Smoke-test the bookmarklet generation locally**

Run: `pnpm dev` in one terminal, then in another:

```bash
# Verify the install page renders without errors
curl -s http://localhost:3000/ | grep -i "bookmarklet"
# Verify /save renders directly (without url param) without 500
curl -s http://localhost:3000/save -o /dev/null -w "%{http_code}\n"
```

Expected: `/save` returns 200.

- [ ] **Step 3: Manual smoke test (user does this; agent describes the checklist)**

Before deploying, verify these manually in a real browser:

1. Open `http://localhost:3000/` (or wherever the install modal lives)
2. Drag the `📌 Booklage ↤ Drag me` link to the bookmarks bar
3. Open `https://github.com/anthropics/claude-code` in a new tab (this URL has og:image)
4. Click the bookmarklet
5. Verify: popup appears at **bottom-right** of screen, **square**-ish (320×320), **black** from the first frame (no white flash)
6. Verify: ring indicator spins in the centre, brand "Booklage" + "保存中…" appears
7. Verify: after ~600ms, the GitHub OG image fades in as a blurred bg overlay, checkmark draws, "Inbox に保存しました" letter-staggers in
8. Verify: ~1.5s later, popup fades out smoothly and closes

Then test on a no-image page (e.g. `https://docs.google.com`) and verify the radial-glow-only fallback feels good.

- [ ] **Step 4: Stop dev server, deploy to production**

Run:
```bash
pnpm build
npx wrangler pages deploy out/ --project-name=booklage --branch=master --commit-dirty=true --commit-message="bookmarklet final polish"
```

Expected: Deploy succeeds. Output shows `https://booklage.pages.dev` and a per-deploy preview URL.

- [ ] **Step 5: Verify on production**

User opens `https://booklage.pages.dev` with **hard reload** (Ctrl+Shift+R). User is informed:

> Bookmarklet は再ドラッグが必要です — `📌 Booklage ↤ Drag me` を再度ブックマークバーへドラッグしてから任意サイトでクリック。

Verify: same checklist as Step 3 but on production.

- [ ] **Step 6: Update `docs/TODO.md` "現在の状態" section**

Open `docs/TODO.md` and update the top status section:

```markdown
- **本番**: `https://booklage.pages.dev` に **bookmarklet final polish 反映済**
- **次セッション最優先**: Phase 1 — Chrome 拡張 v0 の設計開始
- **2026-05-09 引き継ぎ**:
  - ブクマレット popup を 320×320 / 右下 / 黒キャンバス / staged アニメに刷新済
  - **ブクマレット再インストールが必要** — 古いやつを削除して `📌 Booklage ↤ Drag me` を再ドラッグ
  - Phase 0 (ブクマレット polish) ＝ 終了。これより Phase 1 (拡張) → Phase 2 (一括インポート) → Phase 3 (PiP) の 3 段で投資移転
```

Update the SW version line (`Service Worker:` line) if a SW version bump is part of the deploy convention. Check current SW version with:
Run: `grep -n "CACHE_VERSION" public/sw.js | head -3` (or wherever the SW lives) — if a bump is convention here, bump it; otherwise leave as-is.

- [ ] **Step 7: Commit the TODO update**

```bash
git add docs/TODO.md
git commit -m "docs(todo): handoff for 2026-05-09 — bookmarklet final polish complete"
git push
```

---

## Self-Review Notes (already applied inline)

- ✅ Spec §3 timeline matches Task 4 timer math (`SAVING_HOLD_MS=600` + `SAVED_VISIBLE_MS=1250` + `RECEDE_DURATION_MS=250` = 2100ms total from save complete to close)
- ✅ Spec §4 ちらつき対策 — Task 2 (layout.tsx black inline), Task 4 (SSR-completed markup, GPU transforms only), Task 1 (window.open with explicit width/height/left/top)
- ✅ Spec §5 file changes match Tasks 1–4 exactly
- ✅ Spec §7 error handling — Task 4 has `onError` on `<img>` that hides on failure; IDB error path triggers `state='error'`
- ✅ Spec §9 a11y — `prefers-reduced-motion` block in CSS, `aria-live="polite"` on label, `role="img"`+`aria-label` on icons
- ✅ i18n keys preserved (`bookmarklet.toast.{saving,saved,error}`)
- ✅ Pre-existing E2E uses `data-testid="save-toast"` and `data-state="saved"` — both retained
- ✅ Type consistency: `State` union `'saving' | 'saved' | 'recede' | 'error'` used consistently across CSS `[data-state="..."]` selectors and TSX state machine
