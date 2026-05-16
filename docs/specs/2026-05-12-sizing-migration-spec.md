# Sizing Migration Spec — AllMarks → 新 sizing 哲学

> 全プロジェクト共通の sizing 思想 (`C:\Users\masay\.claude\design-philosophy-sizing.md` v2 / 2026-05-12) への AllMarks (旧 AllMarks) 移行計画。 **本ドキュメントは spec のみ。 実装は別セッション。**

最終更新: 2026-05-12
対象範囲: `app/globals.css` の `:root` token + 主要 component CSS modules
依存思想: アンカー viewport 1489, 単位は px ベース, `clamp(MIN_PX, N_VW, BASE_PX)` で `BASE = MAX`, html font-size 16px 明示固定, container max-width 1489px

---

## 1. 現状サマリ

### 1-1. `app/globals.css` `:root` token の現状

| カテゴリ | token | 現値 | 評価 |
|---|---|---|---|
| **font-size scale** | `--text-xs` … `--text-4xl` | `0.75rem` (12px) … `3.052rem` (≈48.8px) (1.25x scale) | **rem ベース** — 新思想と不整合 |
| **spacing** | `--space-1` … `--space-24` | 固定 px (4px → 96px) | 固定 px → 新思想と整合 (proportional 不要、 OS scaling 受け入れ) |
| **border-radius** | `--radius-sm/md/lg/xl/full` | 6 / 10 / 16 / 24 / 9999 px | 固定 px → 整合 |
| **shadow** | `--shadow-sm/md/lg/xl/drag/glow` | 固定 px | 整合 |
| **duration / easing** | `--duration-*`, `--ease-*` | ms / cubic-bezier | sizing 無関係 |
| **grid / collage** | `--grid-gap` 16px | 固定 px | 整合 |
| **sidebar geometry** | `--sidebar-width` 240px, `--sidebar-collapsed` 52px | 固定 px | 新思想ではアンカー基準 clamp 化候補 |
| **corner / canvas** | `--corner-radius-outer` 24px, `--canvas-margin` 24px, `--canvas-radius` 24px | 固定 px | 整合 (proportional 不要) |
| **lightbox envelope** | `--lightbox-media-max-h: calc(100vh - margin*2 - chrome*2)` | 既に vh ベース proportional | **新思想と整合 — 触らない** |
| **lightbox chrome** | `--lightbox-chrome-clearance: 72px` | 固定 px | 整合 |
| **glass / share** | `--glass-blur` 6px, `--share-backdrop-blur` 8px 等 | 固定 px | 整合 |

### 1-2. html font-size の現状

- `html { font-size: ... }` の **明示宣言なし** → ブラウザデフォルト (通常 16px) に依存
- ブラウザ font 設定 (経路 b) で twice scaling されるリスクが残っている

### 1-3. rem 使用箇所 (新思想で px 化対象)

`Grep` 結果から 7 ファイルに rem 使用:

1. `app/globals.css` — `--text-xs` … `--text-4xl` 全 8 token (1.25x scale)
2. `components/marketing/sections/HeroSection.module.css` — `font-size: clamp(2.5rem, 6vw, 4.5rem)` 等 (LP の本文・見出し)
3. `components/marketing/sections/CollageDemoSection.module.css`
4. `components/marketing/sections/SaveDemoSection.module.css`
5. `components/marketing/sections/ShareDemoSection.module.css`
6. `components/marketing/sections/StyleSwitchSection.module.css`
7. `components/marketing/sections/CtaSection.module.css`

LP marketing は既に `clamp(rem, vw, rem)` パターンを使用しており、 **思想は近いが単位が rem** — px 化が必要。

### 1-4. clamp 使用箇所

LP marketing 6 ファイルのみ。 board (app 本体) は **clamp ゼロ** — 全部固定 px。

### 1-5. board 主要コンポーネントの sizing 現状 (固定 px ハードコード)

