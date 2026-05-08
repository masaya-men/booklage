# Chrome Extension v0 — Plan 2: Extension Package + Bookmarklet/PiP Reconciliation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Chrome extension v0 (Manifest v3 sideload-loadable package) that saves the current tab to Booklage via 4 triggers (icon click / context menu page / context menu link / Ctrl+Shift+B), shows a `Booklage · Saving / Saved / Failed` cursor pill when PiP is closed, and cooperates with the existing in-tab Document PiP via the Plan 1 `/save-iframe` BroadcastChannel bridge. As a prerequisite, fix the visual collision between the bookmarklet `/save` popup and the PiP companion: when PiP is active, the bookmarklet performs a silent iframe save with no popup.

**Architecture:**
- **Booklage side** — extend the Plan 1 `/save-iframe` to (a) track PiP presence via a small BroadcastChannel protocol (`pip:open` / `pip:query` / `pip:presence`) and (b) answer a new `booklage:probe` postMessage so the bookmarklet IIFE can decide silent-vs-popup at run time. Rewrite the bookmarklet source to (1) inject a hidden iframe pointing at `/save-iframe`, (2) probe for PiP, (3) postMessage-save silently if PiP is active, (4) fall back to the existing `window.open('/save?…')` popup if not.
- **Extension side (new)** — vanilla JavaScript Manifest v3 package. Background service worker is the dispatcher: on each trigger it (a) calls `chrome.scripting.executeScript` on the active tab to extract OGP, (b) opens an offscreen document if not already open, (c) forwards the OGP payload to the offscreen doc, which forwards it via postMessage to a hidden `<iframe src="https://booklage.pages.dev/save-iframe">`. Content script is `<all_urls>` and renders the cursor pill on save events. Settings live in `chrome.storage.sync`. Distribution is Unlisted Chrome Web Store + sideload.

**Tech stack:**
- **Booklage side:** TypeScript strict, Vanilla CSS Modules, Vitest, Playwright, existing `idb` IDB layer, existing BroadcastChannel infra (`lib/board/channel.ts`)
- **Extension side:** vanilla JavaScript (no framework — keep zip <100KB), Manifest v3, Chrome APIs (`offscreen`, `scripting`, `contextMenus`, `commands`, `notifications`, `storage`, `runtime`, `tabs`)

**Spec:** `docs/superpowers/specs/2026-05-09-chrome-extension-v0-design.md`

**Plan 1:** `docs/superpowers/plans/2026-05-09-extension-v0-plan1-booklage-foundation.md` (already complete — provides `/save-iframe`, `usePipWindow`, `PipCompanion`, `?focus=cardId`)

---

## File Structure

### Booklage side (additions / modifications)

| Path | Action | Responsibility |
|------|--------|----------------|
| `lib/board/pip-presence.ts` | Create | PiP presence broadcast + subscribe + query helpers (separate from bookmark-saved channel for clarity) |
| `lib/board/pip-presence.test.ts` | Create | Unit tests for the presence protocol |
| `components/pip/PipCompanion.tsx` | Modify | Wire presence broadcast on mount/unmount + answer queries while alive |
| `lib/utils/save-message.ts` | Modify | Add `booklage:probe` + `booklage:probe:result` Zod schemas alongside the existing save schemas |
| `lib/utils/save-message.test.ts` | Modify | Add probe schema tests |
| `app/save-iframe/SaveIframeClient.tsx` | Modify | Track PiP presence (subscribe + lazy query on first probe) + handle `booklage:probe` postMessage |
| `tests/e2e/save-iframe.spec.ts` | Modify | Add probe → result scenario |
| `lib/utils/bookmarklet.ts` | Modify | Rewrite IIFE: hidden iframe probe → silent save OR fallback popup. Keep <2000 chars. |
| `lib/utils/bookmarklet.test.ts` | Modify | Update assertions for the new flow shape |
| `tests/e2e/bookmarklet-save.spec.ts` | Modify | Add PiP-active branch + PiP-off branch |
| `app/(marketing)/guide/page.tsx` | Modify | Re-registration notice ("bookmarklet was updated, drag the new one to your bar") |

### Extension package (all new under `extension/`)

