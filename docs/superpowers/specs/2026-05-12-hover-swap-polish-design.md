# I-07-#2 板上カード hover 切替演出 + 明るさリフト Design

**Goal:** 複数画像 / mix tweet カードの hover 切替を、 現状の「即時 src 書き換え」 から「380ms クロスフェード」 へ刷新。 さらに destefanis 由来の `filter: brightness(1.08)` リフトを hover 時に併用し、 「触れる感」 のマイクロインタラクションを board 全体に行き渡らせる。

**Phase:** Phase A 補足 (destefanis 哲学に整合する範囲での polish)

**Brainstorming session (2026-05-12):** 4 方向 (instant / cross-fade / blur / scale+fade) から **クロスフェード** を選択。 速度は 130 / 220 / 380ms から **380ms (じっとり、 余韻)** を選択。 リフト効果は destefanis 純正 (baseline 100% → hover 108%、 baseline dim なし) を採用。

---

## アーキテクチャ

### Before

`ImageCard.tsx` は 1 枚の `<img src={displayedSrc}>` の `src` 属性を `imageIdx` 変化のたびに直接書き換えていた。 transition 不可能、 視覚的にパッと切り替わる。

### After

複数 slot を **全て同時に DOM にスタック**。 active な layer だけ `opacity: 1`、 それ以外は `opacity: 0`。 CSS の `transition: opacity ...` で 380ms クロスフェード。 `:hover` 時に active layer に `filter: brightness(1.08)` を加える。

```
<div className={imageCard}>          ← :hover を listen
  <img layer data-active="true" />  ← slot 0  opacity 1, hover で brightness 1.08
  <img layer />                     ← slot 1  opacity 0
  <img layer />                     ← slot 2  opacity 0
  <div multiImageDots>...</div>
</div>
```

`pointermove` ハンドラ・preload ロジック・`imageIdx` state は **既存のまま流用**。 変更は「`src` を 1 個書き換える」 → 「`data-active` 属性を切り替える」 に置換するだけ。

---

## デザイントークン

`app/globals.css` の `:root` ブロックに 3 つ追加 (`/* === card hover micro-interaction (I-07-#2) === */` セクション):

```css
--card-hover-swap-duration: 380ms;
--card-hover-swap-easing: ease-out;
--card-hover-lift-brightness: 1.08;
```

- duration: クロスフェードとリフト両方の transition 時間 (共有)
- easing: クロスフェードとリフト両方の transition カーブ (共有)
- lift-brightness: hover 時に active layer に乗る brightness 倍率

後から数値変更したい時はこの 3 行を書き換えれば、 全 board / 全カードで一斉に挙動が変わる。

---

## CSS 詳細 (`components/board/cards/ImageCard.module.css`)

```css
/* I-07-#2: layered img stack for cross-fade hover swap.
 * Each MediaSlot renders as its own absolutely-positioned <img>.
 * Only the layer matching imageIdx has data-active="true" → opacity 1.
 * Card-level :hover adds the brightness lift on the active layer. */
.thumb {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  user-select: none;
  -webkit-user-drag: none;
  opacity: 0;
  transition:
    opacity var(--card-hover-swap-duration) var(--card-hover-swap-easing),
    filter var(--card-hover-swap-duration) var(--card-hover-swap-easing);
}

.thumb[data-active='true'] {
  opacity: 1;
}

.imageCard:hover .thumb[data-active='true'] {
  filter: brightness(var(--card-hover-lift-brightness));
}
```

注意点:
- `position: absolute; inset: 0` で全 layer が card サイズに張り付き、 重なって表示される
- `.imageCard` 自体は既に `position: relative` (現状コード通り) なので絶対位置基準になる
- Instagram Reel の `thumbInstagramReel` (`filter: brightness(0.86) saturate(0.92)`) と hover lift の filter は **打ち消し合うので注意**。 解決策: hover lift は `.imageCard:hover .thumb[data-active='true']:not(.thumbInstagramReel)` で reel カードには適用しない。 reel は元から brightness 0.86 で抑制してあるため、 hover で 1.08 倍にすると 0.93 になり大した変化にならず、 むしろ tint と整合せず違和感が出る恐れあり

