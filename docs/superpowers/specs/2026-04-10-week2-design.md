# Week 2 設計書 — Booklage ローンチ準備

> **この文書は Week 2 の全作業の設計書です。**
> 各セッションの冒頭で `docs/TODO.md` と合わせて必ず読むこと。
> 承認日: 2026-04-10

---

## 鉄則（全セクション共通・最優先）

| # | 原則 | 具体的にやること |
|---|------|----------------|
| 1 | **情報漏洩リスクの徹底排除** | ユーザーデータはIndexedDBのみ。外部送信ゼロ。ブックマークレットのiframe通信はsame-originのみ。`.env`にシークレットを置かない。CSPヘッダーで不正スクリプト防止。`Content-Security-Policy` を `next.config.js` で設定 |
| 2 | **ハードコーディング禁止** | 全設定値は定数ファイルか環境変数。広告カテゴリ、表示間隔、アニメーション値、色、ブレークポイント等すべて設定ファイルに集約 |
| 3 | **多言語の無限拡張** | 翻訳は `messages/{locale}.json` にキーベース。コード内に日本語文字列を直書きしない。新言語 = JSONファイル1つ追加するだけ |
| 4 | **デザイントークン** | 色・フォント・影・角度・間隔・z-indexを全て `globals.css` の CSS Custom Properties で定義。UIの見た目変更 = 変数の値を変えるだけ |
| 5 | **大規模トラフィック対応** | 静的サイト配信のみ（サーバーダウンなし）。将来のサステナビリティに備え必要なページを初日から用意 |
| 6 | **システム設定に追従** | テーマ: `prefers-color-scheme` でOS設定を自動検出 → 手動切り替えも可能。言語: `navigator.language` でブラウザ言語を自動検出 → 手動切り替えも可能 |

---

## セクション 1: コアキャンバス

### 1.1 無限キャンバスのアーキテクチャ

```
外側のコンテナ（viewport・画面サイズ）
  └─ 内側のワールド（transform: translate(panX, panY) scale(zoom) で移動・拡縮）
       └─ カード群（position: absolute; left: x; top: y;）
```

#### 操作マッピング

| 操作 | PC | スマホ |
|------|-----|--------|
| キャンバス移動（パン） | 中ボタンドラッグ / Space+左ドラッグ / 2本指トラックパッド | 2本指ドラッグ |
| ズーム | マウスホイール / Ctrl+ホイール | ピンチイン/アウト |
| カード移動 | 左クリックドラッグ | 1本指ドラッグ |
| カード拡大表示 | ダブルクリック | ダブルタップ |
| カードメニュー | 右クリック | 長押し |

#### ズーム制限

- 最小: 0.1（全体を俯瞰）
- 最大: 3.0（カードの詳細を確認）
- デフォルト: 1.0

### 1.2 グリッド ⇄ コラージュ切り替え

切り替えボタンをツールバーに配置。2つのモードを持つ。

#### グリッドモード

- マソンリー（瀑布式）自動配置
- 列数: ビューポート幅に応じて自動（PC: 3〜5列、スマホ: 2列）
- カードの角度: 0°（整然）
- カードの影: 控えめ（`box-shadow: 0 2px 8px rgba(0,0,0,0.2)`）
- カード間隔: デザイントークン `--grid-gap`（デフォルト 16px）

#### コラージュモード

- 物理演算的に散布配置
- カードの角度: ランダム（-5°〜+5°）— 値はデザイントークン `--collage-rotation-range`
- カードの影: 深い（`box-shadow: 0 8px 24px rgba(0,0,0,0.5)`）
- カードの重なり: 許容（z-indexで前後関係管理。ドラッグしたカードが最前面）
- 新規カード追加時: 既存カードと重なりすぎない位置を探す（重なりOKだが完全に隠れるのはNG）

#### データ構造

IndexedDB の `cards` テーブルに2座標を保持:

```typescript
interface CardPosition {
  bookmarkId: string
  folderId: string
  // グリッドモード用（自動計算。手動変更不可）
  gridIndex: number
  // コラージュモード用（自動配置 or 手動ドラッグ）
  collageX: number
  collageY: number
  collageRotation: number  // 度
  collageScale: number
  zIndex: number
  isManuallyPlaced: boolean  // ユーザーが手動で動かしたか
}
```

