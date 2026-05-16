# Phase 2 — 受信側 Lightbox + 矢印 nav 設計書

> 日付: 2026-05-06
> 親: `docs/TODO.md` §「Phase 2: 受信側 Lightbox + 矢印 nav」
> 前提: Plan A item 2 (Composer reflow + 編集レイヤー) v77 で完了済

---

## 1. 目的とスコープ

### やること

1. **受信側 (`/share#d=...`) のカードクリックで Lightbox を開く**
   - 現状は `window.open(url)` で直接元 URL を新タブ表示している
   - Phase 2 後: Lightbox が開き、内部の「元のサイトへ ↗」が新タブ遷移を担う
2. **board / 受信側両方の Lightbox に左右矢印 + キーボード ←/→ nav を追加**
   - Hover で chevron フェード (両端 65% 中高オーバーレイ)
   - Instagram stories 風の dynamic dot indicator (active pulse + auto-scroll)
   - Slide horizontal + cross-fade トランジション
   - 端末で先頭 ↔ 末尾を派手なスライドでループ
3. **「AllMarks で表現する ↗」文言改名**
   - → 「自分も AllMarks を使う ↗」

### やらないこと (Out-of-scope)

- 「このカードを取り込む」単体ボタン (Phase 3)
- bulk import + matching-app 風タグ付け (Phase 3)
- 受信側 Lightbox 内での編集 (永遠に out-of-scope、read-only モード)
- カード N 番目を開いた状態の URL 共有 (`&i=5` 等、Phase 3 以降検討)
- Slide animation 中の旧 embed スナップショット表示 (初版省略)

---

## 2. アーキテクチャ全体像

```
┌─ Board ─────────────────────────┐    ┌─ SharedView (受信側) ──────────┐
│                                 │    │                                 │
│  BoardRoot                      │    │  SharedView                     │
│   └ items: BoardItem[]          │    │   └ data.cards: ShareCard[]     │
│   └ openIndex / setOpenIndex    │    │   └ openIndex / setOpenIndex    │
│                                 │    │                                 │
│   ┌────────────────────────┐    │    │   ┌────────────────────────┐   │
│   │ Lightbox               │◄───┼────┼──►│ Lightbox               │   │
│   │  item: BoardItem|Share │    │    │   │  item: ShareCard|Board │   │
│   │  nav: { current, total,│    │    │   │  nav: { current, total,│   │
│   │       onNav, onJump }  │    │    │   │       onNav, onJump }  │   │
│   │  + chevron L/R         │    │    │   │  + chevron L/R         │   │
│   │  + dot indicator       │    │    │   │  + dot indicator       │   │
│   │  + slide animation     │    │    │   │  + slide animation     │   │
│   └────────────────────────┘    │    │   └────────────────────────┘   │
└─────────────────────────────────┘    └─────────────────────────────────┘
                  ▲                                  ▲
                  └───── shared component ───────────┘
```

### 鍵となる新規概念

1. **`LightboxItem` 内部型** — Lightbox 内部で扱う共通 shape (`{ url, title?, description?, thumbnail?, kind: 'board' | 'share' }`)。`item` props を `BoardItem | ShareCard` の union で受け取り、Lightbox 内部の `normalizeItem()` で `LightboxItem` に変換
2. **Nav 制御は呼び出し側 (Parent) 責任** — Lightbox は `currentIndex / total / onNav(dir) / onJump(i)` を受け取るだけ。Parent (`BoardRoot` / `SharedView`) が `openIndex` state を持ち、`item` を再計算して Lightbox に渡す。loop / boundary ロジックも Parent
3. **既存 `originRect` props は keep** — 初回 open animation はそのまま FLIP。**nav 切替時の slide animation は別軸で Lightbox 内部完結**

### 検討した代替案 (却下記録)

- **B**: ShareCard → BoardItem adapter (却下 — dummy 値の混在で「これ実は受信側だ」が分からなくなる、`bookmarkId` 偽装が将来バグ源)
- **C**: `LightboxView` 抽出 refactor (却下 — 992 行 refactor の diff が太く Plan A 直後の今は overkill。Phase 3 以降で必要なら検討)

---

## 3. Lightbox の Props 拡張

### 既存 (Phase 2 前)

```ts
type Props = {
  readonly item: BoardItem | null
  readonly originRect: DOMRect | null
  readonly onClose: () => void
}
```

### Phase 2 後 (additive、既存呼び出しは無変更で動く)

```ts
type Props = {
  readonly item: BoardItem | ShareCard | null   // ← union 拡張
  readonly originRect: DOMRect | null
  readonly onClose: () => void
  readonly nav?: {                              // ← 新規 (optional)
    readonly currentIndex: number
    readonly total: number
    readonly onNav: (dir: -1 | 1) => void
    readonly onJump: (index: number) => void
  }
}
```

