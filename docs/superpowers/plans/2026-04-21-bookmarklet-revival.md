# Bookmarklet Revival Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** B0 リビルド時に削除されたブックマークレットを復活させ、任意サイトから 1 クリックで AllMarks に保存できる主導線を再実装する。B-embeds 4 種カード（Tweet/VideoThumb/Image/Text）が実 URL で正しく出ることを確認する。

**Architecture:** Pure inline `javascript:` URI 方式。OGP 抽出 + `/save` ポップアップ起動のみ bookmarklet が担当、保存処理は既存の `/save` route + `SavePopup` を無変更で流用。install UI はサイドバー行 + 導入モーダル + 空状態ウェルカムの 3 UI。

**Tech Stack:** Next.js 14 App Router / TypeScript strict / Vanilla CSS Modules / Vitest + @testing-library/react (jsdom) / Playwright E2E / IndexedDB via `idb`

**Spec:** `docs/superpowers/specs/2026-04-21-bookmarklet-revival-design.md`

---

## File Structure

**新規作成:**
- `lib/utils/bookmarklet.ts` — 型 `OgpData` + `extractOgpFromDocument(doc)` + `generateBookmarkletUri(appUrl)` 純粋関数
- `lib/utils/bookmarklet.test.ts` — 上記のユニットテスト
- `components/bookmarklet/BookmarkletInstallModal.tsx` + `.module.css` — 導入モーダル（ドラッグ可能リンク + 使い方）
- `components/bookmarklet/BookmarkletInstallModal.test.tsx` — モーダルのテスト
- `components/bookmarklet/BookmarkletInstall.tsx` + `.module.css` — サイドバー行
- `components/bookmarklet/BookmarkletInstall.test.tsx` — サイドバー行のテスト
- `components/bookmarklet/EmptyStateWelcome.tsx` + `.module.css` — 空状態ウェルカム
- `components/bookmarklet/EmptyStateWelcome.test.tsx` — 空状態のテスト
- `tests/e2e/bookmarklet-save.spec.ts` — `/save?url=...` 保存フロー E2E

**変更:**
- `components/board/Sidebar.tsx` — `BookmarkletInstall` row を LIBRARY と Folders の間に mount、`onOpenBookmarkletModal` prop 追加
- `components/board/BoardRoot.tsx` — `bookmarkletModalOpen` state、`BookmarkletInstallModal` 常時 mount、`!loading && items.length === 0` で `EmptyStateWelcome` render
- `messages/ja.json` — `board.sidebar.bookmarklet` + `board.empty.*` + `board.bookmarkletModal.*` キー追加
- `public/sw.js` — `CACHE_VERSION` bump（デプロイ時）

---

## Task 1: `lib/utils/bookmarklet.ts` — 型と OGP 抽出関数

**Files:**
- Create: `lib/utils/bookmarklet.ts`
- Create: `lib/utils/bookmarklet.test.ts`

- [ ] **Step 1.1: Write failing test for `extractOgpFromDocument` basic case**

Create `lib/utils/bookmarklet.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { extractOgpFromDocument } from './bookmarklet'

describe('extractOgpFromDocument', () => {
  function makeDoc(html: string, href = 'https://example.com/page'): Document {
    const parser = new DOMParser()
    const doc = parser.parseFromString(`<!DOCTYPE html><html><head>${html}</head><body></body></html>`, 'text/html')
    Object.defineProperty(doc, 'location', {
      value: new URL(href),
      configurable: true,
    })
    return doc
  }

  it('extracts og:title, og:image, og:description, og:site_name from meta tags', () => {
    const doc = makeDoc(`
      <meta property="og:title" content="Example Title" />
      <meta property="og:image" content="https://cdn.example.com/og.png" />
      <meta property="og:description" content="Example description" />
      <meta property="og:site_name" content="Example Site" />
      <title>Fallback Title</title>
    `)
    const ogp = extractOgpFromDocument(doc)
    expect(ogp.title).toBe('Example Title')
    expect(ogp.image).toBe('https://cdn.example.com/og.png')
    expect(ogp.description).toBe('Example description')
    expect(ogp.siteName).toBe('Example Site')
  })
})
```

- [ ] **Step 1.2: Run the test to verify it fails**

Run: `npx vitest run lib/utils/bookmarklet.test.ts`
Expected: FAIL with "Cannot find module './bookmarklet'" or equivalent.

- [ ] **Step 1.3: Create minimal `bookmarklet.ts` to make Step 1.1 pass**

Create `lib/utils/bookmarklet.ts`:

```typescript
export interface OgpData {
  readonly title: string
  readonly image: string
  readonly description: string
  readonly siteName: string
  readonly favicon: string
  readonly url: string
}

export function extractOgpFromDocument(doc: Document): OgpData {
  const meta = (selector: string): string => {
    const el = doc.querySelector(selector)
    return el?.getAttribute('content') ?? ''
  }
  const link = (selector: string): string => {
    const el = doc.querySelector(selector)
    return el?.getAttribute('href') ?? ''
  }

  const url = doc.location.href
  const title = meta('meta[property="og:title"]') || doc.title || url
  const image = meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]') || ''
  const description = (meta('meta[property="og:description"]') || meta('meta[name="description"]') || '').slice(0, 200)
  const siteName = meta('meta[property="og:site_name"]') || doc.location.hostname
  let favicon = link('link[rel="icon"]') || link('link[rel="shortcut icon"]') || '/favicon.ico'
  if (favicon && !/^https?:/.test(favicon)) {
    try {
      favicon = new URL(favicon, doc.location.href).href
    } catch {
      favicon = ''
    }
  }

  return { title, image, description, siteName, favicon, url }
}
```

