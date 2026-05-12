# I-07-#5 Lightbox テキストパネル mask-reveal-up Design

**Goal:** Lightbox open 時、 media の FLIP 着地後にテキストパネルを 3 stage (見出し → 本文 → meta+CTA) で順次 mask-reveal-up する演出を導入。 現状の素 opacity fade を置き換え、 destefanis 系 / Apple 系の本格リッチ演出にグレードアップ。

**Phase:** Phase A 補足 (Phase A 忠実コピー方針外の独自ポリッシュ。 ユーザー意思で導入決定、 destefanis 本家確認はスキップ)

**Brainstorming session (2026-05-12):** 5 軸の決定 — パターン (B: 段階 stagger) / タイミング (b: 150ms 一呼吸) / mechanism (C: translateY + clip-path 併用) / stage 構造 (3 段: 見出し / 本文 / meta+CTA) / tempo (b: per-stage 500ms, stagger 150ms, power3.out)

---

## アーキテクチャ

### Before

`components/board/Lightbox.tsx` の open useEffect (line ~565-705 周辺) で、 `textRef.current` を 1 要素として `gsap.set(textEl, { opacity: 0 })` → `tl.to(textEl, { opacity: 1 })` の素フェードで出していた。 fade 開始タイミングは `chromeAt = dur * OPEN_TEXT_FADE_DELAY_RATIO` で media 着地のかなり手前から。 close 時は逆方向の opacity tween。

### After

テキストパネル内を **3 stage 要素 (見出し / 本文 / meta+CTA wrapper)** に分割。 stage 要素は `data-reveal-stage="N"` 属性で識別。 open 時 GSAP timeline が:

1. media FLIP 着地完了を待つ (timeline 上の `dur` 時点)
2. 150ms の「一呼吸」 静止 (token: `--lightbox-text-reveal-pause`)
3. stage 要素群を初期状態 (opacity 0, translateY 18px, clip-path inset(100% 0 0 0)) から終端 (opacity 1, translateY 0, clip-path inset(0 0 0 0)) へ、 500ms (token: duration) ・ 150ms stagger (token) ・ power3.out (token) で順次 reveal

stage 2 / 3 の要素が存在しないカード (Tweet で meta 無し等) は `querySelectorAll` で要素自体が返らないため、 GSAP の stagger が自動的に skip → タイミング詰めも自動 (timeline 側に欠損ハンドリング不要)。

### DOM 構造

```html
<div ref={textRef} className={styles.text}>
  <!-- カード type 別の見出し -->
  <h1 className={styles.title} data-reveal-stage="1">{title}</h1>           <!-- Default -->
  <h1 className={styles.bylineHeading} data-reveal-stage="1">{byline}</h1>  <!-- Instagram -->
  <div className={styles.tweetAuthor} data-reveal-stage="1">...</div>      <!-- Tweet -->

  <!-- 本文 -->
  <p className={styles.description} data-reveal-stage="2">{description}</p>  <!-- Default -->
  <p className={styles.captionBody} data-reveal-stage="2">{caption}</p>     <!-- Instagram -->
  <p className={styles.tweetBody} data-reveal-stage="2">{text}</p>          <!-- Tweet -->

  <!-- meta + CTA を 1 ブロック化 (NEW wrapper) -->
  <div className={styles.metaCtaGroup} data-reveal-stage="3">
    <div className={styles.meta}>...</div>
    <a className={styles.sourceLink}>...</a>
  </div>
</div>
```

`.metaCtaGroup` wrapper は **新規追加**。 既存縦並びレイアウトを変えないため、 wrapper 自体は `display: block` (or 既存 text panel の column flow をそのまま継承)、 内部はそのまま縦並び。

---

## デザイントークン

`app/globals.css` の `:root` ブロックに 5 つ追加 (新セクション `/* === lightbox text mask reveal (I-07-#5) === */`):

```css
--lightbox-text-reveal-duration: 0.5s;        /* per-stage 持続 */
--lightbox-text-reveal-stagger: 0.15s;        /* stage 間 offset */
--lightbox-text-reveal-pause: 0.15s;          /* media 着地後の溜め */
--lightbox-text-reveal-translate-y: 18px;     /* 滑り込み距離 */
--lightbox-text-reveal-easing: power3.out;    /* GSAP easing 名 (CSS variable には string で格納) */
```

GSAP timeline 側は `getComputedStyle(document.documentElement).getPropertyValue('--lightbox-text-reveal-duration')` 等で値を読み、 ms / px / string にパースしてから timeline に渡す。 既存 hover swap polish と同じパターン。

後から「テンポ上げたい」 「もっと溜めたい」 等あれば、 この 5 行を書き換えれば全箇所同期。

---

## CSS 詳細

### `components/board/Lightbox.module.css` 新規追加