| Path | Action | Responsibility |
|------|--------|----------------|
| `extension/manifest.json` | Create | MV3 manifest |
| `extension/background.js` | Create | Service worker — 4-trigger dispatcher |
| `extension/offscreen.html` | Create | Hidden host doc for the booklage `/save-iframe` |
| `extension/offscreen.js` | Create | postMessage bridge between SW and the embedded `/save-iframe` |
| `extension/content.js` | Create | OGP extractor injection target + cursor pill renderer |
| `extension/content.css` | Create | Cursor pill glass-themed styles (matches Booklage `LiquidGlass` baseline) |
| `extension/popup.html` | Create | Tiny popup (just an "Open settings" link) |
| `extension/popup.js` | Create | `chrome.runtime.openOptionsPage()` wiring |
| `extension/popup.css` | Create | Popup styles |
| `extension/options.html` | Create | Settings page |
| `extension/options.js` | Create | `chrome.storage.sync` read/write |
| `extension/options.css` | Create | Settings page style |
| `extension/icons/icon-{16,32,48,128}.png` | Create | Booklage glyph (square book-mark mark, transparent BG) |
| `extension/_locales/en/messages.json` | Create | i18n strings (description / shortcut hint / settings labels) |
| `extension/lib/ogp.js` | Create | OGP extractor (mirrors `lib/utils/bookmarklet.ts`'s `extractOgpFromDocument`, injected via `chrome.scripting`) |
| `tests/extension/ogp-extract.test.ts` | Create | Unit tests for OGP function (DOM fixtures from `tests/e2e/fixtures/`) |
| `tests/extension/cursor-pill.test.ts` | Create | Unit tests for pill state machine |
| `tests/extension/save-message-protocol.test.ts` | Create | Unit tests for postMessage envelope round-trip |
| `tests/e2e/extension-save.spec.ts` | Create | Playwright sideload + save flow |
| `tests/e2e/fixtures/extension-test-page.html` | Create | Static HTML with OGP meta for E2E |
| `docs/private/extension-privacy-policy.md` | Create | Privacy policy (private — never check into git) |
| `scripts/package-extension.mjs` | Create | Lint manifest + zip `extension/` to `dist/booklage-extension.zip` |
| `package.json` | Modify | Add `"package:extension"` script |

### Out of scope for Plan 2

- Theme switching inside extension (hardcoded glass theme; Phase 1.5)
- Image-only bookmarks (right-click image; v1 candidate)
- Firefox / Safari port (Phase 2)
- Multiple-selection / batch save (Phase 2)
- Web Store *Public* listing (we ship as Unlisted only)
- Sync / cloud backup (Phase 2)

---

## Group 0 — Bookmarklet/PiP collision fix

### Task 0.1: Create PiP presence module (`lib/board/pip-presence.ts`)

**Files:**
- Create: `lib/board/pip-presence.ts`
- Create: `lib/board/pip-presence.test.ts`

**Design contract:**
- Channel name: reuse `'booklage'` (same as `lib/board/channel.ts`) — PiP presence and bookmark-saved messages can coexist on one channel; type tag disambiguates.
- Three message shapes:
  - `{ type: 'pip:open' }` — PipCompanion broadcasts on mount
  - `{ type: 'pip:closed' }` — PipCompanion broadcasts on unmount
  - `{ type: 'pip:query', nonce: string }` — newcomer asks for current state
  - `{ type: 'pip:presence', open: boolean, nonce?: string }` — answer (echo nonce when answering a query)
- Public API:
  - `broadcastPipOpen(): void` / `broadcastPipClosed(): void`
  - `subscribePipPresence(handler: (open: boolean) => void): () => void` — also auto-replies to `pip:query` if currently subscribing as PipCompanion (parameterized via second arg `selfStateGetter?: () => boolean`)
  - `queryPipPresence(timeoutMs?: number): Promise<boolean>` — default 80 ms, defaults to `false` if no answer

- [ ] **Step 1: Write failing tests**

```typescript
// lib/board/pip-presence.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  broadcastPipOpen,
  broadcastPipClosed,
  subscribePipPresence,
  queryPipPresence,
} from './pip-presence'

describe('pip-presence', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('broadcastPipOpen sends pip:open on the booklage channel', () => {
    const received: unknown[] = []
    const ch = new BroadcastChannel('booklage')
    ch.addEventListener('message', (ev) => received.push(ev.data))
    broadcastPipOpen()
    expect(received.some((m: any) => m?.type === 'pip:open')).toBe(true)
    ch.close()
  })

  it('subscribePipPresence reports open=true on pip:open and false on pip:closed', () => {
    const states: boolean[] = []
    const unsub = subscribePipPresence((open) => states.push(open))
    broadcastPipOpen()
    broadcastPipClosed()
    expect(states).toEqual([true, false])
    unsub()
  })

  it('queryPipPresence resolves true if a subscriber answers within timeout', async () => {
    const unsub = subscribePipPresence(() => {}, () => true)
    const promise = queryPipPresence(80)
    await vi.advanceTimersByTimeAsync(50)
    await expect(promise).resolves.toBe(true)
    unsub()
  })

  it('queryPipPresence resolves false when no subscriber answers within timeout', async () => {
    const promise = queryPipPresence(80)
    await vi.advanceTimersByTimeAsync(100)
    await expect(promise).resolves.toBe(false)
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
rtk vitest run lib/board/pip-presence.test.ts
```
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement `lib/board/pip-presence.ts`**

```typescript
const CHANNEL_NAME = 'booklage'

export type PipPresenceMessage =
  | { type: 'pip:open' }
  | { type: 'pip:closed' }
  | { type: 'pip:query'; nonce: string }
  | { type: 'pip:presence'; open: boolean; nonce?: string }

function isPipMessage(data: unknown): data is PipPresenceMessage {
  if (!data || typeof data !== 'object') return false
  const t = (data as { type?: unknown }).type
  return t === 'pip:open' || t === 'pip:closed' || t === 'pip:query' || t === 'pip:presence'
}

function postOnce(msg: PipPresenceMessage): void {
  if (typeof BroadcastChannel === 'undefined') return
  try {
    const ch = new BroadcastChannel(CHANNEL_NAME)
    ch.postMessage(msg)
    ch.close()
  } catch { /* ignore */ }
}

export function broadcastPipOpen(): void { postOnce({ type: 'pip:open' }) }
export function broadcastPipClosed(): void { postOnce({ type: 'pip:closed' }) }

export function subscribePipPresence(
  handler: (open: boolean) => void,
  selfStateGetter?: () => boolean,
): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {}
  const ch = new BroadcastChannel(CHANNEL_NAME)
  const listener = (ev: MessageEvent): void => {
    const data = ev.data
    if (!isPipMessage(data)) return
    if (data.type === 'pip:open') handler(true)
    else if (data.type === 'pip:closed') handler(false)
    else if (data.type === 'pip:presence') handler(data.open)
    else if (data.type === 'pip:query' && selfStateGetter) {
      const open = selfStateGetter()
      const reply = new BroadcastChannel(CHANNEL_NAME)
      reply.postMessage({ type: 'pip:presence', open, nonce: data.nonce } satisfies PipPresenceMessage)
      reply.close()
    }
  }
  ch.addEventListener('message', listener)
  return (): void => {
    ch.removeEventListener('message', listener)
    ch.close()
  }
}

export function queryPipPresence(timeoutMs: number = 80): Promise<boolean> {
  if (typeof BroadcastChannel === 'undefined') return Promise.resolve(false)
  return new Promise<boolean>((resolve) => {
    const nonce = `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    let resolved = false
    const ch = new BroadcastChannel(CHANNEL_NAME)
    const finish = (open: boolean): void => {
      if (resolved) return
      resolved = true
      ch.removeEventListener('message', listener)
      ch.close()
      resolve(open)
    }
    const listener = (ev: MessageEvent): void => {
      const data = ev.data
      if (!isPipMessage(data)) return
      if (data.type === 'pip:presence' && data.nonce === nonce) finish(data.open)
    }
    ch.addEventListener('message', listener)
    ch.postMessage({ type: 'pip:query', nonce } satisfies PipPresenceMessage)
    setTimeout(() => finish(false), timeoutMs)
  })
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
rtk vitest run lib/board/pip-presence.test.ts
```
Expected: PASS (all 4).

- [ ] **Step 5: Commit**

```bash
rtk git add lib/board/pip-presence.ts lib/board/pip-presence.test.ts
rtk git commit -m "feat(pip): add presence broadcast + query protocol"
```

---

### Task 0.2: Wire presence broadcast into PipCompanion

**Files:**
- Modify: `components/pip/PipCompanion.tsx`
- Modify: `components/pip/PipCompanion.test.tsx`

- [ ] **Step 1: Add failing test for presence wiring**

Add a test case asserting that mounting `<PipCompanion>` produces a `pip:open` broadcast and unmounting produces `pip:closed`. Mock the BroadcastChannel in jsdom (or use happy-dom which provides it natively). Pattern:

```typescript
import { broadcastPipOpen, broadcastPipClosed } from '@/lib/board/pip-presence'
vi.mock('@/lib/board/pip-presence', () => ({
  broadcastPipOpen: vi.fn(),
  broadcastPipClosed: vi.fn(),
  subscribePipPresence: vi.fn(() => () => {}),
}))

it('broadcasts pip:open on mount and pip:closed on unmount', () => {
  const { unmount } = render(<PipCompanion />)
  expect(broadcastPipOpen).toHaveBeenCalledOnce()
  unmount()
  expect(broadcastPipClosed).toHaveBeenCalledOnce()
})
```

- [ ] **Step 2: Run, verify fail**

```bash
rtk vitest run components/pip/PipCompanion.test.tsx
```

- [ ] **Step 3: Implement — add useEffect to PipCompanion**

```typescript
// At the top of PipCompanion:
import { broadcastPipOpen, broadcastPipClosed, subscribePipPresence } from '@/lib/board/pip-presence'

