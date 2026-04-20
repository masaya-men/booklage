# Board: Content-Sized Masonry + Drag-to-Reorder — Design Spec

- **Status**: Draft, awaiting user review
- **Author**: Masaya + Claude (brainstorming session 2026-04-20, 続編)
- **Supersedes (partial)**: `2026-04-20-b1-dashboard-redesign-design.md` — §2.1（常時自由配置）/ §2.6（整列アクション）/ §5.1（Task 16 free-drag, Task 17 Rotation, Task 18 Resize を主役とする方針）を本 spec で差し替える
- **Preserves**: Sidebar（§2.3）/ Share Modal（§2.5）/ 視覚言語（§3）/ Theme system は変更なし
- **Defers**: Free 配置 / 回転 / 連続リサイズ / 装飾 → すべて Share Modal（Plan B）内に移設

---

## 1. なぜやるか

現行の `/board` は「always free canvas + Align ボタンで戻せる」という設計で、実機確認の結果、以下の根本的な UX ねじれが出ている。

1. **カードが重なる・下にもぐる**: 自由リサイズやドラッグ後、隣接カードと重なり z-order で潜り込む。scale 正規化を残したまま collision push を入れても「触ったカードの近所が動く」挙動がドミノ状に見え、触るたびに整列が壊れる不安が残る
2. **Align ボタンで戻せる、が戻すと触った意味が消える**: ユーザーに「自由 / 整列」2 つのメンタルモデルを同時に持たせる構造
3. **中身の大きさ準拠で表示されていない**: Twitter は全文が見えないまま切れる、YouTube / 縦動画の判別が UI に出ない、画像付きツイートの縦長さが表現できない
4. **「表現ツール」として中途半端**: 整理されたギャラリーでも、自由配置の作品でもない中間領域

### 方向転換

**Board を「整ったギャラリー」、Share Modal を「作品モード」と役割分離する。**

- **Board**: content 準拠サイズの column masonry、drag-to-reorder、size preset（S/M/L）で拡大
- **Share Modal**（Plan B）: SNS 枠内で自由配置・リサイズ・装飾して PNG 出力

結果、Board で「重なる」「もぐる」「整列が壊れる」問題は **根本的に消滅** する（カードが重ならない設計になる）。

---

## 2. 確定した設計判断

### 2.1 Board は常に整列（free 配置廃止）

- `freePos` を Board render path から外す（IDB は dead column として残存）
- `computeAutoLayout`（justified rows）を **column masonry** に置換
- カード位置は masonry が一意に決定。ユーザーは「位置」を直接いじらず、「順番」と「サイズ」だけを操作
- Align ボタンは **削除**（常時整列なので不要）

### 2.2 Aspect ratio は content 準拠（動的 derive）

`lib/utils/aspect-ratio-by-content.ts` で URL / OGP / 本文長から aspect ratio を計算する純関数を新規導入。保存値（IDB `Card.aspectRatio`）は legacy 扱い、render 時は常に derive 結果を優先。

#### マッピング規則（Phase 1 ヒューリスティック）

| コンテンツ判定 | aspect ratio (w:h) | 判定ロジック |
|---|---|---|
| YouTube Shorts | 9:16 | URL に `/shorts/` |
| YouTube 通常 | 16:9 | `youtube.com/watch` / `youtu.be/` |
| TikTok | 9:16 | `tiktok.com` |
| Instagram Reels | 9:16 | URL に `/reels/` |
| Instagram Post | 1:1 | 上記以外の `instagram.com`（暫定） |
| Twitter/X 画像あり | OGP image の比率 | OGP `og:image:width` / `og:image:height` 読み、フォールバック 16:9 |
| Twitter/X 画像なし・短文（〜140 字） | 3:4 | title / description 字数が 140 未満 |
| Twitter/X 画像なし・中文（141〜280 字） | 2:3 | |
| Twitter/X 画像なし・長文（281 字〜） | 1:2 | |
| Twitter/X 画像 + 長文 | 1:3 | 画像あり判定 + 長文判定の合成 |
| 一般 web + OGP image | OGP image の比率 | `og:image:width` / `og:image:height`、フォールバック 16:9 |
| 一般 web（OGP image なし） | 3:4 | default |

**実装ノート**:
- 「字数」は `title + description` の合計バイト数ではなく code point 数で判定（CJK 対応）
- OGP 画像比率が取得できず fallback する時は「画像あり判定」を false に戻す（長文優先）
- Phase 2 で pretext による実レンダリング高さ測定を追加予定（本 spec では範囲外）
- 旧 `Card.aspectRatio`（IDB 保存値）は **無視**。Import 済みの既存データも derive 結果で再計算