#### 切り替えアニメーション

GSAPタイムラインで各カードを現在位置からターゲット位置にアニメーション。
duration: 0.6s、ease: `power2.inOut`。全カード同時ではなくstagger: 0.02sでずらす。

### 1.3 自動配置ロジック（コラージュモード）

新しいカードが保存されたとき:

1. ビューポートの中心付近にターゲット位置を決定
2. 既存カードのバウンディングボックスと照合
3. 重なりが50%を超える場合は位置をずらす（最大10回試行）
4. ランダムな角度（`-collage-rotation-range` 〜 `+collage-rotation-range`）を付与
5. 上から「ポトッ」と落下するアニメーション（GSAP、bounce ease）
6. ふわふわ浮遊アニメーション開始

### 1.4 デザイン磨き

#### デザイントークン（globals.css の :root に定義）

```css
:root {
  /* カラー — ライトテーマ */
  --color-bg: #fafafa;
  --color-surface: rgba(255, 255, 255, 0.8);
  --color-text: #1a1a1a;
  --color-text-secondary: #666;
  --color-accent: #6366f1;
  --color-accent-hover: #4f46e5;
  --color-border: rgba(0, 0, 0, 0.08);
  --color-glow: rgba(99, 102, 241, 0.3);
  --color-ad-badge: #f59e0b;

  /* カラー — ダークテーマ（prefers-color-scheme: dark で上書き） */
  /* --color-bg: #0a0a0a; etc. */

  /* タイポグラフィ */
  --font-display: 'Outfit', sans-serif;
  --font-body: 'Inter', sans-serif;
  --font-size-hero: clamp(2rem, 5vw, 4rem);
  --font-size-heading: clamp(1.25rem, 3vw, 2rem);
  --font-size-body: 1rem;
  --font-size-small: 0.875rem;
  --font-size-caption: 0.75rem;

  /* 影 */
  --shadow-card: 0 2px 8px rgba(0, 0, 0, 0.2);
  --shadow-card-hover: 0 8px 24px rgba(0, 0, 0, 0.3);
  --shadow-card-drag: 0 16px 48px rgba(0, 0, 0, 0.4);
  --shadow-collage: 0 8px 24px rgba(0, 0, 0, 0.5);

  /* アニメーション */
  --float-duration: 4s;
  --float-distance: 8px;
  --collage-rotation-range: 5deg;
  --transition-fast: 150ms ease;
  --transition-normal: 300ms ease;

  /* レイアウト */
  --grid-gap: 16px;
  --sidebar-width: 160px;
  --anchor-ad-height: 60px;
  --folder-nav-width: 56px;

  /* Glassmorphism */
  --glass-bg: rgba(255, 255, 255, 0.08);
  --glass-blur: 16px;
  --glass-border: 1px solid rgba(255, 255, 255, 0.12);

  /* z-index */
  --z-card: 1;
  --z-card-dragging: 100;
  --z-folder-nav: 200;
  --z-toolbar: 300;
  --z-modal: 400;
  --z-toast: 500;
  --z-bookmarklet-popup: 10000;

  /* ブレークポイント（メディアクエリで使用） */
  /* sm: 640px, md: 768px, lg: 1024px, xl: 1280px */
}
```

#### Glassmorphism 2.0 カード

```css
.card {
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border: var(--glass-border);
  border-radius: 12px;
  box-shadow: var(--shadow-card);
  transition: box-shadow var(--transition-normal),
              transform var(--transition-fast);
}
.card:hover {
  box-shadow: var(--shadow-card-hover);
  transform: scale(1.03);
}
```

#### ダーク/ライト追従

```css
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #0a0a0a;
    --color-surface: rgba(255, 255, 255, 0.06);
    --color-text: #f0f0f0;
    --color-text-secondary: #999;
    --color-border: rgba(255, 255, 255, 0.08);
    /* ... ダーク用の全変数 ... */
  }
}
```

手動切り替え: `<html data-theme="light|dark">` 属性で `prefers-color-scheme` を上書き。
設定はIndexedDBの `settings` テーブルに保存。

#### フォント

