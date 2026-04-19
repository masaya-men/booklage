# B1-placement: Drag UX + Content-Aware Aspect Ratio — Design Spec

**Date**: 2026-04-19
**Status**: Draft (pending user review)
**Author**: Claude Opus 4.7 + user brainstorming
**Branch**: `claude/lucid-bardeen-c9a786`
**Prerequisite read**: `docs/superpowers/specs/2026-04-19-b0-board-skeleton-design.md`, `docs/DESIGN_REFERENCES.md`, `docs/TODO.md`, `CLAUDE.md`, `docs/private/IDEAS.md`（非公開）

---

## Part A — ユーザー向け要約

### このスプリントで作るもの

B0 で装飾ゼロの骨組みを作ったボードに、**「表現ツール」としての骨格** を追加する。具体的には：

1. **2 つのレイアウトモード** — Grid（auto justified、普段の閲覧）と Free（自由配置、ミックス / SNS シェア）を 1 つのボードで切替可能に
2. **Grid モードのドラッグは気持ちよく** — 差し込み式（Insert）＋近隣カードがスムーズに動く（FLIP アニメ）
3. **Free モードはキャンバスっぽく** — 境界は柔らかい枠（ソフト境界）、フレーム外はグレースケール化、カードは枠を跨いで配置 OK
4. **中身に応じてカードの形が変わる** — YouTube は 16:9、長文ツイートは 3:4、画像は og:image 比、等 12 パターン
5. **Shopify.design tier の UI chrome** — 上部の Pill トグル、フレームプリセットポップアップ、右クリックメニュー
6. **ブクマ管理の下地** — 右クリックで「既読」「削除」、削除は 10 秒 Undo トースト付き（B2 で本格ゴミ箱へ拡張）

### 完成したら何が見える？

1. `/board` で上部中央に「⊞ Grid / ◇ Free」のトグル
2. Grid モード: カードが auto justified、ドラッグすると「差し込み位置」が光り、周囲がスッと詰まる
3. Free モード: フレームが出現、外側はグレースケール、カードを自由配置・回転・リサイズ
4. 中身によってカードの初期形が違う（moodboard 的な視覚リズム）
5. 右クリックで既読 / 削除 / フォルダ移動 / z-order / ロックのメニュー
6. 削除したら「Undo」トースト（10 秒）、誤爆しても安心
7. Free モードで SNS フレーム比率を選べる（1:1、9:16、16:9、2:3、A4、Custom 等）

### 含まないもの（次スプリント以降）

- **B1-playback**: 複数動画・音を同時再生（Booklage の核だが別 spec）
- **B1 装飾**: リキッドグラス、カードスタイル、テーマ別アニメーション、スプリング物理
- **B1.5 or B2 Share+Import**: SNS シェアから直接ブクマをインポートできる機構
- **B2 Triage**: 大量ブクマ仕分けモード（Tinder 風）
- **B2 フォルダ管理**: 完全ゴミ箱 UI、フォルダ CRUD、フォルダごとのモード保存
- **C-pure**: Grid モードで連続流動ドラッグ（今回は A++ Insert + smooth reflow、C-pure は upgrade パスとして設計）

### 成功の定義

- **Grid のドラッグが触って気持ちいい**（Notion / Linear tier の reorder）
- **Free モードで SNS シェア用コラージュが完成する**（フレーム内の状態が PNG 出力される）
- **中身に応じた比率で moodboard 感が出る**（「ブクマ表」からの脱却）
- **Shopify.design tier の UI chrome**（AI 感ゼロ、上品）
- 60fps 維持（1,000 カード時）
- 「触ってみないと分からない」は ship して iterate（quality > speed）

---

## Part B — 実装仕様（Claude 向け）

### B1. アーキテクチャ：B0 からの拡張

B0 の 6 層分離は踏襲、以下を追加 / 拡張する。

| 層 | ファイル | B1 での変更 |
|----|---------|----|
| ① Root | `components/board/BoardRoot.tsx` | `layoutMode` 状態追加、grid/free 切替ロジック |
| ② Theme | `components/board/ThemeLayer.tsx` | `animationProfile` 受け口の空 interface 追加（実装は B1 装飾） |
| ③ Layout (pure) | `lib/board/auto-layout.ts` | `computeGridLayout` に改名、`computeFreeLayout` 追加 |
| ④ Cards | `components/board/CardsLayer.tsx` | mode 切替時の FLIP animation、free mode transforms 適用 |
| ⑤ Interaction | `components/board/InteractionLayer.tsx` | drag gesture を grid/free で分岐、回転ハンドル、右クリックメニュー |
| ⑥ Leaf | `components/board/CardNode.tsx` | 8 ハンドル、回転ハンドル、選択状態の視覚化 |

