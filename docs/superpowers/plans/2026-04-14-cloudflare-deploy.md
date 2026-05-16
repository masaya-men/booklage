# Cloudflare Pages デプロイ 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AllMarks を Cloudflare Pages にデプロイし `booklage.pages.dev` で世界中からアクセス可能にする

**Architecture:** Next.js を `output: 'export'` で静的 HTML に書き出し、Cloudflare Pages で配信。API（OGP 取得・oEmbed プロキシ）は Cloudflare Pages Functions として実装。GitHub 連携で git push → 自動デプロイ。

**Tech Stack:** Next.js 16 (Static Export), Cloudflare Pages, Cloudflare Pages Functions, wrangler CLI

---

## ファイル構成

### 新規作成
- `functions/api/ogp.ts` — OGP 取得 API（Pages Function）
- `functions/api/oembed.ts` — oEmbed プロキシ API（Pages Function）

### 変更
- `next.config.ts` — `output: 'export'` 追加
- `package.json` — `wrangler` devDep 追加、`preview` スクリプト追加
- `.gitignore` — `.wrangler/` 追加

### 削除
- `app/api/ogp/route.ts` — Pages Functions に移行済み
- `app/api/oembed/route.ts` — Pages Functions に移行済み

### 変更不要（確認済み）
- `lib/scraper/ogp.ts` — `/api/ogp` 呼び出しパスは同じ
- `lib/scraper/oembed.ts` — `/api/oembed` 呼び出しパスは同じ
- `.gitignore` — `/out/` は既に含まれている

---

### Task 1: Next.js を静的書き出しモードに変更

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: next.config.ts に output: 'export' を追加**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable React Strict Mode — GSAP Draggable doesn't survive kill+recreate cycle
  // TODO: Find a proper workaround and re-enable
  reactStrictMode: false,
  output: 'export',
};

export default nextConfig;
```

注: `next/image` は使われていないため `images.unoptimized` は不要。

- [ ] **Step 2: Commit**

```bash
git add next.config.ts
git commit -m "chore: set Next.js output to static export for Cloudflare Pages"
```

---

### Task 2: API Route を Pages Functions に移行（OGP）

**Files:**
- Create: `functions/api/ogp.ts`
- Delete: `app/api/ogp/route.ts`

- [ ] **Step 1: functions/api/ogp.ts を作成**

`functions/api/` ディレクトリを作成し、OGP 取得 API を Cloudflare Pages Functions 形式で実装する。ロジックは既存の `app/api/ogp/route.ts` と同一。NextRequest/NextResponse を Web 標準の Request/Response に置き換える。

```typescript
interface PagesContext {
  request: Request
}

function extractMeta(html: string, property: string): string {
  const ogMatch = html.match(
    new RegExp(
      `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["']`,
      'i',
    ),
  )
  if (ogMatch) return ogMatch[1]

  const ogReversed = html.match(
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${property}["']`,
      'i',
    ),
  )
  if (ogReversed) return ogReversed[1]

  const nameMatch = html.match(
    new RegExp(
      `<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']*)["']`,
      'i',
    ),
  )
  if (nameMatch) return nameMatch[1]

  const nameReversed = html.match(
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${property}["']`,
      'i',
    ),
  )
  if (nameReversed) return nameReversed[1]

  return ''
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  return match?.[1]?.trim() ?? ''
}

