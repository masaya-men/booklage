# I-07-#2 hover swap polish + brightness lift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current instant src-swap on board card hover with a 380ms cross-fade across stacked `<img>` layers, and add a destefanis-style `filter: brightness(1.08)` lift on hover.

**Architecture:** Each MediaSlot renders as its own absolutely-positioned `<img>` layer stacked inside the card. Active layer (matching `imageIdx`) gets `data-active="true"` → `opacity: 1`; others stay at `opacity: 0`. A single CSS transition handles both the cross-fade and the hover brightness lift. Three CSS Custom Properties on `:root` (`--card-hover-swap-duration`, `--card-hover-swap-easing`, `--card-hover-lift-brightness`) make tuning a single-line edit. The existing `preloadedRef` + first-hover `new Image()` cache primer is removed — browser-native `loading="lazy"` on the img layers replaces it.

**Tech Stack:** Next.js 14 App Router · TypeScript strict · vanilla CSS modules · vitest · Playwright

**Spec:** [docs/superpowers/specs/2026-05-12-hover-swap-polish-design.md](../specs/2026-05-12-hover-swap-polish-design.md)

**Scope:** Board ImageCard only. Does NOT touch Lightbox (which already has its own carousel transitions) or TextCard / TweetCard variants. Instagram Reel cards opt out of the hover lift (brightness baseline conflict).

---

## File Structure

**Create:** none

**Modify:**
- `app/globals.css` — add 3 CSS Custom Properties to the existing `:root` block (in the `=== destefanis pivot (2026-04-21) ===` section after `--card-radius: 24px`)
- `components/board/cards/ImageCard.module.css` — restructure `.thumb` for absolute-positioned layered stack + cross-fade transition; add hover brightness lift rule that excludes `.thumbInstagramReel`
- `components/board/cards/ImageCard.tsx` — replace single `<img>` rendering with a `slots.map(...)` layered stack; remove the `preloadedRef` + first-hover preload loop in `handlePointerMove`; attach `imgRef` to slot 0 only
- `tests/e2e/board-mixed-media.spec.ts` — UPDATE the existing "board hover swaps thumb" assertion to check `data-active` on the matching layer instead of `.first()` img's `src`; ADD a new test verifying the brightness lift filter is applied on hover

---

## Task 1: Add 3 CSS design tokens to globals.css

**Files:**
- Modify: `app/globals.css` (insert after `--card-radius: 24px;` inside the `:root` block)

- [ ] **Step 1: Add the tokens**

Open `app/globals.css`, locate the line `--card-radius: 24px;` inside the `:root` block (around line 326). Insert the following directly below it (before `--lightbox-media-radius`):

```css
  /* === card hover micro-interaction (I-07-#2) ===
     Cross-fade duration + easing shared by the multi-slot hover swap
     (opacity transition on layered <img>s) AND the destefanis-style
     :hover brightness lift. Tunable in one place. */
  --card-hover-swap-duration: 380ms;
  --card-hover-swap-easing: ease-out;
  --card-hover-lift-brightness: 1.08;
```

- [ ] **Step 2: Verify tokens are present**

Run: `rtk grep -F "card-hover-swap-duration" app/globals.css`
Expected output: one line showing the new token definition.

- [ ] **Step 3: TypeScript still compiles**

Run: `rtk tsc --noEmit`
Expected: `TypeScript compilation completed` with no errors.

- [ ] **Step 4: Commit**