// Inside the component, before the JSX return:
useEffect(() => {
  broadcastPipOpen()
  // Answer queries while we are mounted (we are the PiP, we are open).
  const unsub = subscribePipPresence(() => {}, () => true)
  return () => {
    unsub()
    broadcastPipClosed()
  }
}, [])
```

- [ ] **Step 4: Run tests, verify pass**

```bash
rtk vitest run components/pip/PipCompanion.test.tsx
```

- [ ] **Step 5: Commit**

```bash
rtk git add components/pip/PipCompanion.tsx components/pip/PipCompanion.test.tsx
rtk git commit -m "feat(pip): broadcast presence on mount/unmount + answer probes"
```

---

### Task 0.3: Add probe schemas to save-message

**Files:**
- Modify: `lib/utils/save-message.ts`
- Modify: `lib/utils/save-message.test.ts`

- [ ] **Step 1: Write failing tests for the new probe schemas**

Add cases for:
- valid `booklage:probe` parses
- valid `booklage:probe:result` parses
- `booklage:probe` requires a `nonce` string
- `booklage:probe:result` requires `nonce` + `pipActive: boolean`

- [ ] **Step 2: Implement schemas**

Add Zod schemas alongside existing ones. Export `parseProbeMessage` + `parseProbeResult` + types. Existing `parseSaveMessage` unchanged.

- [ ] **Step 3: Run tests, verify pass**

```bash
rtk vitest run lib/utils/save-message.test.ts
```

- [ ] **Step 4: Commit**

```bash
rtk git add lib/utils/save-message.ts lib/utils/save-message.test.ts
rtk git commit -m "feat(save-iframe): add probe message schemas"
```

---

### Task 0.4: Handle probe in `/save-iframe`

**Files:**
- Modify: `app/save-iframe/SaveIframeClient.tsx`
- Modify: `tests/e2e/save-iframe.spec.ts`

The iframe must:
1. On mount, subscribe to PiP presence and maintain a `pipActiveRef` (default `false`).
2. Lazy-query on first probe arrival: if we have never received any presence message yet, fire `queryPipPresence()` once before answering.
3. Respond to `booklage:probe` postMessage with `booklage:probe:result` containing current `pipActive`.

- [ ] **Step 1: Add E2E test scenario** for probe round-trip

In `tests/e2e/save-iframe.spec.ts`, add a test where:
- First, broadcast `pip:open` via a helper before posting probe
- Post `booklage:probe` from a parent page wrapping `/save-iframe`
- Assert the response contains `pipActive: true`
- Then broadcast `pip:closed`, repeat, assert `false`

- [ ] **Step 2: Implement** by extending `SaveIframeClient`:

```typescript
// Add inside the component:
const pipActiveRef = useRef<boolean>(false)
const seenPresenceRef = useRef<boolean>(false)

useEffect(() => {
  const unsub = subscribePipPresence((open) => {
    pipActiveRef.current = open
    seenPresenceRef.current = true
  })
  return () => unsub()
}, [])

// Inside the existing message handler, BEFORE the parseSaveMessage check, add:
const probeParsed = parseProbeMessage(ev.data)
if (probeParsed.ok) {
  let active = pipActiveRef.current
  if (!seenPresenceRef.current) {
    active = await queryPipPresence(80)
    pipActiveRef.current = active
    seenPresenceRef.current = true
  }
  ev.source?.postMessage(
    { type: 'booklage:probe:result', nonce: probeParsed.value.payload.nonce, pipActive: active },
    { targetOrigin: ev.origin },
  )
  return
}
```

- [ ] **Step 3: Run tests**

```bash
rtk vitest run
rtk playwright test tests/e2e/save-iframe.spec.ts
```

- [ ] **Step 4: Commit**

```bash
rtk git add app/save-iframe/SaveIframeClient.tsx tests/e2e/save-iframe.spec.ts
rtk git commit -m "feat(save-iframe): respond to probe with current pip-active state"
```

---

### Task 0.5: Rewrite bookmarklet IIFE — probe-then-save

**Files:**
- Modify: `lib/utils/bookmarklet.ts`
- Modify: `lib/utils/bookmarklet.test.ts`
- Modify: `tests/e2e/bookmarklet-save.spec.ts`

The new flow inside the IIFE:
1. Extract OGP from current page (unchanged from current).
2. Create hidden iframe pointing at `<APP>/save-iframe?bookmarklet=1`.
3. On `iframe.onload`, postMessage `booklage:probe` with a fresh nonce.
4. Wait up to 600ms for `booklage:probe:result`:
   - If `pipActive: true` → postMessage `booklage:save` to the iframe (silent), wait up to 1500ms for `booklage:save:result`, then remove iframe.
   - If `pipActive: false` OR timeout → remove iframe, `window.open('<APP>/save?…')` (existing popup flow).

Constraints:
- Keep the source under 2000 chars after `__APP_URL__` substitution. Minify by hand: shorten variable names, strip quotes where possible.
- No template literals (target ES5-safe browsers — bookmarklets run on arbitrary pages including legacy ones).

- [ ] **Step 1: Write failing tests**

In `lib/utils/bookmarklet.test.ts`, add cases:
- `generateBookmarkletUri('https://example.com')` produces a `javascript:` URI under 2000 chars
- The URI contains `'/save-iframe?bookmarklet=1'`
- The URI still contains a `window.open(...'/save?...')` fallback path
- The URI contains `'booklage:probe'` and `'booklage:save'` literals (= probe + save messages)

- [ ] **Step 2: Implement** — replace `BOOKMARKLET_SOURCE` with the new minified IIFE:

```javascript
// Annotated readable form (the actual constant is hand-minified):
(function(){
  var d=document, l=location;
  var g=function(s){var e=d.querySelector(s);return e?e.getAttribute('content')||'':'';};
  var h=function(s){var e=d.querySelector(s);return e?e.getAttribute('href')||'':'';};
  var u=l.href;
  var t=g('meta[property="og:title"]')||d.title||u;
  var i=g('meta[property="og:image"]')||g('meta[name="twitter:image"]')||'';
  var ds=(g('meta[property="og:description"]')||g('meta[name="description"]')||'').slice(0,200);
  var sn=g('meta[property="og:site_name"]')||l.hostname;
  var f=h('link[rel="icon"]')||h('link[rel="shortcut icon"]')||'/favicon.ico';
  if(f&&!/^https?:/.test(f)){try{f=new URL(f,u).href}catch(e){f=''}}
  var APP='__APP_URL__';
  var n='b'+Date.now()+Math.random().toString(36).slice(2,7);
  var done=false;
  var openPopup=function(){
    var p=new URLSearchParams({url:u,title:t,image:i,desc:ds,site:sn,favicon:f});
    window.open(APP+'/save?'+p.toString(),'booklage-save',
      'width=320,height=320,left='+Math.max(0,(screen.availWidth-340))+
      ',top='+Math.max(0,(screen.availHeight-340))+
      ',toolbar=0,menubar=0,location=0,status=0,resizable=0,scrollbars=0');
  };
  var cleanup=function(){try{d.body.removeChild(fr)}catch(e){};window.removeEventListener('message',M);};
  var fr=d.createElement('iframe');
  fr.style.cssText='position:fixed;left:-9999px;top:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;';
  fr.src=APP+'/save-iframe?bookmarklet=1';
  var M=function(e){
    if(done)return;
    if(e.source!==fr.contentWindow)return;
    var z=e.data;
    if(!z||typeof z!=='object')return;
    if(z.type==='booklage:probe:result'&&z.nonce==='p'+n){
      if(z.pipActive){
        fr.contentWindow.postMessage({type:'booklage:save',payload:{url:u,title:t,description:ds,image:i,favicon:f,siteName:sn,nonce:n}},APP);
      }else{
        done=true;cleanup();openPopup();
      }
    }else if(z.type==='booklage:save:result'&&z.nonce===n){
      done=true;cleanup();
    }
  };
  window.addEventListener('message',M);
  fr.onload=function(){
    fr.contentWindow.postMessage({type:'booklage:probe',payload:{nonce:'p'+n}},APP);
    setTimeout(function(){if(!done){done=true;cleanup();openPopup();}},600);
  };
  fr.onerror=function(){if(!done){done=true;cleanup();openPopup();}};
  d.body.appendChild(fr);
})();
```

Then hand-minify into the single-line `BOOKMARKLET_SOURCE` constant (strip whitespace, comments, newlines). Verify length < 2000 after `__APP_URL__` substitution with a typical app URL like `https://booklage.pages.dev`.

