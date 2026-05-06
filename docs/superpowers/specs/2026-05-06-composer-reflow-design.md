# Composer Reflow + 編集レイヤー — Design Spec

**作成日**: 2026-05-06
**スコープ**: Plan A 残り item 2（v76 → v77 想定）
**前提**: v75 で受信側 URL バグ（title 200 字超）は根本解決済み、v76 で title 帯白の漏れも修正済み

---

## 1. 背景と問題

現在の `ShareComposer` は本番テストで以下の致命欠陥が判明：

1. **中央 frame が真っ黒** — ユーザーが Composer を開くと選択カードが何も映らない
2. **アスペクト切替で reflow しない** — 4:3 → 1:1 → 9:16 を切り替えても masonry が再計算されない
3. **編集できない** — drag 並び替え / S/M/L 変更 / 削除が Composer 内でできず、シェア画像の質を作り込めない

### 根本原因（item 1 の真因）

[`lib/share/board-to-cards.ts`](../../../lib/share/board-to-cards.ts) の `boardItemsToShareCards` は **board canvas 座標の `layout.positions`（pixel 単位、x が 0..数千）を frame size（典型 1080）で割って 0..1 に normalize しようとしている**。座標系が完全に違う → 正規化値は 0..1 を遥かに超え、`<ShareFrame>` で `c.x * width` が画面外を指す。

board と Composer の frame は別座標系。Composer は board の位置情報を再利用するのではなく **frame の中で独自に再レイアウトする**必要がある。

### item 2 の解（item 1 と同根）

Composer は frame 幅基準で `computeColumnMasonry` を独自に実行。アスペクト切替で frame.w が変わると masonry が自動再計算 → reflow が自然に成立。

### item 3 の必要性

ユーザー曰く「シェア時の見た目に直結する」「組み直したい」。board の InteractionLayer と完全パリティな編集体験（drag reorder / S/M/L 循環 / 右クリック削除）が必須。

---

## 2. 確定した設計判断（brainstorming 結果）

| 論点 | 決定 |
|------|------|
| ドラッグの挙動 | **reorder（並び替え）型**。masonry 順序の swap、free position pin ではない。board と同じ |
| アスペクト切替時の手動編集 | **完全リセット**（frame 切替は構図やり直し宣言）。手動 position の概念がそもそも無いので問題消滅 |
| カードが箱に入りきらないとき | **A 案: uniform scale 自動縮小**。masonry 結果が frame 高さを超えたら全体比例縮小して全カードを収める |
| サイズ変更 UI | board と完全同じ `<SizePresetToggle>`（hover で出る S/M/L 循環 pill） |
| Composer 内編集の board への波及 | **絶対なし**。Composer は side-effect-free な ephemeral mode、IndexedDB / `onCyclePreset` 等 board mutation API は一切呼ばない |
| Composer 内 state の永続化 | **完全リセット**（閉じる毎に破棄）。シェアは「その時の気分で組む 1 回モノ」 |
| 受信側クリック挙動 | **新タブで元 URL を開く**最小実装。Lightbox 化は Phase 2 別セッション |

---

## 3. アーキテクチャ

```
ShareComposer (state owner)
  ├─ cardOrder: readonly string[]            ← drag reorder で mutate
  ├─ sizeOverrides: ReadonlyMap<id, S|M|L>   ← S/M/L 循環で mutate
  ├─ selectedIds (既存)                       ← 削除時もここを mutate（onToggle 流用）
  └─ uses composer-layout.ts → ShareCard[]
                                              ↓
                                    ShareFrame (renderer + edit affordances)
                                              ↓
                                    CardNode (board と同じ)
```

**3 つのレイヤー責務**:

1. `ShareComposer.tsx`: state 所有 + `composer-layout.ts` 呼び出し + 編集ハンドラ
2. `lib/share/composer-layout.ts`（新規）: pure function, frame-fit + auto-shrink + normalize
3. `ShareFrame.tsx`: renderer + drag / sizecycle / contextmenu の affordance を component 内で wire

