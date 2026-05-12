# I-07-#5 Lightbox Text Mask-Reveal-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lightbox open 時にテキストパネルを 3 stage で順次 mask-reveal-up する演出を実装。 media FLIP 着地 + 150ms 一呼吸の後、 見出し → 本文 → (meta+CTA wrapper) の順に translateY + clip-path + opacity の同時 tween で reveal。 close は素早い opacity fade のまま、 nav 遷移時は slide 着地後に reveal 再発火、 連打時は kill → 最終 settle で reveal 完走。 `prefers-reduced-motion` は opacity-only fallback。

**Architecture:** `app/globals.css` に 5 つのデザイントークン追加 → `components/board/Lightbox.module.css` に `.metaCtaGroup` wrapper 追加 → `Lightbox.tsx` の JSX に `data-reveal-stage` 属性を付与 + `sourceLink` を text コンポーネント内へ移動 → open useLayoutEffect / nav useLayoutEffect の text fade 部分を timeline 書き換え → close handler に stage 要素 kill を追加。 GSAP timeline + querySelectorAll で stage 欠損を自動スキップ。

**Tech Stack:** React 19 / Next.js 14 App Router / TypeScript strict / GSAP 3 / CSS Modules / Cloudflare Pages

**Spec:** [`docs/superpowers/specs/2026-05-12-text-mask-reveal-design.md`](../specs/2026-05-12-text-mask-reveal-design.md)

---

## File Structure

| ファイル | 変更種別 | 責務 |
|---|---|---|
| `app/globals.css` | 修正 | reveal tunable token 5 個を `:root` に追加 |
| `components/board/Lightbox.module.css` | 修正 | `.metaCtaGroup` wrapper class (レイアウト中立) を追加 |
| `components/board/Lightbox.tsx` | 修正 | JSX に `data-reveal-stage` 属性追加 + sourceLink を text コンポーネント内へ移動 + open / nav useLayoutEffect の text reveal 書き換え + close handler の stage kill 追加 + token reader helper 追加 |

設計判断: 設計の token reader helper は `Lightbox.tsx` 内に閉じた helper 関数として置く (export しない)。 本機能専用、 他箇所で読まないため。

---

### Task 1: globals.css に reveal トークン 5 個追加

**Files:**
- Modify: `app/globals.css` (`:root` ブロック内、 既存 `--card-hover-lift-brightness: 1.08;` の直後付近)

- [ ] **Step 1: globals.css に 5 トークン追加**

`app/globals.css` の line 334 付近 (`--card-hover-lift-brightness: 1.08;` の直後) に以下を追加:

```css
  /* === lightbox text mask reveal (I-07-#5) ===
     Lightbox open 時のテキストパネル mask-reveal-up 演出。
     media FLIP 着地 + pause 経過後、 見出し / 本文 / (meta+CTA) を
     duration 持続・stagger 間隔で順次 reveal。 後から数値だけ
     1 行書き換えれば全 board で挙動同期。 GSAP は秒単位なので
     duration / stagger / pause は秒で記述する (parseFloat で読む)。 */
  --lightbox-text-reveal-duration: 0.5s;
  --lightbox-text-reveal-stagger: 0.15s;
  --lightbox-text-reveal-pause: 0.15s;
  --lightbox-text-reveal-translate-y: 18px;
  --lightbox-text-reveal-easing: power3.out;
```

- [ ] **Step 2: ファイル単体で構文チェック**

Run:
```bash
rtk pnpm tsc --noEmit
```

Expected: 既存と同じく型エラーゼロ (CSS 変更は TS に影響しないが念のため)

- [ ] **Step 3: Commit**

```bash
rtk git add app/globals.css
rtk git commit -m "feat(tokens): add lightbox text mask-reveal-up tunable vars (I-07-#5)"
```

---

### Task 2: Lightbox.module.css に `.metaCtaGroup` 追加

**Files:**
- Modify: `components/board/Lightbox.module.css` (line 528 付近、 既存 `.sourceLink` 定義の直前)

- [ ] **Step 1: `.metaCtaGroup` class 定義を追加**

`.sourceLink` セレクタ (現在 line 528 周辺) の **直前** に追加:

```css
/* I-07-#5: stage 3 wrapper for meta + sourceLink reveal as one group.
   レイアウト中立 — 親 .text の column flex 内に普通の block として座る。
   既存 .text の `gap: 14px` がこの wrapper にも適用されるので、
   wrapper 自身は children を gap 14px の column flex で並べて
   wrapper 外と内で同じ縦間隔を保つ。 */
.metaCtaGroup {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
```

- [ ] **Step 2: ビジュアル変化が無いことを確認 (見た目は wrapper 追加前と同じ)**

この時点では JSX 側に wrapper はまだ存在しない。 CSS class 追加のみ。

Run:
```bash
rtk pnpm tsc --noEmit
```

Expected: 型エラーゼロ

- [ ] **Step 3: Commit**

```bash
rtk git add components/board/Lightbox.module.css
rtk git commit -m "feat(lightbox): add .metaCtaGroup wrapper class for stage 3 reveal (I-07-#5)"
```

---

### Task 3: JSX に reveal-stage 属性を付与 + sourceLink を text コンポーネント内へ移動

**Files:**
- Modify: `components/board/Lightbox.tsx`
  - Main render `<div ref={textRef}>` 周辺 (line ~968-980): sourceLink を除去
  - `DefaultText` 関数 (line 1045-1074): heading / body / meta-cta-group の stage 属性、 sourceLink 追加
  - `TweetText` 関数 (line 1340-1370): heading / body / cta-group の stage 属性、 sourceLink 追加

- [ ] **Step 1: メイン render から sourceLink を除去**

`components/board/Lightbox.tsx` の line 968-980 の `<div ref={textRef}>` ブロックを以下に置換:

```tsx
        <div ref={textRef} className={styles.text}>
          {tweetId
            ? <TweetText item={view} meta={tweetMeta} />
            : <DefaultText item={view} host={host} />}
        </div>
```

(sourceLink `<a>` タグを削除。 text コンポーネント内へ移動するため。)

- [ ] **Step 2: DefaultText を書き換え (stage 属性付与 + sourceLink 追加)**

`components/board/Lightbox.tsx` の `DefaultText` 関数 (line 1045-1074) を以下に置換:

```tsx
function DefaultText({
  item,
  host,
}: {
  readonly item: LightboxItem
  readonly host: string
}): ReactElement {
  const isInstagram = detectUrlType(item.url) === 'instagram'

  if (isInstagram) {
    const { byline, caption, meta } = cleanInstagramText(item)
    return (
      <>
        <h1 id="lightbox-title" className={styles.bylineHeading} data-reveal-stage="1">
          {byline ? `${byline} on Instagram` : 'Instagram'}
        </h1>
        <p className={styles.captionBody} data-reveal-stage="2">{caption}</p>
        <div className={styles.metaCtaGroup} data-reveal-stage="3">
          {meta && <div className={styles.meta}><span>{meta}</span></div>}
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.sourceLink}
          >
            {t('board.lightbox.openSource')} →
          </a>
        </div>
      </>
    )
  }

  return (
    <>
      <h1 id="lightbox-title" className={styles.title} data-reveal-stage="1">{item.title}</h1>
      {item.description && <p className={styles.description} data-reveal-stage="2">{item.description}</p>}
      <div className={styles.metaCtaGroup} data-reveal-stage="3">
        <div className={styles.meta}>{host && <span>{host}</span>}</div>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.sourceLink}
        >
          {t('board.lightbox.openSource')} →
        </a>
      </div>
    </>
  )
}
```

- [ ] **Step 3: TweetText を書き換え (stage 属性付与 + sourceLink 追加)**

`components/board/Lightbox.tsx` の `TweetText` 関数 (line 1340-1370) を以下に置換:

```tsx
function TweetText({
  item,
  meta,
}: {
  readonly item: LightboxItem
  readonly meta: TweetMeta | null
}): ReactNode {
  const authorName = meta?.authorName ?? ''
  const authorHandle = meta?.authorHandle ?? ''
  const text = meta?.text ?? item.title
  return (
    <>
      {(authorName || authorHandle || meta?.authorAvatar) && (
        <div className={styles.tweetAuthor} data-reveal-stage="1">
          {meta?.authorAvatar && (
            <img
              src={meta.authorAvatar}
              alt={authorName || authorHandle}
              className={styles.tweetAvatar}
            />
          )}
          <div className={styles.tweetAuthorMeta}>
            {authorName && <div className={styles.tweetAuthorName}>{authorName}</div>}
            {authorHandle && <div className={styles.tweetAuthorHandle}>@{authorHandle}</div>}
          </div>
        </div>
      )}
      <p className={styles.tweetBody} data-reveal-stage="2">{text}</p>
      <div className={styles.metaCtaGroup} data-reveal-stage="3">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.sourceLink}
        >
          {t('board.lightbox.openSource')} →
        </a>
      </div>
    </>
  )
}
```