`nav` 未指定 → chevron / indicator 非表示 = 既存挙動完全互換。
board 側も Phase 2 で `nav` を渡すので両方有効化。

### 内部正規化

```ts
// lib/share/lightbox-item.ts
export type LightboxItem = {
  readonly url: string
  readonly title: string | null
  readonly description: string | null
  readonly thumbnail: string | null
  readonly kind: 'board' | 'share'
}

export function normalizeItem(item: BoardItem | ShareCard): LightboxItem
```

### Read-only モードの差分 (`kind === 'share'` のとき)

| 要素 | board | share | 備考 |
|------|-------|-------|------|
| ✕ ボタン | ✓ | ✓ | 共通 |
| 「元のサイトへ ↗」 | ✓ | ✓ | 受信側の主要アクション |
| Tweet メタ fetch | ✓ | ✓ | `/api/tweet-meta` は public |
| TikTok playback fetch | ✓ | ✓ | `/api/tiktok-meta` proxy も public |
| YouTube/Instagram embed | ✓ | ✓ | 共通 |
| アーカイブ/削除 UI | – | – | そもそも Lightbox 内に存在しない |

### `bookmarkId` → `identity` リネーム

- ShareCard には `bookmarkId` がない → URL を identity として使う
- `identity = item ? \`${kind}:${url}\` : null`
- 既存 Lightbox.tsx の `useEffect` で `bookmarkId` を deps にしている箇所すべてを `identity` に置換
- ただし Tweet meta fetch は `tweetId` base なので **そのまま残す** (個別判断)

---

## 4. Nav UI 仕様

### 4.1 Chevron

```
位置:    backdrop の左右、垂直中央 (top: 50%, transform: translateY(-50%))
余白:    左右各 24px (Lightbox frame と被らないよう)
サイズ:  48x48 円
背景:    rgba(255,255,255,0.10) + backdrop-filter: blur(8px)
中身:    14px 太線 chevron (currentColor = white)
hover:   opacity 0 → 1 (140ms power2.out)
         scale 1 → 1.06
keyboard focus: opacity 1 (常時表示) + outline
total ≤ 1: chevron 非表示 (両側とも)
```

### 4.2 Dot indicator (Instagram stories 風 dynamic strip)

```
位置:    backdrop 下端、frame 下に 28px gap、横中央
構成:    最大 7 dots 可視 (active 中央寄せ)

サイズ階層:
  - active dot      : 10px、bg = white、scale 1.0 → 1.15 pulse
  - 隣接 (±1)       : 6px、bg = rgba(255,255,255,0.65)
  - その外 (±2)     : 4px、bg = rgba(255,255,255,0.40)
  - 端 (±3)         : 3px、bg = rgba(255,255,255,0.25)
  - 範囲外          : DOM には全 dots を保持、container に overflow:hidden を掛けて
                       strip translateX で範囲外を視野外に押し出す方式 (clip)
                       (理由: dot 数を動的に増減すると mount/unmount で flicker 発生、
                        全 dot を保持して strip 位置だけ変える方が滑らか)

スライド:
  dot strip 全体を transform:translateX で active が中央に来るよう移動
  duration: 240ms power3.out

クリック:
  各 dot が clickable → onJump(i) でその index にジャンプ
  hover で scale 1.08 (微小)、cursor: pointer

active 切替アニメーション:
  GSAP timeline で
    旧 active: 1.15 → 1.0 + bg fade
    新 active: 1.0 → 1.15 spring (back.out(2))、180ms

エッジケース:
  - total ≤ 1: indicator 全体非表示
  - total = 2: 「●○」or「○●」だけ表示 (隣接スケール無し、active と非 active のみ)
  - total = 3-7: 全 dots 表示、auto-scroll 不要
  - total ≥ 8: dynamic strip フル機能
```

### 4.3 Slide animation (nav 切替時)

```
方向:
  → クリック / Right key → 新カード右から (+40px) slide-in
                          旧カード左へ (-40px) slide-out
  ← クリック / Left key  → 逆

duration: 280ms power3.out
crossfade: 旧 opacity 1 → 0、新 opacity 0 → 1 (同時、200ms)

ループ動作 (Q4=C 確定):
  最終 → 先頭、先頭 → 最終も通常通り slide animation
  dot indicator strip も右端 → 左端へ大きくスライド (派手だが分かりやすい)

embed の重複再生対策:
  - 旧 item の YouTube/TikTok iframe は slide 中に DOM から外す (即 unmount)
  - identity change で React は新 Component tree を mount
  - 切替の瞬間、新 embed が読み込み中なら黒画面が見える可能性あり → 許容
    (理由: 動画切替は稀。Tweet/画像メインのカードでは違和感ゼロ)
```

### 4.4 Nav source (3 ルート)