- [ ] **Step 3: Run unit tests**

```bash
rtk vitest run lib/utils/bookmarklet.test.ts
```

- [ ] **Step 4: Update + run E2E**

In `tests/e2e/bookmarklet-save.spec.ts`, split into two scenarios:
- "When PiP not present, opens popup and shows SaveToast" — assert popup `window.open` called, asserts a new bookmark in IDB
- "When PiP active, no popup is opened" — pre-broadcast `pip:open` from a helper, run the bookmarklet, assert no `window.open`, assert IDB write

```bash
rtk playwright test tests/e2e/bookmarklet-save.spec.ts
```

- [ ] **Step 5: Commit**

```bash
rtk git add lib/utils/bookmarklet.ts lib/utils/bookmarklet.test.ts tests/e2e/bookmarklet-save.spec.ts
rtk git commit -m "feat(bookmarklet): probe pip → silent save when active, popup otherwise"
```

---

### Task 0.6: Re-registration notice in /guide

**Files:**
- Modify: `app/(marketing)/guide/page.tsx`

Add a callout banner at the top of the guide that states:
- "ブックマークレットを更新しました (2026-05-09)"
- "PiP 表示中は popup なし、それ以外は従来通り。古い bookmarklet はそのままでも動作はしますが、PiP との見た目被り問題が残るので入れ替え推奨"
- Embed the new bookmarklet `<a>` (drag target)

- [ ] **Step 1: Add the callout block**, link to dragable bookmarklet, document the date

- [ ] **Step 2: Tsc + commit**

```bash
rtk tsc --noEmit
rtk git add app/'(marketing)'/guide/page.tsx
rtk git commit -m "docs(guide): announce bookmarklet update + drag target"
```

---

## Group A — Extension package skeleton

### Task A.1: Create `extension/manifest.json`

**Files:**
- Create: `extension/manifest.json`

Use the spec §7.1 manifest shape verbatim. Omit `web_accessible_resources` (Plan 2 has no in-extension PiP — we rely on the in-tab booklage PiP).

```json
{
  "manifest_version": 3,
  "name": "Booklage",
  "version": "0.1.0",
  "description": "Save any URL to Booklage as a beautiful visual collage card.",
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },
  "action": {
    "default_icon": {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png"
    },
    "default_title": "Save to Booklage",
    "default_popup": "popup.html"
  },
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "options_page": "options.html",
  "permissions": [
    "activeTab",
    "contextMenus",
    "scripting",
    "offscreen",
    "storage",
    "notifications"
  ],
  "host_permissions": [
    "https://booklage.pages.dev/*"
  ],
  "commands": {
    "save-current-page": {
      "suggested_key": {
        "default": "Ctrl+Shift+B",
        "mac": "Command+Shift+B"
      },
      "description": "Save current page to Booklage"
    }
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "css": ["content.css"],
      "run_at": "document_idle"
    }
  ],
  "default_locale": "en"
}
```

- [ ] **Step 1: Create the file**, validate JSON

```bash
node -e "JSON.parse(require('fs').readFileSync('extension/manifest.json','utf8'))"
```

- [ ] **Step 2: Commit**

```bash
rtk git add extension/manifest.json
rtk git commit -m "feat(ext): add Manifest v3 skeleton"
```

---

### Task A.2: Add icons (placeholder OK, refine later)

**Files:**
- Create: `extension/icons/icon-{16,32,48,128}.png`

For Plan 2, generate simple square book-mark-glyph PNGs (transparent background, white-on-dark-background-friendly). One option: hand-craft an SVG and export to PNG with `npx svgexport` or similar. If user wants final art, mark this task as "design follow-up — placeholder OK for sideload dogfood".

- [ ] **Step 1: Generate placeholder PNGs** (any 16/32/48/128 transparent square with `B` glyph is fine for sideload)

- [ ] **Step 2: Commit**

```bash
rtk git add extension/icons/
rtk git commit -m "feat(ext): add placeholder icon set (16/32/48/128)"
```

---

### Task A.3: Minimal `popup.html` + `popup.js` + `popup.css`

The popup must be tiny — a single "Open Settings" link and a brand mark. v0 does not show recent saves or anything heavy.

**Files:**
- Create: `extension/popup.html`, `extension/popup.js`, `extension/popup.css`

```html
<!-- popup.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <link rel="stylesheet" href="popup.css" />
</head>
<body>
  <div class="brand">Booklage</div>
  <button id="settings">Open settings</button>
  <p class="hint">Press <kbd>Ctrl+Shift+B</kbd> on any page to save.</p>
  <script src="popup.js"></script>
</body>
</html>
```

```javascript
// popup.js
document.getElementById('settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage()
})
```

```css
/* popup.css — vanilla, glass-themed minimal */
:root { color-scheme: dark; }
body {
  width: 240px; padding: 16px; margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  background: #0a0a0c; color: rgba(255,255,255,0.94);
}
.brand { font-weight: 600; font-size: 16px; letter-spacing: 0.01em; margin-bottom: 12px; }
button {
  width: 100%; padding: 8px 12px; border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.04); color: inherit; border-radius: 6px;
  font: inherit; cursor: pointer;
}
button:hover { background: rgba(255,255,255,0.08); }
.hint { font-size: 11px; color: rgba(255,255,255,0.55); margin: 12px 0 0; }
kbd { background: rgba(255,255,255,0.08); padding: 1px 4px; border-radius: 3px; font-size: 10px; }
```

- [ ] **Step 1: Create the three files** with the content above

