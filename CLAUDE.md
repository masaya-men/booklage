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

## 🔒 プライバシー・センシティブ情報の絶対ルール

以下の内容は **絶対に** public な場所（`docs/` 直下、code コメント、tracked ファイル等）に書かない：

- **収益計画・価格戦略・ローンチ戦略**（「収益化計画」「価格戦略」「monetization plan」「launch strategy」等のキーワード）
- **個人情報**（ユーザーの個人メアド、本名、電話番号、住所、契約関係 — 例示でも実値を書かない、placeholder のみ）
- **競合分析**（手の内を見せたくないもの）
- **Paid サービスの認証情報メモ**（実鍵は `.env.local` / `.dev.vars`）

### 置き場所ルール

- **センシティブ系** → `docs/private/` に置く（git-ignored）
- **迷ったら** → `docs/private/` を選ぶ。後で public にしてもいい。逆は GitHub 履歴から消すのが面倒
- **実行時の認証情報** → `.env.local` / `.dev.vars`（既に gitignored）

### 安全装置（多層防御）

1. `.gitignore` で `docs/private/*` を除外（README だけ追跡）
2. `.husky/pre-commit` で gitleaks（API キー等）+ カスタムキーワード検知（メアド・戦略ワード）
3. GitHub Secret Scanning + Push Protection（サーバー側）
4. `docs/private/README.md` に「ここに置く / 置かない」リスト

### Claude への指示

- センシティブ情報を含むファイルを作るときは **必ず `docs/private/` 配下** にパスを選ぶ
- 既存 tracked ファイルにセンシティブ内容を追記しない
- 迷ったらユーザーに確認。無断で public 化しない
- `--no-verify` で hooks をスキップすることは **絶対禁止**（CLAUDE.md 既定）

### IDEAS.md と docs/private/ の永続化ルール（2026-04-19 Phase 2 追加）

- **真実の場所はメインリポ**: `docs/private/IDEAS.md` の正本は `C:/Users/masay/Desktop/マイコラージュ/docs/private/` 配下。gitignored なので worktree 作成時に自動的にコピーされない
- **新規 worktree 作成時**: 開始直後に `cp -r` でメインリポから `docs/private/` 配下を worktree にコピーする（IDEAS.md, README.md 等）
- **worktree で IDEAS.md を更新したら**: セッション終了前に worktree → メインリポへ逆コピーで永続化する
- **worktree を破棄するときは** IDEAS.md がメインリポに同期済みかを必ず確認する（`diff` で比較）
- 「両方ある」状態を sync して維持する仕組みは現在ない。手動同期 = ルール遵守で担保する

### 実メアド・本名の絶対的扱い（2026-04-19 Phase 2 追加）

- tracked ファイルには **絶対に** 実メアドを書かない（CLAUDE.md / README.md / docs/ / コードコメント 含めて全部）
- 例示で必要なら `<user-email>` のような placeholder のみ
- 実値の参照場所は **Claude の user memory（ローカル）** と `docs/private/IDEAS.md` のみ
- 本名 `Masaya` も tracked ファイルでの言及を最小化（GitHub username `masaya-men` から推測可能だが、わざわざ書かない）
- git config の user.name / user.email は別問題。GitHub commit author に出るので、必要なら `<id>+<username>@users.noreply.github.com` 形式に設定

### commit 前の機微自己チェック（pre-commit hook と二重防御）

新規追加 / 編集箇所に以下が含まれていないか **commit 前に目視確認**：

1. **個人情報**: 実メアド、本名、電話、住所、契約関係
2. **競合・戦略ワード**: 「収益」「価格」「monetization」「launch strategy」「Pocket」「Raindrop」「mymind」「Cosmos」「Are.na」「Pinterest」「Dewey」等
3. **戦略表現**: 「magic moment」「差別化の核」「他にない」「市場の空白」「勝ち筋」「訴求ポイント」等

怪しいときは該当内容を `docs/private/IDEAS.md` に退避してから commit。
**既に push 済の機微** が見つかったら、即時 IDEAS.md 退避 + scrub commit + 必要に応じて `git filter-repo` で履歴書き換え（手順は `docs/private/IDEAS.md` §「次セッションのプライバシー徹底監査タスク」参照）。

### Phase 2 (2026-04-19) で実施した恒久対策