- [ ] **Step 1.4: Run the test to verify it passes**

Run: `npx vitest run lib/utils/bookmarklet.test.ts`
Expected: PASS — 1 test passing.

- [ ] **Step 1.5: Add fallback tests**

Append to `lib/utils/bookmarklet.test.ts`:

```typescript
  it('falls back to document.title when og:title is missing', () => {
    const doc = makeDoc(`<title>Fallback Title</title>`)
    expect(extractOgpFromDocument(doc).title).toBe('Fallback Title')
  })

  it('falls back to URL when both og:title and document.title are missing', () => {
    const doc = makeDoc(``, 'https://example.com/page')
    expect(extractOgpFromDocument(doc).title).toBe('https://example.com/page')
  })

  it('falls back to twitter:image when og:image is missing', () => {
    const doc = makeDoc(`<meta name="twitter:image" content="https://cdn.example.com/twitter.png" />`)
    expect(extractOgpFromDocument(doc).image).toBe('https://cdn.example.com/twitter.png')
  })

  it('falls back to meta[name=description] when og:description is missing', () => {
    const doc = makeDoc(`<meta name="description" content="Plain description" />`)
    expect(extractOgpFromDocument(doc).description).toBe('Plain description')
  })

  it('falls back to hostname when og:site_name is missing', () => {
    const doc = makeDoc(``, 'https://news.example.com/article')
    expect(extractOgpFromDocument(doc).siteName).toBe('news.example.com')
  })

  it('truncates description to 200 characters', () => {
    const long = 'a'.repeat(500)
    const doc = makeDoc(`<meta property="og:description" content="${long}" />`)
    expect(extractOgpFromDocument(doc).description.length).toBe(200)
  })

  it('resolves relative favicon to absolute URL', () => {
    const doc = makeDoc(`<link rel="icon" href="/favicon.png" />`, 'https://example.com/page')
    expect(extractOgpFromDocument(doc).favicon).toBe('https://example.com/favicon.png')
  })

  it('keeps absolute favicon URLs as-is', () => {
    const doc = makeDoc(`<link rel="icon" href="https://cdn.example.com/fav.ico" />`)
    expect(extractOgpFromDocument(doc).favicon).toBe('https://cdn.example.com/fav.ico')
  })

  it('uses shortcut icon when icon is missing', () => {
    const doc = makeDoc(`<link rel="shortcut icon" href="https://cdn.example.com/short.ico" />`)
    expect(extractOgpFromDocument(doc).favicon).toBe('https://cdn.example.com/short.ico')
  })

  it('defaults favicon to absolute /favicon.ico when no link tags exist', () => {
    const doc = makeDoc(``, 'https://example.com/deep/path')
    expect(extractOgpFromDocument(doc).favicon).toBe('https://example.com/favicon.ico')
  })

  it('returns url field from document.location.href', () => {
    const doc = makeDoc(``, 'https://example.com/article?id=1')
    expect(extractOgpFromDocument(doc).url).toBe('https://example.com/article?id=1')
  })
```

- [ ] **Step 1.6: Run all tests to verify they pass**

Run: `npx vitest run lib/utils/bookmarklet.test.ts`
Expected: PASS — 11 tests passing.

- [ ] **Step 1.7: Commit**

```bash
rtk git add lib/utils/bookmarklet.ts lib/utils/bookmarklet.test.ts
rtk git commit -m "feat(bookmarklet): extractOgpFromDocument + OgpData type with jsdom tests"
```

---

## Task 2: `generateBookmarkletUri` function

**Files:**
- Modify: `lib/utils/bookmarklet.ts`
- Modify: `lib/utils/bookmarklet.test.ts`

- [ ] **Step 2.1: Write failing tests for `generateBookmarkletUri`**

Append to `lib/utils/bookmarklet.test.ts`:

```typescript
import { generateBookmarkletUri } from './bookmarklet'

describe('generateBookmarkletUri', () => {
  it('returns a URI starting with "javascript:"', () => {
    const uri = generateBookmarkletUri('https://booklage.pages.dev')
    expect(uri.startsWith('javascript:')).toBe(true)
  })

  it('includes the provided appUrl in the output', () => {
    const uri = generateBookmarkletUri('https://booklage.pages.dev')
    expect(uri).toContain('https://booklage.pages.dev')
  })

  it('uses a different appUrl when provided', () => {
    const uri = generateBookmarkletUri('http://localhost:3000')
    expect(uri).toContain('http://localhost:3000')
    expect(uri).not.toContain('booklage.pages.dev')
  })

  it('produces a URI shorter than 2000 characters', () => {
    const uri = generateBookmarkletUri('https://booklage.pages.dev')
    expect(uri.length).toBeLessThan(2000)
  })

  it('contains the /save path reference', () => {
    const uri = generateBookmarkletUri('https://booklage.pages.dev')
    expect(uri).toContain('/save')
  })

  it('is wrapped in an IIFE (function invocation)', () => {
    const uri = generateBookmarkletUri('https://booklage.pages.dev')
    expect(uri).toMatch(/\(function\(\)\{.*\}\)\(\);?$/s)
  })
})
```

- [ ] **Step 2.2: Run the tests to verify they fail**

Run: `npx vitest run lib/utils/bookmarklet.test.ts`
Expected: FAIL with "generateBookmarkletUri is not exported" or equivalent.

- [ ] **Step 2.3: Implement `generateBookmarkletUri` in `bookmarklet.ts`**

Append to `lib/utils/bookmarklet.ts`:

```typescript
/**
 * Inline bookmarklet source. Mirrors extractOgpFromDocument semantics but
 * written as a compact ES5-safe IIFE so the `javascript:` URI stays well
 * under the 2000-char browser limit and works on arbitrary pages.
 *
 * Keep this in sync with extractOgpFromDocument.
 */
const BOOKMARKLET_SOURCE = `(function(){var d=document,l=location,m=function(s){var e=d.querySelector(s);return e?e.getAttribute('content')||'':'';},k=function(s){var e=d.querySelector(s);return e?e.getAttribute('href')||'':'';},u=l.href,t=m('meta[property="og:title"]')||d.title||u,i=m('meta[property="og:image"]')||m('meta[name="twitter:image"]')||'',ds=(m('meta[property="og:description"]')||m('meta[name="description"]')||'').slice(0,200),sn=m('meta[property="og:site_name"]')||l.hostname,f=k('link[rel="icon"]')||k('link[rel="shortcut icon"]')||'/favicon.ico';if(f&&!/^https?:/.test(f)){try{f=new URL(f,u).href}catch(e){f=''}}var p=new URLSearchParams({url:u,title:t,image:i,desc:ds,site:sn,favicon:f});window.open(__APP_URL__+'/save?'+p.toString(),'booklage-save','width=480,height=600,scrollbars=yes')})();`

/**
 * Generate the `javascript:` URI for the AllMarks bookmarklet.
 * @param appUrl — AllMarks origin (e.g. https://booklage.pages.dev or http://localhost:3000)
 * @returns Full `javascript:...` URI ready to be placed in an `<a href>`
 */
export function generateBookmarkletUri(appUrl: string): string {
  return 'javascript:' + BOOKMARKLET_SOURCE.replace('__APP_URL__', JSON.stringify(appUrl))
}
```

- [ ] **Step 2.4: Run the tests to verify they pass**

Run: `npx vitest run lib/utils/bookmarklet.test.ts`
Expected: PASS — 17 tests total passing (11 OGP + 6 URI).

- [ ] **Step 2.5: Commit**

```bash
rtk git add lib/utils/bookmarklet.ts lib/utils/bookmarklet.test.ts
rtk git commit -m "feat(bookmarklet): generateBookmarkletUri with pure-inline javascript: URI"
```

---

## Task 3: i18n keys in `messages/ja.json`

**Files:**
- Modify: `messages/ja.json`

- [ ] **Step 3.1: Read existing `messages/ja.json` structure to find the `board` section**

Run: `grep -n '"board"' messages/ja.json | head -5`

- [ ] **Step 3.2: Add new keys under `board`**

In `messages/ja.json`, inside the existing `board` object, add these keys (merge with existing `board.sidebar`; add new `board.empty` and `board.bookmarkletModal` sections):

```json
{
  "board": {
    "sidebar": {
      "...existing keys...": "...",
      "bookmarklet": "ブックマークレット",
      "bookmarkletHint": "サイトから 1 クリックで保存"
    },
    "empty": {
      "title": "ブックマークをはじめよう",
      "description": "AllMarks は、どのサイトからでも 1 クリックで保存できるブックマークレットを使います",
      "installButton": "📌 AllMarks を設置",
      "alreadyInstalled": "既に設置済？ 別サイトで 📌 をクリック"
    },
    "bookmarkletModal": {
      "title": "ブックマークレットを設置する",
      "linkLabel": "📌 AllMarks",
      "dragInstruction": "↑ これをブラウザのブックマークバーにドラッグしてください",
      "barHint": "ブックマークバーが見えない場合:",
      "barShortcutWindows": "Windows: Ctrl + Shift + B",
      "barShortcutMac": "Mac: ⌘ + Shift + B",
      "usageTitle": "設置後の使い方",
      "usageStep1": "1. 保存したいサイトを開く",
      "usageStep2": "2. ブックマークバーの 📌 をクリック",
      "usageStep3": "3. フォルダ選択 → 保存",
      "closeLabel": "閉じる"
    }
  }
}
```

**Important:** Keep all existing `board.sidebar.*` keys intact. Only ADD `bookmarklet` and `bookmarkletHint` to it. The `empty` and `bookmarkletModal` sections are entirely new, added as siblings to the existing `sidebar`.

- [ ] **Step 3.3: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/ja.json','utf8'))" && echo OK`
Expected: `OK` (no error).

- [ ] **Step 3.4: Verify tsc stays clean**

Run: `rtk tsc --noEmit`
Expected: no errors.

- [ ] **Step 3.5: Commit**

```bash
rtk git add messages/ja.json
rtk git commit -m "i18n(bookmarklet): add sidebar + empty state + modal keys (ja only)"
```

---

## Task 4: `BookmarkletInstallModal` component

**Files:**
- Create: `components/bookmarklet/BookmarkletInstallModal.tsx`
- Create: `components/bookmarklet/BookmarkletInstallModal.module.css`
- Create: `components/bookmarklet/BookmarkletInstallModal.test.tsx`

- [ ] **Step 4.1: Write failing test — modal renders when `isOpen=true`**

Create `components/bookmarklet/BookmarkletInstallModal.test.tsx`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { BookmarkletInstallModal } from './BookmarkletInstallModal'

afterEach(cleanup)

