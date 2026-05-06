# Fullscreen Immersive Mode + Auto-Hide Chrome — Design Spec

**作成日**: 2026-05-07
**スコープ**: ShareComposer に没入モード追加。⛶ ボタン or `F` キーで PREVIEW モードに切替、3 辺 chrome を proximity progressive で auto-hide。
**前提**: 2026-05-07 朝のセッションで composer foundation 再設計済 (sticky / glass / scrollContainer 廃止、grid 3 段、source panel 右、jitter 解消)。

---

## 1. 背景と狙い

ユーザーから挙がった 2 つの要望:

1. **シェアモーダルが viewport いっぱいに広がるモードが欲しい** — 現状の board 全体を fit-to-view で見せる構造は LAYOUT (組み立て) に適切だが、完成形を「大きく見たい」「最終確認したい」用途には狭い
2. **3 辺 chrome (header / source / footer) を auto-hide したい** — 没入時には完成像を妨げる UI を消し、必要な時だけ取り出せる Linear / Apple / Vercel 級の polish

これは 2026-05-07 朝の foundation 再設計の自然な発展で、`関係性: foundation = "全体像を把握できる" / immersive mode = "完成形を大きく見られる" の二層構造`になる。

---

## 2. 確定した設計判断 (brainstorming 結果)

| 論点 | 決定 |
|---|---|
| 突起 (handle) の見せ方 | **C: proximity progressive**。resting は完全不可視、cursor が端 80px 圏内に入ると handle がフェードイン、そのまま近づくと chrome 全展開 |
| 突起の固定 (pin) UI | **キーボードショートカットのみ**。pin ボタンは置かない。視覚的に最もミニマル |
| アニメ easing | **`cubic-bezier(0.16, 1, 0.3, 1)`** (Linear / Vercel 系)。reveal 260ms / hide 210ms (= reveal の 80%、`現れる時はゆったり、消える時はサッと`) |
| フルスクリーン遷移 | **A: Scale + 角丸 morph**。modal の position / border-radius / box-shadow を 360ms で同時補間。境界が viewport 端まで滑らかに伸びる |
| キーボード | `F` (mode toggle) / `H`/`S`/`B` (個別 pin) / `Esc` / `?` (help)。**`A` (全辺 pin) は廃止** — `F` 一発で chrome 全部が一斉に消える/出る挙動に統一 |
| 個別 pin のフィードバック | **handle 自身が 420ms 白くフラッシュ → 該当 chrome 出現 → handle が青 (pin 色) 常時表示**。toast / 別 UI なし |
| Mode 表記 | `LAYOUT` / `PREVIEW` の英大文字 chip。**ヘッダー左**に置き、PREVIEW 中は header が隠れるので chip も自然に消える |
| サイドパネル展開時の canvas 挙動 | **B: Overlay**。canvas は動かず、source panel が右から上に被さる。masonry の reflow ゼロ |
| PREVIEW 中のアスペクト切替 | **header を hover で取り出して切替**。新規 UI ゼロ |
| タッチ / hover 不可デバイス | **LAYOUT モードのみ提供**。⛶ ボタン非表示、F/H/S/B リスナー mount しない。`@media (hover: hover) and (pointer: fine)` で判定 |
| Hover-out delay | **150ms** (UI 業界の jitter 防止定石) |

---

## 3. アーキテクチャ

```
ShareComposer (state owner)
  ├─ mode: 'layout' | 'preview'                  ← F / ⛶ / Esc で切替
  ├─ pinned: { h: bool, s: bool, b: bool }       ← H/S/B で個別 toggle (preview のみ)
  ├─ aspect / selectedIds / cardOrder / sizeOverrides (既存)
  └─ uses composer-layout.ts → ShareCard[]
                                                  ↓
                                        ShareFrame (renderer, 既存)
                                                  ↓
                                      ShareSourceList (overlay 化, 既存)

新規: useShareFullscreen.ts (hook)
  - mode/pinned state 所有
  - keyboard listener (F/H/S/B/Esc/?)
  - flash animation trigger
  - touch detection
```

**既存ファイルへの影響**:

| ファイル | 影響 |
|---|---|
| [components/share/ShareComposer.tsx](../../../components/share/ShareComposer.tsx) | mode/pinned state 導入、⛶ ボタン追加、keyboard hook 接続、ヘッダー左に `LAYOUT/PREVIEW` chip |
| [components/share/ShareComposer.module.css](../../../components/share/ShareComposer.module.css) | `.preview` modifier、hover-zone、handle、chrome auto-hide、modal morph、mode chip |
| [components/share/ShareSourceList.module.css](../../../components/share/ShareSourceList.module.css) | preview mode で `position: absolute` overlay (現行は grid セル) |
| [lib/share/composer-layout.ts](../../../lib/share/composer-layout.ts) | `mode: 'layout' \| 'preview'` パラメータ追加、preview 分岐 |
| [lib/share/composer-layout.test.ts](../../../lib/share/composer-layout.test.ts) | preview mode のテストケース追加 |

**新規ファイル**:

| ファイル | 役割 |
|---|---|
| `components/share/use-share-fullscreen.ts` | mode/pinned state + キーボードリスナー + flash trigger を集約する custom hook |
| `tests/e2e/share-fullscreen.spec.ts` | mode 切替 / 突起 hover / pin / Esc / touch 振分の E2E |

---

## 4. State 模型

```typescript
type ShareMode = 'layout' | 'preview'
type PinnedSides = {
  readonly h: boolean  // header
  readonly s: boolean  // source list (right side)
  readonly b: boolean  // footer (bottom)
}

type FullscreenAPI = {
  readonly mode: ShareMode
  readonly pinned: PinnedSides
  readonly canUseFullscreen: boolean   // touch detection 結果
  readonly toggleMode: () => void      // F or ⛶
  readonly togglePin: (side: 'h' | 's' | 'b') => void  // H/S/B
  readonly exitPreview: () => void     // Esc 1 段目
}
```

### useShareFullscreen hook

```typescript
function useShareFullscreen(opts: {
  readonly open: boolean       // モーダル open 中だけ keyboard 有効
  readonly onCloseModal: () => void  // LAYOUT 中の Esc が呼ぶ
}): FullscreenAPI
```

**実装メモ**:
- mode 切替時、pinned は **必ず全 false にリセット** (preview→layout 時に変なゴミ state を残さない、layout→preview 時はそもそも auto-hide が初期状態)
- `canUseFullscreen` は `window.matchMedia('(hover: hover) and (pointer: fine)').matches` を初回だけ評価して固定
- `false` の場合は `toggleMode` / `togglePin` が no-op、keyboard listener も mount しない (cleanup 簡略化)
- flash animation は CSS class を一時的に追加 → 420ms 後に remove (`requestAnimationFrame` で適用後 `setTimeout`)

### Keyboard handler 仕様

```typescript
function onKey(e: KeyboardEvent): void {
  // 無効化条件
  const target = e.target as HTMLElement | null
  if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return
  if (e.metaKey || e.ctrlKey || e.altKey) return

  const k = e.key.toLowerCase()
  if (k === 'f') { e.preventDefault(); toggleMode(); return }
  if (k === 'escape') {
    e.preventDefault()
    if (mode === 'preview') exitPreview()
    else onCloseModal()
    return
  }
  if (mode !== 'preview') return  // pin は preview 中のみ
  if (k === 'h') { e.preventDefault(); togglePin('h') }
  else if (k === 's') { e.preventDefault(); togglePin('s') }
  else if (k === 'b') { e.preventDefault(); togglePin('b') }
  else if (k === '?') { e.preventDefault(); toggleHelpOverlay() }
}
```

`document.addEventListener('keydown', onKey)` で global listener (フォーカス位置に依存しない確実な発火)。`open === true` の間だけ mount。

---

## 5. composer-layout.ts 改修

### 入力に `mode` 追加

```typescript
type ComposerLayoutInput = {
  readonly items: ReadonlyArray<ComposerItem>
  readonly order: ReadonlyArray<string>
  readonly sizeOverrides: ReadonlyMap<string, ShareSize>
  readonly aspect: ShareAspect
  readonly viewport: { readonly width: number; readonly height: number }
  readonly mode: ShareMode  // ← NEW
}
```

### 分岐表