---

## JSX 詳細 (`components/board/cards/ImageCard.tsx`)

```tsx
return (
  <div ref={cardRef} className={styles.imageCard} ...>
    {slots.length > 0 ? (
      slots.map((slot, i) => (
        <img
          key={slot.url}
          ref={i === 0 ? imgRef : undefined}
          className={isReel ? `${styles.thumb} ${styles.thumbInstagramReel}` : styles.thumb}
          src={slot.url}
          alt={item.title}
          draggable={false}
          loading="lazy"
          data-active={i === imageIdx ? 'true' : undefined}
        />
      ))
    ) : (
      item.thumbnail && (
        <img
          ref={imgRef}
          className={...}
          src={item.thumbnail}
          alt={item.title}
          draggable={false}
          loading="lazy"
          data-active="true"
        />
      )
    )}
    {isReel && <div className={styles.tintInstagramReel} aria-hidden="true" />}
    {hasMultiple && <div className={styles.multiImageDots}>...</div>}
  </div>
)
```

- slots がある場合は **全 slot を `<img>` として並べる** (preload は不要になる、 ブラウザが自然に preload する)
- slots が無い場合 (= 単一画像、 photos も mediaSlots も無いカード) は従来通り `item.thumbnail` 1 枚

副次効果: `preloadedRef` + 「最初に hover した瞬間に `new Image()` で preload する」 ロジックは **不要になる** ので削除する。 全 slot URL がそのまま `<img loading="lazy">` 経由でブラウザ側に load 委譲される。 `imgRef` は **layer 0 (slot 0) にだけ** 付与する (aspect 再計測の対象は default 表示の slot 0 のため)。

**帯域トレードオフの明記**: 元の preload は「**ユーザーが実際に hover したカードのみ** 全 slot URL を取得」 だった。 新設計は `loading="lazy"` 任せで「**viewport 近傍に入った全カード**」 が全 slot 取得する。 board 上の 80% のカードが多画像で hover されないと仮定すると、 viewport 内 10〜20 カード × 平均 2〜3 余分 slot ≈ 数 MB の差。 Twitter CDN は無料なので AllMarks 側コスト増はゼロ、 ユーザー側帯域がやや増える。 視覚的 smoothness と引き換えに許容。 もし将来「外出先のセルラー回線で重い」 と判明したら、 IntersectionObserver で hover 起きるまで slots[1..N-1] を `display: none` にする保守的 fallback を別 spec 化可能。

---

## データフロー / 後方互換

- `mediaSlots` (v13) → そのまま全 slot を layer 化
- `photos[]` (v12 legacy) → 既存の synthetic MediaSlot 化ロジックで layer 化 (既存コード流用)
- 単一画像カード (`item.thumbnail` のみ) → layer 1 枚、 hover でも切替なし、 リフトのみ作動
- テキストカード (画像なし) → 影響外 (`ImageCard` 不使用)
- 動画 slot (`mediaSlot.url` は poster) → 同じ仕組みで poster を fade、 ▶ dot は dots overlay にて区別 (既存コード)

---

## テスト

### E2E (`tests/e2e/board-mixed-media.spec.ts` に追加)

既存ファイルに 1 件 assertion を追加 (新規ファイル不要):