1. **Chevron click** → `onNav(±1)`
2. **Keyboard ←/→** — `keydown` listener で `onNav(±1)`
   - `e.stopPropagation()` 付き (既存 Esc handler と同じパターン)
   - `document.activeElement` が `INPUT | TEXTAREA | SELECT` の時のみスキップ
   - リンク・ボタンフォーカス時は通常通り反応
3. **Dot click** → `onJump(index)`

---

## 5. ファイル変更スコープ

### 新規ファイル (3)

```
components/board/LightboxNavChevron.tsx       — 左右 chevron 単体
  Props: { dir: 'prev' | 'next', onClick: () => void }
  CSS:   Lightbox.module.css に追記 (separate module は overkill)

components/board/LightboxNavDots.tsx          — dot indicator strip
  Props: { current: number, total: number, onJump: (i: number) => void }
  CSS:   Lightbox.module.css に追記
  内部:  GSAP timeline で active dot pulse + strip translateX

lib/share/lightbox-item.ts                    — normalize util + 型
  export type LightboxItem
  export function normalizeItem(item: BoardItem | ShareCard): LightboxItem
```

### 変更ファイル (4)

#### `components/board/Lightbox.tsx`

- Props に `nav?: { currentIndex, total, onNav, onJump }` 追加
- `item: BoardItem` → `BoardItem | ShareCard` に拡張
- 内部で `normalizeItem()` 経由で `LightboxItem` を取り出す
- `bookmarkId` → `identity` (string = `${kind}:${url}`) にリネーム、useEffect deps 更新
- chevron + dots を frame の外側 (backdrop 直下) に配置
- ←/→ keydown handler 追加 (Esc handler の隣)
- nav 切替時の slide animation を `useLayoutEffect`-driven GSAP timeline で実装
- 既存 FLIP open animation はそのまま (initial open のときのみ走り、nav 切替では走らない)

#### `components/board/Lightbox.module.css`

- `.navChevron`, `.navChevronPrev`, `.navChevronNext` 追加
- `.navDots`, `.navDot`, `.navDotActive`, `.navDotAdjacent`, `.navDotFar`, `.navDotEdge` 追加
- 既存スタイルは無変更

#### `components/board/BoardRoot.tsx`

- 既存 `openIndex` state を Lightbox の `nav.currentIndex` に渡す
- `nav.onNav(dir)` で `setOpenIndex((i) => loopWrap(i + dir, items.length))`
- `nav.onJump(i)` で `setOpenIndex(i)`
- `loopWrap = ((i % n) + n) % n` (Lightbox.tsx 内 inline でも可)

#### `components/share/SharedView.tsx`

- 現状 `onCardOpen={(i) => window.open(...)}` → `onCardOpen={(i, rect) => setOpenIndex({ index: i, rect })}`
- `openState: { index: number, rect: DOMRect | null } | null` state 追加
- `<Lightbox item={openState ? data.cards[openState.index] : null} originRect={openState?.rect ?? null} onClose={() => setOpenState(null)} nav={...} />` 追加
- 「AllMarks で表現する ↗」→ 「自分も AllMarks を使う ↗」に文言変更

#### `components/share/ShareFrame.tsx`

- 内部のカードクリックハンドラで `e.currentTarget.getBoundingClientRect()` を取得
- `onCardOpen(i, rect)` で渡す
- `editable=true` の board 側コンポーザでは rect 不要、`null` 渡しで既存挙動互換
- `onCardOpen: (i: number, rect: DOMRect | null) => void` シグネチャ拡張

### 影響なし (確認済み)

- `lib/share/decode.ts` / `lib/share/board-to-cards.ts` — share schema 不変更
- `app/(app)/board/page.tsx` — Lightbox 経由しない
- LiquidGlass / glass-presets — 触らない (テーマ用に保管)

---

## 6. テスト計画

### Unit tests

- `lib/share/lightbox-item.test.ts` — normalize 4-5 件
  - board card → LightboxItem
  - share card → LightboxItem
  - thumbnail null
  - 長い title (truncation はしない、そのまま渡す)
  - URL のみ (title/description null)

### E2E tests (新規 2 ファイル)

`tests/e2e/share-receive-lightbox.spec.ts`:
- 受信側カードクリック → Lightbox 開く
- ← / → でカード切替
- 端末から → で 1 番目に loop
- 最終 dot クリック → そこにジャンプ
- 「自分も AllMarks を使う ↗」リンク存在確認
- ✕ で閉じる

`tests/e2e/board-lightbox-nav.spec.ts`:
- board の Lightbox でも ← / → が動く
- 端末ループ動作
- dot click でジャンプ

### 既存テスト (回帰確認のみ、編集なしを期待)

- `tests/e2e/share-composer-edit.spec.ts` (Plan A item 2)
- `tests/e2e/share-sender.spec.ts`
- 既存 board lightbox の open/close 系

---

