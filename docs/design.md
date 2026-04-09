# Booklage — デザインシステム仕様書

> **このファイルはUIの設計指針・デザイントークン・コンポーネント規約をまとめた設計書です。**
> 実装時は必ずこのファイルを参照し、ここに定義された値を使用すること。
> マジックナンバーや直書きの色・サイズ・z-indexは禁止。

---

## 1. デザイン原則

| 原則 | 説明 |
|------|------|
| **表現 > 整理** | 整理ツールではなく表現ツール。楽しさ・美しさを最優先する |
| **触って気持ちいい** | 全ての操作にマイクロインタラクションを付ける。無反応のUIは存在しない |
| **コラージュ感** | 完璧な整列ではなく、あえて少しランダムな角度・サイズで「手作り感」を出す |
| **軽量** | First Load JS < 200KB。視覚的リッチさとパフォーマンスを両立する |
| **アクセシブル** | WCAG 2.2 AA準拠。キーボード操作・スクリーンリーダー対応 |

---

## 2. デザイントークン

全て `globals.css` の `:root` にCSS Custom Propertiesとして定義する。
コンポーネント内でのハードコーディング禁止。

### 2.1 カラーパレット

```css
:root {
  /* === ベースカラー（ダークモード — デフォルト） === */
  --color-bg-primary: #0a0a0f;
  --color-bg-secondary: #12121a;
  --color-bg-tertiary: #1a1a28;
  --color-bg-elevated: #222233;

  /* === テキスト === */
  --color-text-primary: #f0f0f5;
  --color-text-secondary: #a0a0b8;
  --color-text-tertiary: #6b6b80;
  --color-text-inverse: #0a0a0f;

  /* === アクセントカラー === */
  --color-accent-primary: #7c5cfc;       /* メインアクション */
  --color-accent-primary-hover: #9178ff;
  --color-accent-secondary: #20c997;     /* 成功・保存完了 */
  --color-accent-warning: #ffd43b;
  --color-accent-danger: #ff6b6b;

  /* === Glassmorphism === */
  --color-glass-bg: rgba(255, 255, 255, 0.06);
  --color-glass-border: rgba(255, 255, 255, 0.1);
  --color-glass-bg-hover: rgba(255, 255, 255, 0.1);

  /* === カード === */
  --color-card-bg: rgba(255, 255, 255, 0.04);
  --color-card-border: rgba(255, 255, 255, 0.08);
  --color-card-shadow: rgba(0, 0, 0, 0.4);
  --color-card-glow: rgba(124, 92, 252, 0.15);

  /* === フォルダカラー（ユーザー選択用、10色） === */
  --folder-red: #ff6b6b;
  --folder-orange: #ff922b;
  --folder-yellow: #ffd43b;
  --folder-green: #51cf66;
  --folder-teal: #20c997;
  --folder-blue: #339af0;
  --folder-indigo: #5c7cfa;
  --folder-purple: #cc5de8;
  --folder-pink: #f06595;
  --folder-gray: #868e96;
}

/* === ライトモード === */
[data-theme="light"] {
  --color-bg-primary: #fafafa;
  --color-bg-secondary: #f0f0f5;
  --color-bg-tertiary: #e8e8f0;
  --color-bg-elevated: #ffffff;

  --color-text-primary: #1a1a2e;
  --color-text-secondary: #4a4a60;
  --color-text-tertiary: #8888a0;
  --color-text-inverse: #f0f0f5;

  --color-glass-bg: rgba(255, 255, 255, 0.7);
  --color-glass-border: rgba(0, 0, 0, 0.08);
  --color-glass-bg-hover: rgba(255, 255, 255, 0.85);

  --color-card-bg: rgba(255, 255, 255, 0.9);
  --color-card-border: rgba(0, 0, 0, 0.06);
  --color-card-shadow: rgba(0, 0, 0, 0.1);
  --color-card-glow: rgba(124, 92, 252, 0.1);
}
```

### 2.2 タイポグラフィ