```bash
rtk git add app/globals.css
rtk git commit -m "$(cat <<'EOF'
feat(tokens): add card hover micro-interaction CSS vars

Prepares 3 tunable design tokens (--card-hover-swap-duration / -easing
/ -lift-brightness) used by the upcoming ImageCard cross-fade + lift
polish. No visual change yet — only ImageCard.module.css references
these vars, and that lands in the next commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Write the failing e2e tests

The new behavior is observable by Playwright (DOM attribute toggling + computed-style brightness). We write the tests first so they fail against the current implementation, then implement the change to make them pass.

**Files:**
- Modify: `tests/e2e/board-mixed-media.spec.ts` (update existing test + add new test)

- [ ] **Step 1: Update the existing hover-swap assertion to check `data-active` instead of `.first()` src**

Open `tests/e2e/board-mixed-media.spec.ts`. Locate the test starting at line 71:
`test('board hover swaps thumb across video poster → photo1 → photo2', ...)`.

Replace its body (the entire function passed to `test()`, NOT the test name) with:

```typescript
test('board hover swaps thumb across video poster → photo1 → photo2', async ({ page }) => {
  const card = page.locator(`[data-bookmark-id="${MIX_BOOKMARK_ID}"]`)
  await expect(card).toBeVisible()
  const box = await card.boundingBox()
  if (!box) throw new Error('card has no boundingBox')

  const layers = card.locator('img')
  await expect(layers).toHaveCount(3)

  // Move pointer to leftmost third → slot 0 (video poster) active.
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2)
  await expect(layers.nth(0)).toHaveAttribute('data-active', 'true')
  await expect(layers.nth(1)).not.toHaveAttribute('data-active', 'true')
  await expect(layers.nth(2)).not.toHaveAttribute('data-active', 'true')

  // Middle third → slot 1 (photo a) active.
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2)
  await expect(layers.nth(1)).toHaveAttribute('data-active', 'true')
  await expect(layers.nth(0)).not.toHaveAttribute('data-active', 'true')

  // Right third → slot 2 (photo b) active.
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2)
  await expect(layers.nth(2)).toHaveAttribute('data-active', 'true')
  await expect(layers.nth(1)).not.toHaveAttribute('data-active', 'true')

  // Layer srcs are stable across hover (one img per slot).
  await expect(layers.nth(0)).toHaveAttribute('src', /poster\.jpg/)
  await expect(layers.nth(1)).toHaveAttribute('src', /a\.jpg/)
  await expect(layers.nth(2)).toHaveAttribute('src', /b\.jpg/)

  // 3 dots present, video slot has data-slot-type='video'.
  const dots = card.getByTestId('multi-image-dot')
  await expect(dots).toHaveCount(3)
  await expect(dots.first()).toHaveAttribute('data-slot-type', 'video')
})
```

- [ ] **Step 2: Add a new test for the hover brightness lift**

In the same file, add this test directly after the test you just updated (before the existing `'Lightbox carousel:...'` test):

```typescript
test('hover applies brightness lift filter to the active layer only', async ({ page }) => {
  const card = page.locator(`[data-bookmark-id="${MIX_BOOKMARK_ID}"]`)
  await expect(card).toBeVisible()
  const box = await card.boundingBox()
  if (!box) throw new Error('card has no boundingBox')

  // Without hover, no brightness filter is applied.
  const cleanFilter = await card.locator('img').nth(0).evaluate(
    (el) => window.getComputedStyle(el).filter,
  )
  expect(cleanFilter).toMatch(/^(none|)$/)

  // Hover the card. The active layer (slot 0 by default) should now have
  // a brightness filter applied via :hover.
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2)
  await expect(card.locator('img[data-active="true"]')).toHaveCount(1)
  const liftedFilter = await card.locator('img[data-active="true"]').evaluate(
    (el) => window.getComputedStyle(el).filter,
  )
  expect(liftedFilter).toContain('brightness')
})
```

- [ ] **Step 3: Run tests and verify they FAIL (current code lacks `data-active`)**

Run: `pnpm playwright test tests/e2e/board-mixed-media.spec.ts --reporter=line`
Expected: the updated test and the new test FAIL. The failure mode for the updated test is "expected layer count 3, received 1" (current code has a single img). The failure for the new lift test is similar — there is no `img[data-active="true"]` selector match.

If they pass against the current code, the test is wrong (probably a typo in the selector). Re-read the test against the spec before continuing.

**No commit yet** — failing tests stay uncommitted until the implementation lands.

---

## Task 3: Update ImageCard.module.css with layered stack + hover lift

**Files:**
- Modify: `components/board/cards/ImageCard.module.css`

- [ ] **Step 1: Replace the `.thumb` rule with the layered version**

Open `components/board/cards/ImageCard.module.css`. Locate the existing `.thumb` block (lines 12-19):

```css
.thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  user-select: none;
  -webkit-user-drag: none;
}
```

Replace it with:

```css
.thumb {
  /* I-07-#2: each MediaSlot renders as its own absolutely-positioned
   * layer. Only the layer with data-active="true" is opaque; the rest
   * sit at opacity 0 and cross-fade in/out via the shared duration token. */
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

/* destefanis-style affordance: hover gently brightens the active layer.
 * Excluded for Instagram Reel cards because their .thumbInstagramReel
 * baseline filter (brightness 0.86) and our lift would compose into a
 * muddled mid-brightness that fights the radial tint. */
.imageCard:hover .thumb[data-active='true']:not(.thumbInstagramReel) {
  filter: brightness(var(--card-hover-lift-brightness));
}
```

- [ ] **Step 2: Verify CSS file is syntactically valid by running tsc**

Run: `rtk tsc --noEmit`
Expected: `TypeScript compilation completed`. (tsc resolves CSS module type imports; if the .module.css file is broken the type-only `styles.thumb` lookup may still resolve since CSS Modules typing is permissive, but a build-level syntax issue would surface in `pnpm build` later — we'll catch it there.)

**No commit yet** — JSX still references the single-img layout.

---

## Task 4: Update ImageCard.tsx to render layered slot stack

**Files:**
- Modify: `components/board/cards/ImageCard.tsx`

- [ ] **Step 1: Replace the JSX return body with the layered stack**

Open `components/board/cards/ImageCard.tsx`. Locate the existing return statement (lines 109-143):

```typescript
return (
  <div
    ref={cardRef}
    className={styles.imageCard}
    onPointerMove={handlePointerMove}
    onPointerLeave={handlePointerLeave}
  >
    {displayedSrc && (
      <img
        ref={imgRef}
        className={thumbClass}
        src={displayedSrc}
        alt={item.title}
        draggable={false}
        loading="lazy"
      />
    )}
    {/* Reel-only tint... */}
    {isReel && <div className={styles.tintInstagramReel} aria-hidden="true" />}
    {hasMultiple && (
      <div className={styles.multiImageDots} aria-hidden="true">
        {slots.map((s, i) => (
          <span
            key={i}
            data-testid="multi-image-dot"
            data-active={i === imageIdx ? 'true' : 'false'}
            data-slot-type={s.type}
            className={styles.multiImageDot}
          />
        ))}
      </div>
    )}
  </div>
)
```

Replace with:

```typescript
return (
  <div
    ref={cardRef}
    className={styles.imageCard}
    onPointerMove={handlePointerMove}
    onPointerLeave={handlePointerLeave}
  >
    {slots.length > 0 ? (
      slots.map((slot, i) => (
        <img
          key={slot.url}
          ref={i === 0 ? imgRef : undefined}
          className={thumbClass}
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
          className={thumbClass}
          src={item.thumbnail}
          alt={item.title}
          draggable={false}
          loading="lazy"
          data-active="true"
        />
      )
    )}
    {/* Reel-only tint dims the area where IG's printed play icon usually
        sits, neutralising it without adding our own loud overlay. */}
    {isReel && <div className={styles.tintInstagramReel} aria-hidden="true" />}
    {hasMultiple && (
      <div className={styles.multiImageDots} aria-hidden="true">
        {slots.map((s, i) => (
          <span
            key={i}
            data-testid="multi-image-dot"
            data-active={i === imageIdx ? 'true' : 'false'}
            data-slot-type={s.type}
            className={styles.multiImageDot}
          />
        ))}
      </div>
    )}
  </div>
)
```

Note the two branches:
- `slots.length > 0` — multi-slot or single-slot synthetic from `photos[]` or `mediaSlots[]`. Each renders as a layer.
- otherwise — pure single-thumbnail fallback (no `slots[]` derived). Still gets `data-active="true"` so the brightness lift fires on hover.

- [ ] **Step 2: Remove the `preloadedRef` + first-hover preload loop from handlePointerMove**

In the same file, locate `handlePointerMove` (around lines 50-74). The current implementation contains a `preloadedRef.current` check and an `Image()`-based preload loop. Replace the entire `handlePointerMove` declaration with:

```typescript
const handlePointerMove = useCallback(
  (e: PointerEvent<HTMLDivElement>): void => {
    if (!hasMultiple) return
    const el = cardRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return
    const raw = (e.clientX - rect.left) / rect.width
    const ratio = raw < 0 ? 0 : raw > 1 ? 1 : raw
    const rawIdx = Math.floor(ratio * slots.length)
    const idx = rawIdx >= slots.length ? slots.length - 1 : rawIdx < 0 ? 0 : rawIdx
    setImageIdx((prev) => (prev === idx ? prev : idx))
  },
  [hasMultiple, slots.length],
)
```

- [ ] **Step 3: Remove the now-unused `preloadedRef` declaration**

In the same file, locate `preloadedRef` (around line 27):

```typescript
const preloadedRef = useRef<boolean>(false)
```

Delete this line and the comment block immediately above it that explains the lazy preload rationale (the 5 lines starting `// I-07: lazy-preload all photos on first hover.`). The replacement reasoning lives in the spec under "副次効果" + "帯域トレードオフの明記".

- [ ] **Step 4: Remove the now-unused `displayedSrc` computation**

In the same file, locate (around line 48):

```typescript
const displayedSrc = hasMultiple ? slots[imageIdx].url : item.thumbnail
```

Delete this line. The JSX no longer references `displayedSrc` — slot URLs come straight from `slots[i].url` in the map, and the fallback branch uses `item.thumbnail` directly.

- [ ] **Step 5: Run tsc to verify the rewrite compiles**

Run: `rtk tsc --noEmit`
Expected: `TypeScript compilation completed` with no errors. If `preloadedRef` is referenced anywhere else, tsc will flag it — delete those references.

- [ ] **Step 6: Run the e2e tests and verify they PASS**

Run: `pnpm playwright test tests/e2e/board-mixed-media.spec.ts --reporter=line`
Expected: all tests in this file PASS — including the two from Task 2.

If a test fails:
- "expected layer count 3, received N" with N > 3 → the synthetic single-photo fallback may be activating in addition to slots; re-check the JSX branching logic
- "expected data-active='true', received null" → check that `data-active={i === imageIdx ? 'true' : undefined}` syntax is correct (React strips false/undefined attribute values; we want `true` or absent)
- "expected filter to contain 'brightness', received 'none'" → check the CSS `:hover` selector matches; try opening browser devtools and inspecting the card mid-hover

- [ ] **Step 7: Run vitest to verify unit tests still pass**

Run: `rtk vitest run`
Expected: `PASS (453) FAIL (0)` (or higher pass count; failures = regression).

- [ ] **Step 8: Run the rest of the e2e suite to check for regression**

Run: `pnpm playwright test --reporter=line`
Expected: all tests PASS. If `lightbox-video-flip-regression.spec.ts` or `save-iframe.spec.ts` start to fail, that points to JSX changes affecting unrelated rendering. Re-inspect the JSX diff.

- [ ] **Step 9: Commit the feature in one coherent commit**

```bash
rtk git add components/board/cards/ImageCard.tsx components/board/cards/ImageCard.module.css tests/e2e/board-mixed-media.spec.ts
rtk git commit -m "$(cat <<'EOF'
feat(board): cross-fade hover swap + destefanis brightness lift

Stacks all MediaSlot URLs as absolutely-positioned <img> layers and
toggles opacity via data-active. Adds :hover brightness(1.08) lift on
the active layer (excluded for Instagram Reel cards so it doesn't
fight their baseline 0.86 brightness tint). Three shared CSS vars
make duration / easing / lift-brightness one-line-tunable.

Removes the preloadedRef + manual first-hover Image() loop — browser-
native loading="lazy" handles preloading once the card is near
viewport.

E2E coverage: existing mix-tweet swap test rewritten to check
data-active toggle; new test verifies the brightness filter is
applied via :hover.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Visual approval gate (UI design rule)

Per `.claude/rules/ui-design.md`, UI-visible changes require user approval before deploy. This task runs locally, captures a representative screenshot/video, and lets the user confirm the feel matches their pick (380ms cross-fade + 8% brightness lift).

**Files:** none (manual review)

- [ ] **Step 1: Start the dev server**

Run in background: `pnpm dev`

Wait for it to log `Ready in Xms` and `Local: http://localhost:3000`.

- [ ] **Step 2: Open the board in the user's browser**

Tell the user: open `http://localhost:3000/board`, hover a card that has multiple slots (any mix tweet or multi-photo tweet), and move the cursor left → middle → right slowly across the card. You should see the image cross-fade between slots over ~380ms, and the active image should brighten very slightly on hover.

- [ ] **Step 3: Capture a screenshot for the record**

Ask the user to take a quick screenshot (or screen recording — better) of the hover behavior, and share it. Save context: which cards, what board state.

- [ ] **Step 4: Confirm with user**

Ask the user: "feel right at 380ms / brightness 1.08? Or want to tweak either number?"

If they want to tune:
- Edit `app/globals.css` `:root` values for `--card-hover-swap-duration` (try 280ms snappier, 480ms slower) or `--card-hover-lift-brightness` (try 1.04 subtle, 1.12 stronger)
- Re-test locally
- Re-confirm with user
- Amend the tokens commit OR add a separate `chore(tokens): tune ...` commit, whichever the user prefers

- [ ] **Step 5: Stop the dev server**

In the background process, send SIGINT (Ctrl+C) or kill the bash task. (If launched via run_in_background, use the task ID to stop.)

---

## Task 6: Rotate session docs (mark task complete)

**Files:**
- Modify: `docs/TODO.md` — remove I-07-#2 from active backlog
- Modify: `docs/TODO_COMPLETED.md` — add session 18 narrative for hover swap polish
- Modify: `docs/CURRENT_GOAL.md` — set next session goal (C: Lightbox text panel reveal, or D: thumbnail bugs)

- [ ] **Step 1: Remove I-07-#2 entry from TODO.md**

Open `docs/TODO.md`. Find the section `### I-07 Phase 1 改善案件`. Delete the line:
```
- **I-07-#2 hover 切替演出のリッチ化** — cross-fade / blur / zoom-pan / GSAP micro animation
```

- [ ] **Step 2: Update §現在の状態 in TODO.md**

In the same file, update the "直近の本番状態" section's commit summary line to include the hover swap polish work.

- [ ] **Step 3: Append session 18 task B narrative to TODO_COMPLETED.md**

Open `docs/TODO_COMPLETED.md`. Below the existing session 18 section (which currently only covers task A), add an entry under the same session 18 heading describing the hover swap polish work: layered architecture, 3 tokens, brightness lift, Reel exclusion, deferred B1 multi-playback compatibility note, e2e test coverage. Reference the spec file path.

- [ ] **Step 4: Overwrite CURRENT_GOAL.md for session 19**

Replace the contents of `docs/CURRENT_GOAL.md` with a fresh handoff. The new "next session" candidates are:
- **C** Lightbox text panel mask-reveal-up animation (Phase A 忠実コピー方針、 destefanis 本家挙動要確認 — Claude should re-check destefanis source before implementing)
- **D** Thumbnail bug fixes (B-#1 / #2 / #3)
- **E** Sizing migration Phase 2-6

Recommend C if destefanis has the reveal animation, otherwise D.

- [ ] **Step 5: Commit docs rotation**

```bash
rtk git add docs/TODO.md docs/TODO_COMPLETED.md docs/CURRENT_GOAL.md
rtk git commit -m "$(cat <<'EOF'
docs(session-18): close out — hover swap polish done, rotate goal

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Deploy to production

Per CLAUDE.md, production deploy on Cloudflare Pages costs nothing for direct upload and is encouraged at session end.

**Files:** none

- [ ] **Step 1: Build the static export**

Run: `rtk pnpm build`
Expected: build completes, `out/` directory populated. Watch for any new tsc errors that slipped past `--noEmit` (Next.js does additional checks during build).

- [ ] **Step 2: Deploy with wrangler**

Run: `npx wrangler pages deploy out/ --project-name=booklage --branch=master --commit-dirty=true --commit-message="hover swap polish session 18"`
Expected: `✨ Success! Uploaded N files (Xs)` and a deployment URL.

The `--commit-message` flag is required when the local git commit body contains non-ASCII (Japanese) characters — wrangler reject Japanese git messages directly. ASCII override here.

The `--branch=master` flag is required so the deployment hits `booklage.pages.dev` (the user's bookmark anchor). Without it, deploy goes to a branch-named preview URL and the user's IndexedDB bookmarks appear missing.

- [ ] **Step 3: Confirm deploy reached production**

Tell the user: "deployed. Hard-reload `https://booklage.pages.dev` and confirm the hover cross-fade + brightness lift is live."

If something looks off in production but worked locally, the most likely cause is a stale Cloudflare cache — ask the user to hard-reload (Ctrl+Shift+R) before debugging.

---

## Self-Review Notes

Spec coverage check:
- ✅ Layered img stack — Task 4 Step 1
- ✅ 3 CSS tokens — Task 1
- ✅ Cross-fade transition CSS — Task 3
- ✅ Hover lift on active layer — Task 3
- ✅ Reel exclusion via `:not(.thumbInstagramReel)` — Task 3
- ✅ Remove preloadedRef + preload loop — Task 4 Step 2-3
- ✅ Remove displayedSrc — Task 4 Step 4
- ✅ Keep imgRef on layer 0 only — Task 4 Step 1
- ✅ E2E test update + new lift test — Task 2 + Task 4 Step 6
- ✅ Visual approval gate — Task 5
- ✅ Bandwidth note: only documented, no implementation diff (acceptable per spec)
- ✅ Future-readiness: layered arch is forward-compatible, no implementation work needed

No TBD / placeholder strings in the plan. Type consistency: `data-active='true'` is used uniformly in JSX, CSS, and tests; `slots[i].url` matches the existing `MediaSlot` type from `lib/embed/types.ts`.
