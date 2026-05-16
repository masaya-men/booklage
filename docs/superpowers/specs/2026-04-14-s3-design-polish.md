# S3 デザイン磨き — 設計書

> **作成日**: 2026-04-14
> **ステータス**: 承認済み（ブレスト完了）
> **アプローチ**: B（見た目インパクト先行）
> **依存**: S2（グリッド⇄コラージュ切替）完了済み

---

## 概要

AllMarksのビジュアルを「使えるツール」から「触って楽しい表現ツール」に引き上げる。
リキッドグラス、4種のカードスタイル、リッチインタラクション、テーマ連動を実装し、
「SNSでシェアしたくなる見た目」を実現する。

### 実装順序（B案: 見た目インパクト先行）

1. リキッドグラス + リッチインタラクション（既存Glassカード上で）
2. カードサイズ/アスペクト比システム
3. カードスタイル切替システム + 残り3スタイル
4. テーマ連動 + 設定パネル拡張
5. パフォーマンス最適化 + 段階的劣化

---

## 1. リキッドグラスシステム

### 1.1 ハイブリッド戦略

Chrome対応ブラウザでは本物のSVG feDisplacementMapによる屈折効果、
非対応ブラウザでは高品質なGlassmorphismフォールバックを提供する。

**Chrome（本物のリキッドグラス）:**

```xml
<svg color-interpolation-filters="sRGB">
  <filter id="liquidGlass">
    <feImage
      href="{displacementMapDataUrl}"
      x="0" y="0" width="{width}" height="{height}"
      result="displacement_map"
    />
    <feDisplacementMap
      in="SourceGraphic"
      in2="displacement_map"
      scale="{maximumDisplacement}"
      xChannelSelector="R"
      yChannelSelector="G"
    />
  </filter>
</svg>
```

- `backdrop-filter: url(#liquidGlass)` で適用
- displacement mapはCanvas 2Dで角丸の屈折を計算し、data URLに変換
- `@supports` でSVGフィルターのbackdrop-filter対応を検出

**フォールバック（Safari/Firefox — 高品質Glassmorphism）:**

```css
/* ほぼ限界まで透過 + 強めのblur */
.glass-fallback {
  background: rgba(255, 255, 255, 0.03); /* ダーク時 */
  backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

/* ライト時 */
[data-theme="light"] .glass-fallback {
  background: rgba(255, 255, 255, 0.15);
}
```

- 背景がしっかり透けることを最優先
- 微かなボーダーでカードの輪郭を保つ
- 多層シャドウ（DM-ELEVATION-5風）で浮遊感を追加

### 1.2 Displacement Mapキャッシュ戦略

- サイズ別にCanvasで生成 → `Map<string, string>` にキャッシュ（キー: `"幅x高さ"`）
- 同じサイズのカードは同一mapを共有
- UIパーツはサイズ固定なので起動時に1回生成するだけ
- カードリサイズ中はblurフォールバック → pointerup時にmap再生成（or既存キャッシュ使用）

### 1.3 適用対象

| 要素 | 屈折の強さ | 理由 |
|------|----------|------|
| FolderNav | 強め | 常時表示、キャンバスの上に浮くので効果的 |
| UrlInput | 強め | 画面中央下、視線が集まる |
| ViewModeToggle | 強め | 画面中央上 |
| ThemeSelector | 強め | 設定パネル自体がデザインの一部 |
| ExportButton等 | 強め | 統一感 |
| カード（Glassスタイル時） | 控えめ | コンテンツ視認性を優先 |

---

## 2. カードサイズ/アスペクト比システム

### 2.1 サイズプリセット

| プリセット | 幅 | 用途 |
|-----------|-----|------|
| S | 160px | メモ、リンクのみ |
| M | 240px | 標準 |
| L | 320px | サムネイル重視 |
| XL | 480px | ヒーロー画像、ツイート |

### 2.2 アスペクト比プリセット

| プリセット | 比率 | 用途 |
|-----------|------|------|
| auto | サムネイル元比率 | デフォルト |
| square | 1:1 | 統一感 |
| landscape | 16:9 | 横長写真 |
| portrait | 3:4 | 縦長写真 |

### 2.3 ランダム割り当て

新規カード追加時:
- サイズ: S / M / L からランダム（XLはユーザー手動のみ）
- アスペクト比: auto / square / landscape / portrait からランダム
- 4サイズ × 4比率 = **16パターン** → 毎回ユニークなコラージュ

### 2.4 ユーザーカスタマイズ

設定画面で「デフォルトサイズ」「デフォルトアスペクト比」を固定可能:
- 「ランダム」（デフォルト）: 毎回違うサイズ/比率
- 特定値に固定: 整頓したいユーザー向け

### 2.5 リサイズ操作

- カード右下にリサイズハンドル（ドラッグでサイズ変更）
- GSAPでスムーズにアニメーション
- リサイズ結果はIndexedDBに永続化

### 2.6 DB変更

`CardRecord` に以下を追加（DB migration v3）:
```typescript
width: number    // カード幅（px）
height: number   // カード高さ（px）
```

