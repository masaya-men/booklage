# B0: Board Skeleton Rebuild — Design Spec

**Date**: 2026-04-19
**Status**: Draft (pending user review)
**Author**: Claude Opus 4.7 (1M context) + user brainstorming
**Branch**: `claude/rebuild-board`
**Prerequisite read**: `docs/REBUILD_VISION.md`, `docs/private/IDEAS.md`（非公開） 「kube.io — CSS/SVGリキッドグラス」節

---

## Part A — ユーザー向け要約（まずはここを読む）

### このスプリントで作るもの

AllMarks のメイン画面「ボード」を **骨組みから作り直す**。今は 1431行の巨大ファイルに機能が詰まっていて、触ると何が壊れるかわからない状態。これを 5〜6個の小さなファイルに分け、装飾（ガラス・3D・カスタムカーソル等）を一旦全部剥がし、**素の状態で触って気持ちいい** ところまで持っていく。

### 完成したら何が見える？

1. `/board` にアクセスすると、既存のブクマが自動で良い感じに並んでいる（Moodboard 3000 風の隙間なし justified グリッド）
2. マウスホイール = 縦スクロール（自然）
3. カードを掴んで動かすと、その場所に着地
4. 空エリアを掴んでドラッグしてもスクロール（スマホ/トラックパッド対応）
5. テーマ2種類で切替可能：
   - **点線ノート**（白背景）
   - **方眼紙**（黒背景・視認性の高い白系格子）
6. カード 1000枚でも 60fps、10,000枚でも詰まらない（viewport culling）
7. **装飾ゼロ** — ガラスも影も 3D もカスタムカーソルも一切なし

### 含まないもの（次スプリント以降）

- リキッドグラス、カードスタイル（Polaroid/Newspaper/Magnet）
- 3D 球体モード
- カスタムカーソル
- 3D タイル演出（B1+ で別ジェスチャ）
- ブクマ管理フロー（既読/未読、Inbox、フォルダサジェスト）
- 残りのテーマ（宇宙/森/海/コルク等）
- スプリング物理ホバー、3D フリップ遷移
- 砂浜/水平線の横スクロールテーマ

### 成功の定義

- 「ホイール回すと気持ちよくスクロールする」が体で感じられる
- カード 1000枚並んでいてもヌルヌル動く
- テーマ切替で背景が変わる（方向が同じでも視覚的に差が出る）
- **装飾なしでも触って気持ちいい** — ここが B1（装飾）に進む絶対条件

---

## Part B — 実装仕様（Claude 向け）

### B1. アーキテクチャ：6層分離

現行の `app/(app)/board/board-client.tsx`（1431 行）と `components/board/Canvas.tsx`（231 行）を破棄し、以下の 6 層に分解する。

| 層 | ファイル | 行数上限 | 責務 |
|----|---------|---------|-----|
| ① Root | `components/board/BoardRoot.tsx` | ≤200 | 状態オーケストレーション（選択テーマ、カード配列、ビュー座標）。描画は下位層委譲 |
| ② Theme | `components/board/ThemeLayer.tsx` | ≤200 | テーマ背景描画 + 方向メタデータ供給 |
| ③ Layout (pure) | `lib/board/auto-layout.ts` | ≤250 | justified-grid 配置計算。純関数、副作用ゼロ、テスト対象 |
| ④ Cards | `components/board/CardsLayer.tsx` | ≤200 | 位置適用・transform 管理・viewport culling |
| ⑤ Interaction | `components/board/InteractionLayer.tsx` | ≤300 | wheel / empty-drag / card-drag / resize gesture 受け口 |
| ⑥ Leaf | `components/board/CardNode.tsx` | ≤100 | 素の `<div>`、タイトル + サムネイルのみ、装飾ゼロ |

補助ファイル：

- `lib/board/theme-registry.ts` — テーマ ID → 背景 + 方向 + 視覚メタデータ
- `lib/board/constants.ts` — 全数値定数（既存 `lib/constants.ts` から board 関連を分離）
- `lib/board/types.ts` — CardPosition, ThemeId, LayoutMode, InteractionState の型
- `components/board/ResizeHandle.tsx` — ≤150 行、骨組みから再生

### B2. テーマレジストリ

B0 は2テーマのみ。将来（横スクロール、3D 球体等）は同じ `theme-registry.ts` に追加するだけで拡張可能な構造にする。