```css
:root {
  /* === フォントファミリー === */
  --font-heading: 'Outfit', sans-serif;    /* 見出し — 大胆なタイポグラフィ */
  --font-body: 'Inter', sans-serif;        /* 本文 — 可読性重視 */
  --font-mono: 'JetBrains Mono', monospace; /* コード・URL表示 */

  /* === フォントサイズ（1.25倍スケール） === */
  --text-xs: 0.75rem;     /* 12px — ラベル、補足 */
  --text-sm: 0.875rem;    /* 14px — 小テキスト */
  --text-base: 1rem;      /* 16px — 本文 */
  --text-lg: 1.25rem;     /* 20px — 小見出し */
  --text-xl: 1.563rem;    /* 25px — セクション見出し */
  --text-2xl: 1.953rem;   /* 31.25px — ページ見出し */
  --text-3xl: 2.441rem;   /* 39px — LP大見出し */
  --text-4xl: 3.052rem;   /* 48.8px — LPヒーロー */

  /* === フォントウェイト === */
  --weight-normal: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-bold: 700;
  --weight-extrabold: 800;

  /* === 行間 === */
  --leading-tight: 1.2;   /* 見出し */
  --leading-normal: 1.5;  /* 本文 */
  --leading-relaxed: 1.75; /* 長文 */
}
```

### 2.3 スペーシング（4pxベース）

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;
  --space-24: 96px;
}
```

### 2.4 影（Elevation）

```css
:root {
  /* カードの影 — 浮遊感を表現 */
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.2);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.25);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.3);
  --shadow-xl: 0 16px 48px rgba(0, 0, 0, 0.4);

  /* ドラッグ中の影（掴むと影が深くなる） */
  --shadow-drag: 0 20px 60px rgba(0, 0, 0, 0.5);

  /* カードのグロー（ホバー時） */
  --shadow-glow: 0 0 20px var(--color-card-glow);
}
```

### 2.5 角丸

```css
:root {
  --radius-sm: 6px;      /* ボタン、入力フィールド */
  --radius-md: 12px;     /* カード */
  --radius-lg: 16px;     /* モーダル、パネル */
  --radius-xl: 24px;     /* 大きなコンテナ、ベントグリッド */
  --radius-full: 9999px; /* ピル型、アバター */
}
```

### 2.6 z-index

`lib/constants.ts` で管理。CSS内での直書き禁止。

```typescript
// lib/constants.ts
export const Z_INDEX = {
  CANVAS_CARD: 1,           // キャンバス上のカード（通常）
  CANVAS_CARD_DRAGGING: 50, // ドラッグ中のカード
  FOLDER_NAV: 60,           // フォルダナビゲーション
  TOOLBAR: 70,              // ツールバー
  DROPDOWN: 80,             // ドロップダウンメニュー
  MODAL_BACKDROP: 90,       // モーダル背景
  MODAL: 100,               // モーダル本体
  TOAST: 110,               // 通知トースト
  BOOKMARKLET_POPUP: 120,   // ブックマークレットのポップアップ
  PIP_DROPZONE: 130,        // PiPドロップゾーン（将来）
} as const
```

---

## 3. Glassmorphism 2.0 仕様

2026年版Glassmorphismのガイドライン: 「見せびらかし」ではなく、**視覚的階層を作る実用的ツール**として使う。

### 適用する場所

| コンポーネント | backdrop-filter | background | border |
|---------------|----------------|------------|--------|
| フォルダナビ | `blur(16px)` | `var(--color-glass-bg)` | `1px solid var(--color-glass-border)` |
| ツールバー | `blur(12px)` | `var(--color-glass-bg)` | `1px solid var(--color-glass-border)` |
| モーダル | `blur(20px)` | `rgba(10, 10, 15, 0.8)` | `1px solid var(--color-glass-border)` |
| ブックマークレットポップアップ | `blur(16px)` | `rgba(10, 10, 15, 0.85)` | `1px solid var(--color-glass-border)` |

### 適用しない場所

- **ブックマークカード**: カード内のテキスト可読性が最優先。カード自体は不透明。
- **LP本文**: 長文テキストの背景にぼかしを入れない。可読性を犠牲にしない。

### 実装パターン

```css
.glass-panel {
  background: var(--color-glass-bg);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--color-glass-border);
  border-radius: var(--radius-lg);
}
```

---

## 4. アニメーション仕様

### 4.1 タイミング関数

```css
:root {
  /* === イージング === */
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);    /* 素早く出て、ゆっくり止まる */
  --ease-out-back: cubic-bezier(0.34, 1.56, 0.64, 1); /* 少し行き過ぎて戻る（バウンス感） */
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);        /* 標準的な出入り */
  --ease-spring: cubic-bezier(0.22, 1.36, 0.36, 1);   /* スプリング風 */

  /* === 持続時間 === */
  --duration-instant: 100ms;   /* ホバー、フォーカス */
  --duration-fast: 200ms;      /* ボタンクリック、トグル */
  --duration-normal: 300ms;    /* パネル開閉、フェード */
  --duration-slow: 500ms;      /* カード移動、フォルダ切り替え */
  --duration-dramatic: 800ms;  /* 新規保存バウンス、削除 */
}
```

### 4.2 アニメーション一覧（8種）

仕様書セクション6で定義済みの8種を実装仕様に落とし込む。

#### ① ふわふわ浮遊（全カード常時）

```css
@keyframes float {
  0%, 100% {
    transform: translateY(0) rotate(var(--card-rotation));
  }
  50% {
    transform: translateY(-8px) rotate(calc(var(--card-rotation) + 1deg));
  }
}