| mode | aspect | 挙動 |
|---|---|---|
| `layout` | `free` | **現行通り**: fit-to-viewport (board 全体を縮小)。`fitScale` 適用 |
| `layout` | preset (`1:1`/`9:16`/`16:9`) | **現行通り**: viewport 内に最大 frame 中央配置 |
| `preview` | `free` | **fit 無効**: 本来の masonry 高さ。`fitScale = 1` で normalize、frame.height = totalMasonryHeight。`canvasArea` が縦スクロール |
| `preview` | preset | **viewport いっぱい**: header/footer/source が auto-hide される前提なので、利用可能領域 ≒ viewport 100%。frame は `min(viewport.w, viewport.h * targetRatio)` ベースで最大化、中央配置 |

### 実装上の注意

- `preview` + preset の "header/footer 隠れ前提で frame max" 計算は、実際の chrome 高さに依存しない (純粋に viewport ベース)。これにより hover で chrome が出ても frame サイズは変わらず安定
- `preview` + free の縦スクロールは `canvasArea` の `overflow-y: auto` で、frame 自体は本来の masonry サイズ
- 既存の "vertical centering when shrunk" ロジックは `layout` モードのみ適用 (`preview` では fit しないので不要)

### テスト追加

```typescript
describe('composeShareLayout — preview mode', () => {
  it('preview + free: no fitScale, frame.height = natural masonry height', () => { ... })
  it('preview + 1:1: frame size matches viewport min dimension', () => { ... })
  it('preview + 9:16: frame width <= viewport, height fills', () => { ... })
  it('preview + 16:9: frame width fills, height fits within viewport', () => { ... })
  it('layout mode unchanged: existing behavior preserved', () => { ... })
})
```

---

## 6. CSS / Visual 言語

### Modal morph (mode 切替)

```css
.modal {
  position: absolute;
  /* layout state */
  top: 5vh; left: 5vw; right: 5vw; bottom: 5vh;
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(0,0,0,0.5);
  transition:
    top 360ms cubic-bezier(0.16, 1, 0.3, 1),
    left 360ms cubic-bezier(0.16, 1, 0.3, 1),
    right 360ms cubic-bezier(0.16, 1, 0.3, 1),
    bottom 360ms cubic-bezier(0.16, 1, 0.3, 1),
    border-radius 360ms cubic-bezier(0.16, 1, 0.3, 1),
    box-shadow 360ms cubic-bezier(0.16, 1, 0.3, 1);
}
.modal.preview {
  top: 0; left: 0; right: 0; bottom: 0;
  border-radius: 0;
  box-shadow: none;
}
```
※ 現行の position/size は仮の値 (実装時に既存 module.css 値を踏襲)。

### Handle (preview 中のみ)

```css
.handleTop, .handleRight, .handleBottom {
  position: absolute;
  background: rgba(255,255,255,0);
  pointer-events: none;
  opacity: 0;
  transition:
    background 200ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 200ms ease-out;
}
.preview .handleTop, .preview .handleRight, .preview .handleBottom { opacity: 1; }

.handleTop, .handleBottom {
  left: 50%; transform: translateX(-50%);
  width: 56px; height: 5px;
}
.handleTop { top: 0; border-radius: 0 0 3px 3px; }
.handleBottom { bottom: 0; border-radius: 3px 3px 0 0; }

.handleRight {
  right: 0; top: 50%; transform: translateY(-50%);
  width: 5px; height: 56px;
  border-radius: 3px 0 0 3px;
}
```

### Hover-zone (透明、proximity 検出用)

```css
.zoneTop    { position: absolute; top: 0;    left: 0;    right: 0;     height: 80px; pointer-events: auto; }
.zoneRight  { position: absolute; top: 0;    right: 0;   bottom: 0;    width: 80px;  pointer-events: auto; }
.zoneBottom { position: absolute; bottom: 0; left: 0;    right: 0;     height: 80px; pointer-events: auto; }

/* layout モード中は zone を無効化 (chrome は常時 visible なので不要) */
.modal:not(.preview) .zoneTop,
.modal:not(.preview) .zoneRight,
.modal:not(.preview) .zoneBottom { pointer-events: none; }

/* proximity hover で handle がフェードイン */
.preview .zoneTop:hover    ~ .handleTop    { background: rgba(255,255,255,0.42); }
.preview .zoneRight:hover  ~ .handleRight  { background: rgba(255,255,255,0.42); }
.preview .zoneBottom:hover ~ .handleBottom { background: rgba(255,255,255,0.42); }

/* pinned 状態 */
.modal[data-pin-h="true"] .handleTop    { background: rgba(79,158,255,0.85); }
.modal[data-pin-s="true"] .handleRight  { background: rgba(79,158,255,0.85); }
.modal[data-pin-b="true"] .handleBottom { background: rgba(79,158,255,0.85); }
```