- [ ] **Step 4: TypeScript チェック**

Run:
```bash
rtk pnpm tsc --noEmit
```

Expected: 型エラーゼロ。 もし新規 prop drilling や string literal 関連のエラーが出たら、 既存パターンと照合して修正。

- [ ] **Step 5: vitest を走らせて既存テスト破壊が無いことを確認**

Run:
```bash
rtk pnpm vitest run
```

Expected: 全 pass。 Lightbox の DOM 構造変更で snapshot テストや selector テストが壊れていないか確認。 失敗があれば該当テストを精査して、 行動変更か selector 更新か判断。

- [ ] **Step 6: Commit**

```bash
rtk git add components/board/Lightbox.tsx
rtk git commit -m "feat(lightbox): add data-reveal-stage markers + move sourceLink into text components (I-07-#5)"
```

---

### Task 4: token reader helper 関数を追加

**Files:**
- Modify: `components/board/Lightbox.tsx` (file-level、 既存 `OPEN_BASE_DUR` 等の定数定義の **直後** あたり、 line ~70 付近)

- [ ] **Step 1: token reader helper を追加**

`components/board/Lightbox.tsx` の line 69 (`const CLOSE_FALLBACK_DUR = 0.3` の直後) に以下を追加:

```typescript
// =====================================================================
// I-07-#5: Lightbox text mask-reveal-up.
// CSS デザイントークン (--lightbox-text-reveal-*) を root から読み、
// GSAP timeline 用の数値 / string に変換。 デフォルト値は spec 同期。
// =====================================================================
type RevealTokens = {
  readonly duration: number      // seconds
  readonly stagger: number       // seconds
  readonly pause: number         // seconds
  readonly translateY: number    // px
  readonly easing: string        // gsap easing name
}

function readRevealTokens(): RevealTokens {
  if (typeof window === 'undefined') {
    return { duration: 0.5, stagger: 0.15, pause: 0.15, translateY: 18, easing: 'power3.out' }
  }
  const root = getComputedStyle(document.documentElement)
  const parse = (name: string, fallback: number): number => {
    const raw = root.getPropertyValue(name).trim()
    if (!raw) return fallback
    const n = parseFloat(raw)
    return Number.isFinite(n) ? n : fallback
  }
  const easing = root.getPropertyValue('--lightbox-text-reveal-easing').trim() || 'power3.out'
  return {
    duration: parse('--lightbox-text-reveal-duration', 0.5),
    stagger: parse('--lightbox-text-reveal-stagger', 0.15),
    pause: parse('--lightbox-text-reveal-pause', 0.15),
    translateY: parse('--lightbox-text-reveal-translate-y', 18),
    easing,
  }
}

// Helper: stage 要素を text panel から集める。 DOM 順 (document order) を
// querySelectorAll が保証するので、 `data-reveal-stage="1"` → `"2"` → `"3"`
// の順に並ぶ前提。 stage 2 / 3 が無いカードは要素自体が DOM に存在しないため
// 自動的に NodeList から落ちる → GSAP stagger が要素数分しか offset を刻まない
// → 欠損 stage の特殊処理は不要。
function collectStageEls(textEl: HTMLElement): HTMLElement[] {
  return Array.from(textEl.querySelectorAll<HTMLElement>('[data-reveal-stage]'))
}

// Helper: stage 要素群を初期状態 (不可視) にセット。 reduce-motion 時は
// mask + translate を省略、 opacity のみ 0 にする。
function setStageInitialState(els: HTMLElement[], translateY: number, prefersReduce: boolean): void {
  if (els.length === 0) return
  if (prefersReduce) {
    gsap.set(els, { opacity: 0 })
  } else {
    gsap.set(els, {
      opacity: 0,
      y: translateY,
      clipPath: 'inset(100% 0 0 0)',
    })
  }
}

// Helper: stage 要素群を順次 reveal する timeline を組む。
// timeline に追加する形なので、 既存 open / nav timeline の末尾に
// 差し込んで使う。
function appendRevealTimeline(
  tl: gsap.core.Timeline,
  els: HTMLElement[],
  tokens: RevealTokens,
  startAt: number,
  prefersReduce: boolean,
): void {
  if (els.length === 0) return
  const props = prefersReduce
    ? { opacity: 1, duration: tokens.duration, ease: tokens.easing, stagger: tokens.stagger }
    : {
        opacity: 1,
        y: 0,
        clipPath: 'inset(0 0 0 0)',
        duration: tokens.duration,
        ease: tokens.easing,
        stagger: tokens.stagger,
      }
  tl.to(els, props, startAt)
}

function getPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
```