- **TopHeader**: `height: 64px`, `padding: 0 24px`, `gap: 16px`, `font-size: 13px` (子の `.sharePill`)
- **Lightbox**: `gap: 32px`, `max-width: min(94vw, 1240px)`, `--lightbox-meter-w: 360px`, `width: 48px` (navChevron), `font-size: 22px / 16px / 15px / 13px / 10px` (text col / title / desc / meta / counter), `width: 920px` (iframe horizontal)
- **ImageCard**: `bottom: 10px`, `gap: 6px`, `width/height: 6px` (multi-image dot)
- **CardSize preset** (`lib/constants.ts`): S=160 / M=240 / L=320 / XL=480 px (固定)
- **size-levels.ts**: 列数 3-7 で container 幅 ÷ N の計算 (viewport-aware だが BASE 上限なし)
- **BoardRoot**: `--canvas-margin: 24px` の固定枠

### 1-6. vw / vh 使用箇所 (proportional 既存)

- Lightbox: `min(94vw, 1240px)`, `60vw`, `50vw` (iframe wrap), `100vh` (envelope calc)
- LP marketing: `clamp(min-rem, Nvw, max-rem)` 多用 — N_vw は 1.5 〜 6vw 程度

これらは「既に proportional」 だが、 新思想の「`max = base = 開発者画面 px`」 ルールに照らすと max が rem になっている点が違反。

---

## 2. 新思想との差分

| 観点 | 現状 | 新思想 | 差分 |
|---|---|---|---|
| html font-size | 暗黙 (browser default) | `font-size: 16px` 明示 | **明示宣言を追加** |
| text token 単位 | rem | px (clamp+vw 形式) | **rem → px 全面置換** |
| text scale | 1.25x rem 等比 (固定 8 段) | viewport 連動 clamp (個別決定) | **token 設計の作り直し** |
| UI 要素 | 固定 px | clamp+vw, max = base | **主要要素を clamp 化** |
| container | max-width なし | `max-width: 1489px` 主要 layout | **主要 layout に追加** |
| spacing | 固定 px | 固定 px のまま | **変更不要** |
| Lightbox envelope | `calc(100vh - …)` | 既に proportional | **変更不要 (触らない)** |
| LP marketing clamp | `clamp(rem, vw, rem)` | `clamp(px, vw, px)` で max = base | **rem → px、 max を base に修正** |
| アクセシビリティ | なし | `data-text-scale` 属性で `--text-scale-multiplier` 切替 | **将来追加 (Phase 6)** |

---

## 3. 移行 Phase 計画

### Phase 1 — 基盤整備 (見た目変化ゼロ)

**目的**: 思想を投入する受け皿を作る。 既存 px 値はそのまま token に転写。

**namespace 注意 (2026-05-12 セッション 15 で発見)**: 既存 `--text-body` 等は **文字色 (color)** として Lightbox / Sidebar / FilterPill / DisplayModeSwitch / TriagePage 等 13 箇所で `color: var(--text-body)` のように使われている。 衝突を避けるため、 新 font-size token は **`--fs-*` シリーズ** で新規 namespace を切る (= `--fs-body: 13px` 等)。 既存 `--text-*` (color) はそのまま残す。 `fs` = font-size の web 業界標準略。

作業:
1. `app/globals.css` の `:root` に以下を追加:
   ```css
   font-size: 16px;                  /* browser font 設定 (経路 b) の保険 */
   --container-max: 1489px;
   --text-scale-multiplier: 1;       /* Phase 6 用予約、 token 側はまだ無視 */
   ```
2. 新 text token を **既存の値をそのまま px で書いた formal version** として併設:
   ```css
   /* 既存の rem token は残し、 新 token を追加 (Phase 2 で置換) */
   --fs-micro:   9px;   /* = 仮、 Phase 3 で clamp 化 */
   --fs-caption: 11px;
   --fs-body:    13px;
   --fs-sub:     15px;
   --fs-heading: 18px;
   --fs-display: 22px;  /* Lightbox title 値に合わせる */
   ```
3. 既存 `--text-xs` 等 8 段の rem token は **削除しない** (Phase 2 で参照を全置換してから Phase 5 で削除)

**変化**: 見た目ゼロ。 `font-size: 16px` 明示で僅かに browser 設定耐性が増す程度。

**所要時間予想**: 15 分。