```typescript
// lib/board/types.ts
export type ScrollDirection = 'vertical' | 'horizontal' | '2d' | 'sphere'

export type ThemeId = 'dotted-notebook' | 'grid-paper'
// B1+ 候補: 'beach-horizon' | 'sphere' | 'cutting-mat' etc.

export type ThemeMeta = {
  id: ThemeId
  direction: ScrollDirection
  backgroundClassName: string  // CSS module class
  label: { key: string }       // i18n message key
}

// lib/board/theme-registry.ts
export const THEME_REGISTRY: Record<ThemeId, ThemeMeta> = {
  'dotted-notebook': {
    id: 'dotted-notebook',
    direction: 'vertical',
    backgroundClassName: styles.dottedNotebook,
    label: { key: 'board.theme.dottedNotebook' },
  },
  'grid-paper': {
    id: 'grid-paper',
    direction: 'vertical',
    backgroundClassName: styles.gridPaper,
    label: { key: 'board.theme.gridPaper' },
  },
}

export const DEFAULT_THEME_ID: ThemeId = 'dotted-notebook'
```

**重要**: `direction` 列挙に `horizontal` / `2d` / `sphere` を先に定義しておくことで、B1+ 追加時に型変更なしで済む。

### B3. 背景デザイン仕様

#### 点線ノート（白背景）

- 背景色: `#f8f8f6`（紙白）
- ドット色: `#c8c8c8`（視認可能な薄さ）
- ドット間隔: 24px × 24px
- ドットサイズ: 2px
- CSS: `background-image: radial-gradient(circle, #c8c8c8 1px, transparent 1px);`

#### 方眼紙（黒背景・白系格子）— ユーザー指定でリビジョン

- 背景色: `#0e0e11`（ほぼ黒）
- 格子色: `rgba(255,255,255,0.18)`（従来より視認性高く — ユーザー指示）
- 格子間隔: 40px × 40px
- 線幅: 1px
- CSS: `linear-gradient` を縦横 2 方向重ね

### B4. 自動レイアウトアルゴリズム

**Justified grid**（Moodboard 3000 風・Flickr 方式）を採用。縦スクロールモードでは「行」単位で justify。

#### B0 完成度基準（妥協禁止）

自動レイアウトは **ボードを開いた瞬間の第一印象**。装飾ゼロ B0 が成立するか否かの生命線なので、アルゴリズム自体は **本番品質** で実装する。

- **正統 Flickr 方式 justified grid**: 各行が viewport 幅ぴったり（gap 除く）に揃う
- **アスペクト比耐性**: 縦長（0.5）〜 横長（3.0）、正方形、どれも破綻しない
- **最終行の扱い**: カード少なくて justify できない行は「残りを targetRowHeight のまま左寄せ」を既定。ただし 1〜2枚の孤立行は、前の行と一緒に再分配するか targetRowHeight を少し拡大して自然に見せる（実装時調整）
- **viewport 幅変化対応**: リサイズで即座に再配置、トランジションなしでも気持ちよく収まる
- **ギャップ**: 4px 固定（`constants.ts` で変更可能）
- **targetRowHeight**: 既定 180px、テーマごとに調整可能（`theme-registry.ts` の `layoutParams?` で上書き）
- **実データ検証**: 実装完了時、既存 IndexedDB のブクマで開いて視覚確認。「思ったより普通」と感じたら B0 内で `targetRowHeight` / 最終行ロジック / 余白感を即調整。これは polish ではなく基礎の完成度なので B0 範囲内

#### B0 で実装しないレイアウト polish（B1 以降）

- カード追加/削除時のアニメーション遷移
- テーマ切替時のスムーズな再配置アニメ
- 隣接カード最適化（色・アスペクト比の類似を離す、視覚リズム調整）
- 周辺リフロー演出（ドロップ時に周りが「スッと」寄る動き）

`lib/board/auto-layout.ts` シグネチャ：

```typescript
export type LayoutInput = {
  cards: ReadonlyArray<{ id: string; aspectRatio: number; userOverridePos?: { x: number; y: number; w: number; h: number } }>
  viewportWidth: number
  targetRowHeight: number  // 既定 180px
  gap: number              // 既定 4px
  direction: ScrollDirection
}

export type LayoutResult = {
  positions: Record<string, { x: number; y: number; w: number; h: number }>
  totalHeight: number  // scroll 範囲
}

export function computeAutoLayout(input: LayoutInput): LayoutResult
```

**アルゴリズム骨子**（vertical の場合）:

1. 幅 = `viewportWidth - margin*2`
2. 行を累積: 各カードの希望幅 = `targetRowHeight × aspectRatio`
3. 累積幅が viewport 幅を超えたら行確定、各カードを等比スケールして幅ぴったりにする
4. 最後の行は不足分を targetRowHeight そのままで左寄せ
5. `userOverridePos` があるカードは auto layout スキップ、そのまま配置