- [ ] **Step 2: TypeScript チェック**

Run:
```bash
rtk pnpm tsc --noEmit
```

Expected: 型エラーゼロ

- [ ] **Step 3: Commit**

```bash
rtk git add components/board/Lightbox.tsx
rtk git commit -m "feat(lightbox): add reveal token reader + stage helpers (I-07-#5)"
```

---

### Task 5: open useLayoutEffect の text fade を mask reveal に置換

**Files:**
- Modify: `components/board/Lightbox.tsx` line ~633 (open useLayoutEffect 内、 `if (textEl) gsap.set(textEl, { opacity: 0 })` と `if (textEl) tl.to(textEl, ...)` の箇所)

- [ ] **Step 1: open useLayoutEffect の text fade を mask reveal に書き換える**

`components/board/Lightbox.tsx` の line 633 の以下のブロックを **書き換え**:

**Before** (line 633-634):
```typescript
      if (textEl) gsap.set(textEl, { opacity: 0 })
      if (closeEl) gsap.set(closeEl, { opacity: 0 })
```

**After:**
```typescript
      // I-07-#5: textPanel は stage 要素単位で mask-reveal-up する。
      // textEl 自身は opacity 1 のまま、 子の stage 要素を不可視にしておく。
      const revealTokens = readRevealTokens()
      const prefersReduce = getPrefersReducedMotion()
      const stageEls = textEl ? collectStageEls(textEl) : []
      if (textEl) gsap.set(textEl, { opacity: 1 })
      setStageInitialState(stageEls, revealTokens.translateY, prefersReduce)
      if (closeEl) gsap.set(closeEl, { opacity: 0 })
```

そして **次に**、 line 658-664 (chrome fade in for textEl) を **書き換え**:

**Before** (line 658-664):
```typescript
      const chromeAt = dur * OPEN_TEXT_FADE_DELAY_RATIO
      if (textEl) {
        tl.to(textEl, {
          opacity: 1,
          duration: OPEN_TEXT_FADE_DUR,
          ease: 'power2.out',
        }, chromeAt)
      }
      if (closeEl) {
        tl.to(closeEl, {
          opacity: 1,
          duration: OPEN_TEXT_FADE_DUR,
          ease: 'power2.out',
        }, chromeAt)
      }
```

**After:**
```typescript
      // I-07-#5: stage reveal timeline. textEl は既に opacity 1 で
      // 子の stage 要素が不可視状態。 media FLIP 着地 (= dur 経過) +
      // pause 経過後に stage 1/2/3 順次 reveal を発火。
      const textStartAt = dur + revealTokens.pause
      appendRevealTimeline(tl, stageEls, revealTokens, textStartAt, prefersReduce)
      // close ボタンは従来通り chromeAt で素フェード in (text と別系統)。
      const chromeAt = dur * OPEN_TEXT_FADE_DELAY_RATIO
      if (closeEl) {
        tl.to(closeEl, {
          opacity: 1,
          duration: OPEN_TEXT_FADE_DUR,
          ease: 'power2.out',
        }, chromeAt)
      }
```

- [ ] **Step 2: TypeScript チェック**

Run:
```bash
rtk pnpm tsc --noEmit
```

Expected: 型エラーゼロ

- [ ] **Step 3: vitest 走らせて既存テスト破壊が無いことを確認**

Run:
```bash
rtk pnpm vitest run
```

Expected: 全 pass

- [ ] **Step 4: Commit**

```bash
rtk git add components/board/Lightbox.tsx
rtk git commit -m "feat(lightbox): replace text fade with 3-stage mask-reveal-up on open (I-07-#5)"
```

---