---

## 3. カードスタイル4種

### 3.1 スタイル切替の仕組み

- `data-card-style` 属性でボード全体のスタイルを一括切替
- S3ではボード全体の一括切替を実装
- 個別カードのスタイル変更は将来スプリントに回す

### 3.2 Glass（リキッドグラス）

**コラージュ感**: 高級感、未来的

- Chrome: SVG feDisplacementMap屈折
- 非対応: `backdrop-filter: blur(24px) saturate(180%)`
- 背景: `rgba(255,255,255, 0.03)`（ダーク）/ `rgba(255,255,255, 0.15)`（ライト）
- 境界線: 微かな白ボーダー（光の反射を模倣）
- ホバー時: 反射強化（spotlight + border brightness増加）

### 3.3 ポラロイド風

**コラージュ感**: ノスタルジック、写真アルバム

- 白い厚めフレーム（下部の余白が大きい）
- サムネイル部分は角丸なし
- 下の余白: 手書き風フォントでタイトル表示
- 微妙な紙テクスチャ（CSSノイズ）
- 影: ソフトなドロップシャドウ（紙が机に置かれている感覚）
- ホバー時: 少し持ち上がり影が深くなる
- コラージュモード時のランダム回転との相性◎

### 3.4 新聞切り抜き風

**コラージュ感**: パンク、ZINE、コラージュアート

- 不規則な縁（`clip-path: polygon()` でギザギザ）
- セピア調フィルター（`filter: sepia(0.3) contrast(1.1)`）
- テキスト: セリフ体（Georgia / Times New Roman）
- 背景: 古びた紙色 `#f4e8c1` + ノイズテクスチャ
- 境界線なし（切り抜きだから）
- 影: ごく薄い（紙1枚の薄さを表現）
- ホバー時: セピアが薄くなり色が少し鮮やかに

### 3.5 冷蔵庫マグネット風

**コラージュ感**: ポップ、日常的、親しみやすい

- 白い角丸カード（`border-radius: 8px`）
- カード上部中央に小さなカラフルなマグネット装飾（`::before`）
- マグネット色: フォルダカラーと連動
- 背景: 純白 `#ffffff`
- 影: 柔らかいドロップシャドウ
- ホバー時: マグネットが揺れる（`@keyframes wobble`）
- カードは持ち上がるがマグネットは固定位置に留まる演出

### 3.6 カードスタイル × カラーモードの組み合わせ

| スタイル | ダーク時 | ライト時 |
|---------|---------|---------|
| Glass | 白ボーダー微光、暗い透過 | 暗いボーダー微光、明るい透過 |
| ポラロイド | フレーム: `#f0ede8` | フレーム: `#ffffff` |
| 新聞切り抜き | 紙色: `#d4c89a` | 紙色: `#f4e8c1` |
| マグネット | カード: `#f5f5f5`、影強め | カード: `#ffffff`、影控えめ |

---

## 4. リッチインタラクション

### 4.1 ホバー

- **3D Tilt**: マウス位置に応じて ±5deg 傾く。`transform: perspective(800px) rotateX() rotateY()`
- **Spotlight**: カード上に光源が追従。`radial-gradient` を `::after` 疑似要素で重ねる
- **影の変化**: 傾きに連動して影の方向・強さが動的に変わる（Floating Dimensionality）

### 4.2 ドラッグ

- カードが持ち上がる: `scale(1.05)` + `shadow-drag` 強化
- ドラッグ方向にtilt連動
- **距離ベースリパルション**: 全カードが距離に応じて反応
  ```
  force = maxForce × (1 - distance / radius)²
  ```
  近いカードは大きく避け、遠いカードはふわっと微動

### 4.3 着地

- バウンスアニメーション（`ease-out-back`）
- 波紋エフェクト（`::before` + `@keyframes ripple`）

### 4.4 120fps最適化

- 全transform: `will-change: transform` + GPU合成レイヤー
- mousemove → `requestAnimationFrame` でバッチ処理（1フレーム1計算）
- `contain: layout style paint` でリフロー範囲隔離
- passive event listeners でメインスレッドブロック回避
- ドラッグ中の非対象カード: `pointer-events: none` でヒットテスト省略

---

## 5. テーマ連動

### 5.1 背景テーマ → 自動カラーモード

| 背景テーマ | カラーモード | 備考 |
|-----------|-----------|------|
| dark | dark | |
| space | dark | |
| ocean | dark | |
| forest | dark | |
| grid | dark | |
| cork | light | |
| minimal-white | light | |
| cardboard | light | **新規追加** |
| custom-color | 自動判定 | 相対輝度 ≥ 0.5 → light |
| custom-image | dark | デフォルト（画像の明暗不明） |

### 5.2 Cardboard背景テーマ（新規）

```css
[data-bg-theme="cardboard"] {
  background-color: #d2c8ba;
  background-image: url("data:image/svg+xml,..."); /* feTurbulence noise */
}
```