新規ファイル：

| ファイル | 責務 |
|--------|-----|
| `lib/board/layout-mode.ts` | `LayoutMode` 型、mode ごとの挙動契約 |
| `lib/board/free-layout.ts` | free 配置の純関数（snap guide 計算、bleed 判定） |
| `lib/board/aspect-ratio.ts` | URL 種別 + OGP メタから aspectRatio を推定する純関数 |
| `lib/board/frame-presets.ts` | SNS フレーム比率プリセット定義 |
| `lib/board/constants.ts` | 既存。B1 で `FREE_LAYOUT`, `SNAP`, `ROTATION`, `RESIZE`, `Z_ORDER`, `FRAME` を追加 |
| `components/board/Toolbar.tsx` | トップ中央 Pill トグル + コンテキスト依存ボタン |
| `components/board/FramePresetPopover.tsx` | SNS プリセット選択ポップアップ |
| `components/board/CardContextMenu.tsx` | 右クリックメニュー（既読/削除/z-order/ロック） |
| `components/board/UndoToast.tsx` | 削除 10 秒 Undo トースト |
| `components/board/SnapGuides.tsx` | Figma 風スマートガイドのピンク線描画 |
| `lib/storage/use-board-data.ts` | `toItem` の aspectRatio 推定を差し替え、`layoutMode` / `freePos` / `gridIndex` のスキーマ拡張 |

全ファイル ≤ 300 行の B0 ルールは継続（超えたら分割必須）。

### B2. LayoutMode（grid / free の切替と座標保持）

```typescript
// lib/board/types.ts
export type LayoutMode = 'grid' | 'free'

export type GridPosition = {
  rowIndex: number
  colIndex: number  // row 内 index
}

export type FreePosition = {
  x: number
  y: number
  w: number
  h: number
  rotation: number  // degrees
  zIndex: number    // manual z-order（0 = auto）
  locked: boolean
}

export type BoardCard = {
  id: string
  url: string
  aspectRatio: number   // 中身由来の推定比（B5）
  gridIndex?: number    // grid モード時の並び順
  freePos?: FreePosition // free モード時の配置
  isDeleted?: boolean   // soft delete flag
  isRead?: boolean      // 既読フラグ
  createdAt: number
  updatedAt: number
}
```

**原則**: grid と free の座標は **別々に永続化**。モード切替時はそれぞれの最後の状態を復元。切替は完全に非破壊。

### B3. Grid モード: A++ Insert + smooth reflow

#### 挙動契約

- カードをドラッグ開始 → 元位置に半透明 placeholder、dragged card がカーソルに追従
- カーソルが閾値（`SNAP.INSERT_SLOT_ACTIVATION_PX = 12`）を越えて隣の slot に入る → ピンクの縦 or 横ライン（drop indicator）が光る
- slot 変更の瞬間、**近隣カードが GSAP で新位置へ smooth に移動**（FLIP technique）
- drop → dragged card は drop slot に吸着、placeholder 消滅

#### 実装要点

- `computeGridLayout(cards, viewportWidth, ...)` は既存（B0 の `computeAutoLayout` を改名）
- drag 中の「仮想挿入位置計算」: `computeGridLayoutWithVirtualInsert(cards, virtualIndex)` を純関数で用意
- FLIP animation: 前フレームの positions と新 positions の差分を GSAP tween
- drop indicator: 現在の virtualIndex 前後の gap に `<SnapGuides />` を描画

#### 後日 C-pure への upgrade パス

B1-placement では A++ で出す。C-pure（連続流動）への upgrade は **drop 判定ロジックの差し替えのみ** で済むよう設計：

- 「slot 単位の離散判定」を `dropIndexStrategy` として interface 化
- A++: `discreteSlotStrategy`（閾値を越えた時のみ index 変更）
- C-pure: `continuousNearestStrategy`（毎フレーム最近傍 index で再計算、hysteresis 付き）
- 切替は 1 行（`<CardsLayer dropIndexStrategy={...} />`）