Google Fonts: `Inter`（本文）、`Outfit`（見出し・ブランド）
`next/font/google` で最適化読み込み。

### 1.5 変更が必要な既存ファイル

| ファイル | 変更内容 |
|---------|---------|
| `components/board/Canvas.tsx` | 固定サイズ → 無限キャンバス（pan/zoom）に全面書き直し |
| `components/board/DraggableCard.tsx` | キャンバス座標系に対応。パンとドラッグの競合解決 |
| `components/board/FolderNav.tsx` | 切り替えボタン（グリッド/コラージュ）を追加 |
| `lib/storage/indexeddb.ts` | カードに `gridIndex`, `collageX/Y/Rotation/Scale`, `isManuallyPlaced` 追加 |
| `components/board/ExportButton.tsx` | ビューポート範囲のみエクスポート（広告除外） |
| `app/globals.css` | デザイントークン全面追加。ダーク/ライト対応 |
| `app/layout.tsx` | Google Fonts（Inter, Outfit）読み込み。`data-theme` 属性 |
| `lib/constants.ts` | z-index定数をCSS変数に移行（constants.tsは削除検討） |

### 1.6 新規ファイル

| ファイル | 内容 |
|---------|------|
| `lib/canvas/infinite-canvas.ts` | パン/ズームのロジック（イベント処理、座標変換） |
| `lib/canvas/auto-layout.ts` | グリッド配置・コラージュ散布の計算ロジック |
| `lib/canvas/collision.ts` | カード重なり検出（自動配置時に使用） |
| `components/board/ViewModeToggle.tsx` | グリッド ⇄ コラージュ切り替えボタン |

---

## セクション 2: 運用基盤（省略）

本セクションの実装詳細は非公開ドキュメントで管理。

---

## セクション 3: 保存体験

### 3.1 ブックマークレットUI（SavePopup）

#### 技術方式

外部サイト上にBooklageドメインのiframeを埋め込む方式:

1. ブックマークレットJS → `booklage.com/bookmarklet/popup` のiframeを生成
2. 外部サイトのDOMからOGPメタタグを読み取り
3. `postMessage` でiframe内のSavePopupにOGPデータを送信
4. SavePopupがIndexedDBに保存（same-origin なので直接アクセス可能）

#### セキュリティ

- `postMessage` の `origin` を必ず検証（Booklageドメインのみ受け付け）
- iframeには `sandbox="allow-scripts allow-same-origin"` を設定
- 外部サイトのCookieや認証情報には一切アクセスしない
- CSP: `frame-ancestors 'self'` は設定しない（外部サイトから埋め込まれる必要があるため）
- iframeのsrc以外の外部通信ゼロ

#### ポップアップUI

```
┌──────────────────────────────┐
│ ✨ Booklage に保存            │  ← ヘッダー
│                               │
│ ┌───────────────────────────┐ │
│ │ [OG画像サムネイル]         │ │  ← 保存するページのプレビュー
│ │ ページタイトル              │ │
│ │ example.com                │ │
│ └───────────────────────────┘ │
│                               │
│ フォルダを選択:                │
│ ● 📁 ファッション             │  ← IndexedDBから読み込み
│ ○ 📁 テック                   │
│ ○ 📁 料理                     │
│ ＋ 新しいフォルダ              │  ← インラインでフォルダ名入力
│                               │
│        [ ✨ 保存 ]             │  ← 保存ボタン
└──────────────────────────────┘
```

- 保存成功時: チェックマークアニメーション → 1.5秒後にフェードアウト
- デザイン: Glassmorphism（ダーク背景 + ぼかし）
- 全テキスト: 翻訳キーで管理

#### 新規ファイル/ルート

| ファイル | 内容 |
|---------|------|
| `app/bookmarklet/popup/page.tsx` | iframe内に表示されるSavePopupページ |
| `components/bookmarklet/SavePopup.tsx` | ポップアップUIコンポーネント |
| `components/bookmarklet/SaveSuccess.tsx` | 保存成功アニメーション |
| `lib/utils/bookmarklet.ts` | 既存を更新: iframe埋め込みJS生成 |

### 3.2 PWA（Android Web Share Target）

#### manifest.json 追加内容

