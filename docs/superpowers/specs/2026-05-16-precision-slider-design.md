# Precision Slider sprint — design spec

> セッション 29 (2026-05-16) brainstorm 確定。 board ヘッダーの W (= card width) と G (= card gap) スライダーを native `<input type=range>` から自前 pointer-based slider に置き換える。 IDEAS §セッション 23 D + E の積み残し (= マウスより遅く動く + 1 ずつ狙える) の根本治療。

---

## 0. ゴール

board の **W / G スライダーを自前実装**に置き換え、 マウスを動かした距離より slider 値が遅く動くようにする。 結果:

- 「W = 280 のつもりが 290 になっちゃう」 が消える (= 1 step / 0.1 step 単位で正確に狙える)
- W と G で**手感が完全に一致**する (= 「W は速い、 G は遅い」 のチグハグが消える)
- 視覚的には Apple v3 路線 (= stroke chrome 文字 + 白い小さな点) を維持・拡張
- Gap 上限が 60 → 300 に拡大 (= 「カードを大きく離す」 表現が解放される)

---

## 1. 確定パラメータ

### 1-1. 値モデル

- 内部値は **float** (= `number` のまま、 整数化しない)
- マウス操作で 0.1 単位の精度で値が動く (= range-aware ratio による副産物)
- onChange 経由で BoardRoot に float のまま渡す
- layout 計算 (= `computeSkylineLayout` 経由) は浮動小数点をそのまま消費 (= CSS pixel として通る)

### 1-2. 動作 ratio (= 「マウス N px で端→端」)

- 基準: **マウス 1000px で min → max を移動**
- `ratio = (max - min) / 1000`
- W: `ratio = (720 - 120) / 1000 = 0.6` (= マウス 1px で W が 0.6 進む)
- G: `ratio = (300 - 0) / 1000 = 0.3` (= マウス 1px で G が 0.3 進む)
- 両 slider で「マウス 1000px = 端から端」 という**手感が完全に一致**

### 1-3. 表示形式

- 通常時: `0280` (= 4 桁 zero-pad、 `Math.round(value)`)
- ドラッグ中: 表示変更**なし** (= 小数点を出さない、 layout が動かないことを優先)
- フォント: `ui-monospace, Menlo, monospace`、 `tabular-nums` (= 文字幅固定)
- stroke chrome: `-webkit-text-stroke: 0.5px rgba(0, 0, 0, 0.45)` + `paint-order: stroke fill` (= 既存 chrome と統一)

### 1-4. 定数変更 (`lib/board/constants.ts`)

```diff
 BOARD_SLIDERS = {
   CARD_WIDTH_DEFAULT_PX: 267,
   CARD_WIDTH_MIN_PX: 120,
   CARD_WIDTH_MAX_PX: 720,
   CARD_GAP_DEFAULT_PX: 18,
   CARD_GAP_MIN_PX: 0,
-  CARD_GAP_MAX_PX: 60,
+  CARD_GAP_MAX_PX: 300,
 }
```

既存 IDB 内の gap 値は全て ≤ 60 なので **migration 不要** (= 範囲を広げるだけ、 既存値は範囲内)。 `clampCardGap` も範囲拡大に追従するだけで挙動変化なし。

---

## 2. コンポーネント構造

### 2-1. 構造図

```
PrecisionSlider (新規 = 本体)
  ├── <label className={row}>
  │     ├── <span className={label}>{labelText}</span>          ← "W" or "G"
  │     ├── <div role="slider" tabIndex={0}                     ← track + pointer handler
  │     │       data-dragging={dragging || undefined}
  │     │       data-testid={testId}>
  │     │     ├── <div className={trackLine} />                  ← 視覚線
  │     │     └── <div className={thumb}                          ← 白い点
  │     │             style={{ left: pct% }} />
  │     └── <span className={value}>{pad4(value)}</span>         ← 0280
  └── ...

SizeSlider (= 薄いラッパー)
  └── <PrecisionSlider label="W"
        min={CARD_WIDTH_MIN_PX}
        max={CARD_WIDTH_MAX_PX}
        value={value}
        onChange={onChange}
        testId="size-slider" />

GapSlider (= 薄いラッパー、 同上)
  └── <PrecisionSlider label="G"
        min={CARD_GAP_MIN_PX}
        max={CARD_GAP_MAX_PX}
        ... />
```

### 2-2. ファイル変更