#### 関数シグネチャ

```ts
// lib/utils/aspect-ratio-by-content.ts
export type AspectRatioInput = {
  url: string
  ogpImageAspect?: number  // og:image:width / og:image:height
  title?: string
  description?: string
}

export function aspectRatioByContent(input: AspectRatioInput): number
```

### 2.3 Size preset S/M/L

ユーザーが各カードに「見たい大きさ」を 3 段階で指定できる。`aspectRatio` と直交する axis。

- **S**（default）: 1 column span
- **M**: 2 column span
- **L**: 3 column span（viewport が狭く 3 列入らない時は M にクランプ）

カード幅 = `columnSpan × columnUnit + (columnSpan - 1) × gap`
カード高さ = `width / aspectRatio`

→ 長文ツイート（aspect 1:2）L 指定なら「3 列幅 × 超縦長」、YouTube（16:9）L 指定なら「3 列幅 × 横長」。content 準拠 × user 拡大の 2 軸。

#### 新規 field

- `Bookmark.sizePreset: 'S' | 'M' | 'L'`（default `'S'`）

### 2.4 Drag-to-reorder（iOS home-screen 風）

**Phase 1（本 spec の範囲、drop 確定時 reflow）:**

1. `pointerdown`: カードを「dragging」マーク、`position: fixed` 相当で pointer 追従（他カードは元位置）
2. `pointermove`: dragged card が pointer を追う（GSAP quickTo で 60fps）
3. `pointerup`:
   - ポインタ座標に最も近いカードを検出（全カードの center 距離 → 最小）
   - 左右どちら側にいるかで「前に挿入 / 後に挿入」を決定 → 新 `orderIndex`
   - items 配列を書き換え → masonry 再計算
   - 全カードを GSAP FLIP で新位置にモーフ（~250ms, `power2.out`）
   - `orderIndex` を IDB に persist（影響カード全て）

**Phase 2（将来、drag 中の live reflow）:** 同じ算法を pointermove で ~16ms throttle 呼び出し。Phase 1 を捨てずに拡張可能。

#### 既存挙動の扱い

- Click（開く）: pointer が 5px 以内 + 200ms 以内なら drag 扱いせず click → 既存の open-URL を呼ぶ（Task 16 の state machine 軽量版）
- Space+drag（panning）: 既存の InteractionLayer 挙動を維持

### 2.5 Size preset UI

- **場所**: カード右下（hover 時に fade-in、カード密度高いので常時表示はしない）
- **表示**: `□` / `□□` / `□□□`（または `S` / `M` / `L`）を小さく。mono font、accent color `#7c5cfc`
- **操作**: クリックで S → M → L → S サイクル。keyboard shortcut `1` / `2` / `3`（hovered card に対して）
- **永続化**: `sizePreset` を IDB に persist。masonry 再計算 + GSAP morph（~250ms）
- **狭い viewport でのクランプ**: 3 列が入らない viewport では L を指定しても M 相当にクランプ（データは L のまま保存、表示時だけ clamp）

### 2.6 Column masonry レイアウト

`lib/board/column-masonry.ts` を新規実装（`computeAutoLayout` を置換）。

#### アルゴリズム

```
Input:
  cards: [{ id, aspectRatio, columnSpan }]  (orderIndex 順)
  containerWidth: number
  gap: number
  targetColumnUnit: number  (目安, viewport から算出)

Steps:
1. columnCount = max(1, floor((containerWidth + gap) / (targetColumnUnit + gap)))
2. columnUnit = (containerWidth - (columnCount - 1) * gap) / columnCount
3. columnBottoms[i] = 0 for i in 0..columnCount-1
4. for each card in order:
     span = min(card.columnSpan, columnCount)  // clamp L/M to fit
     // 最短の placement を探す:
     // - 連続 span 列のうち、max(columnBottoms[i..i+span-1]) が最小になる開始列を選ぶ
     bestStartCol = argmin over i in 0..columnCount-span:
         max(columnBottoms[i..i+span-1])
     cardTop = max(columnBottoms[bestStartCol..bestStartCol+span-1])
     cardWidth = span * columnUnit + (span - 1) * gap
     cardHeight = cardWidth / card.aspectRatio
     position[card.id] = { x: bestStartCol*(columnUnit+gap), y: cardTop, w: cardWidth, h: cardHeight }
     // 占有列の bottom を更新
     for i in bestStartCol..bestStartCol+span-1:
         columnBottoms[i] = cardTop + cardHeight + gap
5. totalHeight = max(columnBottoms) - gap  (最後の gap は含めない)

Output:
  positions: Record<id, { x, y, w, h }>
  totalHeight, totalWidth
```