function extractFavicon(html: string, baseUrl: string): string {
  const match = html.match(
    /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']*)["']/i,
  )
  if (match) {
    const href = match[1]
    if (href.startsWith('http')) return href
    if (href.startsWith('//')) return `https:${href}`
    const origin = new URL(baseUrl).origin
    return `${origin}${href.startsWith('/') ? '' : '/'}${href}`
  }
  return `${new URL(baseUrl).origin}/favicon.ico`
}

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  })
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const url = new URL(context.request.url).searchParams.get('url')
  if (!url) {
    return jsonResponse({ error: 'url parameter required' }, 400)
  }

  try {
    new URL(url)
  } catch {
    return jsonResponse({ error: 'Invalid URL format' }, 400)
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AllMarksBot/1.0)',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      return jsonResponse({ error: `Fetch failed: ${res.status}` }, 502)
    }

    const html = await res.text()

    const data = {
      title: extractMeta(html, 'og:title') || extractTitle(html),
      description:
        extractMeta(html, 'og:description') || extractMeta(html, 'description'),
      image: extractMeta(html, 'og:image'),
      siteName: extractMeta(html, 'og:site_name'),
      favicon: extractFavicon(html, url),
      url,
    }

    return jsonResponse(data, 200, {
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return jsonResponse({ error: message }, 500)
  }
}
```

- [ ] **Step 2: app/api/ogp/route.ts を削除**

```bash
rm app/api/ogp/route.ts
```

`app/api/ogp/` ディレクトリが空になったら、ディレクトリも削除:

```bash
rmdir app/api/ogp
```

- [ ] **Step 3: Commit**

```bash
git add functions/api/ogp.ts
git add app/api/ogp/route.ts
git commit -m "feat: migrate OGP API from Next.js route to Cloudflare Pages Function"
```

---

### Task 3: API Route を Pages Functions に移行（oEmbed）

**Files:**
- Create: `functions/api/oembed.ts`
- Delete: `app/api/oembed/route.ts`

- [ ] **Step 1: functions/api/oembed.ts を作成**

```typescript
interface PagesContext {
  request: Request
}

const OEMBED_ENDPOINTS: Record<string, string> = {
  youtube: 'https://www.youtube.com/oembed',
  tiktok: 'https://www.tiktok.com/oembed',
  instagram: 'https://api.instagram.com/oembed',
}