| ファイル | 変更 |
|---|---|
| `components/board/PrecisionSlider.tsx` | **新規** — 本体実装 |
| `components/board/PrecisionSlider.module.css` | **新規** (= `SliderControl.module.css` の中身を移植 + 改修) |
| `components/board/SliderControl.module.css` | **削除** |
| `components/board/SizeSlider.tsx` | 中身を `<PrecisionSlider>` 呼び出しに置換 |
| `components/board/GapSlider.tsx` | 中身を `<PrecisionSlider>` 呼び出しに置換 |
| `components/board/WidthGapResetButton.tsx` | default 判定を `===` → `Math.abs(diff) < 0.5` のトレランス比較に変更 |
| `lib/board/constants.ts` | `CARD_GAP_MAX_PX: 60 → 300` |

### 2-3. PrecisionSlider の Props

```ts
type Props = {
  readonly label: string                  // "W" / "G"
  readonly min: number
  readonly max: number
  readonly value: number                  // controlled — float そのまま
  readonly onChange: (next: number) => void
  readonly testId?: string
}
```

clamp は呼び出し側 (= BoardRoot の `setCardWidthPx(clampCardWidth(v))`) に任せる (= 既存挙動踏襲)。 `PrecisionSlider` 内では `min` / `max` で表示用 clamp のみ行う。

---

## 3. interaction の詳細

### 3-1. pointer ハンドラ

```ts
const onPointerDown = (e: PointerEvent) => {
  e.preventDefault()
  if (typeof trackRef.current?.setPointerCapture === 'function') {
    trackRef.current.setPointerCapture(e.pointerId)
  }
  setDragging(true)
}

const onPointerMove = (e: PointerEvent) => {
  if (!dragging) return
  const ratio = (max - min) / 1000
  const next = clamp(value + e.movementX * ratio, min, max)
  onChange(next)
}

const onPointerUp = (e: PointerEvent) => {
  if (trackRef.current?.hasPointerCapture(e.pointerId)) {
    trackRef.current.releasePointerCapture(e.pointerId)
  }
  setDragging(false)
}
```

### 3-2. 端での挙動

- `min` / `max` で**即時 clamp** (= overshoot 用バッファなし)
- マウスを max を超えて動かすと値が `max` で止まる
- そのまま反対方向にマウスを動かすと**即座に**値が減り始める (= deadzone なし)
- 「行き止まり」 感は thumb が `left: 100%` で止まる視覚で伝える

### 3-3. クリックのみ (= ドラッグなし) の挙動

- **何も起きない** (= track の特定位置にクリック = jump、 という native input 風挙動はしない)
- 理由: 「マウス位置 = 値」 という直接マッピングが今回の精密化と矛盾する
- focus は当たる (= キーボード操作の起点として)

### 3-4. キーボード操作

| キー | 動作 |
|---|---|
| `ArrowLeft` / `ArrowDown` | `value -= 1` |
| `ArrowRight` / `ArrowUp` | `value += 1` |
| `Home` | `value = min` |
| `End` | `value = max` |

modifier 拡張 (= Shift で ×10) は MVP に含めない。

### 3-5. タッチ操作

- pointer event は touch にも対応 (`movementX` も発火)
- board 自体が desktop 前提アプリなので**特別な mobile 対応はしない**
- iPad / mobile で開いても drag は動く、 程度

---

## 4. visual treatment

### 4-1. track

- 幅 **200px**、 高さ 2px (= 現状維持)
- 色 `rgba(255, 255, 255, 0.18)` (= 現状維持)
- 親 `div` の hit area は 200×32px (= 大ポインタ要件、 12-32px ガイドライン準拠)
- hover indicator (= ScrollMeter にあるような hoverLine) は**入れない** (= クリック jump 機能を捨てたので存在意義なし)

### 4-2. thumb

- **静止時**: 直径 12px、 `rgba(255, 255, 255, 0.92)`、 `cursor: grab` (= 現状維持)
- **hover 時**: 14px、 `#fff` (= 現状維持)
- **drag 中**: サイズ 12px のまま、 色 `#fff` + 微 glow `box-shadow: 0 0 4px rgba(255,255,255,0.4)`、 `cursor: grabbing`
  - drag 中にサイズを変えない = layout shift で狙いがブレる事故を防ぐ
- 位置: `left: ((value - min) / (max - min)) * 100%` の純粋な視覚マッピング

### 4-3. ラベル + 数値

- 既存 `.row` / `.label` / `.value` の class 構造を踏襲
- `letter-spacing` / `font-size` / stroke chrome は既存値そのまま
- 数値の幅: 4 桁固定なので `min-width: 32px` 程度に拡大 (= 28 → 32、 4 桁分の確保)

