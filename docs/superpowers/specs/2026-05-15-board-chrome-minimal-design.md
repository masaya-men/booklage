# Board chrome ミニマル化 + 精密化 sprint — design spec

> セッション 27 (2026-05-15) brainstorm の確定。 ① ScrollMeter 下配置 + ② TopHeader ミニマル化 を 1 つの spec に統合。 ③ Slider 精密化以降は次セッション持ち越し。

---

## 0. ゴール

ScrollMeter を board の下端 (= Lightbox と同位置) に移し、 TopHeader 自体は背景なしの「文字 chrome」 にする。 Apple iOS Photos / visionOS が overlay UI で使う「edge gradient scrim + thin paint-order stroke」 方式を採用、 destefanis や Nothing と同じ minimal industrial の方向に揃える。

---

## 1. ① ScrollMeter 下配置 (確定)

### 1-1. 位置・構造

- **位置** = viewport `position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);` (= LightboxNavMeter の `meterWrap` と完全同位置)
- **構造** = counter readout を上に、 waveform を下にスタック (`meterStack` 模倣、 gap 6px)
- **波形** = 現 `components/board/ScrollMeter.tsx` を **そのまま** 下に移動。 swell 計算ロジック (= scroll fraction → 単一点 swell、 固定 sigma `TICK_COUNT/32`) は変更しない。 user 確認済 (= 「ヘッダーにあった時と仕様変えなくていい」)

### 1-2. Counter readout (新規実装)

- **表示形式** = `[ N1 — N2 / TOTAL ]` (= 画面内範囲 N1〜N2 / 全ブクマ件数)
  - 整数 4 桁ゼロ pad: `[ 0001 — 0012 / 0234 ]`
  - bracket は dim (rgba 0.42)、 数字は white (rgba 0.85)
  - dash と slash も dim、 数字の左右に 6-8px の文字スペース
- **font** = `ui-monospace, "SF Mono", Consolas, monospace`、 `font-size: 11px`、 `letter-spacing: 0.10em`、 `tabular-nums` (= LightboxNavMeter と同じ)
- **動き = D ハイブリッド** (= 「数字はうるさく動く、 波形は静か」)
  - 範囲変化時に各数字を `rAF per frame` で random 4 桁 scramble
  - N1, N2 = scramble window `600ms`
  - **TOTAL = scramble window `1500ms`** (= 「総数が一番長くちゃんと見えるスクランブル」 user 希望)
  - settle 後も常時末尾桁 ±1 微振動 (`Math.random() < 0.06` for N1/N2、 `0.10` for TOTAL)
  - **scramble 中もオレンジ強調なし** (= mock では実演用に着色したが本番は white のまま)
- **波形 swell は scramble 値を絶対に参照しない** = settle 済の N1/N2 のみ。 「数字が暴れても波形は静か」 のメリハリを守る (= user 指摘 v3 の bug)

### 1-3. 「画面内範囲 N1〜N2」 の計算

- `viewportY` (= 現在 scroll y) と各カードの y/height (= skyline layout 計算結果) を突き合わせて intersect 判定
- N1 = viewport top に最も近い (= 最初に表示されている) カードの index + 1
- N2 = viewport bottom に最も近い (= 最後に表示されている) カードの index + 1
- 全カードが見えている時 = `N1 = 1`, `N2 = TOTAL`
- 計算は scroll listener 内で throttle (= 60fps で十分)

### 1-4. Lightbox open 時の挙動

- ScrollMeter を **fade out** (= opacity 0、 pointer-events none、 0.25s ease)
- LightboxNavMeter が同位置 (`bottom: 24px`、 center) に表示 → 視覚的に「メーター入れ替わり」
- 既存 TopHeader の `hidden` prop の機構を ScrollMeter にも応用
- 実装: BoardRoot が `<Lightbox open>` 時に ScrollMeter に `hidden` prop を渡す

### 1-5. 既存コードの変更点

