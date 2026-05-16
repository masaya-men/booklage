# Chrome Extension v0 — Plan 1: AllMarks Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the AllMarks-side foundation for the upcoming Chrome extension: a `/save-iframe` postMessage endpoint that writes IDB cross-origin, a Document Picture-in-Picture (PiP) "AllMarks Companion" with the records-stack design, a Pop out button on the board, and a `?focus=<cardId>` smooth-scroll handler. After this plan, the AllMarks app is ready for the extension to talk to it — and as a side effect, users can already manually exercise the PiP via the Pop out button.

**Architecture:** Three independent additions, each tightly scoped. (1) `app/save-iframe/page.tsx` is a hidden-iframe-friendly endpoint that listens for `postMessage`, validates the payload with Zod, writes to IDB via existing `lib/storage/indexeddb.ts`, broadcasts `bookmark-saved` via existing `lib/board/channel.ts`, and posts back a typed result. (2) The PiP companion uses the Document Picture-in-Picture API — opened via `documentPictureInPicture.requestWindow()` — populated via React Portal targeting the PiP window's document. The PiP renders a 5-card stack with 3D-perspective transforms, scan-reveal on thumbnail load, and slide-in animation on `bookmark-saved` events. (3) The board adds a `PopOutButton` to TopHeader actions and a `?focus=<cardId>` URL param handler that smooth-scrolls + glows the matching card.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Vanilla CSS Modules, Zod for postMessage validation, existing IDB layer (`idb` library wrapper), existing BroadcastChannel infrastructure, React 19 `createPortal`, Document Picture-in-Picture API (Chrome 116+, Edge 116+), Vitest + React Testing Library, Playwright for cross-document E2E.

**Spec:** `docs/superpowers/specs/2026-05-09-chrome-extension-v0-design.md`

---

## File Structure

| Path | Action | Responsibility |
|------|--------|----------------|
| `lib/utils/save-message.ts` | Create | Zod schema + parser for the `booklage:save` postMessage payload. Pure data validation, no side effects. |
| `lib/utils/save-message.test.ts` | Create | Unit tests for the schema (valid / invalid / boundary inputs). |
| `app/save-iframe/layout.tsx` | Create | Route-segment layout that paints html/body invisible (the iframe is rendered offscreen by the extension's offscreen document, so visuals don't matter — but a clean layout avoids font/CSS bleed). |
| `app/save-iframe/page.tsx` | Create | Client component that listens for postMessage with `type: 'booklage:save'`, validates via Zod, calls `addBookmark`, posts back a typed result, and broadcasts `bookmark-saved`. |
| `tests/e2e/save-iframe.spec.ts` | Create | Playwright E2E that loads `/save-iframe` in an iframe, posts a save message, asserts IDB write + result message. |
| `lib/board/pip-window.ts` | Create | `usePipWindow()` hook: manages a Document PiP window, copies stylesheets into it, exposes `open / close / window`. |
| `components/pip/PipEmptyState.tsx` | Create | The "AllMarks" wordmark with 4s breathing, shown when no cards exist yet. |
| `components/pip/PipEmptyState.module.css` | Create | Styles for empty state. |
| `components/pip/PipCard.tsx` | Create | Single card in the stack: thumbnail with scan-reveal, fallback placeholder for missing image, hover pull-forward. |
| `components/pip/PipCard.module.css` | Create | Card styles + scan-reveal keyframes. |
| `components/pip/PipStack.tsx` | Create | The 5-card stack composer: applies 3D-perspective transforms to children, handles hover state, dispatches click events upward. |
| `components/pip/PipStack.module.css` | Create | Stack container styles + per-position transform classes. |
| `components/pip/PipCompanion.tsx` | Create | Top-level PiP UI: subscribes to `bookmark-saved`, renders empty state OR stack, animates new card slide-in, handles × close. |
| `components/pip/PipCompanion.test.tsx` | Create | Component tests for empty/stack render, save animation, hover, × close. |
| `components/pip/PipPortal.tsx` | Create | Wraps PiP rendering: uses `createPortal` to render `<PipCompanion>` into the PiP window's document. |
| `components/board/PopOutButton.tsx` | Create | TopHeader actions button. Disabled if `documentPictureInPicture` is unsupported. Click → opens PiP. |
| `components/board/PopOutButton.module.css` | Create | Button styles. |
| `components/board/BoardRoot.tsx` | Modify | Wire `PopOutButton` into TopHeader actions. Render `<PipPortal>` with state. Handle `?focus=<cardId>` URL param for smooth scroll. |
| `lib/board/scroll-to-card.ts` | Create | Pure helper: given a `cardId` and a board container, smooth-scroll the card into view. |
| `lib/board/scroll-to-card.test.ts` | Create | Unit tests for the scroll math. |