### Chrome auto-hide + 150ms hover-out delay

```css
.header, .sourceList, .footer {
  position: absolute;
  transition: transform 210ms cubic-bezier(0.16, 1, 0.3, 1) 150ms; /* hide: 150ms delay */
}

/* preview の auto-hide 初期 state */
.preview .header     { transform: translateY(-100%); }
.preview .sourceList { transform: translateX(100%); }
.preview .footer     { transform: translateY(100%); }

/* hover (zone or chrome 自身) で reveal — delay 0、faster duration */
.preview .zoneTop:hover ~ .header,
.preview .header:hover {
  transform: translateY(0);
  transition: transform 260ms cubic-bezier(0.16, 1, 0.3, 1) 0ms;
}
/* sourceList と footer も同パターン */

/* pin で固定 — delay 0、reveal duration */
.modal[data-pin-h="true"] .header     { transform: translateY(0); transition-delay: 0ms; }
.modal[data-pin-s="true"] .sourceList { transform: translateX(0);  transition-delay: 0ms; }
.modal[data-pin-b="true"] .footer     { transform: translateY(0);  transition-delay: 0ms; }
```

### Source panel = overlay (preview 時)

```css
.sourceList {
  /* layout モード: 既存通り grid セル */
}
.preview .sourceList {
  position: absolute;
  top: 0; right: 0; bottom: 0;
  width: 240px;  /* 既存 200px から overlay 化に伴い少し拡張 */
  z-index: 5;
  box-shadow: -16px 0 32px rgba(0,0,0,0.35);
  background: rgba(20,20,22,0.96);
}
```

`canvasArea` は `preview` 中、`grid-template-columns` を `1fr` に切り替え (source panel が overlay なので grid から外す)。masonry の幅は `canvasArea` の `ResizeObserver` でそのまま追従。

### Z-index 階層 (preview 中)

| layer | z-index | 補足 |
|---|---|---|
| canvas (board content) | 1 | 静的 |
| hover-zones (透明) | 2 | pointer-events 受け取り用 |
| handles | 3 | resting 透明、proximity hover で半透明化 |
| header / footer chrome | 4 | translate でスライドイン |
| source panel (preview overlay) | 5 | 右端 handle を覆う配置、覆われている間 handle は不可視 = OK (chrome reveal 中は handle の役目は済んでいる) |
| help overlay (`?`) | 10 | 全ての上に重なる |

### Flash animation (handle を押した瞬間)

```css
@keyframes handle-flash-h {
  0%   { background: rgba(255,255,255,0.4);  width: 56px; height: 5px; }
  20%  { background: rgba(255,255,255,1.0);  width: 84px; height: 9px; }
  100% { background: var(--handle-rest, rgba(255,255,255,0.4)); width: 56px; height: 5px; }
}
@keyframes handle-flash-v { /* mirror for vertical (handleRight) */ }

.handleTop.flash, .handleBottom.flash { animation: handle-flash-h 420ms cubic-bezier(0.16, 1, 0.3, 1); }
.handleRight.flash { animation: handle-flash-v 420ms cubic-bezier(0.16, 1, 0.3, 1); }
```

JS 側: `togglePin` 呼び出し時に該当 handle に `.flash` class を `requestAnimationFrame` 後付与 → 440ms 後に remove。

### Mode chip (LAYOUT / PREVIEW)

```css
.modeChip {
  font-family: ui-monospace, Menlo, monospace;
  font-size: 11px;
  letter-spacing: 0.12em;
  padding: 4px 10px;
  border-radius: 100px;
  border: 1px solid rgba(255,255,255,0.18);
  color: rgba(255,255,255,0.7);
  background: rgba(255,255,255,0.04);
}
```

ヘッダー左に配置 (現行ヘッダーは `<h2>シェア用ボードを組む</h2>` がある — タイトルの隣 or 置き換えるかは実装時微調整、今回は **タイトルを削除して chip のみ** にする方向で軽量化推奨)。

### `?` Help overlay

最小実装: 中央に半透明黒の overlay、4 行の key リスト。同 easing でフェード。