---

## 4. composer-layout.ts のロジック

### 入出力

```typescript
type ComposerLayoutInput = {
  readonly items: ReadonlyArray<BoardItemLite>           // selectedItems
  readonly order: ReadonlyArray<string>                   // cardOrder
  readonly sizeOverrides: ReadonlyMap<string, ShareSize>  // 未指定なら items.sizePreset
  readonly aspect: ShareAspect
  readonly viewport: { readonly width: number; readonly height: number }
}

type ComposerLayoutResult = {
  readonly cards: ShareCard[]                            // 0..1 normalized
  readonly frameSize: { readonly width: number; readonly height: number }
  readonly didShrink: boolean                            // テスト用シグナル
  readonly shrinkScale: number                           // テスト用シグナル（1 if no shrink）
}
```

### 処理ステップ

1. `order` に従って items を並べる。`order` に未登録の item は末尾追加（safety net）
2. 各 card の effective columnSpan = `SIZE_PRESET_SPAN[sizeOverrides.get(id) ?? items[i].sizePreset]`
3. `frameSize = computeAspectFrameSize(aspect, viewport.w, viewport.h)`
4. 新規定数で masonry を実行:
   ```
   COMPOSER_MASONRY = {
     GAP_PX: 8,                      // board の GAP_PX より小さめ（frame が狭いから）
     TARGET_COLUMN_UNIT_PX: 140,     // board より小さい（frame に多く詰める）
   }
   ```
   （実装時に board のと比較して微調整。spec では「小さめの値」とだけ確定）
5. `result = computeColumnMasonry({ cards, containerWidth: frameSize.width, gap, targetColumnUnit })`
6. `if (result.totalHeight > frameSize.height)`:
   - `scale = frameSize.height / result.totalHeight`
   - 全 position の x/y/w/h に scale 適用
   - `didShrink = true`、`shrinkScale = scale`
7. **vertical centering**: scale 後の totalHeight が frameSize.height より小さければ、`(frameSize.height - scaledTotalHeight) / 2` を全カードの y にオフセット加算。frame 内で構図が縦中央に来る（top-aligned よりシェア画像として落ち着く）
8. 各 card の x/y/w/h を `frameSize` で割って 0..1 normalize → `ShareCard[]`
9. `s` フィールドは effective size を echo（既存通り）

### intrinsicHeight について

Tweet / Text 系の text-heavy card では `intrinsicHeight` を board が使っているが、Composer では **使わない**（width が変わって height が text reflow するのは Composer 内では measure できないため）。`aspectRatio` 由来の height だけで masonry する。シェアは「コラージュ画像」なので text 詳細が崩れるのは許容（PNG 化されたあとの視認性は frame 全体で確保）。

---

## 5. ShareComposer 側の state 追加

### state 宣言

```typescript
const [cardOrder, setCardOrder] = useState<readonly string[]>(() => initialOrder())
const [sizeOverrides, setSizeOverrides] = useState<ReadonlyMap<string, ShareSize>>(new Map())
```

### 初期順序

`initialOrder()` は **board 上での見える順（top-left → bottom-right、masonry の y 昇順 → x 昇順）**。Composer に渡される `positions`（board canvas 座標、現バグの諸悪の根源だが「順序を決めるための sort key」としてだけ使えば OK）から計算。

### selectedIds 同期

```typescript
useEffect(() => {
  setCardOrder((prev) => {
    const filtered = prev.filter((id) => selectedIds.has(id))
    const prevSet = new Set(filtered)
    const newIds = Array.from(selectedIds).filter((id) => !prevSet.has(id))
    return [...filtered, ...newIds]   // 新規追加は末尾へ
  })
}, [selectedIds])
```

### 編集ハンドラ