- `components/board/ScrollMeter.tsx`: counter readout layer 追加、 waveform 部分は維持
- `components/board/ScrollMeter.module.css`: `meterStack` 風 wrapper (`bottom: 24px`、 `position: fixed`) 追加、 counter style 追加
- `components/board/BoardRoot.tsx`: ScrollMeter を TopHeader の instrument slot から portal 化 (= body 直下 or board 直下に移動)、 `lightboxOpen` state を渡す
- `components/board/TopHeader.tsx`: instrument slot 削除 (= 3 columns → 2 columns、 nav と actions のみ)

---

## 2. ② TopHeader ミニマル化 (Apple v3 採用)

### 2-1. 採用方針 = Apple v3 (= edge scrim + thin paint-order stroke + 文字 chrome)

**なぜ Apple v3 か** (= brainstorm 経緯後の結論):

- ユーザー希望 = chrome なし、 文字だけ、 ミニマル、 destefanis / Nothing 感
- destefanis 本家は **localized backdrop-blur pill** 採用 = pill 形状あり = ユーザーの「pill 無し」 と矛盾
- Apple iOS Photos / visionOS は **edge gradient scrim** + **thin stroke 文字** = pill なし、 board 上端の薄い gradient だけが chrome
- Nothing OS は wallpaper を強制 monochrome 化 = user content 板に応用不可
- → Apple iOS の手法が「pill 無し + 視認性確保 + minimal industrial」 を満たす

### 2-2. 確定仕様

- **TopHeader 自体は HTML 要素として残す** (= テスト互換 + a11y 構造維持) が、 **背景・border・height 制約を全削除**
- **board 上端 80px の edge gradient scrim** を新規追加:
  - `linear-gradient(180deg, rgba(0,0,0,0.32) 0%, rgba(0,0,0,0.16) 40%, transparent 100%)`
  - 配置 = board container の `::before` (or 独立 absolute layer)、 height 80px、 top 0
  - `pointer-events: none`、 z-index は cards より上 / nav-row より下
  - 同時に **board 下端 80px も逆向き scrim** を入れる (= ScrollMeter の counter が背景に溶けないため)
- **chrome-row container**:
  - `position: absolute; top: 0; left: 0; right: 0; padding: 14px 18px 0;`
  - `display: flex; justify-content: space-between; align-items: flex-start;`
  - `pointer-events: none` (子の `.group` だけ `pointer-events: auto`)
  - nav (左 group): FilterPill / Folders nav 等
  - actions (右 group): Share / SizePicker / ResetAll / PopOut 等
  - 中央 (instrument slot) は **完全削除** (= ScrollMeter が下に移動したため)
- **floating text label** (各 chrome 要素のスタイル):
  - `color: rgba(255, 255, 255, 0.85)` (= base)、 hover で `rgba(255, 255, 255, 1)`
  - `-webkit-text-stroke: 0.5px rgba(0, 0, 0, 0.45)` + `paint-order: stroke fill`
  - hover で stroke を `rgba(0, 0, 0, 0.6)` に強化
  - **text-shadow は使わない** (= 「動画字幕」 風 ださい drop-shadow 排除)
  - font: `ui-sans-serif, system-ui` (= Geist 入れたいが、 既存 stack のまま)、 `12px`、 `font-weight: 500`
  - padding: `10px 12px` (= hit area 32×32 以上確保、 大ポインタ対応)
  - hover で `transform: translateY(-1px)` (= 1px 浮き上がり、 マイクロインタラクション)
  - **intro fade**: mount 後 2.4 秒だけ高 opacity + 白 glow shadow → ambient 状態に fade (= 発見性確保)
- **divider**: 「·」 文字を `opacity: 0.4`、 `cursor: default`、 `-webkit-text-stroke: 0` で配置 (= 既存 TopHeader の `.divider` 縦線を文字 dot に置換)

### 2-3. 既存コードの変更点