#### 純関数としてのテスト可能性

- 入力だけで決定的に出力が定まる
- TDD で数十パターン（single column, mixed spans, clamping, gap handling）をテスト

#### 既存 `computeAutoLayout` の扱い

- **削除しない**（`lib/board/align.ts::alignAllToGrid` 経由で Share Modal preview に再利用する可能性）
- Board render path からの呼び出しだけ抜く

### 2.7 撤去する UI / 挙動

| 撤去対象 | 理由 |
|---|---|
| Resize handle（8 方向）| Board は S/M/L preset に統一 |
| Rotation handle | Share Modal へ移設（Plan B） |
| Free drag（位置変更）| drag-to-reorder に書き換え |
| Align button（⚡）| 常時整列なので不要 |
| `BoardRoot.handleCardResizeEnd` / `handleCardResize` / `handleCardResetToNative` | Resize 廃止で不要 |
| `BoardRoot.handleAlign` / `alignKey` state / `CardsLayer` morph timeline | Align 廃止で不要（morph ロジックは FLIP reorder で別途使う） |

### 2.8 データモデル（IDB v7 → v8 migration）

#### 追加

- `Bookmark.orderIndex: number`（default: 既存レコードの作成順で連番付与）
- `Bookmark.sizePreset: 'S' | 'M' | 'L'`（default `'S'`）

#### 維持（dead column）

- `Card.freePos`（Share Modal が将来使う可能性を残して dead のまま保持）
- `Card.rotation`, `Card.scale`, `Card.zIndex`（既に dead）

#### Migration 手順

```ts
// lib/storage/indexeddb.ts
// v8: add orderIndex and sizePreset to bookmarks
async function migrateV7toV8(tx: IDBTransaction): Promise<void> {
  const store = tx.objectStore('bookmarks')
  const cursor = store.openCursor()
  let order = 0
  cursor.onsuccess = (e) => {
    const c = (e.target as IDBRequest<IDBCursorWithValue>).result
    if (!c) return
    const v = c.value
    v.orderIndex = order++
    v.sizePreset = 'S'
    c.update(v)
    c.continue()
  }
}
```

- DB 定数 `DB_VERSION = 8`
- 既存 `BoardConfig.layoutMode` 削除は v7 で既に実施済、本 spec では触らない

---

## 3. コンポーネント影響一覧

| 種別 | ファイル | 変更内容 |
|---|---|---|
| 新規 | `lib/utils/aspect-ratio-by-content.ts` | content → aspect ratio 純関数 |
| 新規 | `lib/utils/aspect-ratio-by-content.test.ts` | TDD |
| 新規 | `lib/board/column-masonry.ts` | column masonry 純関数 |
| 新規 | `lib/board/column-masonry.test.ts` | TDD |
| 新規 | `components/board/SizePresetToggle.tsx` + `.module.css` | S/M/L サイクルボタン |
| 新規 | `components/board/use-card-reorder-drag.ts` | drag-to-reorder state machine + FLIP |
| 大改修 | `components/board/BoardRoot.tsx` | free 系 state / handler 削除、column-masonry / reorder 呼び出しに差し替え、`orderIndex` / `sizePreset` persist |
| 大改修 | `components/board/CardsLayer.tsx` | positions を column-masonry 出力に切り替え、reorder 中の preview 対応、resize handle / rotation handle 呼び出し削除 |
| 大改修 | `components/board/CardNode.tsx` | `SizePresetToggle` 埋め込み、hover 検知 |
| 改修 | `lib/storage/use-board-data.ts` | `persistOrderIndex(bookmarkId, order)` / `persistSizePreset(bookmarkId, preset)` 追加、`freePos` 系 API は legacy 扱いで残す |
| 改修 | `lib/storage/indexeddb.ts` | v8 migration 追加、`DB_VERSION = 8` |
| 改修 | `components/board/Toolbar.tsx` | `onAlign` prop 削除（⚡整列ボタン消去）、`onShare` のみ維持 |
| 削除 | `components/board/ResizeHandle.tsx` + `.module.css` | Board から撤去（Share Modal でも使うなら Plan B で import する想定） |
| 削除 | `components/board/RotationHandle.tsx` + `.module.css` | 同上 |
| 削除 | `components/board/use-card-drag.ts` | free-drag state machine、reorder に置換 |
| 削除 | `lib/board/align.ts::alignAllToGrid` 呼び出しサイト | Board から外す（関数は残す） |
| 維持 | `lib/board/auto-layout.ts` | 削除しない（Share Modal preview 用の予備） |
| 維持 | `ThemeLayer / InteractionLayer / Sidebar / LiquidGlass` | 変更なし |