function detectProvider(url: string): string | null {
  const lower = url.toLowerCase()
  if (lower.includes('youtube.com') || lower.includes('youtu.be'))
    return 'youtube'
  if (lower.includes('tiktok.com')) return 'tiktok'
  if (lower.includes('instagram.com')) return 'instagram'
  return null
}

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  })
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const url = new URL(context.request.url).searchParams.get('url')
  if (!url) {
    return jsonResponse({ error: 'url parameter required' }, 400)
  }

  const provider = detectProvider(url)
  if (!provider) {
    return jsonResponse({ error: 'Unsupported oEmbed provider' }, 400)
  }

  const endpoint = OEMBED_ENDPOINTS[provider]
  const oembedUrl = `${endpoint}?url=${encodeURIComponent(url)}&format=json`

  try {
    const res = await fetch(oembedUrl, {
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      return jsonResponse({ error: `oEmbed failed: ${res.status}` }, 502)
    }

    const data: unknown = await res.json()

    return jsonResponse(data, 200, {
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return jsonResponse({ error: message }, 500)
  }
}
```

- [ ] **Step 2: app/api/oembed/route.ts を削除し、app/api/ ディレクトリも削除**

```bash
rm app/api/oembed/route.ts
rmdir app/api/oembed
rmdir app/api
```

- [ ] **Step 3: Commit**

```bash
git add functions/api/oembed.ts
git add app/api/oembed/route.ts
git commit -m "feat: migrate oEmbed API from Next.js route to Cloudflare Pages Function"
```

---

### Task 4: wrangler を追加してローカルプレビュー環境を整備

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: wrangler を devDependencies に追加**

```bash
npm install --save-dev wrangler
```

- [ ] **Step 2: package.json に preview スクリプトを追加**

`package.json` の `"scripts"` セクションに追加:

```json
"preview": "next build && wrangler pages dev out"
```

追加後のスクリプトセクション全体:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "test:watch": "vitest",
  "preview": "next build && wrangler pages dev out"
}
```

- [ ] **Step 3: .gitignore に .wrangler/ を追加**

`.gitignore` の末尾に追加:

```
# Wrangler
.wrangler/
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: add wrangler for local preview of Cloudflare Pages Functions"
```

---

### Task 5: ビルド確認

**Files:** なし（検証のみ）

- [ ] **Step 1: next build を実行して静的書き出しが成功することを確認**

```bash
npm run build
```

期待: ビルド成功。`out/` ディレクトリに HTML ファイルが生成される。以前のエラー（`/_global-error` edge runtime 競合）は API Route 削除により解消。

- [ ] **Step 2: 生成された out/ ディレクトリの内容を確認**

```bash
ls out/
```

期待されるファイル:
- `index.html` — LP（`/`）
- `board/index.html` — ボード画面
- `save/index.html` — ブックマークレットポップアップ
- `privacy/index.html` — プライバシーポリシー
- `terms/index.html` — 利用規約
- `faq/index.html` — FAQ
- `about/index.html` — About
- `contact/index.html` — お問い合わせ
- `_next/` — JS/CSS アセット
- `*.svg`, `manifest.json` — 静的ファイル

- [ ] **Step 3: wrangler pages dev でローカルプレビューを起動して確認**

```bash
npx wrangler pages dev out
```

期待: ローカルサーバーが起動（`localhost:8788` 等）。以下を確認:
- `http://localhost:8788/` — LP が表示される
- `http://localhost:8788/board` — ボード画面が動作する
- `http://localhost:8788/api/ogp?url=https://github.com` — OGP JSON が返る
- `http://localhost:8788/api/oembed?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ` — oEmbed JSON が返る

---

### Task 6: GitHub に push

**Files:** なし（Git 操作のみ）

- [ ] **Step 1: 全変更を push**

```bash
git push origin master
```

期待: GitHub リポジトリ `masaya-men/booklage` の master ブランチが更新される。

---

### Task 7: Cloudflare Pages プロジェクト作成とデプロイ

**Files:** なし（Cloudflare ダッシュボード操作）

この Task はダッシュボード操作を含むため、ユーザーと一緒に進める。

- [ ] **Step 1: Cloudflare ダッシュボードで Pages プロジェクトを作成**

1. https://dash.cloudflare.com にログイン
2. 左メニュー「Workers と Pages」をクリック
3. 「作成」ボタンをクリック
4. 「Pages」タブを選択
5. 「Git に接続」を選択
6. GitHub アカウントを連携（初回のみ）
7. リポジトリ `masaya-men/booklage` を選択

- [ ] **Step 2: ビルド設定を入力**

| 項目 | 値 |
|------|-----|
| プロジェクト名 | `booklage` |
| プロダクションブランチ | `master` |
| ビルドコマンド | `npm run build` |
| ビルド出力ディレクトリ | `out` |

- [ ] **Step 3: 環境変数を設定**

「環境変数」セクションで以下を追加:

| 変数名 | 値 |
|--------|-----|
| `NEXT_PUBLIC_APP_URL` | `https://booklage.pages.dev` |
| `NEXT_PUBLIC_APP_NAME` | `AllMarks` |
| `NODE_VERSION` | `20` |

- [ ] **Step 4: 「保存してデプロイ」をクリック**

初回ビルドが開始される。完了まで 1〜3 分程度。

- [ ] **Step 5: デプロイ成功を確認**

ビルドログで「Success」を確認。`https://booklage.pages.dev` にアクセスして LP が表示されることを確認。

---

### Task 8: デプロイ後の動作検証

**Files:** なし（検証のみ）

- [ ] **Step 1: 全ページの表示確認**

以下の URL にアクセスして表示されることを確認:

- `https://booklage.pages.dev/` — LP
- `https://booklage.pages.dev/board` — ボード画面
- `https://booklage.pages.dev/save` — ブックマークレットポップアップ（パラメータなし → 案内表示）
- `https://booklage.pages.dev/privacy` — プライバシーポリシー
- `https://booklage.pages.dev/terms` — 利用規約
- `https://booklage.pages.dev/faq` — FAQ
- `https://booklage.pages.dev/about` — About
- `https://booklage.pages.dev/contact` — お問い合わせ

- [ ] **Step 2: API の動作確認**

ブラウザまたは curl で:

```bash
curl "https://booklage.pages.dev/api/ogp?url=https://github.com"
```

期待: `{"title":"GitHub",...}` 形式の JSON

```bash
curl "https://booklage.pages.dev/api/oembed?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

期待: YouTube の oEmbed JSON（`type: "video"`, `html` にiframeを含む）

- [ ] **Step 3: ボード機能の動作確認**

`/board` にアクセスして:
1. URL 入力欄に `https://github.com` を貼り付け → カードが追加される（OGP 情報付き）
2. カードのドラッグが動作する
3. ページリロード → カードが消えない（IndexedDB 永続化）
4. スタイル切替（Glass/Polaroid/Newspaper/Magnet）が動作する

- [ ] **Step 4: HTTPS とフォント確認**

- URL が `https://` であること（HTTP は自動リダイレクトされる）
- Google Fonts（Inter, Outfit, Caveat）が正しく読み込まれている
- DevTools Console にエラーがないこと

- [ ] **Step 5: スマホからアクセス確認**

スマホのブラウザから `https://booklage.pages.dev` にアクセスして:
- LP が正しく表示される
- `/board` に遷移できる
- タッチ操作が動作する