## 7. リスク

### R1: `bookmarkId` → `identity` リネームの広がり

Lightbox.tsx 992 行のうち `bookmarkId` を deps に持つ useEffect が複数。一括置換時に「Tweet meta fetch だけは tweetId base なので残す」など個別判断が必要。

**緩和**: リネームは 1 commit に閉じ、tsc + 既存 E2E (board lightbox open / close) で回帰確認。

### R2: nav 切替時の embed lifecycle

`identity` change で React は新 Component tree を mount。YouTube/TikTok/Instagram の iframe は完全に新規 fetch。slide animation 中、新 embed が読み込み中なら黒画面が見える可能性。

**判断**: 許容。受信側はリンク先確認用途。動画自動再生の繋ぎは UX 必須ではない。

### R3: dot indicator の total が大きい場合のスクロール

total = 1000 でも CPU 負担は dot 7 個の transform のみ → OK。

**緩和**: total ≤ 1 で indicator 非表示、total = 2 では「●○」or「○●」だけ表示 (隣接スケール無し)、エッジケース処理を test に含める。

### R4: keyboard nav が他のフォーカス可能要素と競合

受信側に「自分も AllMarks を使う ↗」link、board に Toolbar pill がある。Lightbox open 中に keydown を listen するとき、フォーカスがリンクや input にあると ←/→ が打ち間違いを起こす。

**対策**: `document.activeElement` が `INPUT | TEXTAREA | SELECT` の時のみスキップ。他 (リンク・ボタン) は通常通り。既存 Esc handler と同じパターンと整合。

### R5: ShareFrame の `onCardOpen` シグネチャ変更

`(i) => void` → `(i, rect) => void` 拡張。board 側コンポーザ (editable mode) は rect 不要 → `null` 渡し。

**緩和**: テストの mock callback も更新が必要だが impact は局所。tsc が型チェックで漏れを catch。

### R6: 受信側で Lightbox 開いた状態で URL 共有

`/share#d=...` の hash を直接他人に送り、その人が開いたら `openIndex = null` で開始 = 一覧表示。これは正しい挙動。

**out-of-scope**: 「カード N を開いた状態の URL を共有」は Phase 3 以降検討。

---

## 8. 設計判断記録 (なぜこうしたか)

### D1: Lightbox に `nav?` を additive で足す (refactor しない)

Plan A 直後で diff コストを抑える。`nav` 未指定時は既存挙動 100% 互換 → board 側の既存テストは壊れない。

### D2: `onJump` を `onNav` と分離

`onNav: (-1 | 1)` のシグネチャを保ったまま `onJump?: (i: number)` を別 prop として追加。chevron は relative、dot は absolute、と意味が違う API は別関数で表現するほうが読み手にやさしい。

### D3: dot は「Instagram stories 風 dynamic strip」を採用、シンプルな等間隔 dots ではない

total が 1000 になり得る (Plan A 完了後の cards 上限は明示的にないため大量 share 想定)。等間隔 dot だと豆粒化して使えない。dynamic strip なら total 不問で UX 一定。

### D4: ループ動作は派手な slide で OK (Q4=C)

ユーザー判断。「ループしてる」直感性 > 静かさ。

### D5: 受信側の primary action は「元のサイトへ ↗」のままでよい

Phase 2 では受信者の取り込み機能は無し。Lightbox 内の「元のサイトへ ↗」と、左下の「自分も AllMarks を使う ↗」が並んで二択 (見たいリンクへ / アプリを試す) として読みやすい構造。

### D6: slide 中の旧 embed スナップショット表示は不要

完璧主義の落とし穴。280ms の黒画面は許容、削減しても良い (cross-fade 200ms に固定すれば完了 80ms 早まる) と実装中に判断する余地あり。

### D7: 文言「自分も AllMarks を使う ↗」

「ボードを始める」より具体性あり、「AllMarks で集める」より mission (表現ツール) と整合、ブランド名露出も維持。

---

## 9. 完了条件

- [ ] 受信側でカードクリックすると Lightbox が開く (現状 `window.open` から差し替え)
- [ ] board / 受信側両方の Lightbox に左右 chevron が hover で fade-in
- [ ] board / 受信側両方の Lightbox に dot indicator が表示
- [ ] キーボード ←/→ で nav 動作
- [ ] dot click で任意 index へジャンプ
- [ ] 端末から → で先頭にループ、← で末尾にループ (派手な slide)
- [ ] slide animation 280ms power3.out + cross-fade 200ms
- [ ] 受信側左下のリンクが「自分も AllMarks を使う ↗」
- [ ] tsc 0 errors、244 既存 unit tests + 新 normalize tests passing
- [ ] 既存 E2E (Plan A 系) 全て pass、新 E2E 2 ファイル pass
- [ ] 本番 deploy (`booklage.pages.dev`) で実機動作確認