```css
/* I-07-#5: stage 3 wrapper for meta + CTA reveal as one block. */
.metaCtaGroup {
  /* レイアウト中立 — 内部の既存縦並びをそのまま維持 */
}

/* I-07-#5: prefers-reduced-motion fallback.
 * mask + translate を無効化し、 opacity fade のみで text を出す。
 * GSAP 側で reduce-motion 検出して timeline branch を切る。 */
@media (prefers-reduced-motion: reduce) {
  /* CSS 側では特に追加スタイル不要 — GSAP timeline 側で
   * x: 0, clipPath: 'inset(0 0 0 0)' の終端値を直接 set し、
   * opacity 0 → 1 のみ tween するパスに切替 */
}
```

### 既存スタイルへの影響

なし。 `.text` / `.title` / `.description` / `.tweetAuthor` / `.bylineHeading` / `.captionBody` / `.tweetBody` / `.meta` / `.sourceLink` は変更しない (data 属性追加のみ JSX 側)。

---

## GSAP timeline 詳細

### open 時 (line ~565-705 周辺の置き換え)

```typescript
// 1. token を root から読む
const root = getComputedStyle(document.documentElement)
const revealDuration = parseFloat(root.getPropertyValue('--lightbox-text-reveal-duration')) || 0.5
const revealStagger = parseFloat(root.getPropertyValue('--lightbox-text-reveal-stagger')) || 0.15
const revealPause = parseFloat(root.getPropertyValue('--lightbox-text-reveal-pause')) || 0.15
const revealTranslateY = parseFloat(root.getPropertyValue('--lightbox-text-reveal-translate-y')) || 18
const revealEasing = root.getPropertyValue('--lightbox-text-reveal-easing').trim() || 'power3.out'

// 2. stage 要素群を集める
const stageEls = textEl?.querySelectorAll<HTMLElement>('[data-reveal-stage]')

// 3. reduce-motion 分岐
const prefersReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

// 4. 初期状態セット (timeline 開始前)
if (stageEls && stageEls.length > 0) {
  if (prefersReduce) {
    gsap.set(stageEls, { opacity: 0 })  // mask + translate なし
  } else {
    gsap.set(stageEls, {
      opacity: 0,
      y: revealTranslateY,
      clipPath: 'inset(100% 0 0 0)',
    })
  }
}

// 5. timeline 構築 (既存 media tween に追加)
const textStartAt = dur + revealPause  // media 着地 + 一呼吸
if (stageEls && stageEls.length > 0) {
  if (prefersReduce) {
    tl.to(stageEls, {
      opacity: 1,
      duration: revealDuration,
      ease: revealEasing,
      stagger: revealStagger,
    }, textStartAt)
  } else {
    tl.to(stageEls, {
      opacity: 1,
      y: 0,
      clipPath: 'inset(0 0 0 0)',
      duration: revealDuration,
      ease: revealEasing,
      stagger: revealStagger,
    }, textStartAt)
  }
}
```

### close 時 (line ~285-413 周辺)

text panel は **mask reveal を逆再生せず** opacity 0 への素早い fade (200ms 程度) のみ。 close FLIP に大きく遅れない潔い終端動作。

```typescript
// 既存 close tween の textEl 部分を opacity-only fade に短縮
if (textEl) {
  tl.to(textEl, {
    opacity: 0,
    duration: 0.2,
    ease: 'power2.in',
  }, 0)
}
```

`textRef` 自体への tween で、 stage 要素個別の挙動は気にしない (close 時に mask 戻し挙動を user に見せる意味がないため)。 新カード再 open 時には初期状態セットが走り直すので state リセット不要。

### nav 切替時 (line ~707-852 周辺、 3D slide 中の text 挙動)

新カードに切替時:

1. 前カードの reveal timeline を `gsap.killTweensOf(prevStageEls)` で kill
2. 3D slide が完了 (slide animation 完了 callback) + 150ms 一呼吸 後に、 open 時と同一の reveal timeline を新カードの stage 要素群に対して発火
3. 連打中は kill → slide → kill → slide のループで text は不可視のまま、 連打が止まった時点の最終カードで reveal が完走

---

## 想定挙動 (edge case 明示)

### Default カード (title + description + meta + sourceLink 全部あり)

```
  0ms  media FLIP 着地
150ms  一呼吸完
150ms  stage 1 (title) reveal 開始
300ms  stage 2 (description) reveal 開始
450ms  stage 3 (meta + sourceLink) reveal 開始
950ms  全 stage 完了
```

### Default カード (title のみ、 description 無し、 meta は host あり)

stage 2 要素 (`.description` with `data-reveal-stage="2"`) が DOM 上に存在しない → `querySelectorAll` で 2 要素のみ返る:

```
  0ms  media FLIP 着地
150ms  一呼吸完
150ms  stage 1 (title) reveal 開始
300ms  stage 2 (= stage 3 を 1 つ繰り上げ: meta + sourceLink) reveal 開始
800ms  全 stage 完了
```

GSAP stagger は要素数分しかタイミング刻まないため自動。

### Tweet カード (tweetAuthor + tweetBody + sourceLink、 meta 無し)