- [ ] **Step 2: Sideload + smoke test** — load `extension/` in `chrome://extensions`, click the icon, verify popup renders + settings link tries to open options (will 404 until A.6, that's fine)

- [ ] **Step 3: Commit**

```bash
rtk git add extension/popup.html extension/popup.js extension/popup.css
rtk git commit -m "feat(ext): minimal popup with settings link"
```

---

### Task A.4: Sideload smoke test + dogfood checkpoint

- [ ] **Step 1:** Open `chrome://extensions`, enable Developer mode

- [ ] **Step 2:** Click "Load unpacked" → select `extension/` directory

- [ ] **Step 3:** Verify the icon appears in the toolbar, the popup opens on click, the brand and link render

- [ ] **Step 4:** No commit (this is just verification)

If the icon does not load: check `chrome://extensions` for errors. Most likely culprit: malformed manifest, missing icon file, or wrong path. Fix by inspecting the error pane.

---

## Group B — Save pipeline

### Task B.1: Background service worker — trigger registration

**Files:**
- Create: `extension/background.js`

The service worker registers all 4 trigger surfaces but routes them through a single `dispatchSave({ trigger, tabId, linkUrl? })` function so trigger handlers stay one-line.

```javascript
// extension/background.js
import { dispatchSave } from './lib/dispatch.js'

// Trigger 1: extension icon click (when no default_popup) — but we DO have
// default_popup, so action.onClicked won't fire. Instead, the popup will
// have a "Save current page" button later. For v0, we leave action.onClicked
// as a no-op and rely on shortcut + context menus + popup link for save.

// Trigger 2: keyboard shortcut
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'save-current-page') return
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return
  await dispatchSave({ trigger: 'shortcut', tabId: tab.id })
})

// Trigger 3: context menu — page
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'booklage-save-page',
    title: 'Save to Booklage',
    contexts: ['page'],
  })
  chrome.contextMenus.create({
    id: 'booklage-save-link',
    title: 'Save link to Booklage',
    contexts: ['link'],
  })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return
  if (info.menuItemId === 'booklage-save-page') {
    await dispatchSave({ trigger: 'context-page', tabId: tab.id })
  } else if (info.menuItemId === 'booklage-save-link' && info.linkUrl) {
    await dispatchSave({ trigger: 'context-link', tabId: tab.id, linkUrl: info.linkUrl })
  }
})
```

- [ ] **Step 1: Create the file** + a stub `extension/lib/dispatch.js` that just `console.log`s for now

- [ ] **Step 2: Sideload + verify** — Press Ctrl+Shift+B on any page, see the log in the SW devtools (`chrome://extensions` → Booklage → "service worker" link)

- [ ] **Step 3: Commit**

```bash
rtk git add extension/background.js extension/lib/dispatch.js
rtk git commit -m "feat(ext): wire shortcut + context menu triggers to dispatcher stub"
```

---

### Task B.2: Offscreen document host

**Files:**
- Create: `extension/offscreen.html`
- Create: `extension/offscreen.js`

The offscreen doc holds a single hidden `<iframe>` to `https://booklage.pages.dev/save-iframe`. It receives messages from the SW, forwards them to the iframe, and forwards iframe replies back.

```html
<!-- offscreen.html -->
<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head><body>
<iframe id="save" src="https://booklage.pages.dev/save-iframe?ext=1" sandbox="allow-scripts allow-same-origin"></iframe>
<script src="offscreen.js"></script>
</body></html>
```

```javascript
// extension/offscreen.js
const iframe = document.getElementById('save')
const BOOKLAGE_ORIGIN = 'https://booklage.pages.dev'

const pendingByNonce = new Map()

window.addEventListener('message', (ev) => {
  if (ev.origin !== BOOKLAGE_ORIGIN) return
  const data = ev.data
  if (!data || typeof data !== 'object') return
  if (data.type === 'booklage:save:result' || data.type === 'booklage:probe:result') {
    const port = pendingByNonce.get(data.nonce)
    if (port) {
      pendingByNonce.delete(data.nonce)
      port.postMessage(data)
    }
  }
})

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen') return false
  if (msg.type === 'forward-to-iframe') {
    pendingByNonce.set(msg.nonce, { postMessage: sendResponse })
    iframe.contentWindow.postMessage(msg.envelope, BOOKLAGE_ORIGIN)
    // Timeout fallback — return error if no result in 4s
    setTimeout(() => {
      if (pendingByNonce.has(msg.nonce)) {
        pendingByNonce.delete(msg.nonce)
        sendResponse({ type: 'booklage:save:result', nonce: msg.nonce, ok: false, error: 'timeout' })
      }
    }, 4000)
    return true // async
  }
  return false
})
```

- [ ] **Step 1: Create the two files**

- [ ] **Step 2: Add `update_url` for sandbox iframe** if needed; verify the iframe loads the booklage save endpoint when offscreen doc is created

- [ ] **Step 3: Smoke test** — Add a temporary `chrome.offscreen.createDocument(...)` call from the SW console and verify the iframe loads (check via inspecting the offscreen doc in `chrome://extensions`)

- [ ] **Step 4: Commit**

```bash
rtk git add extension/offscreen.html extension/offscreen.js
rtk git commit -m "feat(ext): add offscreen doc with hidden booklage save-iframe"
```

---

### Task B.3: Dispatch implementation — `extension/lib/dispatch.js`

**Files:**
- Modify: `extension/lib/dispatch.js`
- Create: `extension/lib/ogp.js`

```javascript
// extension/lib/ogp.js — INJECTED via chrome.scripting, runs in target tab
// Mirrors lib/utils/bookmarklet.ts's extractOgpFromDocument exactly.
export function extractOgp() {
  const m = (s) => { const e = document.querySelector(s); return e ? e.getAttribute('content') || '' : '' }
  const k = (s) => { const e = document.querySelector(s); return e ? e.getAttribute('href') || '' : '' }
  const url = location.href
  const title = m('meta[property="og:title"]') || document.title || url
  const image = m('meta[property="og:image"]') || m('meta[name="twitter:image"]') || ''
  const description = (m('meta[property="og:description"]') || m('meta[name="description"]') || '').slice(0, 200)
  const siteName = m('meta[property="og:site_name"]') || location.hostname
  let favicon = k('link[rel="icon"]') || k('link[rel="shortcut icon"]') || '/favicon.ico'
  if (favicon && !/^https?:/.test(favicon)) {
    try { favicon = new URL(favicon, url).href } catch { favicon = '' }
  }
  return { url, title, image, description, siteName, favicon }
}
```

```javascript
// extension/lib/dispatch.js
const OFFSCREEN_PATH = 'offscreen.html'

async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })
  if (existing.length > 0) return
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ['IFRAME_SCRIPTING'],
    justification: 'Bridge to booklage origin for IDB write',
  })
}

function makeNonce(prefix) {
  return prefix + Date.now() + Math.random().toString(36).slice(2, 7)
}

async function extractOgpFromTab(tabId, overrideUrl) {
  // For "save link" we already have the URL but no DOM context — synthesize a minimal payload.
  if (overrideUrl) {
    return { url: overrideUrl, title: overrideUrl, image: '', description: '', siteName: new URL(overrideUrl).hostname, favicon: '' }
  }
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const m = (s) => { const e = document.querySelector(s); return e ? e.getAttribute('content') || '' : '' }
      const k = (s) => { const e = document.querySelector(s); return e ? e.getAttribute('href') || '' : '' }
      const url = location.href
      const title = m('meta[property="og:title"]') || document.title || url
      const image = m('meta[property="og:image"]') || m('meta[name="twitter:image"]') || ''
      const description = (m('meta[property="og:description"]') || m('meta[name="description"]') || '').slice(0, 200)
      const siteName = m('meta[property="og:site_name"]') || location.hostname
      let favicon = k('link[rel="icon"]') || k('link[rel="shortcut icon"]') || '/favicon.ico'
      if (favicon && !/^https?:/.test(favicon)) {
        try { favicon = new URL(favicon, url).href } catch { favicon = '' }
      }
      return { url, title, image, description, siteName, favicon }
    },
  })
  return result
}

async function postToOffscreen(envelope, nonce) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { target: 'offscreen', type: 'forward-to-iframe', envelope, nonce },
      (response) => resolve(response),
    )
  })
}

export async function dispatchSave({ trigger, tabId, linkUrl }) {
  await ensureOffscreen()
  const ogp = await extractOgpFromTab(tabId, linkUrl)
  const nonce = makeNonce('e')
  const envelope = {
    type: 'booklage:save',
    payload: { ...ogp, nonce },
  }
  // Notify content script for cursor pill (saving state)
  chrome.tabs.sendMessage(tabId, { type: 'booklage:cursor-pill', state: 'saving' }).catch(() => {})
  const result = await postToOffscreen(envelope, nonce)
  if (result?.ok) {
    chrome.tabs.sendMessage(tabId, { type: 'booklage:cursor-pill', state: 'saved' }).catch(() => {
      chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon-48.png', title: 'Booklage', message: 'Saved' })
    })
  } else {
    chrome.tabs.sendMessage(tabId, { type: 'booklage:cursor-pill', state: 'error' }).catch(() => {
      chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon-48.png', title: 'Booklage', message: 'Failed to save' })
    })
  }
}
```

- [ ] **Step 1: Create both files**

- [ ] **Step 2: Sideload + smoke test** — press Ctrl+Shift+B on a page with OGP meta tags. Verify:
  - SW logs the trigger
  - Offscreen doc gets created (check `chrome://extensions`)
  - The booklage IDB receives a new bookmark (check via the booklage tab — if open, the new card animates in)

- [ ] **Step 3: Commit**

```bash
rtk git add extension/lib/dispatch.js extension/lib/ogp.js
rtk git commit -m "feat(ext): wire dispatchSave end-to-end via offscreen iframe"
```

---

## Group C — Cursor pill (content script)

### Task C.1: Pill renderer + state machine

**Files:**
- Create: `extension/content.js`
- Create: `extension/content.css`
- Create: `tests/extension/cursor-pill.test.ts`

State machine:
- Pill is hidden by default
- On `booklage:cursor-pill` message with state `saving` → render pill with `Saving` label + ring spinner at last known mouse position (default bottom-right if unknown)
- On `saved` → swap label to `Saved` + checkmark draw, schedule auto-hide at +1200ms
- On `error` → swap label to `Failed` + ! mark, auto-hide at +2400ms

Implementation outline:

```javascript
// extension/content.js
let lastMouse = { x: window.innerWidth - 220, y: window.innerHeight - 60 }
window.addEventListener('mousemove', (e) => { lastMouse = { x: e.clientX, y: e.clientY } }, { passive: true })

let pill = null
let hideTimer = null

function ensurePill() {
  if (pill) return pill
  pill = document.createElement('div')
  pill.className = 'booklage-pill'
  pill.innerHTML = `
    <span class="booklage-pill__icon" data-role="icon"></span>
    <span class="booklage-pill__brand">Booklage</span>
    <span class="booklage-pill__sep">·</span>
    <span class="booklage-pill__state" data-role="state">Saving</span>
  `
  document.documentElement.appendChild(pill)
  return pill
}

function positionPill() {
  const p = ensurePill()
  const x = Math.min(window.innerWidth - 220, Math.max(8, lastMouse.x + 12))
  const y = Math.min(window.innerHeight - 56, Math.max(8, lastMouse.y - 52))
  p.style.transform = `translate(${x}px, ${y}px)`
}

function setState(state) {
  const p = ensurePill()
  const stateEl = p.querySelector('[data-role="state"]')
  const iconEl = p.querySelector('[data-role="icon"]')
  positionPill()
  p.dataset.state = state
  if (state === 'saving') { stateEl.textContent = 'Saving';  iconEl.innerHTML = '<span class="ring"></span>' }
  if (state === 'saved')  { stateEl.textContent = 'Saved';   iconEl.innerHTML = '<svg viewBox="0 0 24 24" class="check"><path d="M5 12 L10 17 L19 7"/></svg>' }
  if (state === 'error')  { stateEl.textContent = 'Failed';  iconEl.innerHTML = '<span class="bang">!</span>' }
  p.classList.add('is-visible')
  clearTimeout(hideTimer)
  if (state !== 'saving') {
    const ms = state === 'error' ? 2400 : 1200
    hideTimer = setTimeout(() => { p.classList.remove('is-visible') }, ms)
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== 'booklage:cursor-pill') return
  setState(msg.state)
})
```

CSS — glass theme. See `extension/content.css` block in Task C.2.

- [ ] **Step 1: Add pill state machine tests** (`tests/extension/cursor-pill.test.ts`) — pure logic separated from DOM. Extract `setState` into a `state-machine.js` module if you want unit tests.

- [ ] **Step 2: Implement content.js** + content.css (Task C.2)

- [ ] **Step 3: Sideload + smoke test** — press Ctrl+Shift+B on a page, verify the pill appears at the cursor

- [ ] **Step 4: Commit**

```bash
rtk git add extension/content.js extension/content.css tests/extension/cursor-pill.test.ts
rtk git commit -m "feat(ext): cursor pill content script with saving/saved/error states"
```

---

### Task C.2: Pill CSS — glass theme

**Files:**
- Create / refine: `extension/content.css`

```css
.booklage-pill {
  position: fixed;
  top: 0; left: 0;
  z-index: 2147483647;
  display: flex; align-items: center; gap: 8px;
  padding: 0 12px;
  height: 40px; min-width: 200px;
  border-radius: 20px;
  background: rgba(18, 18, 22, 0.92);
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.32);
  font: 500 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  color: rgba(255, 255, 255, 0.94);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.booklage-pill.is-visible { opacity: 1; }
.booklage-pill__brand { font-weight: 600; }
.booklage-pill__sep { opacity: 0.45; }
.booklage-pill__state { font-weight: 400; opacity: 0.85; }
.booklage-pill__icon { width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; }
.booklage-pill .ring {
  width: 12px; height: 12px;
  border: 2px solid rgba(255,255,255,0.4); border-top-color: rgba(255,255,255,0.95);
  border-radius: 50%;
  animation: booklage-pill-spin 0.8s linear infinite;
}
@keyframes booklage-pill-spin { to { transform: rotate(360deg); } }
.booklage-pill .check {
  width: 14px; height: 14px; stroke: rgba(255,255,255,0.95); stroke-width: 2.5;
  fill: none; stroke-linecap: round; stroke-linejoin: round;
  stroke-dasharray: 24; stroke-dashoffset: 24;
  animation: booklage-pill-check 0.24s ease-out forwards;
}
@keyframes booklage-pill-check { to { stroke-dashoffset: 0; } }
.booklage-pill .bang {
  width: 14px; height: 14px; border-radius: 50%; background: rgba(255, 90, 90, 0.95);
  color: #000; font-weight: 700; font-size: 10px; display: flex; align-items: center; justify-content: center;
}
@media (prefers-reduced-motion: reduce) {
  .booklage-pill, .booklage-pill .ring, .booklage-pill .check { transition: none; animation: none; }
}
```

- [ ] **Step 1: Add the CSS**

- [ ] **Step 2: Sideload + visual smoke test** — confirm the pill renders correctly (no broken backdrop-filter, no overflow)

- [ ] **Step 3: Commit**

```bash
rtk git add extension/content.css
rtk git commit -m "feat(ext): cursor pill glass theme"
```

---

## Group D — Settings UI

### Task D.1: Options page (`options.html` + `options.js` + `options.css`)

**Files:**
- Create: `extension/options.html`, `extension/options.js`, `extension/options.css`

Settings (v0):

| Key | Default | UI |
|-----|---------|-----|
| `autoOpenPip` | `false` | toggle (manual button still required for v0 — will be wired in Phase 1.5) |
| `cursorPillFallbackPosition` | `'cursor'` | radio: cursor / bottom-right |
| `keyboardShortcut` | (display only) | text: "Ctrl+Shift+B" + link to `chrome://extensions/shortcuts` |

```html
<!-- options.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <link rel="stylesheet" href="options.css" />
</head>
<body>
  <h1>Booklage settings</h1>
  <section>
    <label class="row">
      <input type="checkbox" id="autoOpenPip" />
      <span>Auto-open PiP on Booklage tab</span>
    </label>
  </section>
  <section>
    <h2>Cursor pill position when no mouse data</h2>
    <label class="row"><input type="radio" name="pillPos" value="cursor" /> At cursor</label>
    <label class="row"><input type="radio" name="pillPos" value="bottom-right" /> Bottom-right corner</label>
  </section>
  <section>
    <h2>Keyboard shortcut</h2>
    <p>Default: <kbd>Ctrl+Shift+B</kbd> (Mac: <kbd>Cmd+Shift+B</kbd>)</p>
    <a href="#" id="shortcuts-link">Customize shortcuts</a>
  </section>
  <script src="options.js"></script>
</body>
</html>
```

```javascript
// options.js
const $ = (id) => document.getElementById(id)
const DEFAULTS = { autoOpenPip: false, cursorPillFallbackPosition: 'cursor' }

async function load() {
  const stored = await chrome.storage.sync.get(DEFAULTS)
  $('autoOpenPip').checked = stored.autoOpenPip
  document.querySelector(`input[name="pillPos"][value="${stored.cursorPillFallbackPosition}"]`).checked = true
}

$('autoOpenPip').addEventListener('change', () => {
  chrome.storage.sync.set({ autoOpenPip: $('autoOpenPip').checked })
})
document.querySelectorAll('input[name="pillPos"]').forEach((el) => {
  el.addEventListener('change', () => {
    chrome.storage.sync.set({ cursorPillFallbackPosition: el.value })
  })
})
$('shortcuts-link').addEventListener('click', (e) => {
  e.preventDefault()
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })
})

load()
```

```css
/* options.css */
:root { color-scheme: dark; }
body { font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  background: #0a0a0c; color: rgba(255,255,255,0.94); padding: 24px; max-width: 480px; margin: 0 auto; }
h1 { font-weight: 600; font-size: 22px; margin: 0 0 24px; }
h2 { font-weight: 600; font-size: 14px; margin: 16px 0 8px; opacity: 0.85; }
section { padding: 16px; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; margin-bottom: 12px; background: rgba(255,255,255,0.02); }
.row { display: flex; align-items: center; gap: 10px; padding: 6px 0; cursor: pointer; }
kbd { background: rgba(255,255,255,0.08); padding: 1px 6px; border-radius: 3px; font-size: 12px; }
a { color: #6ed; }
```

- [ ] **Step 1: Create the three files**

- [ ] **Step 2: Sideload + smoke test** — open the options page via the popup button, toggle settings, reload, verify persistence

- [ ] **Step 3: Commit**

```bash
rtk git add extension/options.html extension/options.js extension/options.css
rtk git commit -m "feat(ext): settings UI (autoOpenPip, pillPos, shortcut hint)"
```

---

## Group E — Tests

### Task E.1: OGP unit tests

**Files:**
- Create: `tests/extension/ogp-extract.test.ts`

Use HTML fixtures (re-use `tests/e2e/fixtures/` if any exist, or create minimal fixtures inline). Assert each OGP field is extracted correctly from realistic snippets (Twitter, YouTube, generic news, missing-meta site).

- [ ] **Step 1: Write the tests + a thin TS wrapper around `extension/lib/ogp.js`** so they can be imported by Vitest. The wrapper reads the JS module via dynamic import + JSDOM:

```typescript
import { describe, it, expect } from 'vitest'
import { JSDOM } from 'jsdom'

async function extract(html: string): Promise<unknown> {
  const dom = new JSDOM(html, { url: 'https://example.com/page' })
  const orig = { document: globalThis.document, location: globalThis.location, window: globalThis.window }
  // @ts-expect-error
  globalThis.document = dom.window.document
  // @ts-expect-error
  globalThis.location = dom.window.location
  // @ts-expect-error
  globalThis.window = dom.window
  const mod = await import('../../extension/lib/ogp.js')
  const result = mod.extractOgp()
  Object.assign(globalThis, orig)
  return result
}

describe('OGP extraction', () => {
  it('reads og:title, og:image, og:description, og:site_name', async () => {
    const html = `
      <html><head>
        <meta property="og:title" content="Example title" />
        <meta property="og:image" content="https://example.com/img.png" />
        <meta property="og:description" content="An example" />
        <meta property="og:site_name" content="Example Site" />
        <link rel="icon" href="/icon.png" />
      </head><body></body></html>
    `
    const r: any = await extract(html)
    expect(r.title).toBe('Example title')
    expect(r.image).toBe('https://example.com/img.png')
    expect(r.description).toBe('An example')
    expect(r.siteName).toBe('Example Site')
    expect(r.favicon).toBe('https://example.com/icon.png')
  })

  it('falls back to document.title and twitter:image', async () => {
    const html = `<html><head><title>Fallback</title>
      <meta name="twitter:image" content="https://x.com/i.jpg" /></head></html>`
    const r: any = await extract(html)
    expect(r.title).toBe('Fallback')
    expect(r.image).toBe('https://x.com/i.jpg')
  })

  it('clamps description to 200 chars', async () => {
    const long = 'a'.repeat(300)
    const html = `<html><head><meta property="og:description" content="${long}" /></head></html>`
    const r: any = await extract(html)
    expect(r.description).toHaveLength(200)
  })
})
```

- [ ] **Step 2: Run tests**

```bash
rtk vitest run tests/extension/ogp-extract.test.ts
```

- [ ] **Step 3: Commit**

```bash
rtk git add tests/extension/ogp-extract.test.ts
rtk git commit -m "test(ext): OGP extractor unit tests"
```

---

### Task E.2: postMessage envelope round-trip tests

**Files:**
- Create: `tests/extension/save-message-protocol.test.ts`

Verify the offscreen-side bridge round-trips a save envelope correctly. Mock `chrome.runtime.sendMessage` and `iframe.contentWindow.postMessage`, dispatch a `forward-to-iframe` message, fake a `booklage:save:result` response from the iframe, assert sendResponse is called with the correct payload.

- [ ] **Step 1: Add the tests + run**

- [ ] **Step 2: Commit**

```bash
rtk git add tests/extension/save-message-protocol.test.ts
rtk git commit -m "test(ext): save-message protocol round-trip"
```

---

### Task E.3: Playwright E2E with sideloaded extension

**Files:**
- Create: `tests/e2e/extension-save.spec.ts`
- Create: `tests/e2e/fixtures/extension-test-page.html`

Sideload pattern with Playwright:

```typescript
import { test, expect, chromium } from '@playwright/test'
import path from 'path'

test('extension saves a page via Ctrl+Shift+B', async () => {
  const extDir = path.resolve('extension')
  const ctx = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extDir}`,
      `--load-extension=${extDir}`,
    ],
  })
  // Open booklage tab so it's available for the BroadcastChannel
  await ctx.newPage().then((p) => p.goto('https://booklage.pages.dev/board'))
  // Navigate a regular page
  const target = await ctx.newPage()
  await target.goto('file://' + path.resolve('tests/e2e/fixtures/extension-test-page.html'))
  // Trigger via shortcut
  await target.keyboard.press('Control+Shift+KeyB')
  // Wait for a "saved" indicator (cursor pill or notification or the booklage tab's IDB)
  // For this assertion, wait for the IDB to contain the test URL — open booklage tab and read IDB
  // ... (use page.evaluate to check IDB)
  await ctx.close()
})
```

- [ ] **Step 1: Add the test + fixture HTML**

- [ ] **Step 2: Run** (note: requires `headless: false` since extensions don't load in pure headless; CI may need `xvfb-run`)

```bash
rtk playwright test tests/e2e/extension-save.spec.ts
```

- [ ] **Step 3: Commit**

```bash
rtk git add tests/e2e/extension-save.spec.ts tests/e2e/fixtures/extension-test-page.html
rtk git commit -m "test(ext): E2E sideload save flow"
```

---

## Group F — Distribution prep

### Task F.1: Privacy policy

**Files:**
- Create: `docs/private/extension-privacy-policy.md`

Cover: data flow (URL+title only), no external send, IDB-only storage, chrome.storage usage, contact info (placeholder for masked email).

- [ ] **Step 1: Draft from the spec §11.3 outline**

- [ ] **Step 2: Verify it lives in `docs/private/`** (gitignored)

- [ ] **Step 3: NO commit** (private docs are not tracked)

---

### Task F.2: Packaging script

**Files:**
- Create: `scripts/package-extension.mjs`
- Modify: `package.json`

Script responsibilities:
1. Validate `extension/manifest.json` is valid JSON
2. Verify all referenced icons / scripts exist
3. Zip `extension/` to `dist/booklage-extension-<version>.zip`
4. Print byte size

```javascript
// scripts/package-extension.mjs
import { readFileSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

const root = 'extension'
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'))
const version = manifest.version

mkdirSync('dist', { recursive: true })
const out = `dist/booklage-extension-${version}.zip`

// Use the OS zip tool — works on macOS / Linux / Git Bash on Windows
execSync(`cd ${root} && zip -r ../${out} . -x "*.DS_Store" "**/.*"`, { stdio: 'inherit' })

const size = statSync(out).size
console.log(`✓ Packaged ${out} (${(size / 1024).toFixed(1)} KB)`)
if (size > 200_000) console.warn(`⚠ Size > 200 KB target`)
```

```json
// package.json — add to scripts:
"package:extension": "node scripts/package-extension.mjs"
```

- [ ] **Step 1: Add the script + npm script**

- [ ] **Step 2: Run + verify zip output**

```bash
rtk npm run package:extension
```

- [ ] **Step 3: Commit**

```bash
rtk git add scripts/package-extension.mjs package.json
rtk git commit -m "chore(ext): packaging script for Web Store zip"
```

---

### Task F.3: Web Store submission checklist (manual, no commit)

Outside-of-repo work, but document in TODO.md:
1. Pay one-time $5 USD developer fee (per CLAUDE.md, list as ¥フィー — currency conversion)
2. Upload `dist/booklage-extension-0.1.0.zip`
3. Title: "Booklage"
4. Short description: from manifest
5. Detailed description: from `docs/private/extension-store-description.md` (create as private)
6. Screenshots: 1280×800, taken on the booklage board with cursor pill / PiP visible
7. Privacy policy URL: hosted version of `docs/private/extension-privacy-policy.md` (publish to a `/extension/privacy` route on booklage.pages.dev — see Task F.4)
8. **Visibility: Unlisted** (per spec §11)
9. Submit, wait 1-3 weeks for review

- [ ] **Step 1: Update `docs/TODO.md`** with this checklist as a "保留" item

- [ ] **Step 2: NO commit until Web Store actions actually happen**

---

### Task F.4: Public privacy policy route

**Files:**
- Create: `app/(marketing)/extension/privacy/page.tsx`

Render the privacy policy publicly so the Web Store submission has a URL to point to. The content can be a redacted version of the private file (no email addresses; substitute with the contact form URL).

- [ ] **Step 1: Create the page** with the policy text

- [ ] **Step 2: Verify** at `https://booklage.pages.dev/extension/privacy` after deploy

- [ ] **Step 3: Commit**

```bash
rtk git add app/'(marketing)'/extension/privacy/page.tsx
rtk git commit -m "feat(marketing): public extension privacy policy page"
```

---

## Final smoke test (manual, no commit)

After all tasks above are merged:
- [ ] Sideload `extension/` in Chrome
- [ ] Press Ctrl+Shift+B on github.com/anthropics/anthropic-sdk-typescript — verify cursor pill appears, then "Saved", then booklage tab (open in another window) shows the new card
- [ ] Right-click on a link in the same page → "Save link to Booklage" → verify pill + booklage card
- [ ] Right-click on the page background → "Save to Booklage" → verify pill + booklage card
- [ ] Click the extension icon → popup opens → click "Open settings" → options page renders
- [ ] On booklage tab with PiP open: trigger a save via shortcut from another tab — verify PiP card slides in (= proves the BroadcastChannel bridge works through `/save-iframe`)
- [ ] On a `chrome://extensions` page: trigger save — verify the OS notification fallback fires (cursor pill cannot inject into chrome:// pages)
- [ ] Bookmarklet (old): from a regular tab with PiP active — verify NO popup opens (silent save)
- [ ] Bookmarklet: from a regular tab with PiP closed — verify popup opens and saves normally

---

## Self-review checklist (executed by plan author at write time, not by implementer)

- [x] Group 0 covers spec §6 cursor pill foundation prereq + bookmarklet/PiP collision
- [x] Group A covers spec §7 manifest + popup
- [x] Group B covers spec §3 architecture + §4 triggers + §8 endpoint integration
- [x] Group C covers spec §6 cursor pill
- [x] Group D covers spec §9 settings
- [x] Group E covers spec §10 tests
- [x] Group F covers spec §11 distribution
- [x] No "TODO" / "implement later" placeholders in any task body
- [x] Type names consistent: `pip:open / pip:closed / pip:query / pip:presence` (presence module), `booklage:probe / booklage:probe:result` (postMessage), `dispatchSave({trigger,tabId,linkUrl?})` (background)
- [x] Spec §5 (PiP layout) — out of Plan 2 scope by spec design (PiP is in-tab, owned by Plan 1)
- [x] Spec §13 a11y — covered partially in Task C.2 (`prefers-reduced-motion`); full a11y polish deferred to a focused Phase 1.5 task