### Task 6: close handler に stage 要素の kill を追加

**Files:**
- Modify: `components/board/Lightbox.tsx` line ~322 (close handler 内、 既存 `if (textEl) gsap.killTweensOf(textEl)` の直後)

- [ ] **Step 1: 既存 textEl kill の直後に stage 要素 kill を追加**

`components/board/Lightbox.tsx` の line 321-323 を以下に **書き換え**:

**Before** (line 321-323):
```typescript
      gsap.killTweensOf(mediaEl)
      if (textEl) gsap.killTweensOf(textEl)
      if (closeEl) gsap.killTweensOf(closeEl)
```

**After:**
```typescript
      gsap.killTweensOf(mediaEl)
      if (textEl) {
        gsap.killTweensOf(textEl)
        // I-07-#5: stage 要素の進行中 reveal tween も止める。
        // text パネル全体の opacity fade 後、 stage 要素の translateY や
        // clip-path が中途半端な状態で残ったまま unmount しても close 中は
        // textEl の opacity 0 で隠れているので視覚的に問題ない。
        const stageEls = collectStageEls(textEl)
        if (stageEls.length > 0) gsap.killTweensOf(stageEls)
      }
      if (closeEl) gsap.killTweensOf(closeEl)
```

- [ ] **Step 2: TypeScript チェック**

Run:
```bash
rtk pnpm tsc --noEmit
```

Expected: 型エラーゼロ

- [ ] **Step 3: Commit**

```bash
rtk git add components/board/Lightbox.tsx
rtk git commit -m "fix(lightbox): kill in-flight stage reveal tweens on close (I-07-#5)"
```

---

### Task 7: nav slide useLayoutEffect に reveal trigger を追加

**Files:**
- Modify: `components/board/Lightbox.tsx` line ~847-866 (nav useLayoutEffect 内、 entering tween 周辺)

- [ ] **Step 1: nav slide 開始時に新カード stage 要素を初期化、 slide 完了時に reveal 発火**

`components/board/Lightbox.tsx` の line 847-866 の entering tween ブロックを以下に **書き換え**:

**Before** (line 847-866):
```typescript
    // Entering animation on the real (newly mounted) frame.
    gsap.killTweensOf(el)
    gsap.fromTo(
      el,
      {
        x: dir * ENTER_DIST,
        z: ENTER_DEPTH,
        rotateY: dir * ROTATE_Y,
        opacity: 0,
        transformOrigin: '50% 50%',
      },
      {
        x: 0,
        z: 0,
        rotateY: 0,
        opacity: 1,
        duration: DUR,
        ease: 'power4.out',
      },
    )
  }, [identity, nav])
```

**After:**
```typescript
    // Entering animation on the real (newly mounted) frame.
    gsap.killTweensOf(el)

    // I-07-#5: 新カードの stage 要素を初期化 (不可視) し、 slide 完了後に
    // reveal timeline を発火させる。 連打 (rapid) で slide が短縮されても
    // pause + reveal は token 値そのまま — 連打中は slide が次々に
    // 立ち上がり、 ここまで来ない (前 useLayoutEffect 発火で kill される)
    // ので reveal は最後の slide 完了時にしか走らない。
    const newTextEl = textRef.current
    const revealTokens = readRevealTokens()
    const prefersReduce = getPrefersReducedMotion()
    const newStageEls = newTextEl ? collectStageEls(newTextEl) : []
    // 進行中 reveal を kill (前カード残骸対策)
    if (newStageEls.length > 0) gsap.killTweensOf(newStageEls)
    setStageInitialState(newStageEls, revealTokens.translateY, prefersReduce)

    gsap.fromTo(
      el,
      {
        x: dir * ENTER_DIST,
        z: ENTER_DEPTH,
        rotateY: dir * ROTATE_Y,
        opacity: 0,
        transformOrigin: '50% 50%',
      },
      {
        x: 0,
        z: 0,
        rotateY: 0,
        opacity: 1,
        duration: DUR,
        ease: 'power4.out',
        onComplete: () => {
          // slide 着地後 + pause を待って reveal 発火。
          // gsap.delayedCall は内部でフレームに乗るので、 識別子変化や
          // 次 slide が来た場合は次の useLayoutEffect で kill される。
          const tl = gsap.timeline({ delay: revealTokens.pause })
          appendRevealTimeline(tl, newStageEls, revealTokens, 0, prefersReduce)
        },
      },
    )
  }, [identity, nav])
```