### B4. Free モード

#### B4.1 ソフト境界キャンバス

- 本質は無限キャンバス（パン可能）
- **シェアフレーム** が乗る — 矩形、動かせる、比率変更可能
- フレーム外は **desaturated**（`filter: saturate(0.2)` + `rgba(210,210,210,0.55)` オーバーレイ）
- フレーム縁は 1.5px の crisp なライン（`rgba(0,0,0,0.3)`）
- **カードのブリード配置 OK** — フレーム境界を跨いで置ける。PNG 出力時はフレームで自動クリップ（雑誌風の断裁美）

#### B4.2 SNS フレームプリセット

`lib/board/frame-presets.ts`:

```typescript
export const FRAME_PRESETS = [
  { id: 'ig-square',    label: 'Instagram',       ratio: [1, 1],    messageKey: 'frame.preset.igSquare' },
  { id: 'story-reels',  label: 'Story/Reels',     ratio: [9, 16],   messageKey: 'frame.preset.storyReels' },
  { id: 'ig-landscape', label: 'IG Landscape',    ratio: [1.91, 1], messageKey: 'frame.preset.igLandscape' },
  { id: 'x-landscape',  label: 'X 横',            ratio: [16, 9],   messageKey: 'frame.preset.xLandscape' },
  { id: 'x-portrait',   label: 'X 縦',            ratio: [4, 5],    messageKey: 'frame.preset.xPortrait' },
  { id: 'pinterest',    label: 'Pinterest',       ratio: [2, 3],    messageKey: 'frame.preset.pinterest' },
  { id: 'yt-thumb',     label: 'YT Thumbnail',    ratio: [16, 9],   messageKey: 'frame.preset.ytThumb' },
  { id: 'a4',           label: 'A4',              ratio: [1, 1.414], messageKey: 'frame.preset.a4' },
  { id: 'custom',       label: 'Custom',          ratio: null,      messageKey: 'frame.preset.custom' },
] as const
```

- UI: トップツールバーの「1:1 ▾」ボタンクリックで `<FramePresetPopover />` が開く
- 3 列グリッド、各プリセットの比を視覚的に表示（正方形ミニ）
- 「Custom」は数値入力（幅 × 高さ、アスペクト比自動計算）
- **フォルダごとに最後に選んだプリセットを記憶**（B1-placement では単一ボードなのでボード単位、B2 でフォルダ拡張）
- プリセット切替時: **カードは移動しない**（ユーザー配置を尊重、枠だけ変わる）。はみ出すカードは alert で「縮小して収める / そのまま（ブリード扱い）」選択

#### B4.3 カード変形（Free モードのみ有効）

以下の変形操作は **Free モード専用**。Grid モードでは回転・8 ハンドルリサイズは無効で、ドラッグ（差し込み reorder）と右クリックメニューのみ。Grid モードで card の size を変えたい場合は Free モードに切替えてから行う。

**回転**

- 選択時、カード上部に丸いハンドル（直径 14px、白背景 + 青枠）
- **マウスドラッグ = 15° スナップ**（0, 15, 30, 45°...、最寄りに吸着）
- **Shift + ドラッグ = 自由回転**（precision 用途）
- **ダブルクリック** = 回転 0° にリセット
- 新規カード着地時、`ROTATION.AUTO_RANDOM_RANGE_DEG = ±5°` で自動微傾
- 動画カード（oEmbed）も同様に回転可（ユーザーの creative freedom 尊重）

**スナップ・整列（alignment guides）**

- カードドラッグ中、他カードと **エッジ / 中心** が揃いそうになるとピンク線が出現
- 吸着閾値 `SNAP.EDGE_ALIGNMENT_TOLERANCE_PX = 5`
- **マウスドラッグ = 整列スナップ ON**
- **Shift + ドラッグ = スナップ OFF**（意図的な散らし配置）
- 等間隔分布: 3 枚以上選択時、自動等間隔線も表示
- 実装: `lib/board/free-layout.ts::computeSnapGuides(draggedCard, otherCards)` 純関数

**z-order**

- 触ったカード自動最前面（manual zIndex == 0 のときのみ）
- 右クリック or キーボードで手動操作:
  - `]` = 最前面 / `[` = 最背面
  - `Ctrl+]` = 一段前 / `Ctrl+[` = 一段後ろ
- `L` キー or メニューで **ロック**（固定、背景画像として使える）