**ユーザーがドラッグで動かしたカード**は `userOverridePos` に記録され、以降は auto-layout に従わない（= 「動かした場所に着地」仕様）。リセット機能は UI で別途提供（シャッフルボタン等、B1+）。

### B5. インタラクションモデル

| ジェスチャ | B0 動作 | 備考 |
|-----------|--------|------|
| マウスホイール | テーマ方向にスクロール | vertical 固定なので縦スクロール |
| 空エリアをドラッグ | スクロール（同じ挙動） | スマホ/トラックパッド用途 |
| カードをドラッグ | カード位置変更、`userOverridePos` 記録 | 現状踏襲の自由移動 |
| リサイズハンドル | カードサイズ変更 | 骨組み手触り重視、スナップは次スプリント |
| ダブルクリック | カードを開く（`url` へ遷移） | 3D フリップ演出は B1 |

**InteractionLayer 実装上の要点**:

- ネイティブ DOM イベント（`mousedown`/`mousemove`/`mouseup`/`touchstart`等）を直接扱う
- `createPortal` + DOM API 方式で GSAP Draggable と React 再レンダリングの衝突を回避（既存 TODO.md の技術判断踏襲）
- `pointerEvents` CSS で衝突解決、z-index は `constants.ts` 定義

### B6. パフォーマンス要件

- **60fps 固定**（フレームバジェット 16.67ms）
- **入力応答 < 16ms**（押して 1 フレーム以内に transform 開始）
- **1000 カード時も 60fps**（viewport culling なしで達成可能なはず）
- **10,000 カード時はスクロール詰まりゼロ**（viewport culling 導入）

**viewport culling 実装**:

- `CardsLayer` で現在のビュー矩形を計算
- 画面外 + buffer 1 画面分のカードは React render をスキップ（`null` を返す）
- 画面内に入ってきたカードだけ render
- buffer サイズは `constants.ts` に `CULLING_BUFFER_SCREENS = 1.0`

**測定方法**:

- Chrome DevTools Performance タブで 1000 カード + 60s スクロールを計測、平均 fps ≥ 58 を確認
- Vitest でレイアウト計算関数 `computeAutoLayout` が 1000 カード < 16ms を確認（テスト）

### B7. クリーンコード・ハード制約

以下は B0 以降も永続的に守るルール。

1. **ファイルサイズ**: 全ファイル ≤ 300行（超えたら分割必須）
2. **数値ハードコード禁止**: すべて `lib/board/constants.ts` 経由（z-index、ギャップ、threshold 等）
3. **文字列ハードコード禁止**: UI 文字列はすべて `messages/*.json` 経由（15 言語）
4. **新規文字列は15 言語全部に追加**: `messages/ja.json` に追加したら `en/zh/ko/es/fr/de/pt/it/nl/tr/ru/ar/th/vi.json` も更新
5. **`any` 禁止**: CLAUDE.md 既定、`unknown` + 型ガード使用
6. **`'use client'`**: 末端コンポーネントのみ（BoardRoot 以下の必要最小限）
7. **削除前に `docs/archive/`**: 重要な実装は要点メモ残してから削除

### B8. 削除・アーカイブ計画

#### アーカイブ（docs/archive/*.md に要点残してから削除）

- `lib/glass/use-liquid-glass.ts` → `docs/archive/liquid-glass-notes.md`
  - 現行の SVG filter 設定（feTurbulence の baseFrequency 等）、「黒ずみ問題」の原因推定、次回 kube.io 方式で置き換える旨を記述
- `lib/sphere/` 全体 → `docs/archive/sphere-navigation-notes.md`
  - glass-shader.ts の IOR/aberration/fresnel 値
  - 既知の残課題（`docs/TODO.md` の3D球体セクションから引用）
  - WebGL + CSS3DRenderer 統合の要点
- `components/board/SphereCanvas.{tsx,module.css}` → 上記 notes に言及、ファイル削除

#### 直接削除（git 履歴に残るので archive 不要）

- `components/board/card-styles/` 全体（CardStyleWrapper 等）
- `components/board/Canvas.tsx`（BoardRoot に吸収）
- `components/board/DraggableCard.tsx`（CardNode + InteractionLayer に吸収）
- `components/board/BookmarkCard.tsx`（CardNode に吸収）
- `components/board/CustomCursor.tsx` + `CustomCursor.module.css`（B0 対象外）
- `components/board/SphereModeToggle.tsx`
- `app/(app)/board/board-client.tsx`（BoardRoot で完全置換）

#### 残す（簡素化のみ）