**Out of scope (for Plan 2):**
- Chrome extension `manifest.json`, service worker, content script
- Offscreen document pattern
- Cursor pill (only renders inside the extension's content script, no AllMarks-side change)
- All `chrome.*` API usage

---

## Task 1: Create the postMessage schema + parser (`lib/utils/save-message.ts`)

**Files:**
- Create: `lib/utils/save-message.ts`
- Create: `lib/utils/save-message.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/utils/save-message.test.ts
import { describe, it, expect } from 'vitest'
import { parseSaveMessage, type SaveMessageInput } from './save-message'

describe('parseSaveMessage', () => {
  it('accepts a valid booklage:save payload', () => {
    const result = parseSaveMessage({
      type: 'booklage:save',
      payload: {
        url: 'https://example.com/article',
        title: 'Example',
        description: 'desc',
        image: 'https://example.com/og.png',
        favicon: 'https://example.com/favicon.ico',
        siteName: 'Example',
        nonce: 'abc-123',
      },
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.payload.url).toBe('https://example.com/article')
      expect(result.value.payload.nonce).toBe('abc-123')
    }
  })

  it('rejects payloads with the wrong type', () => {
    const result = parseSaveMessage({
      type: 'something-else',
      payload: { url: 'https://example.com', title: 't', description: '', image: '', favicon: '', siteName: '', nonce: 'n' },
    })
    expect(result.ok).toBe(false)
  })

  it('rejects payloads missing required url', () => {
    const result = parseSaveMessage({
      type: 'booklage:save',
      payload: { title: 't', description: '', image: '', favicon: '', siteName: '', nonce: 'n' },
    })
    expect(result.ok).toBe(false)
  })

  it('rejects payloads with non-string url', () => {
    const result = parseSaveMessage({
      type: 'booklage:save',
      payload: { url: 123, title: 't', description: '', image: '', favicon: '', siteName: '', nonce: 'n' },
    })
    expect(result.ok).toBe(false)
  })

  it('rejects null', () => {
    expect(parseSaveMessage(null).ok).toBe(false)
  })

  it('rejects non-object', () => {
    expect(parseSaveMessage('hello').ok).toBe(false)
  })

  it('accepts payload with empty optional fields', () => {
    const result = parseSaveMessage({
      type: 'booklage:save',
      payload: {
        url: 'https://example.com',
        title: 'Example',
        description: '',
        image: '',
        favicon: '',
        siteName: '',
        nonce: 'n',
      },
    })
    expect(result.ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run lib/utils/save-message.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/utils/save-message.ts`**

```typescript
import { z } from 'zod'

const SaveMessagePayload = z.object({
  url: z.string().min(1),
  title: z.string(),
  description: z.string(),
  image: z.string(),
  favicon: z.string(),
  siteName: z.string(),
  nonce: z.string().min(1),
})

const SaveMessage = z.object({
  type: z.literal('booklage:save'),
  payload: SaveMessagePayload,
})

export type SaveMessageInput = z.infer<typeof SaveMessage>

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

export function parseSaveMessage(input: unknown): ParseResult<SaveMessageInput> {
  const r = SaveMessage.safeParse(input)
  if (r.success) return { ok: true, value: r.data }
  return { ok: false, error: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
}

export type SaveMessageResult =
  | { type: 'booklage:save:result'; nonce: string; ok: true; bookmarkId: string }
  | { type: 'booklage:save:result'; nonce: string; ok: false; error: string }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run lib/utils/save-message.test.ts`
Expected: PASS — 7/7 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/save-message.ts lib/utils/save-message.test.ts
git commit -m "feat(save-iframe): add postMessage schema and parser"
```

---

## Task 2: Create the `/save-iframe` endpoint

**Files:**
- Create: `app/save-iframe/layout.tsx`
- Create: `app/save-iframe/page.tsx`
- Create: `app/save-iframe/SaveIframeClient.tsx` (the postMessage handler — extracted client component)
- Create: `tests/e2e/save-iframe.spec.ts`

- [ ] **Step 1: Create `app/save-iframe/layout.tsx`**

```typescript
import type { ReactNode } from 'react'

export default function SaveIframeLayout({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `html, body { background: transparent; margin: 0; padding: 0; overflow: hidden; min-height: 0 !important; }`,
        }}
      />
      {children}
    </>
  )
}
```

- [ ] **Step 2: Create `app/save-iframe/page.tsx`**

```typescript
import { Suspense } from 'react'
import { SaveIframeClient } from './SaveIframeClient'

export default function SaveIframePage(): React.ReactElement {
  return (
    <Suspense fallback={null}>
      <SaveIframeClient />
    </Suspense>
  )
}
```

- [ ] **Step 3: Create the client handler `app/save-iframe/SaveIframeClient.tsx`**

```typescript
'use client'

import { useEffect, useRef, type ReactElement } from 'react'
import { initDB, addBookmark } from '@/lib/storage/indexeddb'
import { detectUrlType } from '@/lib/utils/url'
import { postBookmarkSaved } from '@/lib/board/channel'
import { parseSaveMessage, type SaveMessageResult } from '@/lib/utils/save-message'

const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  // AllMarks extension origin (chrome-extension://) — the actual ID is set
  // post-publish; allow any chrome-extension origin in v0. Production
  // tightening is tracked in spec §8.4 (origin verification).
  /^chrome-extension:\/\//,
]

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGIN_PATTERNS.some((p) => p.test(origin))
}