**リサイズ**

- 選択時、カードの **8 ハンドル**（4 隅 + 4 辺中央）
  - **4 隅**: 縦横比を維持したまま拡縮（moodboard 用途の安全な操作）
  - **4 辺**: 片方向だけ拡縮（意図的な歪み、creative freedom）
- モディファイヤキー不要、ハンドルで挙動選択
- **どのハンドルもダブルクリックで aspect ratio をネイティブ比にリセット**
- 最小 `RESIZE.MIN_PX = 80`、最大 `RESIZE.MAX_PX = 1200`

#### B4.4 右クリックメニュー（CardContextMenu）

```
┌─────────────────────┐
│ 新タブで開く          │  → url を target="_blank"
│ 既読にする            │  → isRead = true（ログ残す、見た目に軽い変化）
│ 削除                  │  → soft delete + 10 秒 Undo トースト
│ フォルダへ移動 ▸      │  → B2 で本格化、B1 では disabled
│ ─────────────       │
│ 一段前に      Ctrl+]  │
│ 一段後ろに    Ctrl+[  │
│ 最前面に         ]    │
│ 最背面に         [    │
│ ─────────────       │
│ ロック           L    │  → FreePosition.locked = true
└─────────────────────┘
```

- 位置: クリック位置に表示（画面端で自動反転）
- キーボードで閉じる: `Esc`
- `Delete` キー = 削除ショートカット（メニューを開かずに）

#### B4.5 UndoToast（soft delete 安全装置）

- 削除後、画面下部中央に 10 秒表示
- テキスト: 「削除しました」+「元に戻す」ボタン
- `Ctrl+Z` でも undo 可
- B1-placement 段階: IndexedDB に `isDeleted: true` フラグを立てる（物理削除はしない）
- B2 段階: 30 日保持の「ゴミ箱」フォルダへ移動、30 日後に完全消去

### B5. 中身に応じたアスペクト比マッピング

`lib/board/aspect-ratio.ts`:

```typescript
export type AspectRatioSource =
  | { type: 'youtube' }
  | { type: 'tiktok' }
  | { type: 'instagram-post' }
  | { type: 'instagram-story' }
  | { type: 'tweet', hasImage: boolean, textLength: number }
  | { type: 'pinterest' }
  | { type: 'soundcloud' | 'spotify' }
  | { type: 'image', intrinsicRatio?: number }
  | { type: 'generic', ogImageRatio?: number }

export function estimateAspectRatio(source: AspectRatioSource): number {
  switch (source.type) {
    case 'youtube':          return 16 / 9
    case 'tiktok':           return 9 / 16
    case 'instagram-post':   return 1
    case 'instagram-story':  return 9 / 16
    case 'tweet':
      if (source.hasImage)            return 16 / 9
      if (source.textLength > 140)    return 3 / 4
      return 1
    case 'pinterest':        return 2 / 3
    case 'soundcloud':
    case 'spotify':          return 1
    case 'image':            return source.intrinsicRatio ?? 4 / 3
    case 'generic':          return source.ogImageRatio ?? 4 / 3
  }
}
```

**既存ブクマの扱い**: IndexedDB migration で全カードの aspectRatio を再計算。ただしユーザーが `freePos.w / freePos.h` を手動で変えたカードは尊重（`freePos.isUserResized = true` フラグを保持）。

**lib/storage/use-board-data.ts::toItem** の `aspectRatio` 推定を差し替え。URL 判定は `lib/utils/url.ts::detectUrlType` を拡張、OGP メタは `ogp` state から読む。

### B6. モード切替 UX

#### トップツールバー

```
  Grid モード:  [ ⊞ Grid | ◇ Free ]  [ テーマ ] [ エクスポート ]
  Free モード:  [ ⊞ Grid | ◇ Free ]  [ 1:1 ▾ ] [ テーマ ] [ シェア ]
```

- **配置**: トップ中央、`position: fixed`、半透明白（`rgba(255,255,255,0.92)`）+ `backdrop-filter: blur(10px)`
- **Pill 形状**（`border-radius: 999px`）
- Active 状態は `background: #1a1a1a; color: white`
- フォント: `Inter` or 近いもの、`letter-spacing: -0.01em`（Shopify.design tier）
- 高さ: 36px、パディング: 4px 内側

#### モード切替の挙動

