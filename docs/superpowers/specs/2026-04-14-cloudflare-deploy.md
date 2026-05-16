# Cloudflare Pages デプロイ設計書

> 承認済み: 2026-04-14

---

## 概要

AllMarks を Cloudflare Pages にデプロイし、`booklage.pages.dev` で世界中からアクセス可能にする。

### 方式

**Static Export + Cloudflare Pages Functions**

- Next.js を `output: 'export'` で静的 HTML に変換して配信
- API 機能（OGP 取得、oEmbed プロキシ）は Cloudflare Pages Functions として実装
- GitHub 連携による自動デプロイ（git push → 自動ビルド → 公開）

### 選定理由

- AllMarks は 95% が静的コンテンツ → 静的配信が最速・最安定
- API Route は 2 つだけ → Pages Functions で十分
- Next.js 16 はフル SSR アダプター（@opennextjs/cloudflare）の互換性リスクあり
- サーバー費 ¥0 の要件を確実に満たせる

---

## 1. Next.js 静的書き出し設定

### next.config.ts の変更

```typescript
const nextConfig: NextConfig = {
  reactStrictMode: false,
  output: 'export',
  images: {
    unoptimized: true, // 静的書き出しでは Next/Image の最適化が使えない
  },
}
```

### 削除するファイル

- `app/api/ogp/route.ts` — Pages Functions に移行
- `app/api/oembed/route.ts` — Pages Functions に移行

### 環境変数

| 変数 | ローカル | 本番（Cloudflare） |
|------|---------|-------------------|
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | `https://booklage.pages.dev` |
| `NEXT_PUBLIC_APP_NAME` | `AllMarks` | `AllMarks` |

---

## 2. Cloudflare Pages Functions（API 移行）

### ディレクトリ構成

```
functions/
  api/
    ogp.ts      → GET /api/ogp?url=...
    oembed.ts   → GET /api/oembed?url=...
```

`functions/` ディレクトリに置いたファイルは、Cloudflare Pages が自動的に Workers（API エンドポイント）として認識する。URL パスはファイルパスと一致するため、既存のクライアントコード（`/api/ogp`, `/api/oembed` を呼び出す部分）は変更不要。

### API 形式の変換

Next.js API Route → Cloudflare Pages Functions:

| 項目 | Next.js | Pages Functions |
|------|---------|-----------------|
| リクエスト | `NextRequest` | `Request`（Web 標準） |
| レスポンス | `NextResponse.json()` | `new Response(JSON.stringify())` |
| パラメータ取得 | `req.nextUrl.searchParams` | `new URL(request.url).searchParams` |
| エクスポート | `export async function GET()` | `export async function onRequest()` |

### OGP 取得 API（functions/api/ogp.ts）

機能:
- URL を受け取り、対象ページの HTML を取得
- OGP メタタグ（og:title, og:description, og:image, og:site_name）を抽出
- favicon URL を抽出
- JSON で返却
- Cache-Control: 24 時間キャッシュ

### oEmbed プロキシ API（functions/api/oembed.ts）

機能:
- URL を受け取り、プロバイダーを判定（YouTube, TikTok, Instagram）
- 対応プロバイダーの oEmbed エンドポイントにプロキシリクエスト
- JSON で返却
- Cache-Control: 24 時間キャッシュ

### クライアントコード

`lib/scraper/ogp.ts` と `lib/scraper/oembed.ts` は変更不要。呼び出し先の URL パス（`/api/ogp`, `/api/oembed`）が同じため。

---

## 3. ローカル開発環境

API Route を Next.js から削除するため、ローカル開発時にも API を動かす仕組みが必要。

### 方針

`wrangler`（Cloudflare の CLI ツール）を devDependencies に追加し、ローカルでも Pages Functions を実行できるようにする。

### 開発コマンド

```bash
# フロントエンド開発（従来通り）
npm run dev          # → next dev（localhost:3000）

# 本番と同じ環境をローカルで確認
npm run preview      # → next build && wrangler pages dev out
```

