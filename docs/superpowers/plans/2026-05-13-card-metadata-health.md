# Card Metadata Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** カードを 「通常 / 薄い / 消えた」 の 3 状態モデルで管理し、 相対パス og:image bug を恒久 fix、 リンク切れ自動検出 + フィルタ、 そして Lightbox close 中の wheel 暴発を抑止する。

**Architecture:** scraper 4 経路 (Worker / extension / bookmarklet / inline copy) で共通 URL 解決ヘルパーを共有し、 og:image / favicon / twitter:image を一律で絶対化。 IDB v13 → v14 で `linkStatus` + `lastCheckedAt` を additive 追加 (破壊的 migration なし)。 viewport 入場 + 経年 30 日でバックグラウンド再 scrape、 404/410 で `linkStatus='gone'`。 UI は `BoardFilter` に `'dead'` を増やすことで mood システムと衝突せず 「リンク切れだけ表示」 を実現。

**Tech Stack:** TypeScript strict / Next.js App Router / IndexedDB via `idb` / vitest / playwright (E2E) / GSAP (Lightbox tween) / Cloudflare Pages Functions

**Spec:** [docs/superpowers/specs/2026-05-13-card-metadata-health-design.md](../specs/2026-05-13-card-metadata-health-design.md)

---

## File Structure

**新規作成**:
- `lib/utils/url-resolve.ts` — 共通 URL 解決ヘルパー (相対→絶対)
- `tests/lib/url-resolve.test.ts` — 上記の unit test
- `lib/storage/backfill-relative-thumbnails.ts` — 起動時 1 回限りの旧データ修正
- `tests/lib/backfill-relative-thumbnails.test.ts`
- `lib/board/revalidate.ts` — viewport-driven revalidation engine
- `tests/lib/revalidate.test.ts`
- `components/board/cards/RefetchButton.tsx` — 再取得ボタン
- `components/board/cards/RefetchButton.module.css`
- `components/board/cards/MinimalCard.tsx` — 薄いカード variant
- `components/board/cards/MinimalCard.module.css`
- `tests/lib/idb-v14-link-status.test.ts` — schema migration テスト

**修正**:
- `lib/constants.ts` — DB_VERSION 13 → 14
- `lib/storage/indexeddb.ts` — `BookmarkRecord` に `linkStatus?` / `lastCheckedAt?` 追加、 v14 no-op migration、 `updateBookmarkHealth` helper、 同 backfill helper
- `lib/storage/use-board-data.ts` — `BoardItem` に新フィールド露出、 `persistLinkStatus` callback、 起動時に backfill を呼ぶ
- `lib/utils/bookmarklet.ts` — `extractOgpFromDocument` と inline `BOOKMARKLET_SOURCE` で og:image 絶対化
- `functions/api/ogp.ts` — Worker 経路で og:image 絶対化
- `extension/lib/ogp.js` — extension 経路で og:image 絶対化
- `extension/lib/dispatch.js` — inline コピーで og:image 絶対化
- `components/board/Lightbox.tsx` — wheel / arrow handler に `closingRef.current` ガード
- `components/board/cards/index.ts` — `pickCard` を 3 状態判定に拡張
- `components/board/cards/ImageCard.tsx` — `<img onError>` で 薄い fallback へ降格
- `lib/board/types.ts` — `BoardFilter` に `'dead'` 追加
- `lib/board/filter.ts` — `'dead'` フィルタ実装
- `components/board/CardsLayer` の wrapper (該当ファイル内) — `data-link-status` 属性付与

---

## Task 1: 共通 URL 解決ヘルパー

og:image / favicon / 任意 path の相対→絶対化を 1 関数に集約。 scraper 4 経路全てで使う。

**Files:**
- Create: `lib/utils/url-resolve.ts`
- Create: `tests/lib/url-resolve.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/lib/url-resolve.test.ts
import { describe, it, expect } from 'vitest'
import { resolveMaybeRelative } from '@/lib/utils/url-resolve'

describe('resolveMaybeRelative', () => {
  const base = 'https://labs.noomoagency.com/'

  it('returns absolute URL unchanged', () => {
    expect(resolveMaybeRelative('https://cdn.example.com/img.jpg', base))
      .toBe('https://cdn.example.com/img.jpg')
  })

  it('promotes protocol-relative URL to https', () => {
    expect(resolveMaybeRelative('//cdn.example.com/img.jpg', base))
      .toBe('https://cdn.example.com/img.jpg')
  })

  it('resolves root-relative path against base origin', () => {
    expect(resolveMaybeRelative('/OpenGraph.jpg', base))
      .toBe('https://labs.noomoagency.com/OpenGraph.jpg')
  })

  it('resolves relative path against base URL directory', () => {
    expect(resolveMaybeRelative('og.jpg', 'https://example.com/blog/post/'))
      .toBe('https://example.com/blog/post/og.jpg')
  })

  it('returns empty string for empty input', () => {
    expect(resolveMaybeRelative('', base)).toBe('')
  })

  it('returns empty string when input cannot be parsed', () => {
    expect(resolveMaybeRelative('not a url at all', 'invalid')).toBe('')
  })
})
```

- [ ] **Step 2: Run tests, verify all FAIL**

Run: `rtk pnpm vitest run tests/lib/url-resolve.test.ts`
Expected: 6 test failures (module not found)

- [ ] **Step 3: Implement helper**

```ts
// lib/utils/url-resolve.ts
/**
 * Resolve a possibly-relative URL against a base URL.
 *
 * - Absolute http(s) URL → returned as-is.
 * - Protocol-relative (//cdn.example.com/...) → prefixed with https:.
 * - Root-relative (/foo/bar) or path-relative (foo.jpg) → resolved via
 *   the URL constructor against baseUrl.
 * - Empty input or unparseable → empty string (caller decides fallback).
 *
 * Used by all OGP scrapers (Worker, extension, bookmarklet, inline copy)
 * for og:image / twitter:image / favicon so relative paths in 3rd-party
 * pages become loadable absolute URLs in our IndexedDB.
 */
export function resolveMaybeRelative(href: string, baseUrl: string): string {
  if (!href) return ''
  if (/^https?:\/\//i.test(href)) return href
  if (href.startsWith('//')) return `https:${href}`
  try {
    return new URL(href, baseUrl).href
  } catch {
    return ''
  }
}
```

- [ ] **Step 4: Run tests, verify all PASS**

Run: `rtk pnpm vitest run tests/lib/url-resolve.test.ts`
Expected: 6 passing tests

- [ ] **Step 5: Commit**

```bash
git add lib/utils/url-resolve.ts tests/lib/url-resolve.test.ts
rtk git commit -m "feat(scraper): add resolveMaybeRelative URL helper for relative-path OGP resolution"
```

---

## Task 2: Worker scraper の og:image 絶対化

`/api/ogp` で og:image / twitter:image を絶対 URL に解決する。

**Files:**
- Modify: `functions/api/ogp.ts:97-105`

- [ ] **Step 1: Update Worker scraper**

`functions/api/ogp.ts` の `extractMeta` 直後と onRequest 内の `data` 構築箇所を修正。 既存の `extractFavicon` も `resolveMaybeRelative` に置き換える。

```ts
// functions/api/ogp.ts 先頭の import セクション (相対 import — Cloudflare Pages Functions は @ alias 非対応)
// もしくはコピー実装 (Worker は self-contained が安全)。
// 以下のように resolveMaybeRelative を local 定義する:

function resolveMaybeRelative(href: string, baseUrl: string): string {
  if (!href) return ''
  if (/^https?:\/\//i.test(href)) return href
  if (href.startsWith('//')) return `https:${href}`
  try {
    return new URL(href, baseUrl).href
  } catch {
    return ''
  }
}
```

そして `extractFavicon` を以下に置き換え:

```ts
function extractFavicon(html: string, baseUrl: string): string {
  const match = html.match(
    /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']*)["']/i,
  )
  const raw = match?.[1] ?? `${new URL(baseUrl).origin}/favicon.ico`
  return resolveMaybeRelative(raw, baseUrl) || `${new URL(baseUrl).origin}/favicon.ico`
}
```

`onRequest` の `data` を以下に修正:

```ts
const rawImage = extractMeta(html, 'og:image') || extractMeta(html, 'twitter:image')
const data = {
  title: extractMeta(html, 'og:title') || extractTitle(html),
  description:
    extractMeta(html, 'og:description') || extractMeta(html, 'description'),
  image: resolveMaybeRelative(rawImage, url),
  siteName: extractMeta(html, 'og:site_name'),
  favicon: extractFavicon(html, url),
  url,
}
```

- [ ] **Step 2: Verify build still passes**

Run: `rtk pnpm tsc --noEmit`
Expected: no new errors in `functions/api/ogp.ts`

- [ ] **Step 3: Commit**

