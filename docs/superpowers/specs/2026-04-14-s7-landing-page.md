# S7: ランディングページ 設計書

## 概要

AllMarksのランディングページ（`/`）を、デモ型のインタラクティブLPとして実装する。スクロールすると何ができるかアニメーションで体験でき、プロダクトの魅力が直感的に伝わる。

## デザイン方針

- **トーン**: クリエイティブ寄り — 「整理ツール」ではなく「表現ツール」
- **スクロール**: 退屈でない、多方向・多アニメーション展開（参考: motion.zajno.com, evasanchez.info）
- **Hero**: B+C融合 — テンポ良い3ワードキャッチ + コラージュが主役の没入感
- **ダークモード標準**: `#0a0a1a` 背景

## 参考サイト・取り入れる要素

| サイト | 取り入れる要素 |
|--------|--------------|
| motion.zajno.com | Lenisスムーズスクロール、スタガーリビール、Floating Dimensionality |
| gggggggg.jp | WebPタイリング背景テクスチャ、clip-path遷移、ブラー入場 |
| repponen.com | コラージュ的な重なり合うレイアウト |
| evasanchez.info | スクロール連動のブラー/リビール |
| dashdigital.studio | 目的のあるアニメーション、セクション構成のリズム |
| editora.jp | ギャラリー的世界観、瞑想的ブラウジング |
| davidwhyte.com/experience | 意図的なローディング演出、Scroll to exploreパターン |
| studio.gen-m.jp/exh | 余白の美学、コンテンツファースト |

## 技術スタック

| 技術 | 用途 |
|------|------|
| Lenis | スムーズスクロール基盤 |
| GSAP ScrollTrigger | スクロール連動アニメーション |
| GSAP（既存） | カード/要素のアニメーション |
| CSS Modules | コンポーネントスタイル |
| CSS Custom Properties（既存） | テーマ変数 |
| Next.js Server Components | ページ本体 |
| `'use client'` 末端コンポーネント | スクロール/アニメーション制御 |

### 新規依存パッケージ

- `lenis` — スムーズスクロール（軽量、~3KB gzip）

**GSAP ScrollTriggerはGSAP同梱のため追加インストール不要。**

## セクション構成（6セクション）

### Section 1: Hero

**キャッチコピー:**
```
Bookmark. Collage. Share.
あらゆるWebサイトを、あなただけのコラージュに。
```

**ビジュアル:**
- 背景: ダーク + WebPノイズテクスチャ
- 浮遊するガラスカード5〜7枚がふわふわアニメーション（既存の `@keyframes float` を流用）
- カードは半透明ガラススタイル、微妙な回転・サイズ差
- キャッチコピーはグラデーションテキスト（`#7c5cfc` → `#c084fc` → `#f472b6`）
- フォント: Outfit（既存の `--font-heading`）、800 weight

**CTA:**
- 「始める — 無料」ボタン（プライマリ、`#7c5cfc`、pill形状）
- 「↓ デモを見る」ボタン（ゴースト、スクロールダウン誘導）

**スクロール演出:**
- ページロード時: カードがブラー状態から0.8秒かけてフォーカスイン（ブラー入場）
- キャッチコピー: 下からフェードアップ（stagger 0.1s）
- CTAボタン: 最後にフェードイン

### Section 2: 保存デモ

**見出し:** 「ワンクリックで保存」
**サブ:** 「ブックマークレットをクリック → OGP自動取得 → カードが飛んでくる」

**ビジュアル:**
- 左→右に3ステップのフロー表示:
  1. ブラウザモックアップ（任意サイト + ブックマークレットボタン）
  2. SavePopupモックアップ（フォルダ選択 + 保存ボタン）
  3. カードが飛んでくるアニメーション

**スクロール演出:**
- スクロール進行に合わせて3ステップが順次リビール
- ステップ間を矢印（→）が伸びるアニメーション
- 最後のカードはスケール0→1 + 回転 + バウンスで着地

### Section 3: コラージュデモ

**見出し:** 「自由に並べる」
**サブ:** 「ドラッグ、回転、リサイズ。あなたのキャンバスに制限はない。」

**ビジュアル:**
- 5枚のカード（YouTube, Twitter/X, ブログ, Instagram, TikTok）が重なり合うコラージュ
- 各カードは異なるサイズ・角度・色