.bookmark-card {
  --card-rotation: 0deg;  /* JS側でランダム値を設定: -3deg 〜 3deg */
  --float-delay: 0s;      /* JS側でランダム値を設定: 0s 〜 4s */
  animation: float 4s var(--ease-in-out) infinite;
  animation-delay: var(--float-delay);
}
```

- `--card-rotation` をカードごとにランダム（-3deg〜3deg）で設定し、コラージュ感を出す。
- `--float-delay` をカードごとにランダム（0s〜4s）で設定し、一斉に動かない自然さを出す。
- `prefers-reduced-motion: reduce` の場合はアニメーション無効化。

#### ② フォルダ切り替え（散布アニメーション）

```
現在のカードが四方八方に飛び散る（GSAP Timeline）
  → 0.3s 待機
  → 新しいフォルダのカードが中央から四方に飛んで配置される
```

- GSAP Timeline で `stagger` を使い、カードが1枚ずつ時間差で動く。
- 各カードの飛び散る方向はランダム。
- View Transitions API の活用を検討（ブラウザ対応状況を確認の上）。

#### ③ ランダムピック

```
全カードが一斉にシャッフル回転（GSAP）
  → 1枚に絞り込み
  → 選ばれたカードが中央で拡大表示
  → 残りのカードは透明度を下げる
```

#### ④ ドラッグ移動

```
掴む → shadow を --shadow-drag に変更 + scale(1.05) + z-index上昇
移動中 → GSAP Draggable で追従
離す → --shadow-md に戻る + scale(1.0) + ふわっと着地（--ease-out-back）
```

#### ⑤ ホバー

```css
.bookmark-card:hover {
  transform: scale(1.03) rotate(var(--card-rotation));
  box-shadow: var(--shadow-lg), var(--shadow-glow);
  transition: transform var(--duration-fast) var(--ease-out-expo),
              box-shadow var(--duration-fast) var(--ease-out-expo);
}
```

#### ⑥ 新規保存

```
カードが画面上部（Y: -100px）から落下
  → バウンド着地（--ease-out-back, 800ms）
  → 一瞬のグロー発光
  → 通常のふわふわ浮遊に移行
```

#### ⑦ 削除

```
カードが縮小 + 回転（360deg）+ 透明化
  → 0.5s で完全に消える
  → GSAP: rotation: 360, scale: 0, opacity: 0, duration: 0.5