- クリック即座に切替え
- **カードの位置トランジション**: GSAP で 400ms `power2.inOut` で grid ↔ free 座標間を morph
- 切替中も入力は受け付ける（中断可能）
- grid / free の座標は IndexedDB に別々に保持、切替は非破壊
- **Free → Grid の救済**: トップ「⊞ Grid」1 クリックで復帰。FAB は不要（過剰設計で削除）

### B7. データ構造 / IndexedDB スキーマ拡張

**DB バージョン v5** へ bump（B0 で v5 マイグレーション済なら v6）。

```typescript
// lib/storage/schema.ts
export type BookmarkV6 = {
  id: string
  url: string
  title: string
  description?: string
  ogImage?: string
  siteName?: string
  aspectRatio: number          // 中身由来推定
  gridIndex?: number           // grid モード順位
  freePos?: {
    x: number
    y: number
    w: number
    h: number
    rotation: number
    zIndex: number
    locked: boolean
    isUserResized: boolean     // aspect ratio 再計算で上書きしない目印
  }
  isRead?: boolean
  isDeleted?: boolean           // soft delete
  deletedAt?: number            // 30 日後パージ判定用（B2）
  createdAt: number
  updatedAt: number
}

export type BoardConfigV6 = {
  layoutMode: LayoutMode
  frameRatio: { preset: string; width?: number; height?: number }
  theme: ThemeId
  // 将来拡張: folders, user preferences 等
}
```

**migration v5→v6**:
- 既存 `x, y, w, h` があれば `freePos` に移動、`rotation: 0, zIndex: 0, locked: false, isUserResized: true`
- `aspectRatio` を `estimateAspectRatio` で再計算、ただし `freePos.isUserResized` が true のカードは既存 w/h の比を aspectRatio として保持
- `gridIndex` は `createdAt` 順で初期値設定

### B8. 操作ルール（統合表）

| 操作 | マウスのみ | Shift + マウス | キーボード | 備考 |
|-----|----------|--------------|-----------|------|
| カードドラッグ（grid） | 差し込み + 近隣 reflow | ー | Tab/矢印 | A++ Insert |
| カードドラッグ（free） | 整列スナップ ON | スナップ OFF | 矢印で 1px 移動 | Alignment guides |
| 回転ハンドル | 15° スナップ | 自由回転 | ー | ダブルクリックで 0° |
| リサイズ 4 隅 | 比率固定拡縮 | ー | ー | ダブルクリックでネイティブ比 |
| リサイズ 4 辺 | 片方向拡縮 | ー | ー | ダブルクリックでネイティブ比 |
| z-order | 触ったカード自動最前面 | ー | `]` `[` `Ctrl+]` `Ctrl+[` | locked は除外 |
| ロック | ー | ー | `L` | 右クリックメニューにも |
| 削除 | 右クリック → 削除 | ー | `Delete` | 10 秒 Undo |
| Undo | ー | ー | `Ctrl+Z` | 削除・移動の直前操作 |

**深いルール**:
> **マウスのみ = 最も頻繁に欲しい挙動 / Shift + マウス = 稀な variant**
> （Shift の意味は用途で変わるが、原則は 1 つ）

### B9. パフォーマンス要件

- **60fps 固定**（1,000 カードまで）
- **入力応答 < 16ms**（push-to-transform）
- **Grid drag の FLIP animation**: 影響カード数 × 位置差分計算 < 5ms
- **Free mode snap guide 計算**: 可視カード N 枚 × O(N) edge comparison < 3ms per drag frame
- **mode 切替 morph**: 400ms 間も 60fps 維持

**viewport culling**: B0 の実装を踏襲。Free モードでは `freePos` ベースで AABB culling。

### B10. デザイン参考（DESIGN_REFERENCES.md から引用）

| UI 要素 | 参考 | 抽出ポイント |
|--------|-----|----------|
| トップ Pill トグル | **shopify.design** の navigation chip | フォント重、letter-spacing、shadow |
| FramePresetPopover | **shopify.design** の preset picker | 3 列グリッド、余白、host hover |
| CardContextMenu | **linear.app** の context menu | アイコン + ショートカット表記の整列 |
| UndoToast | **linear.app** の toast notification | 位置、消失タイミング、アクション可視化 |
| SnapGuides ピンク線 | **Figma** | 色、太さ、ラベル表示 |
| GSAP motion | **Fluid Functionalism**（DESIGN_REFERENCES.md） | "motion is information", easing curves |
| Grid 配置感 | **Moodboard 3000**（Figma plugin） | gap / margin の数値、justified 感 |
| Meanwhile Studio collage | **DESIGN_REFERENCES.md** | 有機的重なり、ブリード感 |