```json
{
  "name": "Booklage",
  "short_name": "Booklage",
  "start_url": "/board",
  "display": "standalone",
  "theme_color": "#0a0a0a",
  "background_color": "#0a0a0a",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ],
  "share_target": {
    "action": "/board",
    "method": "GET",
    "params": {
      "url": "shared_url",
      "title": "shared_title"
    }
  }
}
```

**注意**: `theme_color` はmanifest.jsonが静的ファイルのためダーク固定。実行時は `<meta name="theme-color">` をJSで動的に切り替えてシステム設定に追従させる。

#### 保存フロー

1. 外部アプリから共有 → `/board?shared_url=...&shared_title=...` で開く
2. `board/page.tsx` がURLパラメータを検出
3. フォルダ選択モーダルを表示（SavePopupと同じUI）
4. 保存 → カード着地アニメーション → コラージュ画面

### 3.3 iOSショートカット

- `/guide` ページに「iOSで使う」セクションを設置
- ショートカットの設定手順を動画付きで解説
- ショートカットの動作: 共有シートからURLを受け取り → `booklage.com/board?shared_url={URL}` をSafariで開く
- ショートカットファイル（`.shortcut`）をダウンロード可能にする（Apple Shortcuts形式。S6セッション内で具体的な生成方法を調査・実装）

### 3.4 保存後の引き込み演出

| 演出 | タイミング | 実装 |
|------|-----------|------|
| カード着地 | 保存直後 | GSAP: 上から落下 + bounce ease |
| ふわふわ開始 | 着地の0.5秒後 | CSS animation |
| カウンター | 着地の1秒後 | トースト: 「今週 N件保存！」 |
| シェア誘導 | フォルダ内5枚以上で初回のみ | トースト: 「コラージュをシェアしませんか？」 |

新規ファイル:

| ファイル | 内容 |
|---------|------|
| `components/board/SaveConfirmation.tsx` | 保存後の着地アニメーション + トースト |
| `components/ui/Toast.tsx` | 汎用トーストコンポーネント |

---

## セクション 4: マーケティング & ローンチ

### 4.1 LP（ランディングページ）

#### ページ構成

```
[ヒーローセクション]
  キャッチコピー（大胆なタイポグラフィ）
  サブコピー（1行）
  デモアニメーション（コラージュが組み上がるGIF/CSS）
  CTAボタン「今すぐ始める →」

[特徴セクション（ベントグリッド）]
  カード1: 全URL対応（Twitter, YouTube, TikTok, Instagram, 何でも）
  カード2: 美しいコラージュ（ドラッグ&ドロップで自由に配置）
  カード3: プライバシー安全（データはあなたのブラウザだけ）

[デモセクション]
  実際のコラージュのスクリーンショット or 動画

[使い方セクション]
  ステップ1: ブックマークレットを追加
  ステップ2: 好きなページで「保存」
  ステップ3: コラージュを楽しむ

[CTA再表示]
  「無料で始める →」

[フッター]
  リンク: Features, Guide, FAQ, About, Privacy, Terms, Contact
  言語切り替え
  © Booklage
```

- 全テキスト: 翻訳キーで管理
- ダーク/ライト: システム設定に追従
- レスポンシブ: スマホでも美しく表示

#### 新規ファイル

| ファイル | 内容 |
|---------|------|
| `app/(marketing)/page.tsx` | LPページ（Server Component） |
| `components/marketing/Hero.tsx` | ヒーローセクション |
| `components/marketing/Features.tsx` | 特徴セクション |
| `components/marketing/Demo.tsx` | デモセクション |
| `components/marketing/HowItWorks.tsx` | 使い方セクション |
| `components/marketing/Footer.tsx` | 共通フッター |
| `app/(marketing)/layout.tsx` | マーケティングページ共通レイアウト |

### 4.2 静的ページ

各ページは `app/(marketing)/` 以下に配置。共通レイアウトを使用。