- **CLAUDE.md L23**: 実メアド placeholder 化
- **MYCOLLAGE_FULL_SPEC.md §1, §13**: 市場分析・Pocket ポジショニングを IDEAS.md に退避
- **docs/TODO.md / b1-placement-design.md**: 戦略表現中立化、「収益戦略」参照削除
- **git filter-repo**: master 全履歴 214 commits から機微テキスト + 旧メアドを削除
- **backup branch**: `backup-pre-filter-repo-2026-04-19` を origin に保管（**2026-05-19 以降に削除可**）

---

## セッション管理

### 開始時
`docs/TODO.md` を読む。他のドキュメントは該当タスクに着手するときに読む。
詳細なワークフローは `.claude/rules/session-workflow.md` を参照。

### 会話中の記録
アイデア・方針・設計判断は即座に `docs/TODO.md` に追記する。指示されなくても自動的にやること。

### 重要ドキュメント（該当タスク着手時に読む）
- `docs/TODO.md` — 現在の状態・タスク一覧（毎セッション必読）
- `docs/DESIGN_DECISIONS.md` — 確定済み設計方針（将来作成予定）
- `MYCOLLAGE_FULL_SPEC.md` — 要件定義書

### コンパクション時
When compacting, always preserve: 現在のタスク、変更中のファイルパス、docs/TODO.mdの「現在の状態」内容。

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
| URL情報取得 | ブックマークレット（主導線）/ Worker（任意） | Worker不要で動作 |
| テキスト計測 | @chenglou/pretext | カード内テキスト精密レイアウト |
| ドラッグ | GSAP + Draggable | Framer Motion 禁止 |
| ローカルDB | IndexedDB via `idb` | ブラウザ内のみ |
| 共有 | URL圧縮エンコード方式 | サーバー不要・URLにデータ埋め込み |
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
│   │   │   └── page.tsx       # メインキャンバス
│   │   └── layout.tsx
│   ├── api/                   # API Routes（任意・なくても動作する）
│   │   ├── oembed/route.ts    # oEmbedプロキシ（任意）
│   │   └── ogp/route.ts       # OGPスクレイパー（任意）
│   ├── globals.css
│   └── layout.tsx
├── components/
│   ├── board/                 # コラージュ関連
│   ├── bookmarklet/           # ブックマークレット
│   ├── marketing/             # LP関連
│   └── ui/                    # 共通UI
├── lib/
│   ├── storage/               # IndexedDB, URL圧縮共有
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
   → IndexedDBのみ。共有はURL圧縮エンコード方式（サーバー保存なし）。

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

### OGP取得（ブックマークレット主導線）
```typescript
// ブックマークレットがページ上で直接OGPメタタグを読み取る（Worker不要）
// lib/utils/ogp.ts
export function extractOgpFromDocument(doc: Document): OgpData {
  const getMeta = (property: string): string =>
    doc.querySelector(`meta[property="${property}"]`)?.getAttribute('content') ?? ''
  
  return {
    title: getMeta('og:title') || doc.title,
    description: getMeta('og:description'),
    image: getMeta('og:image'),
    siteName: getMeta('og:site_name'),
    url: doc.location.href,
  }
}
```

### OGPスクレイパー（任意 — URLペースト時のフォールバック）
```typescript
// app/api/ogp/route.ts（任意・なくてもアプリは動作する）
export const runtime = 'edge'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })
  
  const res = await fetch(url, { 
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AppBot/1.0)' }
  })
  const html = await res.text()
  
  const title = html.match(/<meta property="og:title" content="([^"]*)"/)?.[ 1] ?? ''
  const description = html.match(/<meta property="og:description" content="([^"]*)"/)?.[ 1] ?? ''
  const image = html.match(/<meta property="og:image" content="([^"]*)"/)?.[ 1] ?? ''
  const siteName = html.match(/<meta property="og:site_name" content="([^"]*)"/)?.[ 1] ?? ''
  
  return NextResponse.json({ title, description, image, siteName, url })
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

# Cloudflare Pages のみ使用（Workers/R2/KV は不要）
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
| `MYCOLLAGE_FULL_SPEC.md` | 完全要件定義書。全決定事項・UI・運用方針・ロードマップ |
| `docs/` | 完全運営マニュアル（開発と同時に作成） |

---

*このファイルはプロジェクトルートに `CLAUDE.md` として配置すること。*
*Claude Code はこのファイルを自動的に読み込み、コンテキストとして使用する。*
*最終更新: 2026-04-10（完全¥0設計に改訂）*