### Phase 2 — token 経由に置換 (見た目変化ゼロ)

**目的**: ハードコード px と rem 参照を新 token に集約。

作業:
- board 主要 CSS modules (TopHeader, Lightbox, ImageCard, ScrollMeter, FilterPill, SizePicker, Sidebar 等) の `font-size: 13px` 等を `var(--text-*)` に置換
- LP marketing 6 ファイルの `font-size: 1rem` / `clamp(2.5rem, 6vw, 4.5rem)` 等の rem 参照を新 px token に置換
- `static-main h1/h2/h3` などの globals.css 内 selector も新 token に置換

**変化**: 見た目ゼロ (token が既存値と同じ px を返すため)。

**所要時間予想**: 3-4 時間 (全 component CSS の置換 + Playwright snapshot 確認)。

### Phase 3 — token 自体を clamp+vw 化 (見た目が viewport 連動に変わる)

**目的**: 新思想の核心、 「BASE = MAX」 clamp 適用。

作業:
- 各 token を `clamp(MIN_PX, N_VW, BASE_PX)` 化 (BASE = 開発者画面 px、 N_VW = `BASE/1489×100`、 MIN = base × 0.85〜0.92):
  ```css
  --fs-micro:   clamp(8px,  0.604vw, 9px);
  --fs-caption: clamp(10px, 0.738vw, 11px);
  --fs-body:    clamp(11px, 0.873vw, 13px);
  --fs-sub:     clamp(13px, 1.007vw, 15px);
  --fs-heading: clamp(15px, 1.209vw, 18px);
  --fs-display: clamp(18px, 1.478vw, 22px);
  ```
- UI 要素も同形式で clamp 化:
  ```css
  --top-header-h:    clamp(56px,  4.298vw,  64px);
  --sidebar-width:   clamp(210px, 16.118vw, 240px);
  --nav-chevron-w:   clamp(40px,  3.224vw,  48px);
  --lightbox-meter-w:clamp(300px, 24.177vw, 360px);
  ```
- spacing は固定 px のまま (新思想で proportional 不要を明記)

**変化**: 1366 ノートで文字 / UI が一回り小さく、 1489 開発者画面で従来比同等、 1920 以上で従来比固定 (拡大しなくなる) → ultrawide で初めて余白が増える挙動になる。

**検証**: Chrome DevTools の Device Mode で 1366 / 1920 / 3840 × DPR 1.0 + Windows text scale 100% / 130% で snapshot 比較。 Playwright probe で主要画面の screenshot 自動回帰。

**所要時間予想**: 6-8 時間 (token 値決定 + 個別調整 + 3 viewport × 2 OS scale 検証)。

### Phase 4 — container max-width を主要 layout に追加

**目的**: 1489px 超 viewport で要素拡大せず余白拡大、 「間延び」 を防ぐ。

board は viewport いっぱい使う設計のため (思想ドキュメント §4-4 で明記)、 **適用対象は限定**:

- **適用**: LP marketing (`HeroSection` 等) の textLayer / ctaRow、 marketing footer、 `static-main`
- **適用検討**: TopHeader (現状 viewport いっぱい、 1489 超で余白追加するか要確認)
- **非適用**: BoardRoot `.canvas` (board 全面)、 Lightbox backdrop (全面 dim)、 CardsLayer

実装:
```css
.appContainer { max-width: var(--container-max); margin-inline: auto; }
```

**変化**: 1489 超画面 (4K 等) で LP の文字幅が固定、 余白増える。 board は変化なし。

**所要時間予想**: 1-2 時間。

### Phase 5 — ハードコード px の clean up

**目的**: token 経由していない直書き px を絞り込む。

作業:
- board 主要 CSS の直書き `13px` / `15px` / `16px` / `22px` 等を grep → 残存箇所を `var(--text-*)` に置換
- 旧 rem token (`--text-xs` … `--text-4xl`) を削除 (Phase 2 で参照ゼロ化済みなら安全)
- `lib/constants.ts` の `CARD_SIZES` (S/M/L/XL の固定 px) は **そのまま** — IndexedDB に seed されたデータと整合が必要なので clamp 化しない。 ただし board のカード描画側で必要なら `min(persistedWidth, viewport-derived-max)` で上限を設ける検討余地あり