- `components/board/TopHeader.tsx`:
  - props は維持 (`nav`, `instrument`, `actions`、 `hidden`)、 ただし **instrument は不使用** (= BoardRoot から渡さなくする)
  - `<header>` の className は新規スタイルに置換
- `components/board/TopHeader.module.css`:
  - `.header` の `background: #000` 削除、 `border-bottom` 削除、 `height: 64px` 削除、 `position: sticky` も削除
  - 代わりに `position: absolute; top: 0; left: 0; right: 0;` + padding のみ
  - `.divider` (縦線 span) → 削除 (代わりに React 側で「·」 文字を入れる)
  - mobile media query は scrim 風に整理
- `components/board/BoardRoot.tsx` or `app/(app)/board/page.tsx`:
  - board container に edge scrim 用の `::before` `::after` (or 独立 layer) 追加
  - z-index 順序: `cards < scrim < nav-row < lightbox`

### 2-4. 検討して棄却した動的反転案 (v4-v6)

| 案 | 文字内 pixel 反転 | 白黒のみ | pill 無し | 採否 |
|---|---|---|---|---|
| v4: mix-blend-mode: difference | ✓ | ✗ (赤→cyan / 青→yellow 変色) | ✓ | 棄却 (= カラフル変色) |
| v5b: JS sampling per-label | ✗ (= 文字 1 つ 1 色) | ✓ | ✓ | 棄却 (= 「文字内分割」 user 希望満たさず) |
| v6: backdrop-filter (grayscale + contrast) で 2 値化 | ✓ | ✓ | ✓ (= 視覚的 pill なし) | 棄却 (= 上端 80px の card 領域が「色味抜け・コントラスト強化された帯」 になる副作用が許容外、 user 「全然まともに確認できない」 + Sonnet weekly 制限) |

**物理制約の結論**: 「文字内 pixel-by-pixel 反転 + 白黒のみ + pill / 副作用なし」 の 3 条件は CSS では **物理的に同時実現不可**。 RGB チャンネル独立計算という mix-blend-mode の仕様が根源。 v6 が唯一 3 条件全部満たすが副作用 (= 上端 card 色味抜け) が出る → Apple v3 で「動的反転は諦め、 edge scrim + thin stroke で確実な視認性を担保」 が最終解。

### 2-5. ホバー時のマイクロインタラクション (= user 必須要件)

- opacity 0.85 → 1.0
- transform translateY 0 → -1px
- stroke color 0.45 → 0.6
- transition `color 0.15s, transform 0.15s, -webkit-text-stroke-color 0.15s`

---

## 3. ③ Slider 精密化 + 板に馴染ませる (次セッション持ち越し)

セッション 28 着工。 spec は **持ち越し**。 既存 backlog:
- `docs/private/IDEAS.md` §セッション 23 D + E (= 数値表記の遊び + slow slider 根本治療)
- 実装方針: `setPointerCapture` + `movementX × ratio` でカスタム slider 実装、 visual も Apple v3 路線で文字 chrome 化

---

## 4. 実装 plan (= writing-plans skill 起動前のメモ)

順序:
1. **TopHeader.module.css 改修** (= 黒帯削除 + 文字 chrome 化、 既存 nav/actions slots に新スタイル適用)
2. **board container に edge scrim 追加** (= `::before` 上端、 `::after` 下端、 各 80px)
3. **ScrollMeter portal 化** (= TopHeader instrument slot から body / board 直下に移動、 position fixed bottom 24px center)
4. **ScrollMeter に counter readout 追加** (= D ハイブリッド動き、 LightboxNavMeter の slot machine 流用)
5. **「画面内範囲 N1〜N2」 計算ロジック実装** (= viewport y + skyline layout intersect、 60fps throttle)
6. **Lightbox open 時の ScrollMeter fade out** (= BoardRoot から hidden prop)
7. **Text 各要素の thin-stroke 化** (= FilterPill, Share, SizePicker, ResetAll, PopOut 全部に paint-order stroke + drop text-shadow)
8. **テスト更新** (= TopHeader.test.tsx, ScrollMeter.test.tsx)
9. **build + tsc + vitest 通す**
10. **deploy**