```typescript
const handleReorder = (orderedIds: readonly string[]): void => {
  setCardOrder(orderedIds)
}

const handleCycleSize = (id: string, next: ShareSize): void => {
  setSizeOverrides((prev) => {
    const m = new Map(prev)
    m.set(id, next)
    return m
  })
}

const handleDelete = (id: string): void => {
  // 既存の onToggle を流用、selectedIds から外すだけ
  // sizeOverrides は残してよい（同じカードが再選択されたとき記憶を維持）
  // → simplicity 優先で sizeOverrides.delete(id) もあり、実装時判断
  onToggle(id)
}
```

---

## 6. ShareFrame 側の編集 affordance

### Props 拡張

```typescript
type Props = {
  readonly cards: ReadonlyArray<ShareCard>
  readonly width: number
  readonly height: number
  readonly editable: boolean
  // 編集モード時のみ参照
  readonly cardIds?: ReadonlyArray<string>     // index → bookmarkId 解決用
  readonly onReorder?: (orderedIds: readonly string[]) => void
  readonly onCycleSize?: (id: string, next: ShareSize) => void
  readonly onDelete?: (id: string) => void
  // 受信側のみ
  readonly onCardOpen?: (i: number) => void
}
```

### drag reorder

`useCardReorderDrag` フックを board から流用。**ただし座標系が違う** ので注意:
- board: world coordinates（pan/zoom 考慮）
- Composer: frame-local coordinates（pan/zoom なし、frame サイズ ≦ ~1080）

board 側のフックは `positions` と `pointer world coords` を受けるので、Composer では `positions = cards から派生（c.x*width, c.y*height, c.w*width, c.h*height）` を渡し、`pointer = e.clientX/Y - frameRect.left/top` を渡せば再利用可能。実装時にアダプタが必要なら `useShareReorderDrag` という薄い wrapper を書いて分離。

### S/M/L 循環

`<SizePresetToggle>` を hover 時にカード右上に表示。`onCycle` を `handleCycleSize` に bind。**board の `onCyclePreset` は呼ばない**（Composer 内 state のみ更新）。

### 右クリック削除

`onContextMenu` で `e.preventDefault()` + `onDelete(id)`。ShareComposer の `handleDelete` → `onToggle(id)` で source list 側 selection も同期される（既存仕組み）。

### Isolation 保証（実装ガイド）

- ShareFrame は `editable={false}` のとき hover state や drag handler を **mount しない**（受信側で重い event handler が動かない保証）
- `editable={true}` でも、ShareFrame の中から board のグローバル state や IndexedDB に届く API は **import しない**。`useBoardData` を import したら lint で fail させる規約を README に追記

---

## 7. 受信側（SharedView）— Phase 1 最小実装

```typescript
// SharedView.tsx
const handleCardOpen = (i: number): void => {
  const url = state.data.cards[i]?.u
  if (!url) return
  window.open(url, '_blank', 'noopener,noreferrer')
}

<ShareFrame
  cards={state.data.cards}
  width={frame.width}
  height={frame.height}
  editable={false}
  onCardOpen={handleCardOpen}
/>
```

CSS で `editable={false}` 時:
- `cursor: pointer`
- hover 時 `transform: scale(1.02)` + 軽い shadow（160ms ease-out）

Lightbox / 矢印 nav / 取り込みボタンは Phase 2 / 3。

---

## 8. テスト

### Unit (`lib/share/composer-layout.test.ts`)

| ケース | 期待 |
|--------|------|
| 3 枚カード、free aspect、frame に余裕あり | masonry 通り、`didShrink=false`、normalize 後 0 ≤ x,y,w,h ≤ 1、縦方向に中央寄せされる（上下にほぼ均等な余白） |
| 50 枚カード、9:16 aspect（縦長狭い） | `didShrink=true`、`shrinkScale < 1`、全カードの y+h ≤ 1.0001（浮動小数点誤差許容） |
| 1 枚カード（極端に少ない） | 中央寄せが効く、x も水平方向は masonry 通り（左寄せ）、y は中央寄せ |
| aspect: free → 1:1 で frame.w 縮 | 同 input でも layout 違い、deterministic |
| sizeOverrides: M → L 1 枚 | columnSpan 反映、その card の w が大きい |
| order 変更 | 出力配列の順序が input order に一致 |
| `intrinsicHeight` を渡しても無視 | aspectRatio ベースで height 計算 |