### 4-4. cursor 状態

| 位置 | cursor |
|---|---|
| track div (= div role=slider 全体) | `default` |
| thumb | `grab` |
| thumb drag 中 | `grabbing` |

`setPointerCapture` でマウスが画面外に行っても event を受け続ける = `cursor: grabbing` も保持される。

---

## 5. BoardRoot 連携

既存:
```tsx
<SizeSlider value={cardWidthPx} onChange={(v): void => setCardWidthPx(clampCardWidth(v))} />
<GapSlider value={cardGapPx} onChange={(v): void => setCardGapPx(clampCardGap(v))} />
```

変更**なし**。 `SizeSlider` / `GapSlider` の public API (= props) は同じなので、 BoardRoot 側のコード変更はゼロ。

ただし `cardWidthPx` / `cardGapPx` の `useState` 初期化は既存通り integer のままで OK (= float でも代入時 type が緩いので problem なし)。

---

## 6. WidthGapResetButton の修正

現状 `atDefault` 判定は `===` の厳密一致:

```ts
const atDefault =
  widthPx === BOARD_SLIDERS.CARD_WIDTH_DEFAULT_PX &&
  gapPx === BOARD_SLIDERS.CARD_GAP_DEFAULT_PX
```

float 値が入ると整数 default 値と一致しなくなる事故を防ぐため、 **トレランス比較**に変更:

```ts
const EPSILON = 0.5
const atDefault =
  Math.abs(widthPx - BOARD_SLIDERS.CARD_WIDTH_DEFAULT_PX) < EPSILON &&
  Math.abs(gapPx - BOARD_SLIDERS.CARD_GAP_DEFAULT_PX) < EPSILON
```

`EPSILON = 0.5` = 「四捨五入で default 値になる範囲なら default 扱い」。 「DEFAULT」 ボタンを押した直後は厳密 default になるので、 そこからドラッグするまで disable される (= 既存挙動踏襲)。

---

## 7. テスト戦略

### 7-1. 新規テスト

| ファイル | テスト内容 |
|---|---|
| `PrecisionSlider.test.tsx` | (1) render: 4 桁数値表示<br/>(2) pointerdown→move(+100)→up: value が `min + 100 × ratio` になる<br/>(3) clamp: pointermove で max 超えても値は max で止まる<br/>(4) keyboard: ArrowRight で +1、 ArrowLeft で -1、 Home で min、 End で max<br/>(5) NaN 防御: value=NaN を渡しても render が落ちない |

### 7-2. 既存テスト更新

- `SizeSlider`, `GapSlider`: 既存テストファイルなし (= 新規追加せず、 PrecisionSlider テストでカバー)
- `WidthGapResetButton`: 既存テストファイルなし (= 確認済、 tolerance 比較を含めた新規 test 追加は必要なら別チケット、 本 spec では追加しない)
- `lib/board/size-migration.test.ts`: 影響なし (= clamp 関数本体は変えない)

### 7-3. 統合テスト確認

- vitest 478 → +5 程度の追加で 483 前後を想定
- tsc / build clean
- 本番 deploy 後、 実機で W / G を 1000px ドラッグして端→端を確認、 細かい刻みで 1 単位狙えることを確認

---

## 8. 触らない (= 短期スコープ外)

- スライダー数値の「動いてる時の小数」 演出 (= IDEAS §A の `0.0130` 表記アイデア) → user の選択で「通常表記のまま」 確定、 入れない
- 速度 curve / pointer-lock / Shift+arrow ×10 (= MVP に含めない、 必要なら別 spec)
- ScrollMeter の counter とのコラボ演出 (= 例: slider drag 中に counter が一緒に scramble する等)
- DEFAULT ボタンの再デザイン (= 現状維持)

---

## 9. 実装順序 (= 後で writing-plans で plan 化)

1. `constants.ts` の `CARD_GAP_MAX_PX` を 300 に
2. `PrecisionSlider.tsx` + `PrecisionSlider.module.css` 新規作成
3. `SizeSlider.tsx` / `GapSlider.tsx` を ラッパーに書き換え
4. `SliderControl.module.css` を削除
5. `WidthGapResetButton.tsx` を tolerance 比較に
6. `PrecisionSlider.test.tsx` を新規作成
7. tsc / vitest / build clean を確認
8. 本番 deploy + 実機確認 (= user に「マウス 1000px で端→端」 の手感が合うか確認)
9. 必要なら ratio = (max-min)/N の N を実機調整 (= 800-1500 の範囲)