```
F        Toggle immersive mode
H S B    Pin header / source / footer
Esc      Exit
?        Toggle this help
```

---

## 7. キーボード仕様 (詳細)

| key | mode | 条件 | 動作 |
|---|---|---|---|
| `F` | both | always | mode toggle、pinned all reset |
| `Esc` | preview | help overlay 表示中 | help overlay を閉じる (mode は維持) |
| `Esc` | preview | help overlay 非表示 | mode = 'layout' へ、pinned reset |
| `Esc` | layout | help overlay 表示中 | help overlay を閉じる |
| `Esc` | layout | help overlay 非表示 | onCloseModal() でモーダル close |
| `H` | preview | `canUseFullscreen` 時のみ | togglePin('h')、handle flash |
| `S` | preview | 同上 | togglePin('s') |
| `B` | preview | 同上 | togglePin('b') |
| `?` | both | always | help overlay toggle |

無効化条件 (全 key 共通):
- `e.target` が `<input>` / `<textarea>` / `[contenteditable]`
- 修飾子 (`metaKey`, `ctrlKey`, `altKey`) いずれか付き

---

## 8. タッチ / hover 不可デバイス

`window.matchMedia('(hover: hover) and (pointer: fine)').matches` を hook 初期化時に評価して `canUseFullscreen` に格納。

`canUseFullscreen === false` の場合:

- ⛶ ボタンを **render しない** (条件レンダリング)
- `document.addEventListener('keydown', ...)` を **mount しない**
- mode は永続的に `'layout'`、`toggleMode` / `togglePin` は no-op
- composer-layout.ts への入力 `mode` は常に `'layout'`

このフォールバックにより、touch ユーザーは現行 LAYOUT 体験のみを得る (機能後退なし、新機能未提供)。今後別ロードマップで touch 専用の immersive 体験を別途検討。

---

## 9. テスト

### Unit (`lib/share/composer-layout.test.ts` 拡張)

| ケース | 期待 |
|---|---|
| `preview` + `free` + 50 cards | `fitScale = 1`、`frameSize.height = totalMasonryHeight`、normalize 後 y+h は 1.0 を超える可 (= スクロールが必要) |
| `preview` + `1:1` + 10 cards、viewport 1920x1080 | `frameSize.width = frameSize.height = 1080` (viewport.h ベース)、中央配置 |
| `preview` + `9:16` + 10 cards、viewport 1920x1080 | `frameSize.height = 1080`、`frameSize.width = 1080 * 9/16 = 607.5` |
| `preview` + `16:9` + 10 cards、viewport 1920x1080 | `frameSize.width = 1920`、`frameSize.height = 1080` |
| `layout` mode 全ケース | 現行テスト全部 pass (regression なし) |
| `mode` 未指定 | TypeScript エラー (input is required) |

### E2E (`tests/e2e/share-fullscreen.spec.ts`)

1. **Mode toggle**: board → cards 5 個 add → Share open → ⛶ クリック → modal expands to viewport, chrome 全部消える, mode chip 消える
2. **F key toggle**: LAYOUT → `F` 押下 → PREVIEW 化 → `F` もう一度 → LAYOUT 戻り
3. **Proximity reveal**: PREVIEW 中、上端 50px 位置に mouse move → handle 出現、さらに 10px 位置に move → header 全展開
4. **Hover-out delay**: header reveal 後、mouse を遠ざける → 150ms 待機後に hide 開始 (DOM transform を観測)
5. **H key pin**: PREVIEW 中、`H` 押下 → handle が青化、header 常時 visible、mouse を遠ざけても消えない
6. **Esc cascade**: LAYOUT → `F` で PREVIEW → `Esc` で LAYOUT 戻り → `Esc` で modal close
7. **Aspect 切替 in PREVIEW**: PREVIEW 中、上端 hover で header 出現 → アスペクト切替 → frame サイズが viewport いっぱいに reflow
8. **Source panel overlay**: PREVIEW 中、右端 hover → source list が overlay で出現 → board の card 位置は不動 (DOM 位置を screenshot で比較)
9. **Touch fallback**: `pointer: coarse` を Playwright の `hasTouch: true` で simulate → ⛶ ボタンが DOM に存在しない、`F` 押下しても mode 不変

### 既存テスト