- [ ] **Step 2: TypeScript チェック**

Run:
```bash
rtk pnpm tsc --noEmit
```

Expected: 型エラーゼロ

- [ ] **Step 3: vitest 走らせて既存テスト破壊が無いことを確認**

Run:
```bash
rtk pnpm vitest run
```

Expected: 全 pass

- [ ] **Step 4: Commit**

```bash
rtk git add components/board/Lightbox.tsx
rtk git commit -m "feat(lightbox): re-fire mask-reveal-up on nav slide landing (I-07-#5)"
```

---

### Task 8: 統合チェック (tsc + vitest 全部)

**Files:** なし (品質ゲート)

- [ ] **Step 1: TypeScript チェック全体**

Run:
```bash
rtk pnpm tsc --noEmit
```

Expected: 型エラーゼロ

- [ ] **Step 2: vitest 全体実行**

Run:
```bash
rtk pnpm vitest run
```

Expected: 全 pass

- [ ] **Step 3: lint チェック (任意、 既存パターンとの一貫性)**

Run:
```bash
rtk pnpm lint
```

Expected: 既存と同程度の warning レベル (新規エラー無し)

- [ ] **Step 4: ファイル変更状況確認**

Run:
```bash
rtk git status
rtk git log --oneline -7
```

Expected: 直近 7 commit に Task 1-7 が並ぶ、 working tree clean

(コミット無しなのでこのステップでの commit は不要)

---

### Task 9: 本番 deploy + ユーザー視覚承認 gate

**Files:** なし (deploy + 検証)

- [ ] **Step 1: ビルド**

Run:
```bash
rtk pnpm build
```

Expected: ビルド成功、 `out/` ディレクトリ生成

- [ ] **Step 2: Cloudflare Pages へ deploy**

Run:
```bash
npx wrangler pages deploy out/ --project-name=booklage --branch=master --commit-dirty=true --commit-message="I-07-#5 text mask-reveal-up deploy"
```

Expected: `https://booklage.pages.dev` に反映 (Deployment complete メッセージ)

- [ ] **Step 3: ユーザーに視覚確認を依頼 (Test plan 1-8 全項目)**

ユーザーに以下のメッセージを出す:

```
I-07-#5 Lightbox text mask-reveal-up を本番に deploy 完了しました。
booklage.pages.dev をハードリロード (Ctrl+Shift+R) して、 以下を体感してください:

1. 任意のカード (タイトル + 説明 + meta あり) を開く
   → media が着地後、 見出し → 本文 → meta+CTA の順で下から滑り込む
2. タイトルのみのカード (説明・meta 無し) を開く
   → 見出し → CTA の 2 段で滑り込む (stage 2 は自動スキップ)
3. Instagram カード / Tweet カードを開く
   → 各 type で 3 段 reveal
4. 矢印で次カードに切替
   → slide 着地後に新カードの text が reveal
5. 矢印を連打
   → 連打中は text 不可視、 止まった瞬間に reveal
6. ✕ / Esc / backdrop で閉じる
   → text が素早く fade out、 もたつかない
7. (任意) Chrome DevTools の Rendering タブで
   "Emulate CSS prefers-reduced-motion: reduce" を ON → 開く
   → mask は無効化、 opacity fade のみで stagger 出る

OK or 違和感 (テンポ早い / 遅い / 距離変えたい等) を教えてください。
数値調整は globals.css の 5 行を書き換えれば即反映できます。
```

- [ ] **Step 4: ユーザー承認後の cleanup**