---

## 4. 挙動の詳細仕様（インタラクション）

### 4.1 Click（開く）

- `pointerdown` → `pointerup` 間で
  - 移動距離 < 5px かつ経過時間 < 200ms
  - `target` が `SizePresetToggle` でない
- を満たせば click 扱い、`window.open(item.url, '_blank')`

### 4.2 Drag-to-reorder

#### Drag 開始条件

- `pointerdown` on card body（SizePresetToggle 以外）
- 移動距離が 5px を超える、または押下経過時間が 200ms 以上

#### Drag 中

- 対象カードを `z-index: 1000`, `scale: 1.03`, `box-shadow: 0 16px 48px rgba(0,0,0,0.25)` で「持ち上がった」表現
- Pointer に対し GSAP `quickTo` で 60fps 追従
- 他のカードは動かない（Phase 1）

#### Drop

1. Pointer の現在座標に最も近い「候補カード」を探す
   - 全カードの center と pointer の Euclidean 距離を比較
2. 候補カードの center より pointer が左なら「前に挿入」、右なら「後に挿入」
3. 新 `orderIndex` を算出
4. items 配列を新順序で書き換え
5. `column-masonry` を再計算
6. 全カード（dragged 含む）を GSAP FLIP で新位置にモーフ
   - FLIP: drop 直前の DOM 位置を記録 → state 更新 → 新 DOM 位置を読む → delta を逆方向 transform で初期化 → `gsap.to(..., { x: 0, y: 0, duration: 0.25, ease: 'power2.out' })`
7. 影響を受けた全カードの `orderIndex` を IDB に persist（bulk）

#### Drop キャンセル（Escape key）

- drag 中に Esc 押下で元位置へ GSAP bounce back（~200ms）、persist せず

### 4.3 Size preset サイクル

- カード hover で右下 fade-in
- クリックで `S → M → L → S`
- viewport が L を入れられない時（columnCount < 3）は表示時だけ M として render
- 永続化 → masonry 再計算 → GSAP morph ~250ms（FLIP）

### 4.4 キーボードショートカット

| Key | 挙動 |
|---|---|
| `1` | hovered card を S に |
| `2` | hovered card を M に |
| `3` | hovered card を L に |
| `Esc` | drag 中ならキャンセル |
| `F` | Sidebar 折り畳みトグル（既存） |
| `Space`+drag | canvas pan（既存） |

hovered card は `:hover` ではなく state で追跡（`hoveredBookmarkId`）、keyboard 時に最新のものを使う。

---

## 5. スコープ

### 5.1 本 spec の範囲（Phase 1）

- [x] Aspect-ratio-by-content ヒューリスティック + 純関数 + テスト
- [x] Column masonry + 純関数 + テスト
- [x] drag-to-reorder（drop-time reflow, GSAP FLIP）
- [x] Size preset S/M/L + UI toggle + keyboard shortcut
- [x] IDB v8 migration（`orderIndex` + `sizePreset`）
- [x] Free drag / resize / rotation / align 系の UI / state 撤去
- [x] `aspectRatio` 保存値を derive 結果優先に切り替え
- [x] 手動検証 + 本番 deploy

### 5.2 Out of scope（将来）

- Drag 中の live reflow（Phase 2）
- Share Modal 全体（Plan B = `2026-04-20-b1-dashboard-redesign-design.md` §2.5 参照）
- Free 配置 / 回転 / 連続リサイズ / 装飾（Share Modal 内に移設）
- pretext / 実埋め込みを使った精密 aspect ratio 測定
- 範囲選択 reorder、multi-select

### 5.3 削除する既存 Task ペイロード

以下は Plan `2026-04-19-b1-placement.md` / `2026-04-20-b1-dashboard-foundation.md` 内のものを参照:

- Task 16 free-drag state machine（本 spec の use-card-reorder-drag に置換）
- Task 17 RotationHandle（Board から撤去、Share Modal 実装時に転用候補）
- Task 18 ResizeHandle 8 handles（同上）
- Align button 実装（§2.7 で撤去）