**実装時**: **Designmd Style Extractor**（Chrome 拡張）で shopify.design 等の CSS を吸い出し、**数値と余白のリズムだけ** 学習して Booklage 独自に再構成。**そのまま使うのは NG**（AI 感・shadcn 感が出る）。

### B11. テストシナリオ

#### Vitest（純関数）

- `aspect-ratio.ts::estimateAspectRatio` — 12 パターンの URL 種別で正しい比が出る
- `free-layout.ts::computeSnapGuides` — 3 カード並んだ時に等間隔ガイドが出る、エッジ揃いでガイドが出る
- `free-layout.ts::isBleedOutsideFrame` — フレーム外判定
- `auto-layout.ts::computeGridLayoutWithVirtualInsert` — 仮想挿入位置で行レイアウトが正しく再構築される

#### Playwright（E2E）

- Grid モードでカードをドラッグ → 別 slot に drop → 順序が変わり persist する
- Free モードに切替 → 最後の free 配置が復元される
- カードを右クリック → 削除 → Undo トーストをクリック → カード復活
- Shift + 回転ハンドル で自由角度回転できる（15° スナップが無効）
- フレームプリセット「9:16」に変更 → 枠の比が変わる、カードは移動しない
- 1,000 カード生成 → 60fps でスクロール可能

### B12. 将来拡張への先行投資

B1-placement で **下地だけ作る**（実装は別 spec で）:

| 機能 | B1-placement での下地 | 実装 spec |
|------|-------------------|--------|
| Multi-playback（同時再生） | `CardNode` に `isPlayable` interface、click の意味を mode で切替可能な設計 | B1-playback |
| C-pure 連続流動ドラッグ | `dropIndexStrategy` interface を `CardsLayer` に | B1.5 polish |
| テーマ別アニメーション | `ThemeLayer` に `animationProfile` の空 interface | B1 装飾 |
| Share+Import URL 圧縮 | `FreePosition` + `BoardConfig` を URL 圧縮可能な flat shape に | B1.5 / B2 |
| フォルダごとの LayoutMode | `BoardConfig.layoutMode` を将来 `Folder.layoutMode` に昇格しやすい API 設計 | B2 |
| 自動ランダムコラージュ | `computeFreeLayout` に「randomCompose」ストラテジ枠 | B1.5 polish |
| Triage モード | B1 では何もしない（`/triage` 別ルート） | B2 |

### B13. 削除・アーカイブ計画

このスプリントでは **破壊的削除なし**（B0 で整理済）。`lib/glass/` 等は B0 で削除済み。`components/board/card-styles/` も B0 で削除済み。

B1-placement で **追加** するのみ。既存の B0 コンポーネントには最小変更で済む設計。

### B14. 完成の定義（Acceptance Criteria）

**機能**

- [ ] トップツールバーの Pill トグルで grid/free 切替できる
- [ ] Grid モード: カードドラッグで差し込み、周囲が smooth reflow
- [ ] Free モード: カード自由配置、フレーム内外で desaturation、ブリード配置可能
- [ ] フレームプリセット 9 パターンから選べる、Custom 入力可能
- [ ] カード変形（Free のみ）: 回転（15°スナップ / Shift で自由）、リサイズ（8 ハンドル）、アスペクト比リセット
- [ ] スナップ（Free のみ）: mouse で整列 ON、Shift で OFF、ピンク線表示
- [ ] Grid モードでは回転・8 ハンドル不表示、差し込み reorder のみ
- [ ] z-order: 自動最前面 + キーボード / 右クリックで前後
- [ ] ロック機能（L キー / メニュー）
- [ ] 右クリック: 開く / 既読 / 削除 / フォルダ移動（disabled）/ z-order / ロック
- [ ] 削除は 10 秒 Undo トースト、Ctrl+Z 対応
- [ ] 中身に応じたアスペクト比: 12 パターンで正しい比が出る
- [ ] Grid ↔ Free の morph animation、座標は別々に persist
- [ ] モード切替後の「⊞ Grid」1 クリックで救済可能

**品質**