ユーザーが OK と返したら:
- `docs/TODO.md` § I-07 Phase 1 から I-07-#5 entry を削除
- `docs/TODO_COMPLETED.md` に narrative 追記
- `docs/CURRENT_GOAL.md` を次のタスクで上書き (D 候補 = B-#1/#2/#3 サムネ系 or E 候補 = sizing 哲学 Phase 2)

各更新後:

```bash
rtk git add docs/TODO.md docs/TODO_COMPLETED.md docs/CURRENT_GOAL.md
rtk git commit -m "docs(session-19): close out — text mask-reveal-up shipped (I-07-#5)"
```

ユーザーから「数値調整したい」 等の指示があれば、 globals.css の該当変数を編集して再 deploy。

---

## Notes for Implementer

### 既存コードとの整合性

- token 名は spec で確定済 (`--lightbox-text-reveal-*`)。 既存 `--card-hover-swap-*` と命名規則を揃えてある (機能 prefix + 用途 suffix)
- helper 関数は file-level (export しない)、 既存の `OPEN_BASE_DUR` 等の定数定義部と同居
- DOM 構造変更は data 属性追加 + 1 wrapper のみ。 既存 CSS selector や JSX prop 名は変えない
- close 時の textEl 全体 opacity 0 tween (既存 line 328-334) は **変えない**。 stage 要素の個別 reverse animation は無し (spec 確定)
- prefers-reduced-motion 分岐は helper 関数の中で 1 箇所だけ。 GSAP timeline 側に if 分岐は持ち込まない

### 自動スキップの仕組み (おさらい)

stage 2 や stage 3 の要素が DOM に存在しないカード (例: Tweet で meta 無し) では `querySelectorAll('[data-reveal-stage]')` の返り値長さが減る → GSAP `stagger` は要素数分しか offset を刻まないため、 stage 1 → stage 3 の場合は実時間で stage 1(t=0) → stage 3(t=stagger) になる。 全 stage 揃ったカードでは stage 1(t=0) → stage 2(t=stagger) → stage 3(t=2*stagger) になる。

### Edge case: text コンポーネント内 sourceLink の i18n キー

`t('board.lightbox.openSource')` は元の main render と同じ key。 messages/ ディレクトリ側の翻訳 entry は変えない (既に存在する key を使うだけ)。

### Edge case: TweetText が ReactNode 戻り

TweetText は元から ReactNode を返している (Fragment + 条件分岐)。 wrapper `<div className={styles.metaCtaGroup}>` を追加しても戻り型は変わらない。

### コードレビュー視点 (self-review 用)

- `collectStageEls` の戻り順序が常に [stage 1, stage 2, stage 3] になるか? → JSX 側で `data-reveal-stage` 属性付き要素を DOM 順で 1 → 2 → 3 の順に並べているので OK
- `setStageInitialState` を毎回 fresh stage 要素に呼ぶか? → open useLayoutEffect (Task 5) と nav useLayoutEffect (Task 7) の両方で呼ぶように設計
- nav useLayoutEffect の `newStageEls` は新しい frame の text panel (= 新カード) の要素を指すか? → identity 変化後の DOM なので新しい要素。 React の reconciliation で `<div ref={textRef}>` 自体は同じ ref を使い続けるが、 中の child 要素 (h1, p 等) は識別子変化で新 mount される

---

## Spec coverage check (self-review)

Spec の各セクションに対応 task:

| Spec 章 | 対応 task |
|---|---|
| アーキ Before/After | Task 1 (tokens), Task 5/7 (timeline 書き換え) |
| DOM 構造 (data-reveal-stage + wrapper) | Task 2 (CSS class), Task 3 (JSX) |
| デザイントークン 5 個 | Task 1 |
| CSS 詳細 `.metaCtaGroup` | Task 2 |
| GSAP timeline open | Task 4 (helper), Task 5 (open) |
| GSAP timeline close | Task 6 (kill 追加、 既存 fade は維持) |
| GSAP timeline nav | Task 4 (helper), Task 7 (nav) |
| 想定挙動 — Default 全部 | Task 3 (stage 属性), Task 5 (timeline) |
| 想定挙動 — Default 短 / Tweet / Instagram | Task 3 (条件付き要素は自動スキップ) |
| 想定挙動 — close | Task 6 (kill) + 既存 close 維持 |
| 想定挙動 — nav 切替 / 連打 | Task 7 (onComplete reveal + 進行中 kill) |
| prefers-reduced-motion | Task 4 (helper) で分岐、 Task 5/7 が利用 |
| Test plan 1-8 視覚確認 | Task 9 |
| Test plan 9-10 tsc + vitest | Task 8 |
| 影響範囲外 (media FLIP / backdrop / close button fade) | 変更せず、 既存維持 |
| 想定リスク (clip-path 互換性) | Task 9 視覚確認で間接的に検証 |
| 想定リスク (nav DOM 再 mount) | Task 6/7 の kill 強化で対応 |

placeholder / TBD / TODO ゼロ。 全 step に実コードまたは実コマンド有り。 ✓