```
  0ms  media FLIP 着地
150ms  一呼吸完
150ms  stage 1 (tweetAuthor) reveal 開始
300ms  stage 2 (tweetBody) reveal 開始
450ms  stage 3 (sourceLink のみ in metaCtaGroup) reveal 開始
950ms  全 stage 完了
```

### close

- ✕ クリック / Esc / backdrop クリックで close 発火
- text panel: opacity 0 への 200ms fade-out (`power2.in`)
- media: 既存 reverse FLIP (変更なし)

### 矢印で次カード遷移

- 3D slide animation 発火 (既存挙動)
- slide 着地 callback で reveal timeline 発火 (open 時と同一処理)
- 150ms 一呼吸後に stage 順次 reveal

### 矢印連打

- 連打のたびに `gsap.killTweensOf(prevStageEls)` でタイムライン kill
- 連打中は text 不可視のまま 3D slide のみが連続
- 連打が止まり、 最後の slide が完了 + 150ms 経過した時点で reveal が完走

### prefers-reduced-motion: reduce

- mask (clip-path) + translateY を無効化
- opacity 0 → 1 の素フェード stagger のみ残す
- 全体 timing (150ms pause / 500ms duration / 150ms stagger) は維持

---

## Test plan

### 必須 (本番 deploy 後の実機確認 — 視覚承認 gate)

1. **Default カード**: title + description + meta あるカードを開く → media 着地 → 一呼吸 → 見出し → 本文 → meta+CTA の順で reveal、 体感がリッチ
2. **Default カード (短)**: title のみのカード → stage 2 自動スキップで自然なテンポ
3. **Instagram カード**: byline / caption / meta+CTA の 3 段 reveal
4. **Tweet カード**: tweetAuthor / tweetBody / sourceLink の 3 段 reveal (meta 無し → stage 3 は sourceLink のみ)
5. **次カード遷移**: 矢印で次 → 着地後 reveal 発火
6. **連打**: 矢印を 1 秒以下間隔で連打 → 止まった瞬間に reveal がきれいに発火
7. **閉じる**: ✕ / Esc / backdrop で close → text が素早く fade out、 もたつかない
8. **reduce motion**: Chrome DevTools の Rendering タブ → "Emulate CSS prefers-reduced-motion: reduce" → mask アニメ無効化、 opacity stagger のみ

スクリーンショットでは判定不可。 **ユーザー実機 OK 返答が完了 gate**。

### コード品質

9. `rtk pnpm tsc` (型エラーなし)
10. `rtk vitest run` (既存テスト破壊なし)

### 非実施

- Playwright e2e 新規追加なし (視覚演出の細部は assert 困難、 既存 lightbox-open テスト保護のみで足る)
- 既存 Playwright テスト破壊チェックは vitest と同列に扱う

---

## 影響範囲

### 触るファイル

| ファイル | 変更内容 | 規模目安 |
|---|---|---|
| `components/board/Lightbox.tsx` | text panel DOM に `data-reveal-stage` 属性追加 + stage 3 wrapper (`.metaCtaGroup`) 追加 + open / nav useEffect の textEl tween を timeline 書き換え + close 時の textEl fade を短縮 | ~80-120 行追加 / 修正 |
| `components/board/Lightbox.module.css` | `.metaCtaGroup` class 追加 (レイアウト中立) | ~5-10 行 |
| `app/globals.css` | reveal トークン 5 個追加 | ~10 行 |

### 触らないもの

- media FLIP open / close (既存 timeline ロジック保持)
- backdrop fade in/out
- close ボタン の opacity fade (既存 `chromeAt` 経由のまま — text と別系統)
- nav 3D slide animation
- text panel 内既存スタイル (`.title` `.description` `.tweetAuthor` `.tweetBody` `.bylineHeading` `.captionBody` `.meta` `.sourceLink`)

---

## 想定リスク

### clip-path のブラウザ間差異

- `clip-path: inset()` は 2017 以降 baseline (Chromium / Firefox / Safari 全対応)
- アニメーション補間も同様に baseline
- 本番 deploy 後、 Chrome 以外も 1 つ実機確認 (Safari iOS / Firefox 等)

### nav 切替時の DOM 再 mount

- 次カードに切替時、 React の reconciliation で stage 要素が新規生成される
- `gsap.killTweensOf` は古い要素参照に対してのみ効くため、 新要素には影響しない
- ただし古い stage 要素への tween が残っていると、 unmount 直前の 1 frame に元の transform が flashing するリスク
- 対策: 切替前 useEffect cleanup で必ず kill を呼ぶ (既存 close cleanup と同じパターン)

### iframe (動画) 再生中の text パネル mask

- video / tweet iframe が play 中でも text パネルの reveal は media と独立して動く
- 体感確認時に「動画 play しながら test 切替」 を試して挙動確認

---

## 後続作業 (本 spec の scope 外)

- B-#1/#2/#3 サムネ系修正 (`docs/CURRENT_GOAL.md` D 候補)
- AllMarks sizing 哲学移行 Phase 2-6
- 旧 hover swap polish と同じく、 数値調整は後日トークン値だけ書き換え可能 (CSS 1 行で全 board 同期)