export function SaveIframeClient(): ReactElement {
  const handledNonces = useRef<Set<string>>(new Set())

  useEffect(() => {
    const handler = async (ev: MessageEvent): Promise<void> => {
      if (!isAllowedOrigin(ev.origin)) return
      const parsed = parseSaveMessage(ev.data)
      if (!parsed.ok) return
      const { payload } = parsed.value

      // Idempotency — extension may retransmit on flaky postMessage delivery.
      if (handledNonces.current.has(payload.nonce)) return
      handledNonces.current.add(payload.nonce)

      const reply = (msg: SaveMessageResult): void => {
        ev.source?.postMessage(msg, { targetOrigin: ev.origin })
      }

      try {
        const db = await initDB()
        const bm = await addBookmark(db, {
          url: payload.url,
          title: payload.title || payload.url,
          description: payload.description,
          thumbnail: payload.image,
          favicon: payload.favicon,
          siteName: payload.siteName,
          type: detectUrlType(payload.url),
          tags: [],
        })
        postBookmarkSaved({ bookmarkId: bm.id })
        reply({ type: 'booklage:save:result', nonce: payload.nonce, ok: true, bookmarkId: bm.id })
      } catch (err) {
        reply({
          type: 'booklage:save:result',
          nonce: payload.nonce,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  return <div data-testid="save-iframe-mounted" style={{ display: 'none' }} />
}
```

- [ ] **Step 4: Verify build succeeds**

Run: `pnpm build`
Expected: Build succeeds. `/save-iframe` listed in route output.

- [ ] **Step 5: Write E2E test**

Create `tests/e2e/save-iframe.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'

test.describe('/save-iframe postMessage flow', () => {
  test('writes a bookmark to IDB on valid booklage:save message', async ({ page }) => {
    await page.goto('/save-iframe')
    await page.waitForSelector('[data-testid="save-iframe-mounted"]', { state: 'attached' })

    // Fake the origin check by overriding ALLOWED_ORIGIN_PATTERNS via a window flag.
    // Simpler: Playwright loads the page with same origin, so dispatch postMessage
    // from same origin AFTER replacing the pattern matcher in-page.
    await page.evaluate(() => {
      // Inject a same-origin "allowed" rule so the in-page handler accepts our test message.
      // The handler uses regex.test on ev.origin; we add window.location.origin to the test set.
      const orig = (globalThis as Record<string, unknown>)['__BOOKLAGE_ALLOWED_ORIGINS__']
      if (!orig) {
        (globalThis as Record<string, unknown>)['__BOOKLAGE_ALLOWED_ORIGINS__'] = [window.location.origin]
      }
    })

    // Listen for the result message
    const resultPromise = page.evaluate(() => {
      return new Promise<unknown>((resolve) => {
        const listener = (ev: MessageEvent): void => {
          if ((ev.data as { type?: string } | null)?.type === 'booklage:save:result') {
            window.removeEventListener('message', listener)
            resolve(ev.data)
          }
        }
        window.addEventListener('message', listener)
      })
    })

    // Post a save message
    await page.evaluate(() => {
      window.postMessage({
        type: 'booklage:save',
        payload: {
          url: 'https://example.com/test-article',
          title: 'Test Article',
          description: 'A test',
          image: 'https://example.com/og.png',
          favicon: 'https://example.com/favicon.ico',
          siteName: 'Example',
          nonce: 'test-nonce-1',
        },
      }, window.location.origin)
    })

    const result = await resultPromise
    expect((result as { ok: boolean }).ok).toBe(true)
    expect((result as { nonce: string }).nonce).toBe('test-nonce-1')
  })
})
```

**Note**: The current `SaveIframeClient.tsx` only allows `chrome-extension://` origins. For E2E to work with same-origin Playwright, you must add a development hatch. Update `SaveIframeClient.tsx`:

Replace `isAllowedOrigin`:

```typescript
function isAllowedOrigin(origin: string): boolean {
  // Production: chrome-extension only.
  if (ALLOWED_ORIGIN_PATTERNS.some((p) => p.test(origin))) return true
  // Test/dev hatch: explicit window-attached allowlist (set by E2E or local dev).
  const w = globalThis as { __BOOKLAGE_ALLOWED_ORIGINS__?: string[] }
  if (Array.isArray(w.__BOOKLAGE_ALLOWED_ORIGINS__) && w.__BOOKLAGE_ALLOWED_ORIGINS__.includes(origin)) return true
  return false
}
```

- [ ] **Step 6: Run E2E test**

Run: `pnpm playwright test tests/e2e/save-iframe.spec.ts`
Expected: 1 test passes.

- [ ] **Step 7: Run full vitest + tsc**

Run: `pnpm vitest run && pnpm tsc --noEmit`
Expected: All previously passing + new tests pass. tsc 0 errors.

- [ ] **Step 8: Commit**

```bash
git add app/save-iframe/ tests/e2e/save-iframe.spec.ts
git commit -m "feat(save-iframe): add postMessage endpoint for cross-origin save"
```

---

## Task 3: Create the `usePipWindow` hook

**Files:**
- Create: `lib/board/pip-window.ts`

PiP-related code is hard to unit-test (Document PiP API not in jsdom), so this task is implementation + manual smoke verification rather than TDD. The interface is small enough to keep correct by inspection.

- [ ] **Step 1: Implement `lib/board/pip-window.ts`**

```typescript
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface PipWindowApi {
  readonly window: Window | null
  readonly isSupported: boolean
  readonly isOpen: boolean
  open: () => Promise<void>
  close: () => void
}

declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow(opts: { width: number; height: number }): Promise<Window>
      window: Window | null
    }
  }
}

const PIP_WIDTH = 320
const PIP_HEIGHT = 320

/**
 * Manage a Document Picture-in-Picture window for the AllMarks Companion.
 * Copies all parent stylesheets into the PiP document so CSS Modules apply.
 * Cleans up on unmount.
 */
export function usePipWindow(): PipWindowApi {
  const [pipWindow, setPipWindow] = useState<Window | null>(null)
  const isSupported = typeof window !== 'undefined' && 'documentPictureInPicture' in window

  const open = useCallback(async (): Promise<void> => {
    if (!isSupported) return
    if (pipWindow && !pipWindow.closed) return
    const api = window.documentPictureInPicture
    if (!api) return
    const win = await api.requestWindow({ width: PIP_WIDTH, height: PIP_HEIGHT })

    // Copy parent stylesheets — necessary because CSS Modules emit
    // hashed class names that the PiP document doesn't see otherwise.
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const cssText = Array.from(sheet.cssRules).map((rule) => rule.cssText).join('\n')
        const style = win.document.createElement('style')
        style.textContent = cssText
        win.document.head.appendChild(style)
      } catch {
        // Cross-origin stylesheets — link them by href instead.
        if (sheet.href) {
          const link = win.document.createElement('link')
          link.rel = 'stylesheet'
          link.href = sheet.href
          win.document.head.appendChild(link)
        }
      }
    }

    win.document.body.style.background = '#000'
    win.document.body.style.margin = '0'
    win.document.body.style.padding = '0'
    win.document.body.style.overflow = 'hidden'
    win.document.title = 'AllMarks'

    win.addEventListener('pagehide', () => setPipWindow(null), { once: true })
    setPipWindow(win)
  }, [isSupported, pipWindow])

  const close = useCallback((): void => {
    if (pipWindow && !pipWindow.closed) pipWindow.close()
    setPipWindow(null)
  }, [pipWindow])

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (pipWindow && !pipWindow.closed) pipWindow.close()
    }
  }, [pipWindow])

  return {
    window: pipWindow,
    isSupported,
    isOpen: !!pipWindow && !pipWindow.closed,
    open,
    close,
  }
}
```

- [ ] **Step 2: Verify tsc passes**

Run: `pnpm tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add lib/board/pip-window.ts
git commit -m "feat(pip): add usePipWindow hook for Document PiP API"
```

---

## Task 4: Create `PipEmptyState` component

**Files:**
- Create: `components/pip/PipEmptyState.tsx`
- Create: `components/pip/PipEmptyState.module.css`

- [ ] **Step 1: Implement `components/pip/PipEmptyState.tsx`**

```typescript
import type { ReactElement } from 'react'
import styles from './PipEmptyState.module.css'

export function PipEmptyState(): ReactElement {
  return (
    <div className={styles.empty} data-testid="pip-empty-state">
      <div className={styles.wordmark}>AllMarks</div>
    </div>
  )
}
```

- [ ] **Step 2: Implement `components/pip/PipEmptyState.module.css`**

```css
.empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: #000;
}

.wordmark {
  font-family: var(--font-geist), system-ui, -apple-system, sans-serif;
  font-weight: 600;
  font-size: 28px;
  letter-spacing: 0.02em;
  color: rgba(255, 255, 255, 0.94);
  animation: breathing 4s ease-in-out infinite;
  will-change: opacity, transform;
}

@keyframes breathing {
  0%, 100% { opacity: 0.85; transform: scale(0.98); }
  50%      { opacity: 1.0;  transform: scale(1.0); }
}

@media (prefers-reduced-motion: reduce) {
  .wordmark { animation: none; opacity: 1; transform: none; }
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm tsc --noEmit && pnpm vitest run components/pip/`
Expected: tsc 0 errors. (No tests yet for this component — it's pure markup.)

- [ ] **Step 4: Commit**

```bash
git add components/pip/PipEmptyState.tsx components/pip/PipEmptyState.module.css
git commit -m "feat(pip): add PipEmptyState component with breathing wordmark"
```

---

## Task 5: Create `PipCard` component (single card with scan reveal)

**Files:**
- Create: `components/pip/PipCard.tsx`
- Create: `components/pip/PipCard.module.css`
- Create: `components/pip/PipCard.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// components/pip/PipCard.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PipCard } from './PipCard'

describe('PipCard', () => {
  it('renders a thumbnail image when image prop is provided', () => {
    render(<PipCard id="bm1" thumbnail="https://example.com/og.png" favicon="" title="t" />)
    const card = screen.getByTestId('pip-card-bm1')
    const img = card.querySelector('img[data-role="thumbnail"]')
    expect(img).toBeTruthy()
    expect(img?.getAttribute('src')).toBe('https://example.com/og.png')
  })

  it('renders favicon-only fallback when thumbnail is empty', () => {
    render(<PipCard id="bm2" thumbnail="" favicon="https://example.com/favicon.ico" title="t" />)
    const card = screen.getByTestId('pip-card-bm2')
    expect(card.querySelector('img[data-role="thumbnail"]')).toBeNull()
    const fav = card.querySelector('img[data-role="favicon-fallback"]')
    expect(fav).toBeTruthy()
    expect(fav?.getAttribute('src')).toBe('https://example.com/favicon.ico')
  })

  it('renders generic placeholder when both thumbnail and favicon are empty', () => {
    render(<PipCard id="bm3" thumbnail="" favicon="" title="t" />)
    const card = screen.getByTestId('pip-card-bm3')
    expect(card.querySelector('img')).toBeNull()
    expect(card.querySelector('[data-role="generic-placeholder"]')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run components/pip/PipCard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `components/pip/PipCard.tsx`**

```typescript
'use client'

import { useState, type ReactElement } from 'react'
import styles from './PipCard.module.css'

export interface PipCardProps {
  readonly id: string
  readonly thumbnail: string
  readonly favicon: string
  readonly title: string
}

export function PipCard({ id, thumbnail, favicon, title }: PipCardProps): ReactElement {
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgErrored, setImgErrored] = useState(false)

  const showThumbnail = thumbnail !== '' && !imgErrored
  const showFavicon = !showThumbnail && favicon !== ''
  const showGeneric = !showThumbnail && !showFavicon

  return (
    <div className={styles.card} data-testid={`pip-card-${id}`} data-card-id={id} aria-label={title}>
      {showThumbnail && (
        <>
          {!imgLoaded && (
            <div className={styles.thumbPlaceholder} aria-hidden="true">
              {favicon !== '' && (
                <img className={styles.placeholderFavicon} src={favicon} alt="" aria-hidden="true" />
              )}
            </div>
          )}
          <img
            className={`${styles.thumbnail} ${imgLoaded ? styles.thumbnailRevealed : ''}`}
            src={thumbnail}
            alt=""
            data-role="thumbnail"
            aria-hidden="true"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgErrored(true)}
          />
        </>
      )}
      {showFavicon && (
        <div className={styles.faviconFallback}>
          <img src={favicon} alt="" data-role="favicon-fallback" aria-hidden="true" />
        </div>
      )}
      {showGeneric && (
        <div className={styles.genericPlaceholder} data-role="generic-placeholder" aria-hidden="true" />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Implement `components/pip/PipCard.module.css`**

```css
.card {
  position: relative;
  width: 280px;
  height: 170px;
  border-radius: 8px;
  overflow: hidden;
  background: #181820;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  transform-origin: center center;
  will-change: transform, opacity;
}

.thumbPlaceholder {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, #1a1a22 0%, #0c0c12 100%);
  display: grid;
  place-items: center;
}

.placeholderFavicon {
  width: 32px;
  height: 32px;
  opacity: 0.4;
  border-radius: 4px;
}

.thumbnail {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* Hidden until load completes; reveal via clip-path scan animation. */
  clip-path: inset(100% 0 0 0);
  transition: clip-path 420ms cubic-bezier(0.65, 0, 0.35, 1);
}

.thumbnailRevealed {
  clip-path: inset(0 0 0 0);
  /* Note: A subtle scan-line glow can be added with a sibling pseudo-
   * element. For v0, the clip-path reveal alone produces the
   * top-down "scanning" feel. Decorative scan-line trail tracked as a
   * polish item — implement after first review.
   */
}

.faviconFallback {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, #1a1a22 0%, #0c0c12 100%);
  display: grid;
  place-items: center;
}

.faviconFallback img {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  opacity: 0.85;
}

.genericPlaceholder {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.04) 0%, transparent 60%), #0c0c12;
}

@media (prefers-reduced-motion: reduce) {
  .thumbnail { transition: none; }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run components/pip/PipCard.test.tsx`
Expected: PASS — 3/3 tests.

- [ ] **Step 6: Commit**

```bash
git add components/pip/PipCard.tsx components/pip/PipCard.module.css components/pip/PipCard.test.tsx
git commit -m "feat(pip): add PipCard with scan-reveal and fallback placeholders"
```

---

## Task 6: Create `PipStack` component (5-card 3D stack with hover pull-forward)

**Files:**
- Create: `components/pip/PipStack.tsx`
- Create: `components/pip/PipStack.module.css`
- Create: `components/pip/PipStack.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// components/pip/PipStack.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PipStack } from './PipStack'

const cards = [
  { id: '1', title: 'Card 1', thumbnail: '', favicon: '' },
  { id: '2', title: 'Card 2', thumbnail: '', favicon: '' },
  { id: '3', title: 'Card 3', thumbnail: '', favicon: '' },
]

describe('PipStack', () => {
  it('renders up to 5 cards in stack order (latest first)', () => {
    render(<PipStack cards={cards} onCardClick={() => {}} />)
    const stack = screen.getByTestId('pip-stack')
    const items = stack.querySelectorAll('[data-card-id]')
    expect(items).toHaveLength(3)
    expect(items[0].getAttribute('data-card-id')).toBe('1')
  })

  it('caps at 5 cards even when more provided', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: `c${i}`, title: `t${i}`, thumbnail: '', favicon: '',
    }))
    render(<PipStack cards={many} onCardClick={() => {}} />)
    expect(screen.getByTestId('pip-stack').querySelectorAll('[data-card-id]')).toHaveLength(5)
  })

  it('calls onCardClick with cardId when a card is clicked', () => {
    const onCardClick = vi.fn()
    render(<PipStack cards={cards} onCardClick={onCardClick} />)
    fireEvent.click(screen.getByTestId('pip-card-2'))
    expect(onCardClick).toHaveBeenCalledWith('2')
  })

  it('applies hover state to the hovered card', () => {
    render(<PipStack cards={cards} onCardClick={() => {}} />)
    const card2 = screen.getByTestId('pip-card-2')
    fireEvent.mouseEnter(card2)
    expect(screen.getByTestId('pip-stack').getAttribute('data-hovered-id')).toBe('2')
  })
})
```

Add `import { vi } from 'vitest'` to the file's imports.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run components/pip/PipStack.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `components/pip/PipStack.tsx`**

```typescript
'use client'

import { useState, useCallback, type ReactElement } from 'react'
import { PipCard } from './PipCard'
import styles from './PipStack.module.css'

export interface PipStackCard {
  readonly id: string
  readonly title: string
  readonly thumbnail: string
  readonly favicon: string
}

export interface PipStackProps {
  readonly cards: ReadonlyArray<PipStackCard>
  readonly onCardClick: (cardId: string) => void
}

const MAX_VISIBLE = 5

export function PipStack({ cards, onCardClick }: PipStackProps): ReactElement {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const visible = cards.slice(0, MAX_VISIBLE)

  const handleEnter = useCallback((id: string) => () => setHoveredId(id), [])
  const handleLeave = useCallback(() => setHoveredId(null), [])

  return (
    <div
      className={styles.stage}
      data-testid="pip-stack"
      data-hovered-id={hoveredId ?? ''}
    >
      <div className={styles.stack}>
        {visible.map((card, idx) => {
          // Position 0 = front. Higher idx = further back.
          const positionClass = styles[`pos${idx}`]
          const hoveredClass = hoveredId === card.id ? styles.hovered : ''
          return (
            <div
              key={card.id}
              className={`${styles.slot} ${positionClass} ${hoveredClass}`.trim()}
              onMouseEnter={handleEnter(card.id)}
              onMouseLeave={handleLeave}
              onClick={() => onCardClick(card.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') onCardClick(card.id) }}
            >
              <PipCard {...card} />
            </div>
          )
        })}
      </div>
      <div className={styles.wordmark}>AllMarks</div>
    </div>
  )
}
```

- [ ] **Step 4: Implement `components/pip/PipStack.module.css`**

```css
.stage {
  position: absolute;
  inset: 0;
  background: #000;
  perspective: 1000px;
  perspective-origin: 50% 100%;
  overflow: hidden;
}

.stack {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 36px;
  transform-style: preserve-3d;
  transform: rotateX(8deg);
}

.slot {
  position: absolute;
  bottom: 36px;
  left: 50%;
  transform-origin: center bottom;
  margin-left: -140px;
  cursor: pointer;
  transition:
    transform 200ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity   200ms ease-out;
  will-change: transform, opacity;
}

/* Position 0 = newest, full size. */
.pos0 { transform: translate3d(0, 0, 0)        scale(1.00) rotate(0deg);  opacity: 1.0; z-index: 5; }
.pos1 { transform: translate3d(0, -16px, -20px) scale(0.94) rotate(-1deg); opacity: 0.85; z-index: 4; }
.pos2 { transform: translate3d(0, -34px, -42px) scale(0.88) rotate(-2deg); opacity: 0.66; z-index: 3; }
.pos3 { transform: translate3d(0, -54px, -66px) scale(0.82) rotate(-3deg); opacity: 0.46; z-index: 2; }
.pos4 { transform: translate3d(0, -76px, -90px) scale(0.76) rotate(-4deg); opacity: 0.28; z-index: 1; }

/* Hover pull-forward — overrides position transform with z-bump. */
.slot.hovered {
  transform: translate3d(0, -8px, 30px) scale(1.05) rotate(0deg) !important;
  opacity: 1 !important;
  z-index: 100 !important;
}

.wordmark {
  position: absolute;
  bottom: 12px;
  left: 0;
  right: 0;
  text-align: center;
  font-family: var(--font-geist), system-ui, -apple-system, sans-serif;
  font-weight: 500;
  font-size: 12px;
  letter-spacing: 0.04em;
  color: rgba(255, 255, 255, 0.42);
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .slot { transition: none; }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run components/pip/PipStack.test.tsx`
Expected: PASS — 4/4 tests.

- [ ] **Step 6: Commit**

```bash
git add components/pip/PipStack.tsx components/pip/PipStack.module.css components/pip/PipStack.test.tsx
git commit -m "feat(pip): add PipStack with 3D perspective and hover pull-forward"
```

---

## Task 7: Create `PipCompanion` component (orchestrator)

**Files:**
- Create: `components/pip/PipCompanion.tsx`
- Create: `components/pip/PipCompanion.module.css`
- Create: `components/pip/PipCompanion.test.tsx`

This component is the top-level PiP UI. It subscribes to `bookmark-saved` BroadcastChannel events, manages the ring buffer of recent bookmarks, switches between empty / stack states, and handles × close.

- [ ] **Step 1: Add `getRecentBookmarks` helper to `lib/storage/indexeddb.ts`**

First, check whether `lib/storage/indexeddb.ts` already exposes a function to read recent bookmarks. Run:

Run: `grep -n "getAllBookmarks\|getRecentBookmarks\|getBookmarks" lib/storage/indexeddb.ts`

If a `getAllBookmarks` or similar exists, you can derive recent N from it (sort by createdAt desc, take 5). If not, add this helper to `lib/storage/indexeddb.ts`:

```typescript
// Append to lib/storage/indexeddb.ts
export async function getRecentBookmarks(db: IDBPDatabase<AllMarksSchema>, limit: number = 5): Promise<BookmarkRecord[]> {
  const all = await db.getAll('bookmarks')
  return all
    .filter((b) => !b.archivedAt)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
}
```

(If the schema field names differ — `createdAt`, `archivedAt` — adapt to the actual field names. Read `lib/constants.ts` and `lib/storage/indexeddb.ts` to confirm before adding.)

- [ ] **Step 2: Write failing tests**

```typescript
// components/pip/PipCompanion.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { PipCompanion } from './PipCompanion'

vi.mock('@/lib/storage/indexeddb', () => ({
  initDB: vi.fn().mockResolvedValue({}),
  getRecentBookmarks: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/board/channel', () => ({
  subscribeBookmarkSaved: vi.fn(() => () => {}),
}))

describe('PipCompanion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders empty state when no bookmarks exist', async () => {
    const { getRecentBookmarks } = await import('@/lib/storage/indexeddb')
    ;(getRecentBookmarks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([])
    render(<PipCompanion onClose={() => {}} />)
    await waitFor(() => {
      expect(screen.getByTestId('pip-empty-state')).toBeTruthy()
    })
  })

  it('renders stack when bookmarks exist', async () => {
    const { getRecentBookmarks } = await import('@/lib/storage/indexeddb')
    ;(getRecentBookmarks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 'b1', title: 'Card 1', thumbnail: '', favicon: '', createdAt: 1, url: '' },
      { id: 'b2', title: 'Card 2', thumbnail: '', favicon: '', createdAt: 2, url: '' },
    ])
    render(<PipCompanion onClose={() => {}} />)
    await waitFor(() => {
      expect(screen.getByTestId('pip-stack')).toBeTruthy()
    })
  })

  it('calls onClose when × is clicked', async () => {
    const onClose = vi.fn()
    render(<PipCompanion onClose={onClose} />)
    const closeBtn = await screen.findByTestId('pip-close')
    act(() => closeBtn.click())
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run components/pip/PipCompanion.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `components/pip/PipCompanion.tsx`**

```typescript
'use client'

import { useEffect, useState, useCallback, type ReactElement } from 'react'
import { initDB, getRecentBookmarks } from '@/lib/storage/indexeddb'
import { subscribeBookmarkSaved } from '@/lib/board/channel'
import { PipEmptyState } from './PipEmptyState'
import { PipStack, type PipStackCard } from './PipStack'
import styles from './PipCompanion.module.css'

export interface PipCompanionProps {
  readonly onClose: () => void
  readonly onCardClick?: (cardId: string) => void
}

export function PipCompanion({ onClose, onCardClick }: PipCompanionProps): ReactElement {
  const [cards, setCards] = useState<PipStackCard[]>([])
  const [loaded, setLoaded] = useState(false)

  // Initial load from IDB.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const db = await initDB()
      const recent = await getRecentBookmarks(db, 5)
      if (cancelled) return
      setCards(recent.map((b) => ({
        id: b.id,
        title: b.title,
        thumbnail: b.thumbnail ?? '',
        favicon: b.favicon ?? '',
      })))
      setLoaded(true)
    })()
    return () => { cancelled = true }
  }, [])

  // Subscribe to BroadcastChannel for new saves.
  useEffect(() => {
    const unsub = subscribeBookmarkSaved(async ({ bookmarkId }) => {
      const db = await initDB()
      const recent = await getRecentBookmarks(db, 5)
      const newCards = recent.map((b) => ({
        id: b.id,
        title: b.title,
        thumbnail: b.thumbnail ?? '',
        favicon: b.favicon ?? '',
      }))
      // The newest will be the one with id === bookmarkId; setCards triggers
      // the slide-in animation via CSS class transitions on .slot.posN.
      setCards(newCards)
    })
    return unsub
  }, [])

  const handleCardClick = useCallback((cardId: string) => {
    if (onCardClick) onCardClick(cardId)
  }, [onCardClick])

  if (!loaded) {
    return <div className={styles.host} />
  }

  return (
    <div className={styles.host}>
      {cards.length === 0 ? (
        <PipEmptyState />
      ) : (
        <PipStack cards={cards} onCardClick={handleCardClick} />
      )}
      <button
        type="button"
        className={styles.close}
        onClick={onClose}
        data-testid="pip-close"
        aria-label="Close AllMarks Companion"
      >×</button>
    </div>
  )
}
```

- [ ] **Step 5: Implement `components/pip/PipCompanion.module.css`**

```css
.host {
  position: fixed;
  inset: 0;
  background: #000;
  font-family: var(--font-geist), system-ui, -apple-system, sans-serif;
  color: rgba(255, 255, 255, 0.94);
}

.close {
  position: absolute;
  bottom: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  background: transparent;
  border: 0;
  color: rgba(255, 255, 255, 0.4);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  border-radius: 4px;
  transition: color 120ms ease, background 120ms ease;
}

.close:hover { color: rgba(255, 255, 255, 1); background: rgba(255, 255, 255, 0.06); }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run components/pip/PipCompanion.test.tsx`
Expected: PASS — 3/3 tests.

- [ ] **Step 7: Commit**

```bash
git add components/pip/PipCompanion.tsx components/pip/PipCompanion.module.css components/pip/PipCompanion.test.tsx lib/storage/indexeddb.ts
git commit -m "feat(pip): add PipCompanion orchestrator with BroadcastChannel"
```

---

## Task 8: Create `PipPortal` component

**Files:**
- Create: `components/pip/PipPortal.tsx`

PiP rendering via `createPortal` targeting the PiP window's body.

- [ ] **Step 1: Implement `components/pip/PipPortal.tsx`**

```typescript
'use client'

import { createPortal } from 'react-dom'
import type { ReactElement, ReactNode } from 'react'

export interface PipPortalProps {
  readonly pipWindow: Window | null
  readonly children: ReactNode
}

export function PipPortal({ pipWindow, children }: PipPortalProps): ReactElement | null {
  if (!pipWindow || pipWindow.closed) return null
  return createPortal(children, pipWindow.document.body)
}
```

- [ ] **Step 2: Verify tsc**

Run: `pnpm tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add components/pip/PipPortal.tsx
git commit -m "feat(pip): add PipPortal for cross-window rendering"
```

---

## Task 9: Create `PopOutButton` component

**Files:**
- Create: `components/board/PopOutButton.tsx`
- Create: `components/board/PopOutButton.module.css`
- Create: `components/board/PopOutButton.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// components/board/PopOutButton.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PopOutButton } from './PopOutButton'

describe('PopOutButton', () => {
  it('renders with title attribute "Open AllMarks Companion"', () => {
    render(<PopOutButton onClick={() => {}} disabled={false} />)
    const btn = screen.getByTestId('pip-popout')
    expect(btn.getAttribute('title')).toBe('Open AllMarks Companion')
  })

  it('calls onClick when enabled and clicked', () => {
    const onClick = vi.fn()
    render(<PopOutButton onClick={onClick} disabled={false} />)
    fireEvent.click(screen.getByTestId('pip-popout'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('disables button when disabled prop is true', () => {
    render(<PopOutButton onClick={() => {}} disabled={true} />)
    const btn = screen.getByTestId('pip-popout') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests**

Run: `pnpm vitest run components/board/PopOutButton.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `components/board/PopOutButton.tsx`**

```typescript
'use client'

import type { ReactElement } from 'react'
import styles from './PopOutButton.module.css'

export interface PopOutButtonProps {
  readonly onClick: () => void
  readonly disabled: boolean
}

export function PopOutButton({ onClick, disabled }: PopOutButtonProps): ReactElement {
  return (
    <button
      type="button"
      className={styles.button}
      onClick={onClick}
      disabled={disabled}
      title={disabled ? 'PiP not supported in this browser' : 'Open AllMarks Companion'}
      aria-label="Open AllMarks Companion"
      data-testid="pip-popout"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="2" y="3" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="7" y="7" width="6" height="4" rx="0.5" fill="currentColor" />
      </svg>
    </button>
  )
}
```

- [ ] **Step 4: Implement `components/board/PopOutButton.module.css`**

```css
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.78);
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}

.button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 1);
  border-color: rgba(255, 255, 255, 0.16);
}

.button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run components/board/PopOutButton.test.tsx`
Expected: PASS — 3/3 tests.

- [ ] **Step 6: Commit**

```bash
git add components/board/PopOutButton.tsx components/board/PopOutButton.module.css components/board/PopOutButton.test.tsx
git commit -m "feat(board): add PopOutButton for PiP companion"
```

---

## Task 10: Wire `PopOutButton` + `PipPortal` into `BoardRoot`

**Files:**
- Modify: `components/board/BoardRoot.tsx`

- [ ] **Step 1: Read current BoardRoot to understand the actions slot**

Run: `Read components/board/BoardRoot.tsx 1 50`

Find imports section and the TopHeader actions block (around line 649 — verify the line number).

- [ ] **Step 2: Add imports near the top of `BoardRoot.tsx`**

In the import block (top of file), add:

```typescript
import { PopOutButton } from './PopOutButton'
import { PipPortal } from '@/components/pip/PipPortal'
import { PipCompanion } from '@/components/pip/PipCompanion'
import { usePipWindow } from '@/lib/board/pip-window'
```

- [ ] **Step 3: Add PiP hook usage in `BoardRoot` body (after existing hooks)**

Add near the top of the component body, after existing `useState`/`useMemo` declarations:

```typescript
const pip = usePipWindow()
const handleCardClickFromPip = useCallback((cardId: string) => {
  // Activate the matching board card with smooth scroll + glow.
  if (typeof window !== 'undefined') {
    const url = new URL(window.location.href)
    url.searchParams.set('focus', cardId)
    window.history.replaceState({}, '', url.toString())
    window.dispatchEvent(new CustomEvent('booklage:focus-card', { detail: { cardId } }))
  }
}, [])
```

(`useCallback` is already imported in the file; if not, add it to the existing `react` import.)

- [ ] **Step 4: Add `PopOutButton` to TopHeader actions JSX**

Find the `actions={...}` JSX in the existing TopHeader render. Add `<PopOutButton>` as the FIRST child:

```typescript
actions={
  <>
    <PopOutButton
      onClick={() => { void pip.open() }}
      disabled={!pip.isSupported}
    />
    <SizePicker value={sizeLevel} onChange={setSizeLevel} />
    <ResetAllButton
      count={customWidthCount}
      onClick={handleResetAllCustomWidths}
    />
    <button
      type="button"
      className={styles.sharePill}
      onClick={(): void => setShareComposerOpen(true)}
      data-testid="share-pill"
    >
      Share ↗
    </button>
  </>
}
```

- [ ] **Step 5: Add `PipPortal` rendering at the bottom of the BoardRoot return JSX**

Just before the closing tag of the outermost wrapper, add:

```tsx
<PipPortal pipWindow={pip.window}>
  <PipCompanion
    onClose={() => pip.close()}
    onCardClick={handleCardClickFromPip}
  />
</PipPortal>
```

- [ ] **Step 6: Verify tsc + tests**

Run: `pnpm tsc --noEmit && pnpm vitest run`
Expected: tsc 0 errors. All tests pass.

- [ ] **Step 7: Commit**

```bash
git add components/board/BoardRoot.tsx
git commit -m "feat(board): wire PopOutButton and PipPortal into BoardRoot"
```

---

## Task 11: Add `?focus=<cardId>` smooth-scroll handler

**Files:**
- Create: `lib/board/scroll-to-card.ts`
- Create: `lib/board/scroll-to-card.test.ts`
- Modify: `components/board/BoardRoot.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// lib/board/scroll-to-card.test.ts
import { describe, it, expect } from 'vitest'
import { computeFocusScrollY } from './scroll-to-card'

describe('computeFocusScrollY', () => {
  it('centers the target card vertically in the viewport', () => {
    // Card y=400, height 200, viewport h=800 -> center at 400 + 100 = 500, scroll to 500 - 400 = 100
    expect(computeFocusScrollY({ cardY: 400, cardH: 200, viewportH: 800 })).toBe(100)
  })

  it('clamps to 0 when card is near the top', () => {
    expect(computeFocusScrollY({ cardY: 50, cardH: 100, viewportH: 800 })).toBe(0)
  })

  it('does not exceed contentH - viewportH (passed in clamp)', () => {
    expect(computeFocusScrollY({ cardY: 9000, cardH: 100, viewportH: 800, contentH: 9500 })).toBe(8700)
  })

  it('returns 0 for cards outside layout bounds (cardY < 0)', () => {
    expect(computeFocusScrollY({ cardY: -50, cardH: 100, viewportH: 800 })).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests**

Run: `pnpm vitest run lib/board/scroll-to-card.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/board/scroll-to-card.ts`**

```typescript
export interface FocusScrollInput {
  readonly cardY: number
  readonly cardH: number
  readonly viewportH: number
  readonly contentH?: number
}

export function computeFocusScrollY(input: FocusScrollInput): number {
  const { cardY, cardH, viewportH, contentH } = input
  const desired = cardY + cardH / 2 - viewportH / 2
  const clampedLow = Math.max(0, desired)
  if (typeof contentH === 'number') {
    return Math.min(clampedLow, Math.max(0, contentH - viewportH))
  }
  return clampedLow
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run lib/board/scroll-to-card.test.ts`
Expected: PASS — 4/4 tests.

- [ ] **Step 5: Wire `?focus=<cardId>` URL handling into `BoardRoot.tsx`**

Add a `useEffect` that:
1. Reads `?focus` from URL on mount
2. Listens to `booklage:focus-card` window events
3. Looks up the card by ID, computes scrollY, calls existing scroll handler with smooth easing
4. Toggles a brief `glow` data attribute on the card for 600ms

In `BoardRoot.tsx`, near other hooks, add:

```typescript
useEffect(() => {
  const focusCard = (cardId: string): void => {
    // Find the card's y/h from the current items state. This requires the
    // card layout to have been computed at least once. Fall back to no-op if
    // cardId not found.
    const found = filteredItems.find((it) => it.bookmark.id === cardId)
    if (!found) return

    // Use existing skyline layout's coordinate system. The card's `top` and
    // `height` are derivable from the `cards` props passed to CardsLayer.
    // For simplicity, attempt to query the DOM directly and extract bounding
    // rectangle inside the canvasWrap.
    const canvas = canvasRef.current
    if (!canvas) return
    const node = canvas.querySelector<HTMLElement>(`[data-bookmark-id="${cardId}"]`)
    if (!node) return

    const rect = node.getBoundingClientRect()
    const canvasRect = canvas.getBoundingClientRect()
    const cardYInCanvas = rect.top - canvasRect.top + viewport.y
    const targetY = computeFocusScrollY({
      cardY: cardYInCanvas,
      cardH: rect.height,
      viewportH: viewport.h,
      contentH: contentBounds.height,
    })

    // Smooth scroll via existing handleScroll handler — animate over 1000ms.
    const startY = viewport.y
    const startTs = performance.now()
    const DUR = 1000
    const ease = (t: number): number => 1 - Math.pow(1 - t, 3) // ease-out-cubic
    const tick = (now: number): void => {
      const t = Math.min(1, (now - startTs) / DUR)
      const y = startY + (targetY - startY) * ease(t)
      handleScroll({ x: viewport.x, y })
      if (t < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)

    // Glow halo: toggle data-glowing for 600ms after scroll completes.
    setTimeout(() => {
      node.setAttribute('data-glowing', 'true')
      setTimeout(() => node.removeAttribute('data-glowing'), 600)
    }, DUR)
  }

  // From URL on mount.
  const url = new URL(window.location.href)
  const focusId = url.searchParams.get('focus')
  if (focusId) {
    // Defer to allow layout to settle.
    requestAnimationFrame(() => focusCard(focusId))
    url.searchParams.delete('focus')
    window.history.replaceState({}, '', url.toString())
  }

  // From CustomEvent (PiP card click within same tab).
  const evHandler = (e: Event): void => {
    const detail = (e as CustomEvent<{ cardId: string }>).detail
    if (detail?.cardId) focusCard(detail.cardId)
  }
  window.addEventListener('booklage:focus-card', evHandler)
  return () => window.removeEventListener('booklage:focus-card', evHandler)
}, [filteredItems, viewport, contentBounds, handleScroll])
```

Add `import { computeFocusScrollY } from '@/lib/board/scroll-to-card'` near the top.

The card render path in `CardsLayer.tsx` should already have `data-bookmark-id` attributes; if not, add them. Run:

Run: `grep -n "data-bookmark-id\|bookmark.id" components/board/CardsLayer.tsx`

If `data-bookmark-id` is absent, add it to the card's outermost element render. This is the test hook for the focus handler.

- [ ] **Step 6: Add CSS for `[data-glowing="true"]` to the card module**

In whichever module styles the card (likely `components/board/CardItem.module.css` or similar), append:

```css
[data-glowing="true"] {
  animation: card-focus-glow 600ms ease-out;
}

@keyframes card-focus-glow {
  0%   { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.0); }
  30%  { box-shadow: 0 0 24px 8px rgba(255, 255, 255, 0.3); }
  100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.0); }
}
```

(The exact module file depends on what currently styles the card outermost element. If unsure, find it via `grep -l "card-item\|.card{" components/board/`.)

- [ ] **Step 7: Verify tsc + tests**

Run: `pnpm tsc --noEmit && pnpm vitest run`
Expected: tsc 0 errors, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add lib/board/scroll-to-card.ts lib/board/scroll-to-card.test.ts components/board/BoardRoot.tsx components/board/CardsLayer.tsx components/board/CardItem.module.css
git commit -m "feat(board): add ?focus=cardId URL param with smooth scroll and glow"
```

(Only stage files actually modified. `CardsLayer.tsx` and `CardItem.module.css` are conditional based on grep results in earlier steps.)

---

## Task 12: Build, smoke-test, deploy, update TODO

**Files:** none (verification + handoff only)

- [ ] **Step 1: Build**

Run: `pnpm build`
Expected: Build succeeds. Routes include `/save-iframe`.

- [ ] **Step 2: Run all tests**

Run: `pnpm vitest run && pnpm tsc --noEmit`
Expected: All tests pass, tsc 0 errors.

- [ ] **Step 3: Manual smoke test (instruct user)**

Print to user:

> 手動 smoke test:
> 1. `pnpm dev` で local server 起動
> 2. `http://localhost:3000/board` を開く
> 3. TopHeader 右側に新しい PiP icon ボタンが見える → click → 320×320 の PiP window が開く
> 4. PiP の中身: 既存ブクマがあれば 5-card stack、無ければ "AllMarks" wordmark + breathing
> 5. 別タブで `http://localhost:3000/save-iframe` を開く、開発ツール console で:
>    ```js
>    window.parent.postMessage({
>      type: 'booklage:save',
>      payload: { url: 'https://example.com/test', title: 'Test', description: '', image: '', favicon: '', siteName: 'Example', nonce: 'manual-1' },
>    }, window.location.origin)
>    ```
>    (実際の cross-origin テストは Plan 2 で実施。ここでは `/save-iframe` 内で手動 postMessage を投げて IDB 書き込み確認)
> 6. board のタブに戻り、新カードが PiP に slide-in アニメで参入することを確認
> 7. PiP 内のカードに hover → そのカードが手前に grunt forward
> 8. PiP 内のカードを click → board タブが foreground、該当カードに smooth scroll + glow

- [ ] **Step 4: Deploy**

Run:
```bash
pnpm build
npx wrangler pages deploy out/ --project-name=booklage --branch=master --commit-dirty=true --commit-message="extension v0 plan1 booklage foundation"
```

- [ ] **Step 5: Update `docs/TODO.md`**

Update top of TODO.md "現在の状態" section:

```markdown
- **本番**: `https://booklage.pages.dev` に **Chrome 拡張 v0 — Plan 1 (AllMarks 基盤) 完了** 反映済
- **次セッション最優先**: Plan 2 — Chrome 拡張本体 (manifest + service worker + content script + cursor pill) の plan 作成
- **2026-05-09 引き継ぎ (Phase 1 / Plan 1 完了)**:
  - AllMarks 側: `/save-iframe` postMessage endpoint 追加、PiP コンパニオン (320×320 + 5-card 3D stack + scan reveal + hover pull-forward) を board の Pop out ボタンから利用可能に
  - 拡張未実装でも `/save-iframe` に postMessage 投げれば IDB 書き込み + PiP 同期可能 → Plan 2 で拡張から呼ぶだけ
  - 関連 spec: `docs/superpowers/specs/2026-05-09-chrome-extension-v0-design.md`
  - 関連 plan: `docs/superpowers/plans/2026-05-09-extension-v0-plan1-booklage-foundation.md`
```

- [ ] **Step 6: Commit + push**

```bash
git add docs/TODO.md docs/superpowers/plans/2026-05-09-extension-v0-plan1-booklage-foundation.md
git commit -m "docs(todo): handoff for 2026-05-09 — extension v0 plan 1 complete"
git push
```

---

## Self-Review Notes (applied inline)

- ✅ **Spec coverage** (§ refers to spec sections):
  - §3 architecture (extension → offscreen → iframe) — Plan 1 covers the iframe endpoint side. Extension side = Plan 2.
  - §5.1 Pop out button — Task 9 + Task 10
  - §5.2 PiP empty + stack layout — Task 4 + Task 5 + Task 6
  - §5.3 save animation (slide-in) — Task 7 (state-driven via PipCompanion subscribing to BroadcastChannel)
  - §5.4 Scan reveal — Task 5 (clip-path 420ms)
  - §5.5 Hover pull-forward — Task 6 (CSS + state)
  - §5.6 Click → focus on card — Task 10 (handleCardClickFromPip) + Task 11 (focus handler)
  - §5.7 × close — Task 7 (PipCompanion close button)
  - §6 Cursor pill — explicitly Plan 2 scope
  - §8 /save-iframe + postMessage — Task 1 + Task 2
  - §13 a11y — `prefers-reduced-motion` in module CSS, `aria-label` on close button, `role="button"` + `tabIndex` on slot

- ✅ **Placeholder scan**: No "TBD" / "implement later" / vague phrases. All code blocks have actual content.

- ✅ **Type consistency**:
  - `SaveMessageInput` (Task 1) → consumed in Task 2's parser
  - `PipStackCard` (Task 6) → exported and reused by Task 7's `PipCompanion`
  - `usePipWindow` API (Task 3) → matches Task 10's usage (`pip.window`, `pip.open`, `pip.close`, `pip.isSupported`)
  - `getRecentBookmarks` signature (Task 7 step 1) → matches PipCompanion's call

- ⚠️ **Known approximations**:
  - Task 2's E2E test uses a same-origin hatch (`__BOOKLAGE_ALLOWED_ORIGINS__`). Production code path (chrome-extension origin) tested in Plan 2.
  - Task 6's CSS `cursor: pointer` on every slot makes the entire stack clickable — semantically OK because each click is per-slot (event.target).
  - Task 11's focus handler uses `requestAnimationFrame` deferred lookup. If the URL has `?focus=` but the matching card hasn't laid out yet, the `data-bookmark-id` query may miss. The graceful fallback is "no-op" — user sees the board, just no scroll. v1 polish: retry the lookup for ~500ms before giving up.
  - Scan-reveal's "decorative trail glow" mentioned in spec §5.4 is deferred to a polish pass after first review (noted in PipCard.module.css comment).