- `components/board/TweetCard.tsx` — react-tweet ラッパー、CardNode の子として使用
- `components/board/VideoEmbed.tsx` — oEmbed ラッパー、CardNode の子として使用
- `components/board/UrlInput.tsx`, `FolderNav.tsx`, `SettingsPanel.tsx` — 別機能、触らず残す
- `components/board/ViewModeToggle.tsx`, `ThemeSelector.tsx` — 別機能、触らず残す
- `components/board/ExportButton.tsx`, `ColorSuggest.tsx`, `RandomPick.tsx` — 別機能、触らず残す
- `lib/i18n/`, `messages/*` — 言語基盤維持
- `lib/storage/` — IndexedDB 基盤維持
- `lib/constants.ts` — board 関連のみ `lib/board/constants.ts` へ移動、他は残す

### B9. 完成の定義（Acceptance Criteria）

**機能**

- [ ] `/board` でカードが自動 justified grid に並ぶ（既存 IndexedDB データ使用）
- [ ] マウスホイールで縦スクロール動作
- [ ] 空エリアドラッグで縦スクロール動作
- [ ] カード個別ドラッグで自由移動、移動後の位置が保持される
- [ ] リサイズハンドルでカードサイズ変更可能
- [ ] テーマセレクタで「点線ノート」「方眼紙」切替、背景が変わる
- [ ] 1000 カードで 60fps（Chrome DevTools Performance）
- [ ] 10,000 カードで viewport culling 動作（可視カードのみ DOM）

**品質**

- [ ] 全ファイル ≤ 300 行
- [ ] 新規文字列は 15 言語全部にキー追加済み
- [ ] TypeScript strict で型エラーなし
- [ ] `any` ゼロ
- [ ] Vitest で `computeAutoLayout` の単体テストパス
- [ ] Playwright で主要シナリオ（スクロール、ドラッグ、リサイズ、テーマ切替）の E2E テストパス

**削除完了**

- [ ] 上記「直接削除」リストのファイルが存在しない
- [ ] `docs/archive/liquid-glass-notes.md`, `docs/archive/sphere-navigation-notes.md` 作成済み
- [ ] `lib/glass/`, `lib/sphere/`, `components/board/card-styles/`, `components/board/SphereCanvas*`, `SphereModeToggle.tsx`, `CustomCursor*` が存在しない
- [ ] `board-client.tsx` が存在しない、`BoardRoot.tsx` が代替

**非機能（明示的に対象外）**

- [ ] カードに装飾なし（ガラス/影/radius 微量のみ）
- [ ] 3D モード無効
- [ ] カスタムカーソル無効

### B10. 未解決項目（実装時にユーザー確認が必要なもの）

実装中に判断が必要になった場合のフォールバック候補。

1. **既存データの移行**: `userOverridePos` フィールドは IndexedDB スキーマに存在しない。既存カードは全部 auto-layout で再配置するか、既存 `x,y,w,h` を overridePos 扱いにするか。**推奨**: 既存データは userOverridePos 扱いに読み替え、ユーザーの配置を保持。
2. **リサイズ挙動の詳細**: スナップ閾値、最小/最大サイズ。**推奨**: 骨組み段階では min=120px、max=800px、スナップなし。手触り調整は B1 の装飾前段で。
3. **テーマ切替時の挙動**: auto layout の再計算を走らせる？ userOverridePos は維持？ **推奨**: テーマ切替で位置は変えない。背景だけ変わる。

これら 3 点は実装計画（writing-plans）段階で確認、または実装中に判断が必要になった時点でユーザーへ確認。

---

## Part C — Out of Scope（明確な非対象）

本 spec の対象外。別スプリントでそれぞれ独立した spec を書く。

- **B1 装飾レイヤー**: リキッドグラス（kube.io 方式）、カードスタイル、スプリング物理、3Dタイル演出、**周辺リフロー演出**（カードドロップ時に周囲が「スッと」寄る動き）
- **B2 ブクマ管理**: 既読/未読、Inbox モード、フォルダサジェスト、一括振り分け
- **B3 3D 球体モード**: theme-registry の `sphere` direction に接続、archive notes 参照して再実装
- **B4 ブクマ名自動取得強化**: YouTube タイトル、Tweet 冒頭、Instagram 本文
- **C リビルド**: LP 全面刷新（`(marketing)/` 配下）
- **D リビルド**: カードスタイル拡充

## Part D — 参照

- `docs/REBUILD_VISION.md` — リビルド全体方針とアイデア保管庫
- `docs/private/IDEAS.md`（非公開） — kube.io 液体ガラスレシピ、HTML-in-Canvas 動向
- `docs/TODO.md` — 既存技術判断（ReactのDOM管理+GSAP、座標変換等）
- `CLAUDE.md` — コーディング規約、禁止事項、プライバシー絶対ルール
- `MYCOLLAGE_FULL_SPEC.md` — プロダクト全体仕様
