# CLAUDE.md — Claude Code 用プロジェクト指示書

> **このファイルはClaude Codeが自動的に読み込むプロジェクトルートの指示書です。**
> 必ず `MYCOLLAGE_FULL_SPEC.md` も合わせて読むこと。

---

## ⚠️ ユーザープロフィール（最重要 — 常に意識すること）

- **非エンジニア** の日本人。技術用語は必ず平易な日本語で補足する。
- **1人開発** — Claude Code がメインの開発パートナー。
- **金額は全て日本円（¥）で表示する**こと。ドルは使わない。
- 技術的判断はClaudeが推奨を出し、メリット・デメリットを添えて提案する。
- **応答は日本語で行う**こと。

---

## プロジェクト概要

あらゆるWebサイト（Twitter/X, YouTube, TikTok, Instagram, 一般サイト等）のブックマークを
ビジュアルコラージュとして管理・フォルダ分け・共有できるWebアプリ。
服飾学生のコラージュ / ムードボードのような、見ていて楽しい超モダンなデザイン。
ターゲット: 世界中の全ユーザー（ターゲットは絞らない）。

## ミッション

「整理ツール」ではなく「表現ツール」。
コラージュを画像でSNSシェアさせてバイラルを起こす。
**超モダン・最新技術・目が楽しいアニメーションとインタラクションが絶対条件。**

---

## 技術スタック

| 役割 | ライブラリ | 備考 |
|------|-----------|------|
| Framework | Next.js 14+ App Router | TypeScript strict |
| Styling | Vanilla CSS + CSS Custom Properties | **Tailwind不使用** |
| Tweet表示 | react-tweet | widgets.js 禁止 |
| 動画埋め込み | oEmbed統一プロトコル | YouTube, TikTok等 |
| URL情報取得 | Cloudflare Worker（OGPスクレイパー） | 全URL対応 |
| テキスト計測 | @chenglou/pretext | カード内テキスト精密レイアウト |
| ドラッグ | GSAP + Draggable | Framer Motion 禁止 |
| ローカルDB | IndexedDB via `idb` | ブラウザ内のみ |
| 共有 | Cloudflare R2 + KV | スナップショット TTL 90日 |
| OGP画像 | Satori / Cloudflare Workers | シェア時サムネイル |
| 画像出力 | dom-to-image-more | コラージュPNG書き出し |
| 多言語 | next-intl or i18next | 15言語対応 |
| Hosting | Cloudflare Pages | 帯域無制限・世界310拠点 |
| Analytics | Cloudflare Analytics | Cookie不要 |
| 動画制作 | Remotion | プロモ動画 |

---

## ディレクトリ構成

```
project-root/
├── app/
│   ├── (marketing)/           # SEO用静的ページ
│   │   ├── page.tsx           # LP
│   │   ├── features/
│   │   ├── guide/
│   │   ├── faq/
│   │   ├── about/
│   │   ├── privacy/
│   │   ├── terms/
│   │   └── contact/
│   ├── (app)/                 # アプリ本体
│   │   ├── board/
│   │   │   ├── page.tsx       # メインキャンバス
│   │   │   └── [id]/page.tsx  # 公開共有コラージュ
│   │   └── layout.tsx
│   ├── api/                   # Cloudflare Workers
│   │   ├── oembed/route.ts
│   │   ├── ogp/route.ts
│   │   ├── share/route.ts
│   │   └── og/route.tsx
│   ├── globals.css
│   └── layout.tsx
├── components/
│   ├── board/                 # コラージュ関連
│   ├── bookmarklet/           # ブックマークレット
│   ├── marketing/             # LP関連
│   └── ui/                    # 共通UI
├── lib/
│   ├── storage/               # IndexedDB, R2/KV
│   ├── scraper/               # OGP, oEmbed
│   ├── utils/                 # URL判定, 色抽出等
│   └── i18n/                  # 多言語設定
├── messages/                  # 翻訳ファイル（15言語）
├── public/
├── docs/                      # 完全運営マニュアル
├── CLAUDE.md                  # このファイル
└── MYCOLLAGE_FULL_SPEC.md     # 完全要件定義書
```

---

## コーディング規約

### TypeScript
- `strict: true` 必須（tsconfig.json 変更禁止）
- `any` 禁止 → `unknown` + 型ガードを使う
- 全APIレスポンスを Zod でバリデーション
- Return type は常に明示

### React / Next.js
- Server Components がデフォルト
- `'use client'` はインタラクションが必要な末端コンポーネントのみ
- `useEffect` でデータ取得禁止 → Server Component or React Query
- Props には JSDoc コメント必須

### CSS
- Vanilla CSS + CSS Custom Properties（CSS変数）
- **Tailwind CSS は使わない**
- グローバルな変数は `globals.css` の `:root` に定義
- コンポーネントごとに `.module.css` ファイルを作成
- z-index は定数ファイルで管理（魔法の数値禁止）

### IndexedDB
- `lib/storage/indexeddb.ts` に集約
- `idb` ライブラリを使用
- DBスキーマ変更時は migration を書く

### アニメーション
- ふわふわ浮遊: CSS `@keyframes float` + ランダム `animation-delay`
- ドラッグ: GSAP Draggable
- フォルダ切り替え: GSAP Timeline
- **Framer Motion は使用禁止**（バンドルサイズとパフォーマンスの理由）

---

## 禁止事項（NEVER DO）