```

#### ⑧ 色別サジェスト

```
選択した色以外のカード → opacity: 0.15 + filter: grayscale(0.8)
選択した色のカード → そのまま + グロー強調
切り替え時間: 300ms
```

### 4.3 アクセシビリティ

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 5. レスポンシブ設計

### ブレークポイント

```css
:root {
  --bp-sm: 640px;   /* スマホ横向き */
  --bp-md: 768px;   /* タブレット */
  --bp-lg: 1024px;  /* デスクトップ小 */
  --bp-xl: 1280px;  /* デスクトップ */
  --bp-2xl: 1536px; /* ワイドスクリーン */
}

/* 使用例 */
@media (min-width: 768px) { /* タブレット以上 */ }
@media (min-width: 1024px) { /* デスクトップ以上 */ }
```

### Container Queries（カード内レスポンシブ）

コラージュカードはサイズが可変のため、Container Queriesでカード内のレイアウトを制御する。

```css
.bookmark-card {
  container-type: inline-size;
  container-name: card;
}

/* カード幅が200px以下の場合、サムネイルを非表示 */
@container card (max-width: 200px) {
  .card-thumbnail { display: none; }
  .card-title { font-size: var(--text-sm); }
}

/* カード幅が300px以上の場合、説明文を表示 */
@container card (min-width: 300px) {
  .card-description { display: block; }
}
```

### キャンバスのレスポンシブ

| 画面サイズ | キャンバス挙動 |
|-----------|--------------|
| モバイル（< 768px） | 縦スクロール。カードは自動配置（マソンリー風）。ドラッグはタッチ対応。 |
| タブレット（768px〜1024px） | 自由配置キャンバス。ピンチズーム対応。 |
| デスクトップ（> 1024px） | フル自由配置キャンバス。パン＆ズーム。フォルダナビはサイドバー。 |

---

## 6. 背景テーマ（9種類）

仕様書セクション6で定義済みの9テーマの実装仕様。

```css
/* テーマごとのCSS Custom Properties */
[data-bg-theme="minimal-white"] {
  --canvas-bg: #fafafa;
  --canvas-pattern: none;
}

[data-bg-theme="grid"] {
  --canvas-bg: #fafafa;
  --canvas-pattern: 
    linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px);
  --canvas-pattern-size: 24px 24px;
}

[data-bg-theme="cork"] {
  --canvas-bg: #c4956a;
  --canvas-pattern: url('/textures/cork.webp');
}

[data-bg-theme="dark"] {
  --canvas-bg: #0a0a0f;
  /* カードにグロー効果を追加 */
}