| ページ | URL | ポイント |
|--------|-----|---------|
| Privacy Policy | `/privacy` | IndexedDBのみ使用。外部送信なし。Cookie: Cloudflare AnalyticsとAdSenseのみ |
| Terms of Service | `/terms` | 免責事項。ユーザーデータ非保持の明示 |
| FAQ | `/faq` | アコーディオンUI。SEOロングテール。翻訳キー管理 |
| About | `/about` | No Data Collection の哲学。オープンソース。プロジェクトの想い |
| Contact | `/contact` | Formspree（無料枠: 50件/月）でメールフォーム。必要に応じて有料プランへ移行 |
| Features | `/features` | 各機能を画像付きで紹介 |
| Guide | `/guide` | ブックマークレット設定チュートリアル。iOS/Android別の解説 |

### 4.3 追加言語（9言語）

既存の `messages/ja.json` と `messages/en.json` をベースに、Claudeで一括翻訳。

追加する言語:
- P1: `zh-CN.json`（中国語簡体）、`ko.json`（韓国語）
- P2: `es.json`（スペイン語）、`fr.json`（フランス語）、`de.json`（ドイツ語）、`pt.json`（ポルトガル語）、`it.json`（イタリア語）

翻訳ファイルの構造は既存のja.json/en.jsonと完全に同一のキー構造。
新言語追加 = JSONファイル1つ + `lib/i18n/config.ts` のロケール配列に1行追加。

### 4.4 Remotionプロモ動画

- 30秒のTikTok/YouTube Shorts向け縦動画
- 構成:
  1. (0-5s) ロゴ + キャッチコピー
  2. (5-15s) コラージュ操作のデモ（ドラッグ、ふわふわ、フォルダ切替）
  3. (15-25s) エクスポート → SNSシェアの流れ
  4. (25-30s) CTA「booklage.com」
- 完成した画面のスクリーンキャプチャ素材を使用

### 4.5 デプロイ

- Cloudflare Pages に静的エクスポートでデプロイ
- `next.config.js` に `output: 'export'` 設定
- `@cloudflare/next-on-pages` アダプター使用
- ドメイン: `booklage.com`（取得要確認）
- Cloudflare Analytics を有効化（Cookie不要・無料）

---

## セッション分割計画

全作業を10セッションに分割。各セッションは独立して実行可能。

### 各セッション共通の開始手順

```
1. docs/TODO.md を読む
2. docs/superpowers/specs/2026-04-10-week2-design.md（この文書）を読む
3. 該当セッションの「入力ファイル」を読む
4. 該当セッションの作業を実行
5. 完了条件を満たすことを確認
6. docs/TODO.md を更新
7. コミット + push
8. 次セッションへの引き継ぎメッセージを出力
```

### セッション一覧

#### S1: 無限キャンバス

- **入力**: `components/board/Canvas.tsx`, `components/board/DraggableCard.tsx`, `app/(app)/board/board-client.tsx`
- **作業**: Canvas.tsxを無限キャンバスに書き直し。DraggableCardをキャンバス座標系に対応。パン/ズーム実装
- **完了条件**:
  - PC: マウスホイールでズーム、中ボタン or Space+ドラッグでパン
  - スマホ: ピンチズーム、2本指パン
  - カードドラッグがパンと競合しない
  - `npm run build` が通る
- **依存**: なし（最初に実行）

#### S2: グリッド ⇄ コラージュ切替

- **入力**: S1完了後の `Canvas.tsx`, `lib/storage/indexeddb.ts`
- **作業**: ViewModeToggle追加。グリッドモード（マソンリー）実装。コラージュモード（散布+重なり+ランダム角度）実装。切替アニメーション。IndexedDBスキーマ更新
- **完了条件**:
  - ボタンでグリッド ⇄ コラージュ切り替え
  - 切替時にGSAPアニメーション
  - コラージュモードでカードに角度+重なりがある
  - 新規カード追加時に自動配置される
  - `npm run build` が通る
- **依存**: S1

#### S3: デザイン磨き

- **入力**: S2完了後の全 `components/`, `app/globals.css`, `app/layout.tsx`
- **作業**: デザイントークン定義。Glassmorphism 2.0。ダーク/ライト追従。Google Fonts。ホバー/ドラッグ時のアニメーション強化。全UIコンポーネントのデザイン適用
- **完了条件**:
  - `globals.css` にデザイントークン全定義
  - `prefers-color-scheme` でダーク/ライト自動切替
  - カードがGlassmorphism表現
  - Inter/Outfitフォントが読み込まれている
  - Lighthouse Performance > 90
  - `npm run build` が通る