**変化**: 微小。 主に dev hygiene。

**所要時間予想**: 2-3 時間。

### Phase 6 — アプリ内 text size 設定 UI (アクセシビリティ代替)

**目的**: ブラウザ font 設定が px に効かない問題への補償。

作業:
1. 設定モーダルに「文字サイズ」 選択 (small / medium / large / x-large)
2. 選択値を `<html data-text-scale="...">` に反映
3. 全 text token の clamp 内に `* var(--text-scale-multiplier)` を組み込み:
   ```css
   --fs-body: clamp(
     calc(11px * var(--text-scale-multiplier)),
     calc(0.873vw * var(--text-scale-multiplier)),
     calc(13px * var(--text-scale-multiplier))
   );
   ```
4. IndexedDB に user preference を保存 (Settings store 新設 or 既存に追加)

**変化**: ユーザーが意図的に文字を拡縮できるようになる。 default (1.0) では Phase 3 と同一。

**所要時間予想**: 4-6 時間 (UI + 永続化 + token 改修)。 **別タスク扱い推奨**。

---

## 4. 新規 token 候補

```css
:root {
  /* === 共通基盤 === */
  font-size: 16px;
  --container-max: 1489px;
  --text-scale-multiplier: 1;

  /* === Text (clamp+vw、 max = base) === */
  --fs-micro:   clamp(8px,  0.604vw, 9px);   /* meterCounter, fine-print */
  --fs-caption: clamp(10px, 0.738vw, 11px);  /* MediaTypeIndicator, badges */
  --fs-body:    clamp(11px, 0.873vw, 13px);  /* meta, body, scrollMeter labels */
  --fs-sub:     clamp(13px, 1.007vw, 15px);  /* description, tweetAuthorName */
  --fs-heading: clamp(15px, 1.209vw, 18px);  /* card title small */
  --fs-display: clamp(18px, 1.478vw, 22px);  /* Lightbox .title */
  --fs-hero:    clamp(40px, 4.835vw, 72px);  /* LP .headline (Phase 2 で要再計算) */

  /* === UI dimensions (clamp+vw、 max = base) === */
  --top-header-h:     clamp(56px,  4.298vw, 64px);
  --sidebar-width:    clamp(210px, 16.118vw, 240px);
  --sidebar-collapsed:clamp(46px,  3.493vw, 52px);
  --nav-chevron-w:    clamp(40px,  3.224vw, 48px);
  --lightbox-meter-w: clamp(300px, 24.177vw, 360px);
  --lightbox-text-w:  clamp(260px, 21.491vw, 320px);

  /* === Spacing (固定 px のまま) === */
  /* 既存 --space-1 … --space-24 を流用、 追加なし */

  /* === Container === */
  /* .appContainer { max-width: var(--container-max); margin-inline: auto; } */
}
```

---

## 5. 影響範囲

品質感に直結する優先度高:

1. **Lightbox** (`Lightbox.module.css`) — 全 text サイズ + iframe wrap + nav meter + nav chevron。 アプリの 「見せ場」 で最も視線が集まる
2. **TopHeader** (`TopHeader.module.css`) — height + 全 child sizing。 常時表示の chrome
3. **ImageCard / CardNode** — multi-image dot, card chrome。 board の主役
4. **LP marketing** (`HeroSection` ほか 5 ファイル) — rem を全 px 化 (Phase 2 で集中対応)
5. **Sidebar / SizePicker / FilterPill / ResetAll / PopOut** — 中優先度、 chrome の細部
6. **ScrollMeter / WaveformTrack** — Lightbox 連動の HUD、 Lightbox と一緒に直す

非影響 (触らない):
- `lib/board/size-levels.ts` の列数 → 既に viewport-aware
- `lib/constants.ts` の `CARD_SIZES` → IndexedDB seed と整合のため固定維持
- Lightbox envelope (`--lightbox-media-max-h: calc(100vh - …)`) → 既に proportional、 思想と整合

---

## 6. 既存決定との整合