```bash
git add functions/api/ogp.ts
rtk git commit -m "fix(scraper): resolve relative og:image to absolute URL in Worker scraper"
```

---

## Task 3: Extension + bookmarklet 経路の og:image 絶対化

extension 経路と bookmarklet 経路は document の `location` を直接持つので解決が簡単。 ただし inline コピーが 3 箇所 (`extension/lib/ogp.js`, `extension/lib/dispatch.js` の inline、 `lib/utils/bookmarklet.ts` の `BOOKMARKLET_SOURCE`) あるので 4 箇所まとめて修正。

**Files:**
- Modify: `lib/utils/bookmarklet.ts:10-35` (extractOgpFromDocument)
- Modify: `lib/utils/bookmarklet.ts:68` (BOOKMARKLET_SOURCE)
- Modify: `extension/lib/ogp.js`
- Modify: `extension/lib/dispatch.js:33-49` (inline copy)

- [ ] **Step 1: Update extractOgpFromDocument**

`lib/utils/bookmarklet.ts` 先頭付近に import 追加:

```ts
import { resolveMaybeRelative } from './url-resolve'
```

`extractOgpFromDocument` を以下に修正 (image / favicon の両方を `resolveMaybeRelative` 経由に):

```ts
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
  const rawImage = meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]') || ''
  const image = resolveMaybeRelative(rawImage, url)
  const description = (meta('meta[property="og:description"]') || meta('meta[name="description"]') || '').slice(0, 200)
  const siteName = meta('meta[property="og:site_name"]') || doc.location.hostname
  const rawFavicon = link('link[rel="icon"]') || link('link[rel="shortcut icon"]') || '/favicon.ico'
  const favicon = resolveMaybeRelative(rawFavicon, url)

  return { title, image, description, siteName, favicon, url }
}
```

- [ ] **Step 2: Update BOOKMARKLET_SOURCE inline IIFE**

`lib/utils/bookmarklet.ts:68` の `BOOKMARKLET_SOURCE` を修正。 inline は ES5-safe + minified 形式なので、 image 解決ロジックを 1 行で書き加える:

```ts
const BOOKMARKLET_SOURCE = `(function(){var d=document,l=location,m=function(s){var e=d.querySelector(s);return e?e.getAttribute('content')||'':'';},k=function(s){var e=d.querySelector(s);return e?e.getAttribute('href')||'':'';},r=function(h,b){if(!h)return'';if(/^https?:\\/\\//i.test(h))return h;if(h.indexOf('//')===0)return'https:'+h;try{return new URL(h,b).href}catch(e){return''}},u=l.href,t=m('meta[property="og:title"]')||d.title||u,i=r(m('meta[property="og:image"]')||m('meta[name="twitter:image"]')||'',u),ds=(m('meta[property="og:description"]')||m('meta[name="description"]')||'').slice(0,200),sn=m('meta[property="og:site_name"]')||l.hostname,f=r(k('link[rel="icon"]')||k('link[rel="shortcut icon"]')||'/favicon.ico',u);if(d.documentElement&&d.documentElement.dataset&&d.documentElement.dataset.booklageExtension==='1'){var nc='b'+Date.now()+Math.random().toString(36).slice(2,7);window.postMessage({type:'booklage:save-via-extension',ogp:{url:u,title:t,image:i,description:ds,siteName:sn,favicon:f},nonce:nc},'*');return}var p=new URLSearchParams({url:u,title:t,image:i,desc:ds,site:sn,favicon:f}),W=200,H=160;window.open('__APP_URL__/save?'+p.toString(),'booklage-save','width='+W+',height='+H+',left='+Math.max(0,screen.availWidth-W-20)+',top='+Math.max(0,screen.availHeight-H-20)+',toolbar=0,menubar=0,location=0,status=0,resizable=0,scrollbars=0');var h=d.createElement('div');h.style.cssText='all:initial;position:fixed;top:16px;right:16px;z-index:2147483647';d.body.appendChild(h);var sh=h.attachShadow?h.attachShadow({mode:'closed'}):h,P=d.createElement('div');P.style.cssText='padding:10px 16px;border-radius:20px;background:rgba(18,18,22,.92);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.1);box-shadow:0 8px 24px rgba(0,0,0,.32);font:500 13px system-ui,sans-serif;color:rgba(255,255,255,.94);opacity:0;transition:opacity .2s';P.textContent='AllMarks に保存中…';sh.appendChild(P);setTimeout(function(){P.style.opacity='1'},20);setTimeout(function(){P.textContent='AllMarks に保存しました ✓'},500);setTimeout(function(){P.style.opacity='0'},2200);setTimeout(function(){try{d.body.removeChild(h)}catch(e){}},2500)})();`
```

変更点: `r` 関数を追加 (resolver)、 `i=r(...,u)`、 `f=r(...,u)` に変更。

- [ ] **Step 3: Update extension/lib/ogp.js**

```js
// extension/lib/ogp.js
export function extractOgp() {
  const m = (s) => { const e = document.querySelector(s); return e ? e.getAttribute('content') || '' : '' }
  const k = (s) => { const e = document.querySelector(s); return e ? e.getAttribute('href') || '' : '' }
  const r = (h, b) => {
    if (!h) return ''
    if (/^https?:\/\//i.test(h)) return h
    if (h.startsWith('//')) return `https:${h}`
    try { return new URL(h, b).href } catch { return '' }
  }
  const url = location.href
  const title = m('meta[property="og:title"]') || document.title || url
  const image = r(m('meta[property="og:image"]') || m('meta[name="twitter:image"]') || '', url)
  const description = (m('meta[property="og:description"]') || m('meta[name="description"]') || '').slice(0, 200)
  const siteName = m('meta[property="og:site_name"]') || location.hostname
  const favicon = r(k('link[rel="icon"]') || k('link[rel="shortcut icon"]') || '/favicon.ico', url)
  return { url, title, image, description, siteName, favicon }
}
```

- [ ] **Step 4: Update extension/lib/dispatch.js inline copy**

`extension/lib/dispatch.js:33-49` の `chrome.scripting.executeScript({func: ()=>{...}})` 内側関数を以下に置換:

```js
func: () => {
  const m = (s) => { const e = document.querySelector(s); return e ? e.getAttribute('content') || '' : '' }
  const k = (s) => { const e = document.querySelector(s); return e ? e.getAttribute('href') || '' : '' }
  const r = (h, b) => {
    if (!h) return ''
    if (/^https?:\/\//i.test(h)) return h
    if (h.startsWith('//')) return `https:${h}`
    try { return new URL(h, b).href } catch { return '' }
  }
  const url = location.href
  const title = m('meta[property="og:title"]') || document.title || url
  const image = r(m('meta[property="og:image"]') || m('meta[name="twitter:image"]') || '', url)
  const description = (m('meta[property="og:description"]') || m('meta[name="description"]') || '').slice(0, 200)
  const siteName = m('meta[property="og:site_name"]') || location.hostname
  const favicon = r(k('link[rel="icon"]') || k('link[rel="shortcut icon"]') || '/favicon.ico', url)
  return { url, title, image, description, siteName, favicon }
},
```

- [ ] **Step 5: Run existing extension tests, verify no regression**

Run: `rtk pnpm vitest run tests/extension/ogp-extract.test.ts tests/lib/bookmarklet.test.ts`
Expected: all pass. Adapt expected fixtures if any contains relative URLs that should now resolve.

- [ ] **Step 6: Commit**

```bash
git add lib/utils/bookmarklet.ts extension/lib/ogp.js extension/lib/dispatch.js
rtk git commit -m "fix(scraper): resolve relative og:image/favicon to absolute in extension + bookmarklet paths"
```

---

## Task 4: Lightbox close 中の wheel / arrow ガード

close tween (~500ms) 中に wheel / arrow event を nav.onNav へ転送しないよう closingRef を見る。

**Files:**
- Modify: `components/board/Lightbox.tsx:529-557` (arrow handler)
- Modify: `components/board/Lightbox.tsx:564-580` (wheel handler)
- Create test: `tests/e2e/lightbox-close-wheel-guard.spec.ts`

- [ ] **Step 1: Write E2E test (will fail)**

```ts
// tests/e2e/lightbox-close-wheel-guard.spec.ts
import { test, expect } from '@playwright/test'

test('Lightbox close → immediate wheel does not navigate', async ({ page }) => {
  await page.goto('http://localhost:3000/board')
  // Seed: ensure at least 3 image cards exist (test env / dev fixture)
  await page.waitForSelector('[data-bookmark-id]')
  // Open the first card lightbox
  await page.locator('[data-bookmark-id]').first().click()
  await page.waitForSelector('.lightbox-frame, [class*="frame"]', { state: 'visible' })
  // Read current card id from the lightbox text/url
  const beforeUrl = await page.locator('[class*="lightbox"]').getAttribute('data-current-id')

  // Click close (✕) and IMMEDIATELY wheel
  await page.locator('[aria-label*="閉じる"], [aria-label*="close"]').first().click()
  await page.mouse.wheel(120, 0) // horizontal wheel right after close
  await page.waitForTimeout(800) // wait for close tween to finish

  // The lightbox should be gone AND no new card should have opened
  await expect(page.locator('[class*="lightbox"]')).toHaveCount(0)
})
```

注: `data-current-id` 等の属性が無ければ test 側で URL/視覚で代替 assertion。 まず failing で確認、 実装後に attribute 補完を検討。

- [ ] **Step 2: Run E2E test, verify it FAILS or detects current buggy behavior**

Run: `rtk pnpm playwright test tests/e2e/lightbox-close-wheel-guard.spec.ts`
Expected: FAIL (Lightbox stays mounted because wheel triggered nav).

- [ ] **Step 3: Add closingRef guard to wheel handler**

`components/board/Lightbox.tsx:564-580` を以下に修正:

```ts
const wheelLockUntilRef = useRef<number>(0)
useEffect(() => {
  if (!identity || !nav) return
  const onWheel = (e: WheelEvent): void => {
    // Skip while a close tween is in progress: the user has committed to
    // dismissing this lightbox, so any wheel they fire in the next ~500ms
    // is residual scroll intent for the board, not nav within the
    // lightbox. Without this guard the wheel handler would invoke
    // nav.onNav() and a flash of next/prev card animation slips in.
    if (closingRef.current) return
    const dx = e.deltaX
    const dy = e.deltaY
    const dominant = Math.abs(dx) > Math.abs(dy) ? dx : dy
    if (Math.abs(dominant) < 18) return
    const now = performance.now()
    if (now < wheelLockUntilRef.current) return
    wheelLockUntilRef.current = now + 280
    e.preventDefault()
    nav.onNav(dominant > 0 ? 1 : -1)
  }
  window.addEventListener('wheel', onWheel, { passive: false })
  return (): void => window.removeEventListener('wheel', onWheel)
}, [identity, nav])
```

- [ ] **Step 4: Add closingRef guard to arrow key handler**

`components/board/Lightbox.tsx:529-557` の arrow listener も同様に修正。 既存 onKey の先頭で:

```ts
const onKey = (e: KeyboardEvent): void => {
  if (closingRef.current) return  // ← 新規追加
  const ae = document.activeElement
  // ... 既存処理
}
```

Esc handler 側 ([Lightbox.tsx:514-524](components/board/Lightbox.tsx#L514-L524)) は `requestClose()` 内で既に `closingRef.current` を見て二重発火を防いでいるので追加不要。

- [ ] **Step 5: Run E2E test, verify it PASSES**

Run: `rtk pnpm playwright test tests/e2e/lightbox-close-wheel-guard.spec.ts`
Expected: PASS.

- [ ] **Step 6: Run full vitest + tsc**

Run: `rtk pnpm tsc --noEmit && rtk pnpm vitest run`
Expected: no new failures.

- [ ] **Step 7: Commit**

```bash
git add components/board/Lightbox.tsx tests/e2e/lightbox-close-wheel-guard.spec.ts
rtk git commit -m "fix(lightbox): suppress wheel/arrow nav during close tween — stops phantom next-card flash"
```

---

## Task 5: IDB v13 → v14 (linkStatus + lastCheckedAt)

`BookmarkRecord` に optional field を 2 つ追加し、 schema version を bump。 既存 record は無変更で読み書き可能 (v11/v12/v13 と同じ no-op bump パターン)。

**Files:**
- Modify: `lib/constants.ts:21`
- Modify: `lib/storage/indexeddb.ts:16-83` (BookmarkRecord), 561-568 (upgrade comment + no-op)
- Create test: `tests/lib/idb-v14-link-status.test.ts`

- [ ] **Step 1: Write failing migration test**

```ts
// tests/lib/idb-v14-link-status.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { openDB } from 'idb'
import { initDB } from '@/lib/storage/indexeddb'
import { DB_NAME, DB_VERSION } from '@/lib/constants'

describe('IDB v14 migration', () => {
  beforeEach(async () => {
    const databases = await indexedDB.databases()
    for (const dbInfo of databases) {
      if (dbInfo.name) indexedDB.deleteDatabase(dbInfo.name)
    }
  })

  it('bumps DB_VERSION to 14', () => {
    expect(DB_VERSION).toBe(14)
  })

  it('opens cleanly on cold start', async () => {
    const db = await initDB()
    expect(db.version).toBe(14)
    db.close()
  })

  it('upgrades v13 → v14 preserving existing bookmarks', async () => {
    // Seed v13 first
    const v13 = await openDB(DB_NAME, 13, {
      upgrade(db) {
        db.createObjectStore('bookmarks', { keyPath: 'id' })
        db.createObjectStore('moods', { keyPath: 'id' })
        db.createObjectStore('cards', { keyPath: 'id' })
        db.createObjectStore('settings', { keyPath: 'key' })
        db.createObjectStore('preferences', { keyPath: 'key' })
      },
    })
    await v13.put('bookmarks', {
      id: 'b1',
      url: 'https://example.com',
      title: 't',
      description: '',
      thumbnail: '',
      favicon: '',
      siteName: '',
      type: 'website',
      savedAt: new Date().toISOString(),
      ogpStatus: 'fetched',
      tags: [],
    })
    v13.close()

    // Now open at v14 — should migrate cleanly
    const v14 = await initDB()
    const rec = await v14.get('bookmarks', 'b1')
    expect(rec).toBeDefined()
    expect(rec?.id).toBe('b1')
    // linkStatus and lastCheckedAt should be undefined on legacy records
    expect((rec as any).linkStatus).toBeUndefined()
    expect((rec as any).lastCheckedAt).toBeUndefined()
    v14.close()
  })

  it('persists linkStatus and lastCheckedAt on new write', async () => {
    const db = await initDB()
    await db.put('bookmarks', {
      id: 'b2',
      url: 'https://example.com/dead',
      title: 'dead',
      description: '', thumbnail: '', favicon: '', siteName: '',
      type: 'website',
      savedAt: new Date().toISOString(),
      ogpStatus: 'fetched',
      tags: [],
      linkStatus: 'gone',
      lastCheckedAt: 1715000000000,
    })
    const back = await db.get('bookmarks', 'b2')
    expect((back as any).linkStatus).toBe('gone')
    expect((back as any).lastCheckedAt).toBe(1715000000000)
    db.close()
  })
})
```

- [ ] **Step 2: Run test, verify failure**

Run: `rtk pnpm vitest run tests/lib/idb-v14-link-status.test.ts`
Expected: FAIL because DB_VERSION is still 13.

- [ ] **Step 3: Bump DB_VERSION**

`lib/constants.ts:21` を `export const DB_VERSION = 14` に変更。

- [ ] **Step 4: Add fields and no-op upgrade**

`lib/storage/indexeddb.ts` の `BookmarkRecord` (line 16-83 付近) の最後に追加:

```ts
  /** v14: リンク健全性ステータス。 undefined = 'unknown'。
   *  viewport-driven revalidation で 404/410/接続失敗 を検出すると 'gone' に変わる。
   *  再取得ボタン or 全件再 check で 'alive' に戻ることもある。 */
  linkStatus?: 'alive' | 'gone' | 'unknown'
  /** v14: 最後に link 健全性を再 scrape した Unix ms。 undefined = 未チェック。
   *  viewport 入場時に Date.now() - lastCheckedAt > 30 日なら再 check 候補。 */
  lastCheckedAt?: number
```

`lib/storage/indexeddb.ts:563-568` の v12 → v13 の no-op 説明の直後に追記:

```ts
      // ── v13 → v14: introduce optional linkStatus + lastCheckedAt fields on
      // bookmarks (no-op rewrite). Existing rows have both fields undefined,
      // which the read path treats as 'unknown'/never-checked — no cursor
      // sweep needed. Bumping the schema version still serves as a tripwire
      // so future migrations can assume the fields are observable when
      // oldVersion >= 14.
```

- [ ] **Step 5: Run test, verify PASS**

Run: `rtk pnpm vitest run tests/lib/idb-v14-link-status.test.ts`
Expected: 4 passing tests.

- [ ] **Step 6: Run full IDB regression**

Run: `rtk pnpm vitest run tests/lib/idb-v9-migration.test.ts tests/lib/idb-v10-migration.test.ts tests/lib/idb-v11-custom-card-width.test.ts tests/lib/idb-v13-media-slots.test.ts`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add lib/constants.ts lib/storage/indexeddb.ts tests/lib/idb-v14-link-status.test.ts
rtk git commit -m "feat(idb): bump v14 schema with optional linkStatus + lastCheckedAt fields"
```

---

## Task 6: 既存相対 thumbnail backfill

過去に scraper 経路で相対 og:image が IDB に書き込まれた record を起動時 1 回だけ修正する cleanup migration。

**Files:**
- Create: `lib/storage/backfill-relative-thumbnails.ts`
- Create: `tests/lib/backfill-relative-thumbnails.test.ts`
- Modify: `lib/storage/use-board-data.ts:181-204` (起動 useEffect 内で呼び出し)

- [ ] **Step 1: Write failing test**

```ts
// tests/lib/backfill-relative-thumbnails.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { initDB } from '@/lib/storage/indexeddb'
import { backfillRelativeThumbnails } from '@/lib/storage/backfill-relative-thumbnails'

describe('backfillRelativeThumbnails', () => {
  beforeEach(async () => {
    const dbs = await indexedDB.databases()
    for (const d of dbs) if (d.name) indexedDB.deleteDatabase(d.name)
  })

  it('rewrites /relative.jpg to absolute against bookmark URL origin', async () => {
    const db = await initDB()
    await db.put('bookmarks', {
      id: 'b1',
      url: 'https://labs.noomoagency.com/foo',
      title: 'Noomo', description: '',
      thumbnail: '/OpenGraph.jpg', // ← relative
      favicon: '', siteName: '', type: 'website',
      savedAt: new Date().toISOString(), ogpStatus: 'fetched', tags: [],
    })
    const fixed = await backfillRelativeThumbnails(db)
    expect(fixed).toBe(1)
    const rec = await db.get('bookmarks', 'b1')
    expect(rec?.thumbnail).toBe('https://labs.noomoagency.com/OpenGraph.jpg')
    db.close()
  })

  it('leaves absolute thumbnails unchanged', async () => {
    const db = await initDB()
    await db.put('bookmarks', {
      id: 'b2',
      url: 'https://example.com/',
      title: '', description: '',
      thumbnail: 'https://cdn.example.com/img.jpg',
      favicon: '', siteName: '', type: 'website',
      savedAt: new Date().toISOString(), ogpStatus: 'fetched', tags: [],
    })
    const fixed = await backfillRelativeThumbnails(db)
    expect(fixed).toBe(0)
    const rec = await db.get('bookmarks', 'b2')
    expect(rec?.thumbnail).toBe('https://cdn.example.com/img.jpg')
    db.close()
  })

  it('leaves empty thumbnails unchanged', async () => {
    const db = await initDB()
    await db.put('bookmarks', {
      id: 'b3',
      url: 'https://example.com/',
      title: 'no-thumb', description: '',
      thumbnail: '', favicon: '', siteName: '', type: 'website',
      savedAt: new Date().toISOString(), ogpStatus: 'fetched', tags: [],
    })
    const fixed = await backfillRelativeThumbnails(db)
    expect(fixed).toBe(0)
    db.close()
  })

  it('handles protocol-relative //cdn/img.jpg', async () => {
    const db = await initDB()
    await db.put('bookmarks', {
      id: 'b4',
      url: 'https://example.com/page',
      title: '', description: '',
      thumbnail: '//cdn.example.com/img.jpg',
      favicon: '', siteName: '', type: 'website',
      savedAt: new Date().toISOString(), ogpStatus: 'fetched', tags: [],
    })
    const fixed = await backfillRelativeThumbnails(db)
    expect(fixed).toBe(1)
    const rec = await db.get('bookmarks', 'b4')
    expect(rec?.thumbnail).toBe('https://cdn.example.com/img.jpg')
    db.close()
  })
})
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `rtk pnpm vitest run tests/lib/backfill-relative-thumbnails.test.ts`
Expected: 4 failures (module not found).

- [ ] **Step 3: Implement backfill**

```ts
// lib/storage/backfill-relative-thumbnails.ts
import type { IDBPDatabase } from 'idb'
import { resolveMaybeRelative } from '@/lib/utils/url-resolve'

/**
 * Walk all bookmarks once, fixing any thumbnail field that starts with '/' or
 * '//' by resolving it against the bookmark's own URL. Called once on board
 * startup to heal records saved before scraper paths were patched to do
 * relative-URL resolution. Idempotent — subsequent calls find no work to do.
 *
 * @returns number of records actually rewritten
 */
export async function backfillRelativeThumbnails(db: IDBPDatabase<unknown>): Promise<number> {
  let fixed = 0
  const tx = db.transaction('bookmarks', 'readwrite')
  const store = tx.objectStore('bookmarks')
  let cursor = await store.openCursor()
  while (cursor) {
    const rec = cursor.value as { thumbnail?: string; url?: string }
    const thumb = rec.thumbnail ?? ''
    if (thumb && (thumb.startsWith('/') || thumb.startsWith('./')) && rec.url) {
      const absolute = resolveMaybeRelative(thumb, rec.url)
      if (absolute && absolute !== thumb) {
        await cursor.update({ ...rec, thumbnail: absolute })
        fixed++
      }
    }
    cursor = await cursor.continue()
  }
  await tx.done
  return fixed
}
```

- [ ] **Step 4: Run test, verify PASS**

Run: `rtk pnpm vitest run tests/lib/backfill-relative-thumbnails.test.ts`
Expected: 4 passing.

- [ ] **Step 5: Wire into board startup**

`lib/storage/use-board-data.ts:181-204` の useEffect、 `initDB()` の直後に追加:

```ts
useEffect(() => {
  let cancelled = false
  ;(async (): Promise<void> => {
    const db = (await initDB()) as unknown as DbLike
    if (cancelled) return
    dbRef.current = db
    // One-shot cleanup: rewrite legacy relative thumbnails to absolute.
    // Idempotent and cheap when there's nothing to fix.
    try {
      const { backfillRelativeThumbnails } = await import('./backfill-relative-thumbnails')
      const n = await backfillRelativeThumbnails(db as Parameters<typeof backfillRelativeThumbnails>[0])
      if (n > 0) console.info('[booklage] healed', n, 'relative thumbnails')
    } catch (e) {
      console.warn('[booklage] backfill failed (non-fatal):', e)
    }
    if (cancelled) return
    const bookmarks = await getAllBookmarks(db as Parameters<typeof getAllBookmarks>[0])
    // ... 既存処理
  })()
  // ...
}, [])
```

- [ ] **Step 6: Run full test suite + tsc**

Run: `rtk pnpm tsc --noEmit && rtk pnpm vitest run`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add lib/storage/backfill-relative-thumbnails.ts tests/lib/backfill-relative-thumbnails.test.ts lib/storage/use-board-data.ts
rtk git commit -m "feat(idb): startup backfill heals legacy relative thumbnails to absolute"
```

---

## Task 7: viewport-driven revalidation engine

カード が viewport に入ったタイミングで `/api/ogp` を叩いて linkStatus を更新する。 並列度 3、 30 日以上経過した record のみが対象、 短時間でスクロール通過したカードは debounce で除外。

**Files:**
- Create: `lib/board/revalidate.ts`
- Create: `tests/lib/revalidate.test.ts`
- Modify: `lib/storage/indexeddb.ts` (add `updateBookmarkHealth` helper)
- Modify: `lib/storage/use-board-data.ts` (expose `persistLinkStatus`)
- Modify: `components/board/BoardRoot.tsx` (wire IntersectionObserver) — 該当ファイルを Read で先に確認、 既存 observer 流用可

- [ ] **Step 1: Write failing test for revalidation queue logic**

```ts
// tests/lib/revalidate.test.ts
import { describe, it, expect, vi } from 'vitest'
import { shouldRevalidate, RevalidationQueue } from '@/lib/board/revalidate'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

describe('shouldRevalidate', () => {
  it('returns true for never-checked', () => {
    expect(shouldRevalidate(undefined, Date.now())).toBe(true)
  })

  it('returns true if last check > 30 days ago', () => {
    const old = Date.now() - THIRTY_DAYS_MS - 1000
    expect(shouldRevalidate(old, Date.now())).toBe(true)
  })

  it('returns false for fresh check', () => {
    expect(shouldRevalidate(Date.now() - 1000, Date.now())).toBe(false)
  })

  it('returns false if last check exactly at 30 day boundary', () => {
    const exact = Date.now() - THIRTY_DAYS_MS + 1000
    expect(shouldRevalidate(exact, Date.now())).toBe(false)
  })
})

describe('RevalidationQueue', () => {
  it('limits concurrent fetches to 3', async () => {
    const fetchMock = vi.fn(() =>
      new Promise((resolve) => setTimeout(() => resolve({ status: 200, data: {} }), 50)),
    )
    const queue = new RevalidationQueue({ fetcher: fetchMock as never, maxConcurrent: 3 })
    queue.enqueue('b1', 'https://example.com/1')
    queue.enqueue('b2', 'https://example.com/2')
    queue.enqueue('b3', 'https://example.com/3')
    queue.enqueue('b4', 'https://example.com/4')
    // After enqueue, only 3 should be in flight
    await new Promise((r) => setTimeout(r, 10))
    expect(fetchMock).toHaveBeenCalledTimes(3)
    // After 60 ms, the 4th should be picked up
    await new Promise((r) => setTimeout(r, 60))
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('deduplicates same-id enqueues', () => {
    const fetchMock = vi.fn(() => new Promise(() => {}))
    const queue = new RevalidationQueue({ fetcher: fetchMock as never, maxConcurrent: 3 })
    queue.enqueue('b1', 'https://example.com/1')
    queue.enqueue('b1', 'https://example.com/1')
    queue.enqueue('b1', 'https://example.com/1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `rtk pnpm vitest run tests/lib/revalidate.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement RevalidationQueue**

```ts
// lib/board/revalidate.ts
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

/** Decide whether a bookmark is due for revalidation based on its
 *  lastCheckedAt timestamp. undefined / null = never checked = due. */
export function shouldRevalidate(lastCheckedAt: number | undefined, now: number): boolean {
  if (lastCheckedAt == null) return true
  return now - lastCheckedAt > THIRTY_DAYS_MS
}

export type RevalidationResult =
  | { kind: 'alive'; data: { title?: string; image?: string; description?: string; favicon?: string; siteName?: string } }
  | { kind: 'gone' }
  | { kind: 'unknown' /* transient failure — do not change status */ }

export type Fetcher = (url: string) => Promise<RevalidationResult>

/** Default fetcher that hits our /api/ogp endpoint. 404 / 410 = gone.
 *  5xx / network error / 403 = unknown (transient — try again later). */
export const defaultFetcher: Fetcher = async (url) => {
  try {
    const res = await fetch(`/api/ogp?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(10_000) })
    if (res.status === 404 || res.status === 410) return { kind: 'gone' }
    if (!res.ok) return { kind: 'unknown' }
    const data = await res.json()
    if (data?.error) return { kind: 'unknown' }
    return { kind: 'alive', data }
  } catch {
    return { kind: 'unknown' }
  }
}

type QueueOptions = {
  readonly fetcher: Fetcher
  readonly maxConcurrent?: number
  readonly onResult?: (bookmarkId: string, result: RevalidationResult) => void
}

/** Bounded-concurrency queue for revalidation fetches.
 *  - dedup by bookmarkId (no double-fetch of the same item)
 *  - maxConcurrent = 3 by default (browser-friendly)
 *  - results dispatched via onResult callback */
export class RevalidationQueue {
  private inFlight = new Set<string>()
  private pending: Array<{ id: string; url: string }> = []
  private readonly fetcher: Fetcher
  private readonly maxConcurrent: number
  private readonly onResult?: QueueOptions['onResult']

  constructor(opts: QueueOptions) {
    this.fetcher = opts.fetcher
    this.maxConcurrent = opts.maxConcurrent ?? 3
    this.onResult = opts.onResult
  }

  enqueue(id: string, url: string): void {
    if (this.inFlight.has(id)) return
    if (this.pending.some((p) => p.id === id)) return
    this.pending.push({ id, url })
    this.pump()
  }

  private pump(): void {
    while (this.inFlight.size < this.maxConcurrent && this.pending.length > 0) {
      const next = this.pending.shift()
      if (!next) break
      this.inFlight.add(next.id)
      void this.fetcher(next.url)
        .then((r) => this.onResult?.(next.id, r))
        .catch(() => this.onResult?.(next.id, { kind: 'unknown' }))
        .finally(() => {
          this.inFlight.delete(next.id)
          this.pump()
        })
    }
  }
}
```

- [ ] **Step 4: Run test, verify PASS**

Run: `rtk pnpm vitest run tests/lib/revalidate.test.ts`
Expected: 6 passing.

- [ ] **Step 5: Add updateBookmarkHealth helper to indexeddb.ts**

`lib/storage/indexeddb.ts` 末尾の bookmark CRUD ヘルパー群の隣に追加:

```ts
/** Patch a bookmark's link health status + lastCheckedAt timestamp.
 *  Used by the viewport-driven revalidation engine and the manual
 *  refetch button. No-op when the bookmark does not exist. */
export async function updateBookmarkHealth(
  db: IDBPDatabase<AllMarksDB>,
  bookmarkId: string,
  patch: { linkStatus?: 'alive' | 'gone' | 'unknown'; lastCheckedAt?: number },
): Promise<void> {
  const existing = await db.get('bookmarks', bookmarkId)
  if (!existing) return
  await db.put('bookmarks', { ...existing, ...patch })
}
```

- [ ] **Step 6: Expose persistLinkStatus from use-board-data**

`lib/storage/use-board-data.ts` の hook return 型に追加:

```ts
persistLinkStatus: (bookmarkId: string, status: 'alive' | 'gone' | 'unknown', lastCheckedAt: number) => Promise<void>
```

実装:

```ts
const persistLinkStatus = useCallback(
  async (bookmarkId: string, status: 'alive' | 'gone' | 'unknown', lastCheckedAt: number): Promise<void> => {
    const db = dbRef.current
    if (!db || !bookmarkId) return
    setItems((prev) =>
      prev.map((it) => (it.bookmarkId === bookmarkId ? { ...it, linkStatus: status, lastCheckedAt } : it)),
    )
    const { updateBookmarkHealth } = await import('./indexeddb')
    await updateBookmarkHealth(db as Parameters<typeof updateBookmarkHealth>[0], bookmarkId, {
      linkStatus: status,
      lastCheckedAt,
    })
  },
  [],
)
```

`BoardItem` 型にも `readonly linkStatus?: 'alive' | 'gone' | 'unknown'` と `readonly lastCheckedAt?: number` を追加し、 `toItem` 内で `b.linkStatus`, `b.lastCheckedAt` を引き写す。

- [ ] **Step 7: Wire viewport observer in BoardRoot**

`components/board/BoardRoot.tsx` を Read で確認し、 既存の IntersectionObserver があれば流用、 なければ専用 observer を 1 つ追加。 概略:

```ts
// BoardRoot.tsx 内、 items が ready 後
const queueRef = useRef<RevalidationQueue | null>(null)
useEffect(() => {
  if (!items.length) return
  queueRef.current = new RevalidationQueue({
    fetcher: defaultFetcher,
    onResult: (id, r) => {
      const now = Date.now()
      if (r.kind === 'alive') {
        void persistLinkStatus(id, 'alive', now)
        // Optional: heal title/thumbnail too if changed
      } else if (r.kind === 'gone') {
        void persistLinkStatus(id, 'gone', now)
      }
      // unknown → do nothing, leave lastCheckedAt as-is so we retry next time
    },
  })

  const observer = new IntersectionObserver((entries) => {
    const now = Date.now()
    for (const e of entries) {
      if (!e.isIntersecting) continue
      const id = (e.target as HTMLElement).dataset.bookmarkId
      if (!id) continue
      const item = items.find((it) => it.bookmarkId === id)
      if (!item) continue
      if (shouldRevalidate(item.lastCheckedAt, now)) {
        queueRef.current?.enqueue(id, item.url)
      }
    }
  }, { rootMargin: '200px' })

  for (const it of items) {
    const el = document.querySelector(`[data-bookmark-id="${it.bookmarkId}"]`)
    if (el) observer.observe(el)
  }
  return () => observer.disconnect()
}, [items, persistLinkStatus])
```

注: BoardRoot.tsx に既存 observer (PiP presence 等) があれば干渉しないことを確認。

- [ ] **Step 8: Run full test suite + tsc**

Run: `rtk pnpm tsc --noEmit && rtk pnpm vitest run`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add lib/board/revalidate.ts tests/lib/revalidate.test.ts lib/storage/indexeddb.ts lib/storage/use-board-data.ts components/board/BoardRoot.tsx
rtk git commit -m "feat(health): viewport-driven revalidation engine with linkStatus persistence"
```

---

## Task 8: ImageCard `<img onError>` fallback

サムネ URL が 404 / blocked の場合に空白カードのままにせず、 即座に薄い fallback 表示に切り替える。 これだけで viewport revalidation 待ちなしに UX が改善する。

**Files:**
- Modify: `components/board/cards/ImageCard.tsx:93-144` (render section)
- Modify: `components/board/cards/ImageCard.module.css` (新規 fallback state CSS)

- [ ] **Step 1: Add state + onError handler to ImageCard**

```ts
// ImageCard.tsx の関数本体内、 既存の state 群と並べて
const [hasError, setHasError] = useState(false)

const handleImgError = useCallback((): void => {
  setHasError(true)
}, [])
```

- [ ] **Step 2: Wire onError on every `<img>` and conditionally render fallback**

`ImageCard.tsx` の return JSX を以下に修正:

```tsx
return (
  <div
    ref={cardRef}
    className={`${styles.imageCard} ${hasError ? styles.imageCardFallback : ''}`}
    onPointerMove={handlePointerMove}
    onPointerLeave={handlePointerLeave}
  >
    {hasError ? (
      <FallbackBody url={item.url} title={item.title} />
    ) : slots.length > 0 ? (
      slots.map((slot, i) => (
        <img
          key={slot.url}
          ref={i === 0 ? imgRef : undefined}
          className={thumbClass}
          src={slot.url}
          alt={item.title}
          draggable={false}
          loading="lazy"
          data-active={i === imageIdx ? 'true' : undefined}
          onError={handleImgError}
        />
      ))
    ) : (
      item.thumbnail && (
        <img
          ref={imgRef}
          className={thumbClass}
          src={item.thumbnail}
          alt={item.title}
          draggable={false}
          loading="lazy"
          data-active="true"
          onError={handleImgError}
        />
      )
    )}
    {/* ...existing reel tint + multi-image dots... */}
  </div>
)
```

`FallbackBody` は Task 9 で MinimalCard に切り出すので、 一時的に inline で大 favicon + hostname を出す簡易実装で OK:

```tsx
function FallbackBody({ url, title }: { url: string; title: string }): ReactNode {
  const hostname = hostnameFromUrl(url)
  const favicon = hostname ? getFaviconUrl(hostname) : null
  return (
    <div className={styles.fallback}>
      {favicon && <img src={favicon} alt="" className={styles.fallbackFavicon} />}
      <div className={styles.fallbackDomain}>{hostname}</div>
      {title && title !== url && <div className={styles.fallbackTitle}>{title}</div>}
    </div>
  )
}
```

`getFaviconUrl` / `hostnameFromUrl` は既存 `lib/embed/favicon.ts` から import。

- [ ] **Step 3: Add fallback CSS**

`components/board/cards/ImageCard.module.css` に追加:

```css
.fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  height: 100%;
  padding: 24px 16px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: inherit;
}
.fallbackFavicon {
  width: 56px;
  height: 56px;
  object-fit: contain;
  border-radius: 12px;
}
.fallbackDomain {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.72);
  font-weight: 500;
  text-align: center;
  word-break: break-all;
}
.fallbackTitle {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
```

- [ ] **Step 4: Visual smoke test**

`rtk pnpm dev` 起動 → 既知の broken thumbnail を持つカードを board に追加 (例: `https://labs.noomoagency.com/` をブクマレットで保存して再 deploy 前の状態) → カードが大 favicon + ドメイン名で表示されることを確認。

- [ ] **Step 5: Run full test suite + tsc**

Run: `rtk pnpm tsc --noEmit && rtk pnpm vitest run`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add components/board/cards/ImageCard.tsx components/board/cards/ImageCard.module.css
rtk git commit -m "feat(cards): ImageCard onError fallback shows big favicon + hostname instead of blank box"
```

---

## Task 9: MinimalCard variant + pickCard routing 整理

Task 8 の inline FallbackBody を専用 component `MinimalCard` に切り出し、 `pickCard` の routing を 「title も thumbnail もない」 ケースで MinimalCard へ向ける。

**Files:**
- Create: `components/board/cards/MinimalCard.tsx`
- Create: `components/board/cards/MinimalCard.module.css`
- Modify: `components/board/cards/index.ts` (pickCard)
- Modify: `components/board/cards/ImageCard.tsx` (FallbackBody → MinimalCard 再利用)

- [ ] **Step 1: Create MinimalCard component**

```tsx
// components/board/cards/MinimalCard.tsx
'use client'

import type { ReactNode } from 'react'
import type { BoardItem } from '@/lib/storage/use-board-data'
import { getFaviconUrl, hostnameFromUrl } from '@/lib/embed/favicon'
import styles from './MinimalCard.module.css'

type Props = {
  readonly item: BoardItem
}

/** "薄い" カード — title も thumbnail も取れなかった場合の 「読めるカード」 表示。
 *  大きい favicon + ドメイン名を主体に、 短い path も控えめに添える。
 *  Instagram (bot ブロック) / CodePen full / メタタグ不在ページが該当。 */
export function MinimalCard({ item }: Props): ReactNode {
  const hostname = hostnameFromUrl(item.url)
  const favicon = hostname ? getFaviconUrl(hostname) : null
  let path = ''
  try {
    const u = new URL(item.url)
    path = u.pathname === '/' ? '' : u.pathname
  } catch { /* keep '' */ }

  return (
    <div className={styles.minimalCard}>
      {favicon && (
        <img src={favicon} alt="" className={styles.favicon} draggable={false} />
      )}
      <div className={styles.domain}>{hostname || item.url}</div>
      {path && <div className={styles.path}>{path}</div>}
    </div>
  )
}
```

- [ ] **Step 2: CSS**

```css
/* components/board/cards/MinimalCard.module.css */
.minimalCard {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  width: 100%;
  height: 100%;
  padding: 28px 18px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: inherit;
  text-align: center;
}
.favicon {
  width: 64px;
  height: 64px;
  object-fit: contain;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
  padding: 6px;
}
.domain {
  font-size: 15px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.82);
  word-break: break-all;
  line-height: 1.3;
}
.path {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.42);
  word-break: break-all;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
```

- [ ] **Step 3: Wire pickCard routing**

`components/board/cards/index.ts` を以下に修正:

```ts
import type { ComponentType } from 'react'
import type { BoardItem } from '@/lib/storage/use-board-data'
import type { DisplayMode } from '@/lib/board/types'
import { detectUrlType } from '@/lib/utils/url'
import { VideoThumbCard } from './VideoThumbCard'
import { ImageCard } from './ImageCard'
import { TextCard } from './TextCard'
import { MinimalCard } from './MinimalCard'

export { VideoThumbCard, ImageCard, TextCard, MinimalCard }

export type CardComponentProps = {
  readonly item: BoardItem
  readonly persistMeasuredAspect?: (cardId: string, aspectRatio: number) => Promise<void>
  readonly reportIntrinsicHeight?: (cardId: string, heightPx: number) => void
  readonly cardWidth?: number
  readonly cardHeight?: number
  readonly displayMode: DisplayMode
}

export type CardComponent = ComponentType<CardComponentProps>

/** Determine whether a bookmark has any usable metadata for a "real" card.
 *  Returns false when title is empty/equals-url AND thumbnail is empty. */
function hasUsableMetadata(item: BoardItem): boolean {
  const hasTitle = !!item.title && item.title !== item.url
  const hasThumb = !!item.thumbnail
  return hasTitle || hasThumb
}

export function pickCard(item: BoardItem): CardComponent {
  const type = detectUrlType(item.url)
  if (type === 'youtube' || type === 'tiktok') return VideoThumbCard
  if (!hasUsableMetadata(item)) return MinimalCard
  return item.thumbnail ? ImageCard : TextCard
}
```

- [ ] **Step 4: Simplify ImageCard fallback to reuse MinimalCard**

`components/board/cards/ImageCard.tsx` の inline `FallbackBody` を削除し、 hasError 時に MinimalCard を render:

```tsx
import { MinimalCard } from './MinimalCard'
// ...
{hasError ? <MinimalCard item={item} /> : /* ...img tree... */}
```

Task 8 で追加した `.fallback*` CSS は不要になるので削除。

- [ ] **Step 5: Add pickCard test**

```ts
// tests/lib/pick-card.test.ts (or extend existing if present)
import { describe, it, expect } from 'vitest'
import { pickCard, VideoThumbCard, ImageCard, TextCard, MinimalCard } from '@/components/board/cards'

const base = {
  bookmarkId: 'b', cardId: 'c', url: 'https://example.com/foo',
  aspectRatio: 1, gridIndex: 0, orderIndex: 0,
  cardWidth: 240, customCardWidth: false,
  isRead: false, isDeleted: false, tags: [], displayMode: null,
} as const

describe('pickCard', () => {
  it('returns MinimalCard when title and thumbnail are both empty', () => {
    expect(pickCard({ ...base, title: '', thumbnail: '' } as never)).toBe(MinimalCard)
  })

  it('returns MinimalCard when title equals url and thumbnail empty', () => {
    expect(pickCard({ ...base, title: base.url, thumbnail: '' } as never)).toBe(MinimalCard)
  })

  it('returns ImageCard when thumbnail present (even if title empty)', () => {
    expect(pickCard({ ...base, title: '', thumbnail: 'https://cdn/x.jpg' } as never)).toBe(ImageCard)
  })

  it('returns TextCard when title present but no thumbnail', () => {
    expect(pickCard({ ...base, title: 'Hello', thumbnail: '' } as never)).toBe(TextCard)
  })

  it('returns VideoThumbCard for youtube URLs regardless of metadata', () => {
    expect(pickCard({ ...base, url: 'https://youtube.com/watch?v=x', title: '', thumbnail: '' } as never)).toBe(VideoThumbCard)
  })
})
```

- [ ] **Step 6: Run tests, verify PASS**

Run: `rtk pnpm vitest run tests/lib/pick-card.test.ts`
Expected: 5 passing.

- [ ] **Step 7: Run full test suite + tsc**

Run: `rtk pnpm tsc --noEmit && rtk pnpm vitest run`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add components/board/cards/MinimalCard.tsx components/board/cards/MinimalCard.module.css components/board/cards/index.ts components/board/cards/ImageCard.tsx tests/lib/pick-card.test.ts
rtk git commit -m "feat(cards): MinimalCard for 薄い state — large favicon + hostname when metadata is empty"
```

---

## Task 10: 再取得ボタン

各カード hover で右上に出現する 「↻」 ボタン。 押すと age 制限無視で即 `/api/ogp` を叩く。

**Files:**
- Create: `components/board/cards/RefetchButton.tsx`
- Create: `components/board/cards/RefetchButton.module.css`
- Modify: 該当の card wrapper (CardsLayer 内の各 card の wrap) で RefetchButton を含める

- [ ] **Step 1: Create RefetchButton**

```tsx
// components/board/cards/RefetchButton.tsx
'use client'

import { useState, type MouseEvent, type ReactNode } from 'react'
import styles from './RefetchButton.module.css'

type Props = {
  readonly bookmarkId: string
  readonly url: string
  readonly onRevalidate: (bookmarkId: string, url: string) => Promise<void>
}

/** Hover-revealed refetch action. Bypasses the 30-day age guard — user
 *  intent overrides the natural revalidation cadence. Click animates the
 *  icon (spin during fetch → checkmark on success → fade out). */
export function RefetchButton({ bookmarkId, url, onRevalidate }: Props): ReactNode {
  const [state, setState] = useState<'idle' | 'fetching' | 'done'>('idle')

  const handleClick = async (e: MouseEvent<HTMLButtonElement>): Promise<void> => {
    e.preventDefault()
    e.stopPropagation()
    setState('fetching')
    try {
      await onRevalidate(bookmarkId, url)
      setState('done')
      setTimeout(() => setState('idle'), 1200)
    } catch {
      setState('idle')
    }
  }

  return (
    <button
      type="button"
      className={`${styles.button} ${styles[state]}`}
      onClick={handleClick}
      aria-label="サムネを再取得"
      data-state={state}
    >
      {state === 'done' ? '✓' : '↻'}
    </button>
  )
}
```

- [ ] **Step 2: CSS (32×32 touch target per memory `feedback_large_pointer`)**

```css
/* components/board/cards/RefetchButton.module.css */
.button {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 50%;
  color: rgba(255, 255, 255, 0.92);
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.18s ease;
  z-index: 4;
}
[data-card-hover='true'] .button {
  opacity: 1;
}
.button:hover {
  background: rgba(0, 0, 0, 0.78);
}
.button.fetching {
  animation: spin 1s linear infinite;
  opacity: 1;
}
.button.done {
  background: rgba(40, 180, 80, 0.75);
  opacity: 1;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
```

- [ ] **Step 3: Wire into card wrapper**

`components/board/CardsLayer` 関連ファイル (BoardRoot 経由で render される component) を確認し、 各 card の outer wrapper 内に RefetchButton を追加。 `onRevalidate` は BoardRoot から prop で渡す。 BoardRoot 内で:

```ts
const revalidate = useCallback(async (bookmarkId: string, url: string): Promise<void> => {
  const r = await defaultFetcher(url)
  const now = Date.now()
  if (r.kind === 'gone') await persistLinkStatus(bookmarkId, 'gone', now)
  else if (r.kind === 'alive') {
    await persistLinkStatus(bookmarkId, 'alive', now)
    if (r.data?.image) await persistThumbnail(bookmarkId, r.data.image, true)
    // optionally update title/description here too
  }
  // unknown → leave as-is
}, [persistLinkStatus, persistThumbnail])
```

Wrapper の `data-card-hover='true'` を pointer enter / leave で切り替える既存仕組みがあれば流用、 なければ CSS `:hover` で代替。

- [ ] **Step 4: Manual smoke test**

`rtk pnpm dev` 起動 → 既存の薄いカードに hover → ↻ 出現 → クリック → spin → 成功でチェック ✓ → idle に戻る。

- [ ] **Step 5: Run full tsc + tests**

Run: `rtk pnpm tsc --noEmit && rtk pnpm vitest run`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add components/board/cards/RefetchButton.tsx components/board/cards/RefetchButton.module.css components/board/BoardRoot.tsx
rtk git commit -m "feat(cards): hover refetch button — bypasses 30-day age guard for manual revalidation"
```

---

## Task 11: BoardFilter `'dead'` + gone カード見た目

`BoardFilter` 型に `'dead'` を追加し、 filter UI に 「リンク切れ N 件」 を表示。 gone カードは視覚的に降格 (グレー + 削除しやすい)。

**Files:**
- Modify: `lib/board/types.ts:78`
- Modify: `lib/board/filter.ts`
- Create test: `tests/lib/filter-dead.test.ts`
- Modify: filter picker UI (component 場所は要確認 — TopHeader / FolderNav)
- Modify: card wrapper 内で `data-link-status` 属性付与 + CSS で gone state スタイル

- [ ] **Step 1: Extend BoardFilter type**

`lib/board/types.ts:78` を以下に変更:

```ts
export type BoardFilter = 'all' | 'inbox' | 'archive' | 'dead' | `mood:${string}`
```

- [ ] **Step 2: Write failing test for filter logic**

```ts
// tests/lib/filter-dead.test.ts
import { describe, it, expect } from 'vitest'
import { applyFilter } from '@/lib/board/filter'

const make = (id: string, opts: { linkStatus?: 'alive' | 'gone' | 'unknown'; isDeleted?: boolean }) =>
  ({
    bookmarkId: id, cardId: id, url: '', title: '',
    aspectRatio: 1, gridIndex: 0, orderIndex: 0,
    cardWidth: 240, customCardWidth: false,
    isRead: false, isDeleted: !!opts.isDeleted,
    tags: [], displayMode: null,
    linkStatus: opts.linkStatus,
  } as never)

describe("applyFilter 'dead'", () => {
  it('returns only items with linkStatus = gone, excluding archived', () => {
    const items = [
      make('a', { linkStatus: 'alive' }),
      make('b', { linkStatus: 'gone' }),
      make('c', { linkStatus: 'gone', isDeleted: true }),
      make('d', { linkStatus: 'unknown' }),
      make('e', {}),
    ]
    const out = applyFilter(items, 'dead')
    expect(out.map((x) => x.bookmarkId)).toEqual(['b'])
  })

  it('returns empty array when no gone items exist', () => {
    const items = [make('a', { linkStatus: 'alive' }), make('b', {})]
    expect(applyFilter(items, 'dead')).toEqual([])
  })
})
```

- [ ] **Step 3: Run test, verify FAIL**

Run: `rtk pnpm vitest run tests/lib/filter-dead.test.ts`
Expected: FAIL (filter doesn't handle 'dead').

- [ ] **Step 4: Implement filter branch**

`lib/board/filter.ts` を以下に修正:

```ts
import type { BoardItem } from '@/lib/storage/use-board-data'
import type { BoardFilter } from './types'

export function applyFilter(items: ReadonlyArray<BoardItem>, filter: BoardFilter): BoardItem[] {
  if (filter === 'all') {
    return items.filter((it) => !it.isDeleted)
  }
  if (filter === 'inbox') {
    return items.filter((it) => !it.isDeleted && it.tags.length === 0)
  }
  if (filter === 'archive') {
    return items.filter((it) => it.isDeleted)
  }
  if (filter === 'dead') {
    return items.filter((it) => !it.isDeleted && it.linkStatus === 'gone')
  }
  // template literal: `mood:${id}`
  const moodId = filter.slice(5)
  return items.filter((it) => !it.isDeleted && it.tags.includes(moodId))
}
```

- [ ] **Step 5: Run test, verify PASS**

Run: `rtk pnpm vitest run tests/lib/filter-dead.test.ts`
Expected: 2 passing.

- [ ] **Step 6: Surface "リンク切れ" in filter UI**

filter picker component を Grep で特定 (キー word: `BoardFilter` import, `activeFilter`)。 mood リストの直下に 「リンク切れ N 件」 を system filter として追加。 count は `items.filter(it => it.linkStatus === 'gone' && !it.isDeleted).length`。

```tsx
{deadCount > 0 && (
  <button
    type="button"
    onClick={() => setActiveFilter('dead')}
    data-active={activeFilter === 'dead'}
    className={styles.systemFilter}
  >
    リンク切れ <span className={styles.count}>{deadCount}</span>
  </button>
)}
```

count が 0 のときは button 自体を表示しない (UI noise 抑制)。

- [ ] **Step 7: Add gone card visual state**

card wrapper (Cards Layer の outer div) に `data-link-status={item.linkStatus}` を付与し、 共通 CSS で:

```css
[data-link-status='gone'] {
  opacity: 0.55;
  filter: grayscale(60%);
  cursor: default;
}
[data-link-status='gone']::after {
  content: 'リンク切れ';
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 3px 8px;
  background: rgba(180, 60, 60, 0.85);
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  color: white;
  z-index: 5;
  pointer-events: none;
}
```

クリック挙動: gone カードは外部遷移しないように、 card wrapper の onClick で `if (item.linkStatus === 'gone') return` を入れる。 代わりに 「削除」 ボタンを RefetchButton と並べて hover で出現させる:

```tsx
{item.linkStatus === 'gone' && (
  <button onClick={() => onDelete(item.bookmarkId)} className={styles.deadDeleteBtn}>
    削除
  </button>
)}
```

- [ ] **Step 8: Run full test suite + tsc**

Run: `rtk pnpm tsc --noEmit && rtk pnpm vitest run`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add lib/board/types.ts lib/board/filter.ts tests/lib/filter-dead.test.ts components/board/* components/board/cards/*
rtk git commit -m "feat(filter): add 'dead' BoardFilter + gone card visual state + delete CTA"
```

---

## Task 12: 全件再 check 設定 (任意 / 体力次第)

設定画面 (or header メニュー) に 「全ブクマを再チェック」 ボタン。 進捗を IDB に永続化、 タブ閉じで resume 可。

**Files:**
- Modify: `lib/storage/indexeddb.ts` (settings store に `revalidationQueue` 進捗を保存)
- Create: `lib/board/full-revalidate.ts` (全件 enqueue + resume ロジック)
- Modify: 設定 UI 該当ファイル (要 Grep で特定)

- [ ] **Step 1: Add settings record for queue progress**

```ts
// lib/storage/indexeddb.ts に追加
export interface FullRevalidationProgress {
  readonly remainingIds: readonly string[]
  readonly totalCount: number
  readonly startedAt: number
}

export async function getFullRevalidationProgress(
  db: IDBPDatabase<AllMarksDB>,
): Promise<FullRevalidationProgress | null> {
  const rec = await db.get('settings', 'fullRevalidation' as never)
  return (rec as unknown as { value: FullRevalidationProgress })?.value ?? null
}

export async function saveFullRevalidationProgress(
  db: IDBPDatabase<AllMarksDB>,
  progress: FullRevalidationProgress | null,
): Promise<void> {
  if (progress) {
    await db.put('settings', { key: 'fullRevalidation', value: progress } as never)
  } else {
    await db.delete('settings', 'fullRevalidation' as never)
  }
}
```

- [ ] **Step 2: Implement full revalidate orchestrator**

```ts
// lib/board/full-revalidate.ts
import { RevalidationQueue, defaultFetcher, type RevalidationResult } from './revalidate'

type StartArgs = {
  readonly bookmarkIds: readonly string[]
  readonly urlOf: (id: string) => string
  readonly onResult: (id: string, r: RevalidationResult) => void | Promise<void>
  readonly onProgress: (remaining: readonly string[]) => void
  readonly onComplete: () => void
}

export function startFullRevalidate({ bookmarkIds, urlOf, onResult, onProgress, onComplete }: StartArgs): () => void {
  let cancelled = false
  let remaining = [...bookmarkIds]
  const queue = new RevalidationQueue({
    fetcher: defaultFetcher,
    maxConcurrent: 3,
    onResult: async (id, r) => {
      if (cancelled) return
      await onResult(id, r)
      remaining = remaining.filter((x) => x !== id)
      onProgress(remaining)
      if (remaining.length === 0) onComplete()
    },
  })
  for (const id of bookmarkIds) {
    queue.enqueue(id, urlOf(id))
  }
  return (): void => { cancelled = true }
}
```

- [ ] **Step 3: Wire into settings UI**

Settings page を Grep で特定 (`activeFilter` を持つコンポーネント周辺、 もしくは TopHeader の歯車アイコン)。 「全ブクマを再チェック」 ボタンを追加。 click で:

1. 確認ダイアログ表示 (件数 + 推定時間)
2. `startFullRevalidate` 開始、 cancel 関数を ref に保持
3. header に進捗バー表示 ("N / M 件チェック中…")
4. 進捗を `saveFullRevalidationProgress` で IDB に永続化 (~10 件ごと)
5. 完了で `saveFullRevalidationProgress(db, null)`

resume: board 起動時、 `getFullRevalidationProgress` が non-null かつ `remainingIds.length > 0` ならユーザーに 「前回の再チェックを続行しますか?」 と尋ねる (or 自動再開)。

- [ ] **Step 4: Manual smoke test**

少量データで動作確認:

1. board に 5-10 件のブクマ
2. 設定 → 全件再チェック
3. 進捗バーが進む → 完了
4. 1 件以上が `linkStatus='gone'` になる場合は 「リンク切れ」 filter に出現

- [ ] **Step 5: Run full tsc + tests**

Run: `rtk pnpm tsc --noEmit && rtk pnpm vitest run`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add lib/storage/indexeddb.ts lib/board/full-revalidate.ts <settings UI files>
rtk git commit -m "feat(health): manual 'check all bookmarks' background task with progress persistence"
```

---

## Final integration & deploy

- [ ] **Step 1: Run E2E suite to check nothing regressed**

Run: `rtk pnpm playwright test`
Expected: all pass (failures investigate before deploy).

- [ ] **Step 2: Run vitest in full**

Run: `rtk pnpm vitest run`
Expected: all pass.

- [ ] **Step 3: TypeScript clean**

Run: `rtk pnpm tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Build**

Run: `rtk pnpm build`
Expected: success.

- [ ] **Step 5: Local IDB upgrade verification (CRITICAL)**

開発環境で:
1. master HEAD (v13) を `rtk pnpm dev` で起動
2. board を開く → IDB が v13 で開く
3. このセッションの branch に切り替え (`rtk git checkout <branch>`)
4. `rtk pnpm dev` 再起動 → IDB が v14 に upgrade される
5. 既存 record が全て読める、 新 field の書き込みも動く、 backfill log が出る

memory `project_idb_irreversibility.md` に従い、 deploy 前に必ず確認。

- [ ] **Step 6: Deploy preview**

```bash
rtk pnpm build
npx wrangler pages deploy out/ --project-name=booklage --branch=master --commit-dirty=true
```

- [ ] **Step 7: Production smoke test**

`https://booklage.pages.dev` をハードリロード:
- 既存ブクマが全て表示される (v13 → v14 migration 通過)
- noomo / pitperform が正常 thumbnail で表示 (backfill 効いた)
- Instagram / CodePen が MinimalCard で大 favicon + hostname 表示
- Lightbox を開いて閉じる → close 中の wheel で隣カード遷移しない
- 30 日経過のカードを触らず、 数日後 (or 時計を巻き戻して) 自動 revalidation を確認

- [ ] **Step 8: Update CURRENT_GOAL.md + TODO.md for session 21**

セッション 20 完了後の引継ぎ:

`docs/CURRENT_GOAL.md`: 次セッション (21) のゴールを 1 行 + やること 3-5 個で記述。
`docs/TODO_COMPLETED.md`: セッション 20 narrative 追記。
`docs/TODO.md`: B-#1/#2 削除、 B-#3 を 「次セッション候補」 へ移動。

- [ ] **Step 9: Final commit**

```bash
rtk git add docs/CURRENT_GOAL.md docs/TODO.md docs/TODO_COMPLETED.md
rtk git commit -m "docs(session-20): close out — card metadata health shipped (B-#1/#2 + lightbox close fix)"
```

---

## Self-Review Notes

- **Spec coverage**: spec §4.1〜4.6 + UX フィルタ + 全件再 check を全て task として持つ。 完了基準の 4 条件 (noomo/pitperform 正常 / Instagram/CodePen MinimalCard / 30 日後自動 gone / Lightbox close wheel 抑止) は対応 task あり。
- **No placeholders**: 全 step に exact code 同梱。 「TBD」 「実装後決める」 系の曖昧は無し。 但し Task 11 step 6 と Task 12 の UI 統合は 「該当 component を Grep で特定」 と書いていて若干曖昧 — 実装時に subagent が確認する形を許容。 致命的ではない。
- **Type consistency**: `linkStatus: 'alive' | 'gone' | 'unknown'` を全 task で統一。 `lastCheckedAt: number` も統一。 `BoardFilter` 型に `'dead'` 追加が Task 11 のみで定義され、 Task 5/7 では参照のみで矛盾なし。
- **Risk callout**: Task 5 step で IDB irreversibility に明示触れ。 Task 12 が optional であることも各所で明記。

---

## 完了条件 (DoD)

- spec §完了基準 4 件を全て満たす
- 全テストパス (vitest + playwright)
- `tsc --noEmit` clean
- `booklage.pages.dev` で動作確認済