`npm run preview` は本番と同じ構成（静的ファイル + Pages Functions）をローカルで再現する。API の動作確認はこちらで行う。

### package.json への追加

```json
{
  "scripts": {
    "preview": "next build && wrangler pages dev out"
  },
  "devDependencies": {
    "wrangler": "^4"
  }
}
```

### next dev 時の API フォールバック

`next dev` 時は Pages Functions が動かないため、API 呼び出しが失敗する。ただし AllMarks の主要機能（カード表示、ドラッグ、フォルダ管理等）は IndexedDB のみで動作するため、`next dev` でも大部分の開発が可能。API が必要な開発（URL ペースト → OGP 取得）のみ `npm run preview` を使う。

---

## 4. ビルドエラー修正

### 現在のエラー

```
Error occurred prerendering page "/_global-error"
Using edge runtime on a page currently disables static generation for that page
```

原因: `app/api/` 内の `export const runtime = 'edge'` が Next.js 16 の静的生成と競合。
解決: API Route ファイルを削除し Pages Functions に移行することで解消。

### ビルドコマンド

```bash
npm run build
```

出力先: `out/` ディレクトリ（`output: 'export'` 時のデフォルト）

---

## 5. Cloudflare Pages 設定

### GitHub 連携

- リポジトリ: `masaya-men/booklage`
- ブランチ: `master`
- 自動デプロイ: ON（push のたびに自動ビルド）

### ビルド設定

| 項目 | 値 |
|------|-----|
| ビルドコマンド | `npm run build` |
| ビルド出力ディレクトリ | `out` |
| ルートディレクトリ | `/`（デフォルト） |
| Node.js バージョン | 20 |

### 環境変数（Cloudflare ダッシュボードで設定）

| 変数名 | 値 |
|--------|-----|
| `NEXT_PUBLIC_APP_URL` | `https://booklage.pages.dev` |
| `NEXT_PUBLIC_APP_NAME` | `AllMarks` |
| `NODE_VERSION` | `20` |

### ルーティング

Next.js static export は各ルートごとに `/board/index.html`、`/save/index.html` 等を生成する。Cloudflare Pages はディレクトリの `index.html` を自動的にサーブするため、特別な設定は不要。

デプロイ後に直接 URL アクセス（`/board`、`/save` 等）が 404 になる場合のみ、`public/_redirects` で対処する。

---

## 6. ドメイン

| 段階 | URL | 費用 |
|------|-----|------|
| 初回デプロイ | `booklage.pages.dev` | ¥0 |
| 後日 | `booklage.com`（Cloudflare Registrar で取得推奨） | 年約 ¥1,500 |

カスタムドメイン接続時の作業:
1. Cloudflare Registrar で `booklage.com` を取得
2. Pages プロジェクトの「カスタムドメイン」で追加
3. DNS は自動設定（Cloudflare 管理のため）
4. SSL 証明書も自動発行

---

## 7. 確認事項

デプロイ後に検証する項目:

- [ ] LP（`/`）が正しく表示される
- [ ] ボード画面（`/board`）が動作する（カード追加、ドラッグ、スタイル切替）
- [ ] 静的ページ（`/privacy`, `/terms`, `/faq`, `/about`, `/contact`）が表示される
- [ ] ブックマークレット（`/save`）が動作する
- [ ] OGP API（`/api/ogp?url=...`）が動作する
- [ ] oEmbed API（`/api/oembed?url=...`）が動作する
- [ ] IndexedDB にデータが保存される
- [ ] スマホからアクセスできる
- [ ] HTTPS で配信される
- [ ] Google Fonts が読み込まれる
- [ ] OGP メタタグが正しく設定されている（SNS シェア時のプレビュー）

---

## 8. 将来の拡張

- `booklage.com` ドメイン接続
- S9 一括インポート用の追加 API（Pages Functions に追加するだけ）
- OGP レスポンスの KV キャッシュ（同じ URL の重複取得を防ぐ、大規模時）
- Rate Limiting（Cloudflare の無料機能で設定可能）