**スクロール演出:**
- スクロール開始: 空のキャンバス
- スクロール進行: カードが一枚ずつ画面外から飛んできて配置される（stagger 0.15s）
- 各カードは異なる方向（上/左/右/下）から入場
- 着地時にバウンスイーズ + リプルエフェクト
- 最後のカードが着地したら全体が微妙にふわふわ浮遊開始

### Section 4: スタイル切替

**見出し:** 「スタイルを着せ替え」
**サブ:** （なし — ビジュアルで語る）

**ビジュアル:**
- Section 3で組み上がったコラージュがそのまま残り、スクロールでスタイルが変化:
  1. Glass（ガラス効果、リキッドグラス）
  2. Polaroid（白枠、影）
  3. Newspaper（セピア、古紙テクスチャ）
  4. Magnet（白、冷蔵庫マグネット）

**スクロール演出:**
- スクロール進行率に応じてスタイルが順次切り替わる（clip-path遷移）
- 各スタイル名がフェードイン/アウト
- 切り替え時にカード全体にブラー→フォーカスの瞬間的トランジション

### Section 5: 共有デモ

**見出し:** 「コラージュを世界へ」
**サブ:** 「画像として保存 → SNSにシェア → バイラル」

**ビジュアル:**
- 3ステップフロー:
  1. コラージュ → 2. PNG画像 → 3. SNSシェア（X, Instagram等）

**スクロール演出:**
- Section 2と同様のステップ順次リビール
- PNG出力時にスクリーンショット風のフラッシュエフェクト
- SNSアイコンがスタガーでポップイン

### Section 6: CTA

**キャッチコピー:**
```
Make it yours.
無料。登録不要。データはあなたのブラウザだけに。
```

**ビジュアル:**
- シンプルなセンタリング
- 大きなCTAボタン「コラージュを始める」（グラデーション背景 + box-shadow）
- 下に小さなプライバシーメッセージ

**スクロール演出:**
- テキストが下からフェードアップ
- ボタンがスケール0.8→1 + グロー効果でフェードイン

## ファイル構成

```
app/
  page.tsx                          # LPページ（Server Component）
components/
  marketing/
    LandingPage.tsx                 # LP全体のClient Component
    LandingPage.module.css          # LPスタイル
    sections/
      HeroSection.tsx               # Section 1
      HeroSection.module.css
      SaveDemoSection.tsx           # Section 2
      SaveDemoSection.module.css
      CollageDemoSection.tsx        # Section 3
      CollageDemoSection.module.css
      StyleSwitchSection.tsx        # Section 4
      StyleSwitchSection.module.css
      ShareDemoSection.tsx          # Section 5
      ShareDemoSection.module.css
      CtaSection.tsx                # Section 6
      CtaSection.module.css
lib/
  scroll/
    use-smooth-scroll.ts            # Lenis初期化Hook
    use-scroll-trigger.ts           # ScrollTrigger初期化Hook
```

## レスポンシブ対応

| ブレイクポイント | 対応 |
|----------------|------|
| Desktop (1024px+) | フル演出 |
| Tablet (768-1023px) | 横並びフロー→縦積みに変更、アニメーション維持 |
| Mobile (〜767px) | アニメーション簡略化（`prefers-reduced-motion`対応）、縦積みレイアウト |

## パフォーマンス要件

- First Load JS: < 200KB（Lenis ~3KB + ScrollTrigger ~12KB + ページ本体）
- LCP: < 2.5s（Heroセクションのテキストが LCP 要素）
- CLS: < 0.1
- Lighthouse: > 90
- `prefers-reduced-motion: reduce` 時はアニメーションを全てカット → 静的表示にフォールバック

## アクセシビリティ

- セマンティックHTML: `<section>`, `<h1>`, `<h2>`, `<nav>`
- `prefers-reduced-motion` 完全対応
- キーボードナビゲーション可能
- CTAボタンは `<a href="/board">` で実装（button不可 — ページ遷移のため）
- 画像にalt属性

## 将来の拡展

- 多言語対応（S11で `next-intl` 導入時に対応）
- ヒーロービデオ（Remotionプロモ動画制作後に追加可能）
- ダーク/ライト切替トグル（現在はダーク固定）