- 温かみのあるグレーベージュ
- SVG feTurbulenceで紙の繊維感テクスチャ（画像ファイル不要）
- 新聞切り抜き風、ポラロイド風との相性◎

### 5.3 UIモード独立トグル

`<html data-theme="dark" data-ui-theme="auto">` で属性を分離。

| 値 | 動作 |
|----|------|
| auto | `data-theme` の値を継承（デフォルト） |
| dark | UIパーツだけダーク固定 |
| light | UIパーツだけライト固定 |

UIパーツ（`.glass-panel` 等）は `[data-ui-theme]` を参照してスタイルを決定。

### 5.4 UIパーツにリキッドグラス全面採用

FolderNav, UrlInput, ViewModeToggle, ThemeSelector, ExportButton等、
全てのUI操作パーツにリキッドグラスを適用。

- サイズ固定 → displacement mapは起動時に1回生成
- 背景のコラージュが歪んで透ける → 操作パーツ自体がデザインの一部に
- カードより屈折を強めに設定 → 明確にガラスだとわかる

---

## 6. 設定パネル

### 6.1 統合設定パネル（ThemeSelector拡張）

```
設定パネル (右下ボタンから展開)
├── 背景テーマ (スウォッチ一覧)
│   └── cardboard追加
├── カードスタイル (アイコン付き4択)
│   ├── Glass
│   ├── Polaroid
│   ├── Newspaper
│   └── Magnet
├── UIモード (3択トグル: 自動 / ダーク / ライト)
└── カードデフォルト
    ├── サイズ: ランダム / S / M / L / XL
    └── 比率: ランダム / 自動 / 1:1 / 16:9 / 3:4
```

### 6.2 永続化

IndexedDB `UserPreferences` objectStore（新規、DB migration v3）:

```typescript
type UserPreferences = {
  bgTheme: string
  cardStyle: 'glass' | 'polaroid' | 'newspaper' | 'magnet'
  uiTheme: 'auto' | 'dark' | 'light'
  defaultCardSize: 'random' | 'S' | 'M' | 'L' | 'XL'
  defaultAspectRatio: 'random' | 'auto' | '1:1' | '16:9' | '3:4'
  reducedMotion: boolean
}
```

---

## 7. パフォーマンス戦略

### 7.1 段階的劣化（カード枚数に応じて）

| カード数 | 動作 |
|---------|------|
| 〜50枚 | フル機能 |
| 51〜100枚 | spotlightをホバー中のカードのみに制限 |
| 101〜200枚 | 浮遊アニメを画面内カードのみに制限 |
| 201枚〜 | spatial hash導入、画面外カードのDOMをアンマウント |

### 7.2 自動フレームレート監視

- `performance.now()` でフレームタイム計測
- 8.33ms（120fps）を目標
- 16.67ms（60fps）を下回ったら自動的に一段階劣化

---

## 8. 完了条件

- [ ] `globals.css` にデザイントークン全定義（cardboard含む）
- [ ] `prefers-color-scheme` 初期値判定 + 背景テーマ連動 + UIモード独立トグル
- [ ] カードがリキッドグラス表現（Chrome: 屈折、他: 高品質Glassmorphism）
- [ ] UIパーツ全てにリキッドグラス適用
- [ ] 4種のカードスタイル切替が動作
- [ ] カードサイズ/アスペクト比がランダム割り当て + ユーザーカスタマイズ可能
- [ ] ホバー: 3D tilt + spotlight + 影連動
- [ ] ドラッグ: 持ち上げ + 距離ベースリパルション
- [ ] 着地: バウンス + 波紋
- [ ] 設定パネルで全設定の切替が動作
- [ ] 120fps維持（50枚カード時）
- [ ] `npm run build` が通る
- [ ] Inter/Outfitフォントが読み込まれている（既に完了）

---

## 参考リソース

- **Liquid Glass**: kube.io/blog/liquid-glass-css-svg/ — SVG feDisplacementMap技術
- **Motion原則**: motion.zajno.com — easing, offset/delay, floating dimensionality, parallax
- **ReactBits**: GlassCard, TiltedCard, SpotlightCard — インスピレーション（Framer Motion非使用）
- **DM-ELEVATION-5**: 多層シャドウの参考（7層の影）
- **フォント**: Inter/Outfit は2025-2026トレンドフォントとして確認済み
- **Glassmorphism**: 限界まで透過 + 強blur が最も見た目が良い（ユーザーの他プロジェクト経験）

---

## 設計判断の記録

| 判断 | 理由 |
|------|------|
| リキッドグラスはハイブリッド(C案) | 理想を追いつつ全ブラウザ対応 |
| カードスタイル複数は表現ツールとして必須 | AllMarksのミッション「表現ツール」 |
| 背景テーマ→カラーモード自動連動 | ユーザーの操作を1つ減らす |
| UIモード独立トグル | 「文字はダークがいい」需要への対応 |
| カードサイズ/比率ランダム | 毎回違うコラージュ体験。バイラル要素 |
| 120fps目標 | リッチインタラクションの快適さに直結 |
| B案(インパクト先行) | 早く感動を得てモチベーション維持 |