```
❌ platform.twitter.com/widgets.js を読み込む
   → react-tweet を使え。CORSエラー + GDPR問題がある。

❌ ユーザーのデータをサーバーDBに永続保存する
   → IndexedDBのみ。共有時の一時スナップショットのみR2に保存（90日TTL）。

❌ Framer Motion をアニメーションに使う
   → バンドルサイズが大きい。GSAP + CSS keyframes を使え。

❌ Tailwind CSS を使う
   → Vanilla CSS + CSS Custom Properties を使え。

❌ console.log を本番コードに残す

❌ useEffect でAPIフェッチ
   → Server Components か React Query を使え。

❌ any 型の使用
   → unknown を使いガードする。

❌ z-index に 9999 などの魔法の数値
   → constants.ts に Z_INDEX.MODAL = 100 などと定義する。

❌ localStorage をデータ保存に使う
   → IndexedDB を使え（容量が全然違う）。

❌ ユーザー登録・ログイン機能を作る
   → データはブラウザ内のみ。ユーザー情報を持たない設計。

❌ 金額をドルで表示する
   → 全て日本円（¥）で表示する。
```

---

## 実装パターン（必ず参照）

### OGPスクレイパー（全URL対応）
```typescript
// app/api/ogp/route.ts
export const runtime = 'edge'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })
  
  // KVキャッシュチェック
  const cacheKey = `ogp:${btoa(url)}`
  // ... cache lookup ...
  
  const res = await fetch(url, { 
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AppBot/1.0)' }
  })
  const html = await res.text()
  
  // OGPメタタグを抽出
  const title = html.match(/<meta property="og:title" content="([^"]*)"/)?.[ 1] ?? ''
  const description = html.match(/<meta property="og:description" content="([^"]*)"/)?.[ 1] ?? ''
  const image = html.match(/<meta property="og:image" content="([^"]*)"/)?.[ 1] ?? ''
  const siteName = html.match(/<meta property="og:site_name" content="([^"]*)"/)?.[ 1] ?? ''
  
  const data = { title, description, image, siteName, url }
  // ... cache set ...
  return NextResponse.json(data)
}
```

### URL種別判定
```typescript
// lib/utils/url.ts
export type UrlType = 'tweet' | 'youtube' | 'tiktok' | 'instagram' | 'website'

export function detectUrlType(url: string): UrlType {
  if (url.includes('twitter.com') || url.includes('x.com')) return 'tweet'
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube'
  if (url.includes('tiktok.com')) return 'tiktok'
  if (url.includes('instagram.com')) return 'instagram'
  return 'website'
}

export function extractTweetId(url: string): string | null {
  const match = url.match(/status\/(\d+)/)
  return match?.[1] ?? null
}
```

### コラージュ画像エクスポート
```typescript
// components/board/ExportButton.tsx
'use client'
import domtoimage from 'dom-to-image-more'

export function ExportButton({ canvasRef }: { canvasRef: RefObject<HTMLElement> }) {
  const handleExport = async (): Promise<void> => {
    if (!canvasRef.current) return
    const dataUrl = await domtoimage.toPng(canvasRef.current, { scale: 2 })
    const link = document.createElement('a')
    link.download = `collage-${Date.now()}.png`
    link.href = dataUrl
    link.click()
  }
  return <button onClick={handleExport}>画像として保存</button>
}
```

### ふわふわ浮遊アニメーション
```css
/* globals.css */
@keyframes float {
  0%, 100% { transform: translateY(0) rotate(var(--card-rotation)); }
  50% { transform: translateY(-8px) rotate(calc(var(--card-rotation) + 1deg)); }
}

.card {
  --card-rotation: 0deg;
  animation: float 4s ease-in-out infinite;
  animation-delay: var(--float-delay, 0s);
}
```

---

## 環境変数

```bash
# .env.local
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=Booklage

# Cloudflare Workers バインディング（Cloudflare Dashboard で設定）
# KV_NAMESPACE, R2_BUCKET は自動バインド
```

---

## パフォーマンス目標

| 指標 | 目標 |
|------|------|
| LCP | < 2.5s |
| CLS | < 0.1 |
| First Load JS | < 200KB |
| コラージュ（50枚カード） | 60fps 維持 |
| Lighthouse Score | > 90 |

---

## コミットメッセージ規約

```
feat: 機能追加
fix: バグ修正
perf: パフォーマンス改善
style: コードスタイル（動作変更なし）
refactor: リファクタリング
docs: ドキュメント更新
test: テスト追加・修正
chore: ビルド・設定変更
i18n: 翻訳追加・修正
```

---

## よくある落とし穴

### GSAP は Server Component で import しない
```typescript
// ❌ Server Component でやると死ぬ
import { gsap } from 'gsap'

// ✅ 'use client' コンポーネントでのみ
'use client'
import { gsap } from 'gsap'
```

### Cloudflare Pages での Next.js
```
- @cloudflare/next-on-pages アダプターが必要
- Static Export モードを使う場合は next.config.js に output: 'export' 
- Edge Runtime でのみ Workers が動作
```

### IndexedDB はサーバーサイドで使えない
```typescript
// ✅ 必ず 'use client' コンポーネントから呼ぶ
// ✅ typeof window !== 'undefined' チェックを入れる
```

---

## 重要な文書

| ファイル | 内容 |
|---------|------|
| `CLAUDE.md` | このファイル。Claude Code用指示書 |
| `MYCOLLAGE_FULL_SPEC.md` | 完全要件定義書。全決定事項・UI・収益・ロードマップ |
| `docs/` | 完全運営マニュアル（開発と同時に作成） |

---

*このファイルはプロジェクトルートに `CLAUDE.md` として配置すること。*
*Claude Code はこのファイルを自動的に読み込み、コンテキストとして使用する。*
*最終更新: 2026-04-03*