[data-bg-theme="space"] {
  --canvas-bg: linear-gradient(135deg, #0a0a2e, #1a0a3e);
  /* 星パーティクルはCSS + 軽量JS */
}

[data-bg-theme="forest"] {
  --canvas-bg: #1a3a1a;
  --canvas-pattern: url('/textures/forest.webp');
}

[data-bg-theme="ocean"] {
  --canvas-bg: linear-gradient(180deg, #0a2a4a, #0a4a6a);
}

[data-bg-theme="custom-color"] {
  --canvas-bg: var(--user-custom-color, #1a1a2e);
}

[data-bg-theme="custom-image"] {
  --canvas-bg: var(--user-custom-color, #1a1a2e);
  /* 画像はIndexedDBから読み込み、CSS background-imageで設定 */
}
```

---

## 7. コンポーネント設計規約

### 命名規則

- CSS Modules: `ComponentName.module.css`
- クラス名: camelCase（`.bookmarkCard`, `.folderNav`）
- CSS変数参照: 必ずトークンを使う。直書き禁止。

### カード情報優先順位: ビジュアルファースト

コラージュは「表現ツール」。画像があるカードはビジュアルを全面に出し、テキストは最小限にする。

| 種別 | 通常表示 | ホバー時に追加表示 |
|------|---------|-----------------|
| Tweet（画像付き） | 画像全面 + ファビコン小 | ツイートテキスト |
| Tweet（テキストのみ） | react-tweetによるテキスト表示 | — |
| YouTube | サムネイル全面 | タイトル + チャンネル名 |
| TikTok | サムネイル全面 | タイトル |
| Instagram | 画像全面 | キャプション |
| Website（OGP画像あり） | サムネイル全面 + ファビコン小 | タイトル + サイト名 |
| Website（OGP画像なし） | ファビコン + タイトル + サイト名 | 説明文 |

### カード種別

| 種別 | コンポーネント | 表示内容 |
|------|--------------|---------|
| Tweet | `TweetCard.tsx` | react-tweet によるツイート表示 |
| YouTube | `BookmarkCard.tsx` + oEmbed | サムネイル + 動画プレーヤー |
| TikTok | `BookmarkCard.tsx` + oEmbed | サムネイル + 動画プレーヤー |
| Instagram | `BookmarkCard.tsx` + oEmbed | 投稿埋め込み |
| Website | `BookmarkCard.tsx` + OGP | サムネイル + タイトル + 説明 |

### 共通カードスタイル

```css
/* === カードベーススタイル === */
.bookmarkCard {
  background: var(--color-card-bg);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  overflow: hidden;
  cursor: grab;

  /* ふわふわ浮遊 */
  animation: float 4s var(--ease-in-out) infinite;
  animation-delay: var(--float-delay);

  /* ホバー */
  transition: transform var(--duration-fast) var(--ease-out-expo),
              box-shadow var(--duration-fast) var(--ease-out-expo);
}

.bookmarkCard:hover {
  transform: scale(1.03) rotate(var(--card-rotation));
  box-shadow: var(--shadow-lg), var(--shadow-glow);
}

.bookmarkCard:active {
  cursor: grabbing;
}

/* === Glassmorphism カードモード（設定で切替可能） === */
[data-card-style="glass"] .bookmarkCard {
  background: var(--color-glass-bg);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--color-glass-border);
}

[data-card-style="glass"] .bookmarkCard:hover {
  background: var(--color-glass-bg-hover);
}
```

カードスタイルの切替は `<body data-card-style="solid">` （デフォルト）と `<body data-card-style="glass">` で制御する。
ユーザーの設定（IndexedDB `settings` ストア）に `cardStyle: 'solid' | 'glass'` を追加する。
```

---

## 8. アイコン・ファビコン

- アイコンライブラリ: 使用しない。SVGを直接使用してバンドルサイズを抑える。
- サイトファビコン: ブックマーク + コラージュをモチーフにしたオリジナルSVG。
- プラットフォームアイコン（Twitter, YouTube等）: 各プラットフォームのファビコンを取得して表示。

---

## 9. パフォーマンスガイドライン

| 指標 | 目標 | 実現方法 |
|------|------|---------|
| LCP | < 2.5s | SSGによる静的配信、フォント最適化（`font-display: swap`） |
| CLS | < 0.1 | 画像に`width`/`height`指定、レイアウトシフト防止 |
| First Load JS | < 200KB | GSAP + idb のみ。不要なライブラリを入れない |
| 50枚カード | 60fps | 仮想化（viewport外のカードは`content-visibility: auto`） |
| フォント | < 50KB | Inter + Outfit のsubset（Latin + Japanese） |

### 画像最適化

- OGPサムネイル: `next/image` による自動最適化（WebP変換、リサイズ）
- 背景テクスチャ: WebP形式、最大200KB以下
- 遅延読み込み: viewport外の画像は`loading="lazy"`

---

## 10. Google Fonts 読み込み

```html
<!-- app/layout.tsx の next/font で最適化読み込み -->
```

```typescript
// app/layout.tsx
import { Inter, Outfit } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-heading',
  display: 'swap',
})
```

---

## デザインインスピレーション参照先

- [Awwwards](https://www.awwwards.com/) — 最先端Webデザイン受賞作
- [Mobbin](https://mobbin.com/) — 一流アプリUIパターン
- [Muzli](https://muz.li/) — リアルタイムデザイントレンド
- [GitHub Primer](https://primer.style/) — トークン設計の参考
- [Radix UI](https://www.radix-ui.com/) — アクセシブルなプリミティブ

---

*最終更新: 2026-04-10*