### E2E (`tests/e2e/share-composer-edit.spec.ts`)

1. board 起動 → カード 5 枚 add → Share open → Composer 表示
2. **frame に全カードが見える**（screenshot で目視 + cards selector が ≥1 visible）
3. アスペクト切替 1:1 → 9:16 → frame サイズ変化、reflow 後も全カード見える
4. カード 1 つを drag → 順序変更を観測（DOM 順序チェック）
5. カードを hover → SizePresetToggle 表示 → クリック → 該当カード width 拡大
6. カードを右クリック → 該当カードが消える、source list でも deselect される
7. 確定ボタン → ActionSheet 表示、URL から decode した cards 配列が edits 反映済み

### 既存テスト

- `share-sender.spec.ts` を流して regression なし
- `board-to-cards.test.ts` 残置（normalize テストは依然有効）

---

## 9. Out of scope（このセッション）

- **Phase 2 (次セッション、独立 brainstorming)**:
  - 受信側 read-only Lightbox（board の Lightbox を流用）
  - board / 受信側 Lightbox の左右矢印 / キーボード ←→ nav
  - 「Booklage で表現する」文言改名（候補: 「Booklage で集める」「自分のボードに取り込む」等、別 brainstorming）
- **Phase 3 (Phase 2 の後)**:
  - 受信側 Lightbox に「このカードを取り込む」単体ボタン
  - Lightbox 外で全部取り込み + matching-app 風タグ付け（TODO Task 4.1, 4.2）
  - 複数 PNG 分割出力（多枚カードを 1 枚に詰めず複数 PNG にする願望、別タスク）
- **Future B1**: S/M/L → 連続値スライダー化
  - `composer-layout.ts` の columnSpan 計算と `SizePresetToggle` を同時更新する必要あり
  - memory `feedback_glass_blur_tuning.md` 系列の B1 タスクに合流

---

## 10. リスクと対策

| リスク | 対策 |
|--------|------|
| `useCardReorderDrag` の流用で座標系混乱 | 薄い wrapper `useShareReorderDrag` を書いて frame-local 座標に閉じ込める。混乱したら別フックに分離 |
| auto-shrink で text 系カードの可読性が壊滅的に低下 | Phase 1 では許容（spec 8 のテストでは「全部入る」が success criterion、可読性は post-launch polish） |
| `SizePresetToggle` を Composer に流用したとき hover state が board と干渉 | ShareFrame は backdrop 内 isolated container、event は冒頭で `e.stopPropagation()` |
| board の `useCardReorderDrag` が world coord ベースで前提崩れる | 実装序盤で fork する判断点を持つ。1 日試して壊れるなら Composer 専用フックを新規実装（規模 +0.5 日） |

---

## 11. 実装順序（writing-plans で詳細化）

1. `composer-layout.ts` 新規 + unit tests（最大価値、まず緑にする）
2. `ShareComposer` を新ロジックに切替（既存 `boardItemsToShareCards` 呼び出し削除）→ frame 真っ黒バグ消滅、アスペクト切替 reflow 動作
3. ShareFrame に edit affordances 追加（drag / sizecycle / delete）
4. SharedView に click → window.open 追加
5. E2E spec 追加 → 全部緑
6. visual regression 確認（dev server で目視 + 本番 deploy）

---

## 12. 受け入れ基準

- 本番 board で実 cards を Composer に open → frame 中央に **全カードが見える**
- アスペクト切替 4 種で **reflow が動き、全カード frame 内に収まる**
- drag で順序変更可能、S/M/L 循環可能、右クリック削除可能
- 編集後の状態が確定 PNG / URL に正しく反映される
- **board のカード数 / IndexedDB / onCyclePreset 等の board state は Composer 操作で 1 mutation も発生しない**
- 受信側で各カードクリック → 元 URL を新タブで開く
- `pnpm tsc` + `pnpm vitest run` + `pnpm playwright test` 全緑