```typescript
test('I-07-#2: hover swap renders cross-fade via data-active toggle', async ({ page }) => {
  // ... seed mix tweet bookmark ...
  await page.goto('/board')
  const card = page.locator('[data-bookmark-id="b1"]')

  // Initially, layer 0 should be data-active
  await expect(card.locator('img').nth(0)).toHaveAttribute('data-active', 'true')
  await expect(card.locator('img').nth(1)).not.toHaveAttribute('data-active', 'true')

  // Hover and move to the right side → layer 1 (or N-1) becomes active
  const box = await card.boundingBox()
  await page.mouse.move(box!.x + box!.width * 0.9, box!.y + box!.height * 0.5)
  await expect(card.locator('img').nth(1)).toHaveAttribute('data-active', 'true')
  await expect(card.locator('img').nth(0)).not.toHaveAttribute('data-active', 'true')

  // Hover lift: active layer's computed filter should contain brightness
  const filter = await card.locator('img[data-active="true"]').evaluate((el) =>
    window.getComputedStyle(el).filter,
  )
  expect(filter).toContain('brightness')
})
```

### Unit (vitest)

不要。 CSS transition + DOM 属性切り替えなので Playwright 一本で十分。

### 視覚承認 gate (`.claude/rules/ui-design.md`)

1. `pnpm dev` で localhost 起動
2. ユーザー実機で板上カードを hover → swap + lift 確認
3. screenshot 共有 (デフォルトの 380ms / 1.08 で良いか、 数値調整したいか)
4. 承認 → master deploy

---

## Future-readiness — 多動画同時再生 (B1 primary feature) との互換性

memory `project_booklage_vision_multiplayback` 記載の「**板上で複数動画 / 音声を同時にミックス再生する**」 機能は、 今の hover swap polish 設計と **直交関係** で衝突しない。 むしろ layered architecture が後方互換に有利:

- **layer 置換可能性**: 各 slot は絶対配置の独立 child として並ぶ。 video slot を board 上で実際に再生したくなった時、 該当 layer を `<img>` → `<video>` に差し替えるだけで済む。 opacity ベースのクロスフェードは `<video>` 要素でも同じく機能するので、 「画像 ↔ 動画再生中」 の transition も統一の token で扱える
- **直交する関心事**: 本 spec の 3 トークン (`--card-hover-swap-duration` / `-easing` / `-lift-brightness`) は遷移の **見た目** のみを制御。 「再生するかしないか」 / 「いつ再生開始するか」 / 「音をミックスするか」 はこの spec の範囲外で、 IntersectionObserver による viewport-entry 判定や WebAudio ベースのミキサーは別 spec で被せる構造
- **属性差は別 spec で**: `loading="lazy"` (img) ↔ `preload="metadata"` / `none` (video) の属性差は inline 再生機能を作る spec 側で吸収する

つまり今は静止画ベースで cross-fade + lift を入れ、 B1 で multi-video playback を追加するとき layer の中身を入れ替えれば良い。 今回の設計を後でリファクタする必要はない。

---

## スコープ外 (今回やらない)

- **動画 slot と画像 slot で演出を変える** — IDEAS.md に退避 (将来 polish 余地)
- **scale 微増 (`transform: scale(1.02)`) 併用** — Brainstorm で 2 案として検討したが、 板上カードがジャンプして賑やかになる弊害があるため不採用
- **▶ dot / 画像 dot のアニメ強化** — 現状維持 (今は dot 自体の表示 fade のみ、 切替時の dot 単独アニメは別タスク)
- **Instagram Reel 専用 lift 調整** — Reel は brightness 0.86 baseline + hover lift を打ち消すため、 仕様上「reel に lift 効果なし」 として処理。 別途デザイン検討タスク化が必要なら後で別 spec

---

## 完成判定

- TypeScript strict コンパイル通過 (tsc clean)
- vitest 全件 PASS
- Playwright e2e 全件 PASS (新規 assertion 含む)
- ユーザー実機 hover で 380ms クロスフェード + 8% 明るくなる動作確認
- 視覚承認 gate 通過 → master deploy

---

## 次のステップ

このドキュメントが承認されたら、 `writing-plans` skill を起動して実装プラン (タスク分解 + ファイル変更詳細 + チェックリスト) を作成する。