---

## 6. テスト戦略

### 6.1 ユニット（TDD）

- `lib/utils/aspect-ratio-by-content.test.ts`
  - YouTube 通常 / Shorts / TikTok / Instagram post / Reels の URL 判定
  - Twitter 字数段階（0, 140, 141, 280, 281, 500）でしきい値確認
  - 画像あり + 長文の合成ルール
  - OGP image aspect 優先順位
  - Fallback（OGP なし + URL 判定も失敗）
- `lib/board/column-masonry.test.ts`
  - 単一列 viewport での縦積み
  - 3 列 viewport で 9 枚の S 配置
  - L span=3 の配置と周囲の clamp
  - L 指定だが columnCount=2 での M クランプ
  - Gap 計算の端の扱い
  - orderIndex が等しいケースでの stable sort
  - 空配列の境界

### 6.2 統合（Playwright E2E）

- `/board` 初期表示で masonry 整列、カードが重ならない（overlap 検出）
- Drag で隣のカードと入れ替わる（並び順確認）
- Drag Esc でキャンセル、元位置復帰
- S → M → L クリックでサイズ変化、持続（reload 後も維持）
- Keyboard `1/2/3` で hovered card サイズ変化
- Viewport を狭めると L が自動で M クランプ

### 6.3 パフォーマンス

- 1000 枚カードで masonry 計算 < 16ms
- Drop 時の FLIP morph が 60fps 維持
- DOM 数は viewport culling で < 300（既存テストで確認済）

---

## 7. 段階的ロールアウト

1. **Branch**: `claude/b1-placement` で直接実装（新 worktree は切らない、既存 B1 work を前進させる）
2. **コミット戦略**:
   - (a) aspect-ratio-by-content 純関数 + テスト（TDD）
   - (b) column-masonry 純関数 + テスト（TDD）
   - (c) IDB v8 migration
   - (d) Free drag / resize / rotation / Align 撤去（UI 一時的に素の masonry で動く状態）
   - (e) SizePresetToggle UI + キー操作
   - (f) drag-to-reorder + FLIP
   - (g) 手動検証ラウンド + tweak
   - (h) 本番 deploy
3. 各コミット後にテスト green 確認

---

## 8. リスクと緩和

| リスク | 緩和 |
|---|---|
| OGP image aspect が取れないケースが多い | Phase 1 は字数 fallback で十分。Phase 2 で bookmarklet 取得時に `og:image:width/height` を保存するよう拡張 |
| 長文ツイートを 1:3 / 1:4 にすると画面が縦に伸びすぎる | Clamp 上限を設定（max aspect 1:3 に clamp）。Phase 2 で pretext 実測に移行 |
| FLIP アニメーションが 1000 枚で遅い | Viewport 外のカードは FLIP 対象外（culling 適用）。GSAP の batch API を使う |
| Drag-to-reorder で insertion index の判定が曖昧（特にカラム境界） | MVP は center 距離 + 左右判定のみ。Phase 2 で「gap に入ったら隣の列に挿入」等を精緻化 |
| Size preset 変更で不意にレイアウトが大きく動く | GSAP morph で ~250ms かけて滑らかに移行、突然の snap を避ける |
| 既存ユーザー（dogfood）の `freePos` / `rotation` が失われる | IDB では残存、単に render で参照しないだけ。完全削除は将来 v9 等で |

---

## 9. 未決事項（実装前に決める）

- Sidebar からアクセスする「Sort by」オプション（作成日 / タイトル / aspect ratio）は本 spec では扱わない。B2 以降
- Keyboard shortcut `1/2/3` と「Twitter の短文 / 長文」判定の 280 字境界は dogfood で微調整予定
- SizePresetToggle のデザイン（`□` vs 数字 vs ドット）は実装時に 2〜3 案試してユーザー確認

---

## 10. 完了条件

- 本番 `booklage.pages.dev` で:
  - カードが content 準拠のサイズで並び、重ならない
  - YouTube が横長、縦動画が縦長、長文ツイートが縦長に表示される
  - Drag で順番が入れ替わる（drop 時に滑らかに reflow）
  - S/M/L preset が切り替わる（hover → クリック、または keyboard）
  - Reload 後も順番 / サイズが維持される
- テストすべて green（unit + E2E）
- `docs/TODO.md` 更新（本 spec の実装完了を記録）