- **依存**: S2

#### S4: 運用基盤

本タスクの実装詳細は非公開ドキュメントで管理。

#### S5: ブックマークレットUI

- **入力**: この設計書のセクション3.1, `lib/utils/bookmarklet.ts`
- **作業**: SavePopupページとコンポーネント実装。iframe通信。セキュリティ検証
- **完了条件**:
  - 外部サイトでブックマークレットクリック → ポップアップ表示
  - OGP情報（タイトル、画像、URL）が表示される
  - フォルダ選択 → 保存がIndexedDBに反映
  - 保存成功アニメーション
  - `postMessage` のorigin検証が動作
  - `npm run build` が通る
- **依存**: S3（デザイントークン使用のため）

#### S6: PWA + スマホ保存

- **入力**: `public/manifest.json`, `app/(app)/board/page.tsx`, この設計書のセクション3.2〜3.4
- **作業**: manifest.json更新。Web Share Target対応。iOSショートカット作成。保存後の引き込み演出（SaveConfirmation, Toast）
- **完了条件**:
  - Android: PWAインストール → 外部アプリから共有 → Booklageで保存
  - URLパラメータ `?shared_url=` で保存フローが起動
  - 保存後にカード着地アニメーション + トースト表示
  - iOSショートカットファイルがダウンロード可能
  - `npm run build` が通る
- **依存**: S3

#### S7: LP

- **入力**: S3完了後のデザイントークン, この設計書のセクション4.1
- **作業**: LPの全セクション実装。レスポンシブ対応。翻訳キー管理。デモアニメーション
- **完了条件**:
  - `/` にLP表示
  - ヒーロー、特徴、デモ、使い方、フッターの全セクション
  - ダーク/ライト追従
  - スマホで美しく表示
  - 全テキストが翻訳キー（ハードコーディングなし）
  - `npm run build` が通る
- **依存**: S3

#### S8: 静的ページ

- **入力**: S7完了後のレイアウト/フッター, この設計書のセクション4.2
- **作業**: Privacy, Terms, FAQ, About, Contact, Features, Guide の7ページ実装
- **完了条件**:
  - 7ページ全てアクセス可能
  - 共通レイアウト使用
  - 全テキスト翻訳キー管理
  - Contact: Formspreeフォーム動作
  - Guide: ブックマークレット設定チュートリアル含む
  - `npm run build` が通る
- **依存**: S7

#### S9: 追加言語

- **入力**: S8完了後の `messages/ja.json`（全キーが揃った状態）
- **作業**: 9言語の翻訳JSON生成。`lib/i18n/config.ts` 更新
- **完了条件**:
  - 9言語のJSONファイルが `messages/` に追加
  - 全キーが翻訳済み（欠落なし）
  - 言語切替UIで全言語選択可能
  - `navigator.language` での自動検出が動作
  - UIコード変更ゼロ（翻訳ファイルと設定のみ）
  - `npm run build` が通る
- **依存**: S8（全UIテキストが確定した後）

#### S10: プロモ動画 + デプロイ

- **入力**: 全セッション完了後の完成画面
- **作業**: Remotionで30秒動画制作。Cloudflare Pagesデプロイ。ドメイン設定。Analytics有効化
- **完了条件**:
  - 30秒縦動画がMP4で書き出し完了
  - Cloudflare Pagesにデプロイ成功
  - `booklage.com`（or 仮ドメイン）でアクセス可能
  - Cloudflare Analytics 有効
  - 全ページの動作確認完了
- **依存**: S1〜S9 全て

### 依存関係図

```
S1（無限キャンバス）
  └─ S2（グリッド/コラージュ切替）
       └─ S3（デザイン磨き）
            ├─ S4（広告基盤）
            ├─ S5（ブックマークレットUI）
            ├─ S6（PWA + スマホ保存）
            └─ S7（LP）
                 └─ S8（静的ページ）
                      └─ S9（追加言語）
                           └─ S10（動画 + デプロイ）
```

S4, S5, S6, S7 は S3 完了後に**並列実行可能**。

---

*この設計書は承認済みです。各セッションの冒頭で必ず読むこと。*
*承認日: 2026-04-10*