describe('BookmarkletInstallModal', () => {
  it('renders nothing when isOpen is false', () => {
    render(<BookmarkletInstallModal isOpen={false} onClose={() => {}} appUrl="https://booklage.pages.dev" />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders dialog when isOpen is true', () => {
    render(<BookmarkletInstallModal isOpen={true} onClose={() => {}} appUrl="https://booklage.pages.dev" />)
    expect(screen.getByRole('dialog')).not.toBeNull()
  })

  it('renders draggable link with javascript: URI', () => {
    render(<BookmarkletInstallModal isOpen={true} onClose={() => {}} appUrl="https://booklage.pages.dev" />)
    const link = screen.getByTestId('bookmarklet-drag-link')
    expect(link.getAttribute('href')?.startsWith('javascript:')).toBe(true)
    expect(link.getAttribute('draggable')).toBe('true')
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<BookmarkletInstallModal isOpen={true} onClose={onClose} appUrl="https://booklage.pages.dev" />)
    fireEvent.click(screen.getByRole('button', { name: /閉じる/ }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when ESC key is pressed', () => {
    const onClose = vi.fn()
    render(<BookmarkletInstallModal isOpen={true} onClose={onClose} appUrl="https://booklage.pages.dev" />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('prevents default on link click (drag-only semantics)', () => {
    render(<BookmarkletInstallModal isOpen={true} onClose={() => {}} appUrl="https://booklage.pages.dev" />)
    const link = screen.getByTestId('bookmarklet-drag-link')
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    link.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })
})
```

- [ ] **Step 4.2: Run the test to verify it fails**

Run: `npx vitest run components/bookmarklet/BookmarkletInstallModal.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4.3: Create `BookmarkletInstallModal.module.css`**

Create `components/bookmarklet/BookmarkletInstallModal.module.css`:

```css
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 160ms ease-out;
}

.modal {
  background: var(--color-surface, #fff);
  border-radius: var(--radius-lg, 16px);
  box-shadow: var(--shadow-xl, 0 20px 60px rgba(0, 0, 0, 0.3));
  padding: 24px 28px;
  width: 480px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  position: relative;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  color: var(--color-text-primary, #1a1a1a);
}

.closeBtn {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  color: var(--color-text-secondary, #666);
}

.closeBtn:hover {
  background: var(--color-surface-hover, #f5f5f5);
}

.dragLinkWrap {
  display: flex;
  justify-content: center;
  margin: 20px 0 12px;
}

.dragLink {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--color-surface-raised, #fafafa);
  border: 1px solid var(--color-border, #e0e0e0);
  border-radius: 10px;
  padding: 12px 20px;
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text-primary, #1a1a1a);
  text-decoration: none;
  cursor: grab;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
  user-select: none;
  transition: transform 120ms ease-out, box-shadow 120ms ease-out;
}

.dragLink:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.dragLink:active {
  cursor: grabbing;
}

.dragInstruction {
  text-align: center;
  font-size: 13px;
  color: var(--color-text-secondary, #666);
  margin: 0 0 20px;
}

.divider {
  height: 1px;
  background: var(--color-border, #e0e0e0);
  margin: 20px 0;
  border: none;
}

.barHint {
  font-size: 13px;
  color: var(--color-text-secondary, #666);
  margin: 0 0 6px;
}

.shortcuts {
  font-size: 12px;
  color: var(--color-text-tertiary, #888);
  margin: 0;
  font-family: var(--font-mono, monospace);
  line-height: 1.6;
}

.usageTitle {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 8px;
  color: var(--color-text-primary, #1a1a1a);
}

.usageList {
  font-size: 13px;
  color: var(--color-text-secondary, #555);
  margin: 0;
  padding: 0;
  list-style: none;
  line-height: 1.8;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

- [ ] **Step 4.4: Implement `BookmarkletInstallModal.tsx`**

Create `components/bookmarklet/BookmarkletInstallModal.tsx`:

```typescript
'use client'

import { useEffect, useRef } from 'react'
import type { ReactElement } from 'react'
import { generateBookmarkletUri } from '@/lib/utils/bookmarklet'
import { t } from '@/lib/i18n/t'
import styles from './BookmarkletInstallModal.module.css'

type Props = {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly appUrl: string
}

export function BookmarkletInstallModal({ isOpen, onClose, appUrl }: Props): ReactElement | null {
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    closeBtnRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const uri = generateBookmarkletUri(appUrl)

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bookmarklet-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id="bookmarklet-modal-title" className={styles.title}>
            📌 {t('board.bookmarkletModal.title')}
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label={t('board.bookmarkletModal.closeLabel')}
          >
            ×
          </button>
        </div>

        <div className={styles.dragLinkWrap}>
          <a
            data-testid="bookmarklet-drag-link"
            className={styles.dragLink}
            href={uri}
            draggable="true"
            onClick={(e) => e.preventDefault()}
          >
            {t('board.bookmarkletModal.linkLabel')}
          </a>
        </div>

        <p className={styles.dragInstruction}>
          {t('board.bookmarkletModal.dragInstruction')}
        </p>

        <hr className={styles.divider} />

        <p className={styles.barHint}>{t('board.bookmarkletModal.barHint')}</p>
        <p className={styles.shortcuts}>
          {t('board.bookmarkletModal.barShortcutWindows')}<br />
          {t('board.bookmarkletModal.barShortcutMac')}
        </p>

        <hr className={styles.divider} />

        <h3 className={styles.usageTitle}>{t('board.bookmarkletModal.usageTitle')}</h3>
        <ul className={styles.usageList}>
          <li>{t('board.bookmarkletModal.usageStep1')}</li>
          <li>{t('board.bookmarkletModal.usageStep2')}</li>
          <li>{t('board.bookmarkletModal.usageStep3')}</li>
        </ul>
      </div>
    </div>
  )
}
```

- [ ] **Step 4.5: Run the tests to verify they pass**

Run: `npx vitest run components/bookmarklet/BookmarkletInstallModal.test.tsx`
Expected: PASS — 6 tests passing.

- [ ] **Step 4.6: Commit**

```bash
rtk git add components/bookmarklet/BookmarkletInstallModal.tsx components/bookmarklet/BookmarkletInstallModal.module.css components/bookmarklet/BookmarkletInstallModal.test.tsx
rtk git commit -m "feat(bookmarklet): install modal with draggable link + usage guide"
```

---

## Task 5: `BookmarkletInstall` sidebar row

**Files:**
- Create: `components/bookmarklet/BookmarkletInstall.tsx`
- Create: `components/bookmarklet/BookmarkletInstall.module.css`
- Create: `components/bookmarklet/BookmarkletInstall.test.tsx`

- [ ] **Step 5.1: Write failing test**

Create `components/bookmarklet/BookmarkletInstall.test.tsx`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { BookmarkletInstall } from './BookmarkletInstall'

afterEach(cleanup)

describe('BookmarkletInstall', () => {
  it('renders the label from i18n', () => {
    render(<BookmarkletInstall onClick={() => {}} />)
    expect(screen.getByText('ブックマークレット')).not.toBeNull()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<BookmarkletInstall onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('calls onClick when Enter is pressed', () => {
    const onClick = vi.fn()
    render(<BookmarkletInstall onClick={onClick} />)
    const btn = screen.getByRole('button')
    fireEvent.keyDown(btn, { key: 'Enter' })
    expect(onClick).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 5.2: Run the test to verify it fails**

Run: `npx vitest run components/bookmarklet/BookmarkletInstall.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 5.3: Create `BookmarkletInstall.module.css`**

Create `components/bookmarklet/BookmarkletInstall.module.css`:

```css
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: none;
  border: none;
  width: 100%;
  text-align: left;
  cursor: pointer;
  color: var(--color-text-secondary, #555);
  font-size: 13px;
  border-radius: 6px;
  transition: background 120ms ease-out;
  font-family: inherit;
}

.row:hover {
  background: var(--color-surface-hover, rgba(0, 0, 0, 0.04));
  color: var(--color-text-primary, #1a1a1a);
}

.row:focus-visible {
  outline: 2px solid var(--color-accent-primary, #7c5cfc);
  outline-offset: -2px;
}

.icon {
  font-size: 14px;
  flex-shrink: 0;
}

.label {
  flex: 1;
}

.chevron {
  font-size: 12px;
  color: var(--color-text-tertiary, #999);
}
```

- [ ] **Step 5.4: Implement `BookmarkletInstall.tsx`**

Create `components/bookmarklet/BookmarkletInstall.tsx`:

```typescript
'use client'

import type { ReactElement } from 'react'
import { t } from '@/lib/i18n/t'
import styles from './BookmarkletInstall.module.css'

type Props = {
  readonly onClick: () => void
}

export function BookmarkletInstall({ onClick }: Props): ReactElement {
  return (
    <button type="button" className={styles.row} onClick={onClick}>
      <span className={styles.icon}>📌</span>
      <span className={styles.label}>{t('board.sidebar.bookmarklet')}</span>
      <span className={styles.chevron} aria-hidden="true">→</span>
    </button>
  )
}
```

- [ ] **Step 5.5: Run the tests to verify they pass**

Run: `npx vitest run components/bookmarklet/BookmarkletInstall.test.tsx`
Expected: PASS — 3 tests passing.

- [ ] **Step 5.6: Commit**

```bash
rtk git add components/bookmarklet/BookmarkletInstall.tsx components/bookmarklet/BookmarkletInstall.module.css components/bookmarklet/BookmarkletInstall.test.tsx
rtk git commit -m "feat(bookmarklet): sidebar install row"
```

---

## Task 6: `EmptyStateWelcome` component

**Files:**
- Create: `components/bookmarklet/EmptyStateWelcome.tsx`
- Create: `components/bookmarklet/EmptyStateWelcome.module.css`
- Create: `components/bookmarklet/EmptyStateWelcome.test.tsx`

- [ ] **Step 6.1: Write failing test**

Create `components/bookmarklet/EmptyStateWelcome.test.tsx`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { EmptyStateWelcome } from './EmptyStateWelcome'

afterEach(cleanup)

describe('EmptyStateWelcome', () => {
  it('renders the title from i18n', () => {
    render(<EmptyStateWelcome onOpenModal={() => {}} />)
    expect(screen.getByText('ブックマークをはじめよう')).not.toBeNull()
  })

  it('renders description and already-installed hint', () => {
    render(<EmptyStateWelcome onOpenModal={() => {}} />)
    expect(screen.getByText(/1 クリックで保存できる/)).not.toBeNull()
    expect(screen.getByText(/既に設置済/)).not.toBeNull()
  })

  it('calls onOpenModal when install button is clicked', () => {
    const onOpenModal = vi.fn()
    render(<EmptyStateWelcome onOpenModal={onOpenModal} />)
    fireEvent.click(screen.getByRole('button', { name: /AllMarks を設置/ }))
    expect(onOpenModal).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 6.2: Run the test to verify it fails**

Run: `npx vitest run components/bookmarklet/EmptyStateWelcome.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 6.3: Create `EmptyStateWelcome.module.css`**

Create `components/bookmarklet/EmptyStateWelcome.module.css`:

```css
.wrap {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
  width: min(420px, calc(100vw - 48px));
  background: var(--color-surface, #fff);
  border-radius: var(--radius-lg, 16px);
  box-shadow: var(--shadow-lg, 0 12px 40px rgba(0, 0, 0, 0.15));
  padding: 36px 32px;
  text-align: center;
  pointer-events: auto;
}

.icon {
  font-size: 36px;
  margin-bottom: 16px;
}

.title {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 12px;
  color: var(--color-text-primary, #1a1a1a);
}

.description {
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-secondary, #555);
  margin: 0 0 24px;
}

.installBtn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: var(--color-accent-primary, #1a1a1a);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 120ms ease-out, box-shadow 120ms ease-out;
  font-family: inherit;
}

.installBtn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
}

.installBtn:active {
  transform: translateY(0);
}

.hint {
  margin: 20px 0 0;
  font-size: 12px;
  color: var(--color-text-tertiary, #888);
}
```

- [ ] **Step 6.4: Implement `EmptyStateWelcome.tsx`**

Create `components/bookmarklet/EmptyStateWelcome.tsx`:

```typescript
'use client'

import type { ReactElement } from 'react'
import { t } from '@/lib/i18n/t'
import styles from './EmptyStateWelcome.module.css'

type Props = {
  readonly onOpenModal: () => void
}

export function EmptyStateWelcome({ onOpenModal }: Props): ReactElement {
  return (
    <div className={styles.wrap} data-testid="empty-state-welcome">
      <div className={styles.icon}>📌</div>
      <h2 className={styles.title}>{t('board.empty.title')}</h2>
      <p className={styles.description}>{t('board.empty.description')}</p>
      <button type="button" className={styles.installBtn} onClick={onOpenModal}>
        {t('board.empty.installButton')}
      </button>
      <p className={styles.hint}>{t('board.empty.alreadyInstalled')}</p>
    </div>
  )
}
```

- [ ] **Step 6.5: Run the tests to verify they pass**

Run: `npx vitest run components/bookmarklet/EmptyStateWelcome.test.tsx`
Expected: PASS — 3 tests passing.

- [ ] **Step 6.6: Commit**

```bash
rtk git add components/bookmarklet/EmptyStateWelcome.tsx components/bookmarklet/EmptyStateWelcome.module.css components/bookmarklet/EmptyStateWelcome.test.tsx
rtk git commit -m "feat(bookmarklet): empty state welcome card"
```

---

## Task 7: Wire Sidebar — add `BookmarkletInstall` row

**Files:**
- Modify: `components/board/Sidebar.tsx`

- [ ] **Step 7.1: Read the current `Sidebar.tsx` to confirm insertion point**

Run: `grep -n "foldersHeader\|navItem\|sectionHeader" components/board/Sidebar.tsx`

Confirm the order: Library items (all/unread/read) → Folders sectionHeader → foldersPlaceholder.

- [ ] **Step 7.2: Add `onOpenBookmarkletModal` to Props and render `BookmarkletInstall` between Library and Folders**

Edit `components/board/Sidebar.tsx`:

1. Add import at the top of the file (after existing imports):

```typescript
import { BookmarkletInstall } from '@/components/bookmarklet/BookmarkletInstall'
```

2. Add `onOpenBookmarkletModal` to the `Props` type:

```typescript
type Props = {
  readonly collapsed: boolean
  readonly onToggle: () => void
  readonly counts: {
    readonly all: number
    readonly unread: number
    readonly read: number
  }
  readonly onThemeClick: () => void
  readonly onOpenBookmarkletModal: () => void
}
```

3. Destructure the new prop in the function signature:

```typescript
export function Sidebar({ collapsed, onToggle, counts, onThemeClick, onOpenBookmarkletModal }: Props): ReactElement {
```

4. Insert `<BookmarkletInstall onClick={onOpenBookmarkletModal} />` between the last Library `navItem` (`.read`) and the Folders `sectionHeader`:

Find this block:
```tsx
          <button type="button" className={styles.navItem}>
            <span className={styles.navLabel}>{t('board.sidebar.read')}</span>
            <span className={styles.navCount}>{counts.read}</span>
          </button>

          {/* Folders (placeholder) */}
          <div className={styles.sectionHeader}>{t('board.sidebar.foldersHeader')}</div>
```

Replace with:
```tsx
          <button type="button" className={styles.navItem}>
            <span className={styles.navLabel}>{t('board.sidebar.read')}</span>
            <span className={styles.navCount}>{counts.read}</span>
          </button>

          {/* Bookmarklet install entry point */}
          <BookmarkletInstall onClick={onOpenBookmarkletModal} />

          {/* Folders (placeholder) */}
          <div className={styles.sectionHeader}>{t('board.sidebar.foldersHeader')}</div>
```

- [ ] **Step 7.3: Verify tsc is clean**

Run: `rtk tsc --noEmit`
Expected: BoardRoot will now error with "Property 'onOpenBookmarkletModal' is missing". That's expected — it gets fixed in Task 8. Leave it for now.

Actually, tsc will fail here. To keep commits passing-at-HEAD, also fix BoardRoot in this task by adding a placeholder callback.

Skip that — instead, make `onOpenBookmarkletModal` optional with a default in this task to keep tsc green, then make it required in Task 8.

Revise Step 7.2 to use optional prop:

```typescript
  readonly onOpenBookmarkletModal?: () => void
```

And in the JSX default the handler:

```tsx
          <BookmarkletInstall onClick={onOpenBookmarkletModal ?? (() => {})} />
```

Now re-run:
```
rtk tsc --noEmit
```
Expected: clean.

- [ ] **Step 7.4: Commit**

```bash
rtk git add components/board/Sidebar.tsx
rtk git commit -m "feat(bookmarklet): mount install row in sidebar between Library and Folders"
```

---

## Task 8: Wire `BoardRoot` — state + Modal + EmptyStateWelcome

**Files:**
- Modify: `components/board/BoardRoot.tsx`

- [ ] **Step 8.1: Read relevant sections of `BoardRoot.tsx`**

Run: `grep -n "Sidebar\|useBoardData\|useState\|return (" components/board/BoardRoot.tsx | head -30`

Find where `<Sidebar ...>` is rendered and where top-level state hooks live.

- [ ] **Step 8.2: Add imports**

Near the top of `components/board/BoardRoot.tsx`, add:

```typescript
import { BookmarkletInstallModal } from '@/components/bookmarklet/BookmarkletInstallModal'
import { EmptyStateWelcome } from '@/components/bookmarklet/EmptyStateWelcome'
```

- [ ] **Step 8.3: Add state for modal open/closed**

Inside the `BoardRoot` function component, alongside other `useState` calls, add:

```typescript
const [bookmarkletModalOpen, setBookmarkletModalOpen] = useState(false)
```

- [ ] **Step 8.4: Destructure `loading` from `useBoardData`**

Find this line:
```typescript
const { items, persistSizePreset, persistOrderBatch, persistMeasuredAspect } = useBoardData()
```

Replace with:
```typescript
const { items, loading, persistSizePreset, persistOrderBatch, persistMeasuredAspect } = useBoardData()
```

- [ ] **Step 8.5: Pass `onOpenBookmarkletModal` to `Sidebar`**

Find the `<Sidebar ... />` render. Add the prop:

```tsx
<Sidebar
  // ... existing props
  onOpenBookmarkletModal={() => setBookmarkletModalOpen(true)}
/>
```

- [ ] **Step 8.6: Mount `BookmarkletInstallModal` and conditional `EmptyStateWelcome`**

At the top level of BoardRoot's returned JSX (alongside `<Sidebar>`, `<ThemeLayer>`, etc.), add:

```tsx
<BookmarkletInstallModal
  isOpen={bookmarkletModalOpen}
  onClose={() => setBookmarkletModalOpen(false)}
  appUrl={typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL ?? 'https://booklage.pages.dev')}
/>
{!loading && items.length === 0 && (
  <EmptyStateWelcome onOpenModal={() => setBookmarkletModalOpen(true)} />
)}
```

Place them inside the same outer wrapper `<div>` where `<Sidebar>` lives. The exact position is after all existing board layer children but before the closing outer tag.

- [ ] **Step 8.7: Verify tsc is clean**

Run: `rtk tsc --noEmit`
Expected: clean.

- [ ] **Step 8.8: Run all unit tests**

Run: `npx vitest run`
Expected: all previous tests still pass + new tests pass.

- [ ] **Step 8.9: Manual smoke test (local dev)**

Run in background: `rtk pnpm dev`
Open browser to `http://localhost:3000/board` and verify:

- If Board has 0 cards → EmptyStateWelcome appears centered with install button
- Clicking the install button → BookmarkletInstallModal opens
- Clicking ⇤ sidebar toggle shows "ブックマークレット" row between Library and Folders sections
- Clicking the "ブックマークレット" sidebar row → BookmarkletInstallModal opens
- ESC key closes modal
- × button closes modal
- Clicking outside modal (on overlay) closes it

Stop the dev server.

- [ ] **Step 8.10: Commit**

```bash
rtk git add components/board/BoardRoot.tsx
rtk git commit -m "feat(bookmarklet): BoardRoot wires modal + empty state + sidebar entry"
```

---

## Task 9: Playwright E2E — `/save` fixture param flow

**Files:**
- Create: `tests/e2e/bookmarklet-save.spec.ts`

- [ ] **Step 9.1: Write the E2E test**

Create `tests/e2e/bookmarklet-save.spec.ts`:

```typescript
import { test, expect, type Page } from '@playwright/test'

const DB_NAME = 'booklage-db'
const DB_VERSION = 8

async function clearDb(page: Page): Promise<void> {
  await page.evaluate(
    async ({ dbName, dbVersion }) => {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion)
        const timer = window.setTimeout(() => reject(new Error('clearDb open timeout')), 10_000)
        req.onsuccess = () => {
          window.clearTimeout(timer)
          const db = req.result
          const tx = db.transaction(['bookmarks', 'cards', 'folders'], 'readwrite')
          tx.objectStore('bookmarks').clear()
          tx.objectStore('cards').clear()
          tx.objectStore('folders').clear()
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(new Error('clear tx error'))
        }
        req.onerror = () => reject(new Error('open error'))
      })
    },
    { dbName: DB_NAME, dbVersion: DB_VERSION },
  )
}

async function countBookmarks(page: Page): Promise<number> {
  return page.evaluate(
    async ({ dbName, dbVersion }) => {
      return new Promise<number>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction('bookmarks', 'readonly')
          const count = tx.objectStore('bookmarks').count()
          count.onsuccess = () => {
            db.close()
            resolve(count.result)
          }
          count.onerror = () => reject(new Error('count error'))
        }
        req.onerror = () => reject(new Error('open error'))
      })
    },
    { dbName: DB_NAME, dbVersion: DB_VERSION },
  )
}

test.describe('Bookmarklet /save flow', () => {
  test('saves a bookmark via URL params and persists to IDB', async ({ page }) => {
    // Visit the board once to initialize IDB at v8
    await page.goto('/board')
    await page.waitForLoadState('networkidle')
    await clearDb(page)

    // Open /save with fixture OGP params
    const params = new URLSearchParams({
      url: 'https://example.com/article',
      title: 'Example Article',
      image: 'https://example.com/og.png',
      desc: 'Sample description',
      site: 'Example',
      favicon: 'https://example.com/favicon.ico',
    })
    await page.goto(`/save?${params.toString()}`)

    // Preview should show title + site
    await expect(page.getByText('Example Article')).toBeVisible()
    await expect(page.getByText('Example')).toBeVisible()

    // Default folder 'My Collage' gets auto-created; wait for it
    await expect(page.getByText('My Collage')).toBeVisible({ timeout: 5000 })

    // Click save
    await page.getByRole('button', { name: '保存する' }).click()

    // Success state
    await expect(page.getByText('保存しました！')).toBeVisible({ timeout: 5000 })

    // Verify IDB persistence
    const count = await countBookmarks(page)
    expect(count).toBe(1)
  })

  test('shows instructions when opened without url param', async ({ page }) => {
    await page.goto('/save')
    await expect(page.getByText('このページはブックマークレットから開いてください')).toBeVisible()
  })
})
```

- [ ] **Step 9.2: Run Playwright test**

Run: `npx playwright test tests/e2e/bookmarklet-save.spec.ts`
Expected: 2 tests pass.

If `pnpm dev` is not running, Playwright config will start it automatically (see `webServer` in `playwright.config.ts`).

- [ ] **Step 9.3: Run full unit test suite to confirm nothing regressed**

Run: `rtk vitest run`
Expected: all tests pass (17 new + existing 139+ = 156+).

- [ ] **Step 9.4: Commit**

```bash
rtk git add tests/e2e/bookmarklet-save.spec.ts
rtk git commit -m "test(e2e): bookmarklet /save flow — fixture params persist to IDB"
```

---

## Task 10: Deploy checklist

**Files:**
- Modify: `public/sw.js`
- Modify: `docs/TODO.md`

- [ ] **Step 10.1: Bump service worker cache version**

Open `public/sw.js`, find the existing `CACHE_VERSION` constant (currently `v8-2026-04-21-b-embeds-media-load-retries` or similar), and change it to:

```javascript
const CACHE_VERSION = 'v9-2026-04-21-bookmarklet-revival'
```

- [ ] **Step 10.2: Run full pre-deploy checks**

Run in sequence:
```bash
rtk tsc --noEmit
rtk vitest run
npx playwright test
rtk pnpm build
```

Expected: all pass, build succeeds, `out/` directory contains static assets.

- [ ] **Step 10.3: Deploy to Cloudflare Pages**

Run:
```bash
npx wrangler pages deploy out/ --project-name=booklage --branch=master --commit-dirty=true
```

Expected: deploy success message with URL.

- [ ] **Step 10.4: Verify on production**

Open `https://booklage.pages.dev/board` with Ctrl+Shift+R (hard reload).

Smoke-check:
- Sidebar shows "📌 ブックマークレット" row between Library and Folders
- If Board is empty → welcome card shows with install button
- Clicking either entry point → modal opens with draggable 📌 AllMarks link
- Drag the 📌 AllMarks link to the browser bookmark bar → it appears as "AllMarks" bookmark
- Navigate to any other site and click the bookmark bar 📌 → `/save` popup opens (480×600 window)
- Select folder → Save → popup auto-closes after 1.5s
- Return to AllMarks `/board` → new card appears (via BroadcastChannel auto-refresh)

- [ ] **Step 10.5: Update `docs/TODO.md`**

Update the "現在の状態" section of `docs/TODO.md` to reflect bookmarklet revival shipped. Add notes about:
- Remaining polish items (UI liquid glass / animations / install guide illustration)
- Manual verification matrix for user (seven URL types from spec §5-3)
- Next sprint candidate: C (Multi-playback)

Exact copy is up to the engineer; keep the format consistent with the existing TODO.md structure.

- [ ] **Step 10.6: Commit TODO + cache version**

```bash
rtk git add public/sw.js docs/TODO.md
rtk git commit -m "chore(deploy): bookmarklet revival v9 + TODO update"
rtk git push
```

---

## Self-Review Checklist (for plan author)

- [x] **Spec coverage**: every spec section has a task
  - §1 bookmarklet JS URI → Task 2
  - §2-1 sidebar row → Task 5 + wiring Task 7
  - §2-2 modal → Task 4 + wiring Task 8
  - §2-3 empty state → Task 6 + wiring Task 8
  - §3 BoardRoot/Sidebar integration → Tasks 7, 8
  - §4 i18n → Task 3
  - §5-1 unit tests → Task 1, 2
  - §5-2 E2E → Task 9
  - §5-3 manual verification → Task 10 Step 10.4
  - §7 deploy → Task 10
- [x] **No placeholders**: every step has concrete code or commands
- [x] **Type consistency**: `OgpData` fields, component Props names (`onClick`, `onOpenModal`, `onOpenBookmarkletModal`) stay consistent across tasks
- [x] **Test runner**: `npx vitest run` for unit; `npx playwright test` for E2E
- [x] **Load order**: Task 3 (i18n keys) comes before Task 4-6 (components that use `t()`)
- [x] **Build-stable intermediate commits**: Task 7 makes `onOpenBookmarkletModal` optional to keep tsc green before Task 8 wires BoardRoot

---

## Execution handoff

**Total tasks:** 10  
**Estimated commits:** 10+  
**Total new files:** 10  
**Modified files:** 4

After saving this plan, offer the user:

> Plan complete and saved. Two execution options:
>
> 1. **Subagent-Driven (recommended)** — dispatch fresh subagent per task, review between tasks
> 2. **Inline Execution** — execute tasks in this session with checkpoints
>
> Which approach?