| 既存決定 | 新思想との関係 |
|---|---|
| Lightbox envelope vh ベース | **整合** — 100vh - chrome*2 は proportional、 そのまま維持 |
| canvas-margin 24px 固定 | **整合** — spacing 系は固定 px で OK |
| CARD_SIZES S/M/L/XL 固定 | **整合** — IndexedDB persisted data と整合が要件、 viewport-derive しない |
| FLOAT_ROTATION_RANGE 3deg | sizing 無関係、 影響なし |
| BOARD_Z_INDEX 定数化 | sizing 無関係、 影響なし |
| `font-size: 13px` 直書き (sharePill 等) | **要置換** Phase 2 で `var(--fs-body)` |
| LP marketing `clamp(rem, vw, rem)` | **要修正** Phase 2 で px 化 + max を base に |

---

## 7. リスクと検証方法

### リスク

1. **Phase 3 で 1366 ノートが小さくなりすぎる** — 開発者は 1489 で見ているので 1366 の感覚が無い。 Chrome DevTools の Device Mode + 1366 emulation 必須
2. **Lightbox の text 列 320px が clamp 化で潰れる** — text 列の min が card 列の min と干渉して overflow しないか要確認
3. **Phase 4 の container max-width で TopHeader が 1489 超画面で「中央寄せ + 余白」 になり違和感** — board canvas は viewport いっぱいなので header だけ container 適用すると不自然になる可能性。 header は **適用しない** が安全策
4. **Phase 6 の `* var(--text-scale-multiplier)` 計算が古いブラウザで破綻** — `calc()` 内の vw 乗算は modern Chromium / Firefox / Safari で OK だが、 試験が要る
5. **LP の `font-size: clamp(2.5rem, 6vw, 4.5rem)` (= ~40px / 72px max) を px 化したとき、 max = base にすると ultrawide で hero が小さく見える可能性** — 4.5rem は 72px ≈ base、 ここは「LP の見栄え優先で max を base より上に置く」 例外を許すか議論余地

### 検証手段

1. **Playwright snapshot 回帰** — board 主要画面 + Lightbox 4 種 (image / video / tweet / instagram) × 3 viewport (1366 / 1920 / 3840) で screenshot 自動比較
2. **Chrome DevTools Device Mode** — 1366 / 1920 / 3840、 DPR 1.0 / 2.0、 Windows text scale 100% / 130%
3. **実機**: 開発者 4K 27" (1489 CSS px) で従来比同等になることを目視確認
4. **vitest** — token を参照しているコードがあれば値検証

---

## 8. 作業見積もり (Phase 別)

| Phase | 内容 | 所要 |
|---|---|---|
| 1 | `:root` に基盤 token + font-size 16px 明示 | **15 分** |
| 2 | rem / 直書き px を新 token に置換、 LP rem 解消 | **3-4 時間** |
| 3 | token を clamp+vw 化、 3 viewport 検証 | **6-8 時間** |
| 4 | container max-width 主要 layout に適用 | **1-2 時間** |
| 5 | clean up、 旧 rem token 削除 | **2-3 時間** |
| 6 | text size 設定 UI (アクセシビリティ) | **4-6 時間 (別タスク)** |
| **合計 (Phase 1-5)** | | **約 12-17 時間** |

Phase 1 単独で実行すれば見た目変化ゼロで思想の足場が入る (低リスク)。
Phase 2 完了時点で「rem 排除」 という大きな勝利が確定する。
Phase 3 で初めてユーザーに見える差分が生まれる (要 Playwright 検証)。

---

## 9. 実装は別セッションで

本 spec は計画のみ。 実装時は:
1. 開始時に本 spec + `C:\Users\masay\.claude\design-philosophy-sizing.md` を Read
2. Phase 1 → 2 → 3 の順で各 phase ごとに commit、 Playwright snapshot 取得
3. Phase 3 完了後ユーザーに本番反映 confirm をもらう
4. Phase 6 はアクセシビリティ機能として別 issue 化

---

*このファイルは AllMarks プロジェクト専用の移行計画。 思想本体の更新は `C:\Users\masay\.claude\design-philosophy-sizing.md` 側で行うこと。*