- 全 256 tests + 既存 e2e がそのまま pass (regression なし)

---

## 10. Out of scope

- **Help overlay (`?`) のリッチ化**: 最小 4 行リストで MVP、装飾は別 polish
- **PREVIEW 中の board 内 drag/edit**: 編集は LAYOUT モードに集中、PREVIEW は "見る" 専用
- **mode/pinned の localStorage 永続化**: モーダル close 毎にリセット (share の "ephemeral" 思想踏襲)
- **タッチデバイスでの immersive 体験**: 別ロードマップ
- **mode chip の表記カスタマイズ / i18n**: 英大文字 `LAYOUT` / `PREVIEW` 固定 (UI 共通語彙、世界対応の安全策)
- **アニメーション中の二重 input 防止**: 360ms morph 中の追加 `F` 連打は素直に新しい transition が走る (debounce 不要、CSS が自然に処理)

---

## 11. リスクと対策

| リスク | 対策 |
|---|---|
| `:hover` ベースの reveal が JS の pin state と干渉 | `[data-pin-h="true"]` selector を `:hover` selector より後に配置 (CSS 優先度同じなら後勝ち)、`!important` 不使用 |
| `transition-delay: 150ms` が pin/unpin の瞬間に visible な flicker を起こす | unpin 時は CSS の自然な hide-delay 経路に乗るので OK。pin 時は `transition-delay: 0ms` の override で即時 reveal |
| `composer-layout.ts` の preview + preset 計算が viewport の chrome 高さを誤って引いてしまう | viewport そのまま (chrome 高さ無視) を spec で明示。auto-hide 前提だから問題なし |
| 360ms の modal morph 中に source panel が見えてしまう | preview class 適用と同時に source panel の transform は CSS で `translateX(100%)` に切替 → morph と並行で消える。実装上は両方とも 360ms 同 easing で同期 |
| handle が PREVIEW で常時 opacity:1 だと resting でも視認されて "ノイズ" になる | resting `background: rgba(255,255,255,0)` (= 完全透明) なので opacity:1 でも見えない。proximity hover で初めて色が乗る (透明 → 半透明への transition) |
| keyboard リスナーが他の global keydown listener と衝突 | `e.preventDefault()` を該当キーのみ呼ぶ、`<input>` フォーカス時は早期 return |

---

## 12. 実装順序 (writing-plans で詳細化)

1. **`composer-layout.ts` に `mode` パラメータ追加 + unit tests** — 既存 `layout` 分岐を保ったまま `preview` 分岐を追加。回帰テストで安全網
2. **`useShareFullscreen` hook 実装** — state + keyboard listener + flash trigger + touch detection。stand-alone でテスト容易
3. **`ShareComposer.tsx` に hook 接続 + ⛶ ボタン + mode chip** — UI hook-up、mode/pin state の data-attribute を modal に流す
4. **`ShareComposer.module.css` に preview スタイル全部追加** — modal morph、handle、hover-zone、chrome auto-hide、150ms delay、flash keyframes、mode chip
5. **`ShareSourceList.module.css` に preview overlay スタイル** — `position: absolute` 切替、shadow、width 拡張
6. **`?` help overlay 最小実装** — 中央フェード overlay
7. **E2E spec 追加** → 全部緑
8. **本番 deploy + ハードリロードで動作確認** (`booklage.pages.dev`)

---

## 13. 受け入れ基準

- LAYOUT モードは現行と完全互換 (regression なし、screenshot 一致)
- ⛶ ボタン or `F` キーで modal が viewport 100% に滑らかに広がる (360ms cubic-bezier)
- PREVIEW 中、3 辺 chrome は完全に隠れて handle すら resting 状態では不可視
- 上端/右端/下端に cursor を 80px 以内に近づけると handle がフェードイン → さらに近づくと chrome 全展開
- chrome から cursor が離れると **150ms 待機後に** hide 開始
- `H`/`S`/`B` で個別 pin、handle が 420ms 白くフラッシュ → 青常時表示、chrome 固定
- `Esc` 1 回目で PREVIEW→LAYOUT、2 回目で modal close
- `pnpm tsc` + `pnpm vitest run` + `pnpm playwright test` 全緑
- `(hover: hover) and (pointer: fine)` が false の環境では ⛶ 非表示、`F` 押下無効、現行 LAYOUT 体験のみ提供