- [ ] 全ファイル ≤ 300 行
- [ ] 新規文字列は 15 言語全部にキー追加済み
- [ ] TypeScript strict で型エラーなし、`any` ゼロ
- [ ] Vitest で純関数の単体テストパス（計 10 本以上）
- [ ] Playwright で 6 本以上の E2E シナリオパス
- [ ] 1,000 カードで 60fps 維持（perf spec）
- [ ] IndexedDB migration v5→v6 が既存データを破壊しない

**デザイン**

- [ ] UI chrome が Shopify.design tier（AI 感・shadcn 感ゼロ）
- [ ] Designmd Style Extractor で shopify.design の値を参考にした痕跡あり
- [ ] 「触った瞬間に B0 と違う」と体で感じる

**非機能（明示的に対象外）**

- [ ] リキッドグラスなし（B1 装飾で別途）
- [ ] カードスタイルなし（D で別途）
- [ ] 同時再生なし（B1-playback で別途）
- [ ] フォルダ CRUD なし（B2 で別途）
- [ ] Triage モードなし（B2 で別途）
- [ ] Share+Import URL 機構なし（B1.5 or B2 で別途）

### B15. 未解決項目（実装時にユーザー確認が必要なもの）

実装中に判断が必要になった場合のフォールバック候補。

1. **Undo の対象範囲**: 削除以外に「ドラッグ移動 / リサイズ / 回転」も Undo 対象にする？ **推奨**: B1-placement は削除・モード切替のみ Undo 対応、他は B2 で拡張
2. **Grid ⇄ Free 切替時の grid index 初期値**: free 配置があるカードを初めて grid で見るとき、grid index は何にする？ **推奨**: 一度も grid で触っていないカードは `createdAt` 順、grid で触ったことがあるなら最後の gridIndex を保持
3. **動画カードの極端な歪み**: 16:9 を 1:10 まで歪ませたら見た目が壊れる。警告表示？ **推奨**: 警告なし（creative freedom 尊重）、ダブルクリック recovery を signpost する
4. **フレームサイズの最小**: 画面幅の 20% 未満にすると見にくい。min 制約？ **推奨**: min 200 × 200、max 5000 × 5000 px

これら 5 点は writing-plans 段階で再確認、または実装中に判断が必要になった時点でユーザーへ確認。

---

## Part C — Out of Scope（明確な非対象）

本 spec の対象外。別スプリントで独立した spec を書く。

- **B1-playback**: 複数動画・音の同時再生（click → play-in-place、音声競合 UX、iframe パフォーマンス管理、ミックス共有）
- **B1 装飾**: リキッドグラス（kube.io 方式）、カードスタイル、スプリング物理、3D タイル演出、周辺リフロー演出、テーマ別アニメーション実装
- **B1.5 or B2 Share+Import**: SNS シェアから URL 圧縮で直接ブクマインポート
- **B2 Triage**: 一括仕分け専用ルート（`/triage`）、Tinder 風 UX、カード吸い込みアニメ、フォルダサジェスト連携
- **B2 フォルダ**: フォルダ CRUD、フォルダごとの LayoutMode、完全ゴミ箱 UI（30 日保持 + 復元）、既読エリア、Inbox モード
- **B3 3D 球体**: `theme-registry` の `sphere` direction に接続
- **C LP**: `(marketing)/` 配下全面刷新
- **D カードスタイル**: Glass / Polaroid / Newspaper / Magnet 等の拡充、新スタイル（ネオン / 布 / 羊皮紙 / プリクラ）

---

## Part D — 参照

- `docs/superpowers/specs/2026-04-19-b0-board-skeleton-design.md` — B0 骨組みの設計基盤
- `docs/DESIGN_REFERENCES.md` — 参考サイト（shopify.design、kube.io、Fluid Functionalism、Moodboard 3000、Designmd Style Extractor 等）
- `docs/REBUILD_VISION.md` — リビルド全体方針
- `docs/TODO.md` — 既存技術判断（React DOM 管理、GSAP、座標変換、ドラッグ閾値等）
- `docs/private/IDEAS.md`（非公開） — ユーザーの核ビジョン、フォルダモード化、Triage、Share+Import、テーマ別アニメ等の設計下地
- `CLAUDE.md` — コーディング規約、禁止事項、プライバシー絶対ルール
- `MYCOLLAGE_FULL_SPEC.md` — プロダクト全体仕様