各ステップは独立に commit 可能。 ステップ 1-2 で「視覚的に Apple v3 になる」、 3-6 で「ScrollMeter 下移動 + counter」、 7 で「文字 chrome 統一」。

---

## 5. 物理制約 & 学び (= IDEAS.md にも別追記する事項)

### 5-1. mix-blend-mode の RGB チャンネル独立計算

`mix-blend-mode: difference` は各 RGB チャネルを独立に `|Cs - Cd|` で計算。 赤 (255,0,0) と白 (255,255,255) の difference = (0,255,255) = cyan。 「白黒のみ」 を保つには blend 前に backdrop を grayscale 化するしかない (= v6 アプローチ)。

### 5-2. backdrop-filter は領域内全 backdrop に適用

要素自身に `backdrop-filter` を当てると、 その要素の bbox 内全 backdrop が変換される。 文字背後だけに局所適用したい場合は要素を小さく (= lozenge 化) するしかない。 chrome-row の bbox = 上端の帯 → 帯全体が backdrop 変換 = card 上端の色味が抜ける副作用。

### 5-3. JS sampling の限界

`elementFromPoint` + per-label luminance lookup は文字 1 つ = 1 色までしかできない (= DOM 要素は単一色)。 文字内 partial inversion は不可能。

### 5-4. Apple iOS / visionOS の overlay UI 哲学

「文字を裸で出さない」 が原則。 ただし「裸」 = pill / background / blur のような chrome 装飾ありを意味する。 board 全体の edge gradient scrim (= chrome ではなく ambient overlay) は許容範囲、 と Apple が示している。 写真アプリ / Music / Control Center 全部この路線。

---

## 6. session 27 brainstorm 全行程 (= 復元用ログ)

1. ① ScrollMeter 候補 A/B/C 提示 → user「波形そのままで下に移動 + counter [画面内範囲/全件] + ランダム動き」
2. counter 動き B/C/D 提示 → user「D 採用」
3. counter 動き v3 (= 高速 scramble + N1 連動 swell) 提示 → user「TOTAL 動かさないで (=波形が暴れる原因)」
4. counter 動き v4 (= 数字派手 / 波形静か / 範囲幅 swell) 提示 → user「波形は現状仕様のまま」
5. ② TopHeader 候補 A/B/C/D 提示 → user「D。 ピル無し、 文字だけ + shadow」
6. D-text-only v1 提示 → 右側見切れ
7. D-text-only v2 (= chrome-row container fix) 提示 → user「白背景の text-shadow がダサい、 モダン研究してきて」
8. **研究 deep-dive** (general-purpose agent 経由、 destefanis 実コード + Apple HIG + visionOS + CSS-Tricks 等) → 結論「destefanis は backdrop-blur pill、 Apple は edge scrim + thin stroke、 mix-blend は罠」
9. modern v3 提示 (= edge scrim + 0.5px stroke + text-shadow ゼロ) → user「良い感じ」 ← **= Apple v3 確定**
10. user「白黒で動的反転できない?」 → v4 (mix-blend-mode) 提示 → user「青背景の cyan 文字嫌、 白黒だけがいい」
11. v5b (JS sampling per-label) 提示 → user「文字内で部分反転して欲しい」 (= 物理制約発覚)
12. user「カラフル変色から白黒に変換できない?」 → v6 (backdrop-filter で grayscale 化してから blend) 提示
13. **Visual Companion server kill + weekly 制限近い** → user「Apple アプローチで完成、 spec 残して」 → 本 spec 記録

---

*文書化日: 2026-05-15 / セッション 27 末。 セッション 28 着手時はこの spec から再開。*
