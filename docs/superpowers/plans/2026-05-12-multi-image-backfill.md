# 複数画像 (mediaSlots) 3 段防御 backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** X (Twitter) 投稿のブクマで、 保存ボタンを押した瞬間から複数画像 / 動画の hover 切替が効くようにする (Phase A)。 既存 v12 ブクマも、 board mount 直後にユーザー無自覚で裏で完成させる (Phase B)。 Lightbox open 時の救済 (Phase C) は既存維持で網のすり抜けを拾う。

**Architecture:** Phase A は extension 経路 (`SaveIframeClient.tsx`) で `addBookmark` 成功直後に syndication を fire-and-forget。 Phase B は専用 rate-limit キュー (`lib/board/backfill-queue.ts`: 並列 3 / 200ms 間隔 / AbortController) と統合 backfill 関数 (`lib/board/tweet-backfill.ts`: thumbnail + hasVideo + mediaSlots を 1 fetch で済ませる) を新設し、 BoardRoot.tsx に現存する `processedTweetIdsRef` の sequential loop を完全置換する。 Phase C は前提プラン (`2026-05-12-mixed-media-tweet.md`) Task 8 で既に persistMediaSlots 化済。

**Tech Stack:** Next.js 14 App Router · TypeScript strict · vitest · Playwright · Cloudflare Pages Functions

**Spec:** [docs/superpowers/specs/2026-05-12-multi-image-backfill-design.md](../specs/2026-05-12-multi-image-backfill-design.md)

**前提:** mixed-media-tweet plan ([2026-05-12-mixed-media-tweet.md](./2026-05-12-mixed-media-tweet.md)) を先に完了していること。 `persistMediaSlots` / `BookmarkRecord.mediaSlots` / `MediaSlot` 型などを本プランが利用する。

**Scope:** X (Twitter) のみ。 Bluesky・Mastodon、 filter 変更時の追加 backfill、 削除済ブクマの再 fetch は非ゴール (spec §6 / §1)。

**Phase A の経路カバレッジ (spec §4-1 からの設計上の調整):**
- ✅ extension 経路 (`SaveIframeClient.tsx`) — fire-and-forget OK
- ⚠️ bookmarklet popup 経路 (`components/bookmarklet/SaveToast.tsx`) — addBookmark 完了後 80ms で `window.close()` される (`FAST_CLOSE_MS`)。 syndication fetch は window unload で kill されるため信頼性が低い。 **Phase A 対象から除外、 Phase B が次回 board mount で拾う設計とする**。 spec §4-1 では popup でも fire-and-forget するよう書かれているが、 実装現実として保留。 ユーザー体験への影響: 拡張未導入で bookmarklet 単体ユーザーが新規 X tweet を保存 → 次に board を開くまで mediaSlots は IDB に書かれない → 1 セッションのタイムラグ。 これは「ユーザー意識せず裏で完成」 設計と矛盾しない。

---

## File Structure

**Create:**
- `lib/board/backfill-queue.ts` — 並列 3 / 200ms interval / AbortController 対応の汎用 rate-limit キュー
- `lib/board/tweet-backfill.ts` — 1 ブクマ分の tweet meta 取得 + 3 field 同時 persist (thumbnail / hasVideo / mediaSlots)
- `tests/lib/backfill-queue.test.ts` — キューの並列度 + interval + cancel 動作 unit test
- `tests/lib/tweet-backfill.test.ts` — 取得後の 3 field 同時 persist + 失敗時 silent fail unit test
- `tests/e2e/board-backfill.spec.ts` — v12 photos のみ seed → board mount → 5 秒以内に mediaSlots backfilled を verify

**Phase A (extension flow) の自動 e2e は本プランで作らない**: Playwright harness で chrome extension を load + SaveIframeClient 経由のメッセージ送信を再現するのはセッション 9-14 で時間対効果が低いと判定済 (実機検証で代替)。 Task 7 Step 6 のユーザー手動確認ステップでカバーする。

**Modify:**
- `components/board/BoardRoot.tsx` — 既存 tweet meta sequential loop (lines 634-688) を新キュー + tweet-backfill ベースに置換、 AbortController に統合
- `app/save-iframe/SaveIframeClient.tsx` — Phase A: addBookmark 直後の fire-and-forget syndication fetch を追加 (X tweet のみ)
- `functions/api/tweet-meta.ts:72` — `s-maxage=3600` → `s-maxage=86400` に延長 (Cloudflare edge cache 24h、 spec §5-2)

---

## Task 1: backfill-queue.ts — rate-limit キュー実装

**Files:**
- Create: `lib/board/backfill-queue.ts`
- Create: `tests/lib/backfill-queue.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/backfill-queue.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { createBackfillQueue } from '@/lib/board/backfill-queue'

const tick = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

describe('createBackfillQueue', () => {
  it('respects maxConcurrent = 3 (max 3 in-flight at any time)', async () => {
    const inFlight: number[] = []
    let maxObserved = 0
    let live = 0
    const q = createBackfillQueue({ maxConcurrent: 3, minIntervalMs: 0 })

    const tasks = Array.from({ length: 12 }).map((_, i) =>
      q.add(async () => {
        live++
        maxObserved = Math.max(maxObserved, live)
        inFlight.push(i)
        await tick(20)
        live--
      }),
    )

    await Promise.all(tasks)
    expect(maxObserved).toBe(3)
    expect(inFlight.length).toBe(12)
  })

  it('respects minIntervalMs between task dispatches', async () => {
    const dispatchTimes: number[] = []
    const q = createBackfillQueue({ maxConcurrent: 1, minIntervalMs: 50 })

    const tasks = Array.from({ length: 4 }).map(() =>
      q.add(async () => {
        dispatchTimes.push(performance.now())
        await tick(5)
      }),
    )
    await Promise.all(tasks)

    // Consecutive dispatches should be >= 50ms apart (allow 5ms scheduling jitter).
    for (let i = 1; i < dispatchTimes.length; i++) {
      const gap = dispatchTimes[i] - dispatchTimes[i - 1]
      expect(gap).toBeGreaterThanOrEqual(45)
    }
  })

  it('AbortController stops pending tasks (in-flight tasks see signal.aborted)', async () => {
    const controller = new AbortController()
    const q = createBackfillQueue({ maxConcurrent: 1, minIntervalMs: 0, signal: controller.signal })
    const completed: number[] = []
    const tasks = Array.from({ length: 6 }).map((_, i) =>
      q.add(async (signal) => {
        await tick(40)
        if (signal.aborted) return
        completed.push(i)
      }),
    )

    // Cancel after the first task should complete (~40ms in).
    await tick(60)
    controller.abort()
    await Promise.allSettled(tasks)

    // First task observed signal.aborted=false at end (completed before abort).
    // Subsequent tasks see signal.aborted=true and return without push.
    expect(completed.length).toBeLessThanOrEqual(2)
    expect(completed.length).toBeGreaterThanOrEqual(1)
  })

  it('isolates a failing task — other tasks continue', async () => {
    const q = createBackfillQueue({ maxConcurrent: 2, minIntervalMs: 0 })
    const seen: number[] = []
    const results = await Promise.allSettled([
      q.add(async () => { seen.push(0) }),
      q.add(async () => { throw new Error('boom') }),
      q.add(async () => { seen.push(2) }),
      q.add(async () => { seen.push(3) }),
    ])
    expect(results[0].status).toBe('fulfilled')
    expect(results[1].status).toBe('rejected')
    expect(results[2].status).toBe('fulfilled')
    expect(results[3].status).toBe('fulfilled')
    expect(seen.sort()).toEqual([0, 2, 3])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk pnpm vitest run tests/lib/backfill-queue.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the queue**

Create `lib/board/backfill-queue.ts`:

```ts
/** Generic rate-limit queue for background refreshes.
 *
 *  Why this exists:
 *    Tweet syndication backfill (and similar future backfills) walks every
 *    eligible bookmark on board mount. We want to:
 *      - cap simultaneous in-flight fetches (Twitter rate-limit politeness +
 *        Cloudflare Functions invocation budget protection)
 *      - space out dispatches (= micro-rate-limit) so a burst of 500 tasks
 *        doesn't peg the proxy in <1s
 *      - cleanly cancel everything when the user navigates away
 *
 *  The queue is intentionally tiny — no priorities, no cancellation per
 *  task, no retry. Add those when a concrete need shows up.
 */
export type BackfillQueueOptions = {
  /** Maximum number of tasks running concurrently. */
  readonly maxConcurrent: number
  /** Minimum elapsed time between two task dispatches, ms. */
  readonly minIntervalMs: number
  /** Optional AbortController.signal — when aborted, all pending tasks are
   *  skipped (the runner exits without invoking them) and in-flight tasks
   *  receive the signal so they can early-return. */
  readonly signal?: AbortSignal
}

export type BackfillTask = (signal: AbortSignal) => Promise<void>

export type BackfillQueue = {
  readonly add: (task: BackfillTask) => Promise<void>
}

export function createBackfillQueue(opts: BackfillQueueOptions): BackfillQueue {
  const { maxConcurrent, minIntervalMs } = opts
  // Synthesize a never-firing signal when none is provided so downstream
  // task code can rely on a non-null signal reference.
  const signal: AbortSignal = opts.signal ?? new AbortController().signal

  let inFlight = 0
  let lastDispatchAt = 0
  const pending: Array<{
    task: BackfillTask
    resolve: () => void
    reject: (err: unknown) => void
  }> = []

  const tick = (): void => {
    if (signal.aborted) {
      // Drain pending list — resolve them so awaiters don't hang.
      while (pending.length > 0) {
        const next = pending.shift()
        if (next) next.resolve()
      }
      return
    }
    while (inFlight < maxConcurrent && pending.length > 0) {
      const now = performance.now()
      const wait = Math.max(0, lastDispatchAt + minIntervalMs - now)
      if (wait > 0) {
        // Defer the next dispatch until the interval has elapsed.
        setTimeout(tick, wait)
        return
      }
      const entry = pending.shift()
      if (!entry) return
      inFlight++
      lastDispatchAt = performance.now()
      void Promise.resolve()
        .then(() => entry.task(signal))
        .then(
          () => { entry.resolve() },
          (err) => { entry.reject(err) },
        )
        .finally(() => {
          inFlight--
          tick()
        })
    }
  }

  const add = (task: BackfillTask): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      pending.push({ task, resolve, reject })
      tick()
    })
  }

  return { add }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk pnpm vitest run tests/lib/backfill-queue.test.ts`
Expected: PASS — all 4 cases green.

- [ ] **Step 5: Commit**

```bash
rtk git add lib/board/backfill-queue.ts tests/lib/backfill-queue.test.ts
rtk git commit -m "feat(board): backfill-queue with parallel-3 + 200ms interval + AbortController"
```

---

## Task 2: tweet-backfill.ts — 1 fetch で thumbnail + hasVideo + mediaSlots を統合 persist

**Files:**
- Create: `lib/board/tweet-backfill.ts`
- Create: `tests/lib/tweet-backfill.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/tweet-backfill.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { backfillTweetMeta } from '@/lib/board/tweet-backfill'
import type { TweetMeta } from '@/lib/embed/types'

const meta = (overrides: Partial<TweetMeta> = {}): TweetMeta => ({
  id: '1',
  text: 't',
  hasPhoto: false,
  hasVideo: false,
  hasPoll: false,
  hasQuotedTweet: false,
  authorName: '',
  authorHandle: '',
  photoUrls: [],
  mediaSlots: [],
  ...overrides,
})

describe('backfillTweetMeta', () => {
  it('persists thumbnail + hasVideo + mediaSlots for a mix tweet', async () => {
    const persistThumbnail = vi.fn().mockResolvedValue(undefined)
    const persistVideoFlag = vi.fn().mockResolvedValue(undefined)
    const persistMediaSlots = vi.fn().mockResolvedValue(undefined)
    const fetchMeta = vi.fn().mockResolvedValue(meta({
      hasPhoto: true,
      hasVideo: true,
      photoUrl: 'https://p/a.jpg',
      videoPosterUrl: 'https://p/poster.jpg',
      mediaSlots: [
        { type: 'video', url: 'https://p/poster.jpg', videoUrl: 'https://v/v.mp4', aspect: 1.77 },
        { type: 'photo', url: 'https://p/a.jpg' },
      ],
    }))

    await backfillTweetMeta(
      { bookmarkId: 'b1', tweetId: '1' },
      new AbortController().signal,
      { fetchMeta, persistThumbnail, persistVideoFlag, persistMediaSlots },
    )

    expect(fetchMeta).toHaveBeenCalledWith('1')
    expect(persistThumbnail).toHaveBeenCalledWith('b1', 'https://p/poster.jpg', true)
    expect(persistVideoFlag).toHaveBeenCalledWith('b1', true)
    expect(persistMediaSlots).toHaveBeenCalledWith('b1', [
      { type: 'video', url: 'https://p/poster.jpg', videoUrl: 'https://v/v.mp4', aspect: 1.77 },
      { type: 'photo', url: 'https://p/a.jpg' },
    ])
  })

  it('skips mediaSlots write when slots array is empty', async () => {
    const persistMediaSlots = vi.fn().mockResolvedValue(undefined)
    const persistThumbnail = vi.fn().mockResolvedValue(undefined)
    const persistVideoFlag = vi.fn().mockResolvedValue(undefined)
    const fetchMeta = vi.fn().mockResolvedValue(meta({
      photoUrl: 'https://p/a.jpg',
      mediaSlots: [],
    }))

    await backfillTweetMeta(
      { bookmarkId: 'b2', tweetId: '2' },
      new AbortController().signal,
      { fetchMeta, persistThumbnail, persistVideoFlag, persistMediaSlots },
    )

    expect(persistMediaSlots).not.toHaveBeenCalled()
    expect(persistThumbnail).toHaveBeenCalled()  // thumbnail still backfilled
  })

  it('returns silently when fetchMeta returns null (failed fetch)', async () => {
    const persistThumbnail = vi.fn()
    const persistVideoFlag = vi.fn()
    const persistMediaSlots = vi.fn()
    const fetchMeta = vi.fn().mockResolvedValue(null)

    await backfillTweetMeta(
      { bookmarkId: 'b3', tweetId: '3' },
      new AbortController().signal,
      { fetchMeta, persistThumbnail, persistVideoFlag, persistMediaSlots },
    )

    expect(persistThumbnail).not.toHaveBeenCalled()
    expect(persistVideoFlag).not.toHaveBeenCalled()
    expect(persistMediaSlots).not.toHaveBeenCalled()
  })

  it('honors signal.aborted — skips persist calls if cancelled before fetch resolves', async () => {
    const persistThumbnail = vi.fn()
    const controller = new AbortController()
    const fetchMeta = vi.fn().mockImplementation(async () => {
      controller.abort()
      return meta({ photoUrl: 'https://p/a.jpg', mediaSlots: [{ type: 'photo', url: 'https://p/a.jpg' }] })
    })

    await backfillTweetMeta(
      { bookmarkId: 'b4', tweetId: '4' },
      controller.signal,
      {
        fetchMeta,
        persistThumbnail,
        persistVideoFlag: vi.fn(),
        persistMediaSlots: vi.fn(),
      },
    )

    expect(persistThumbnail).not.toHaveBeenCalled()
  })

  it('swallows fetch exceptions (does not throw to queue)', async () => {
    const fetchMeta = vi.fn().mockRejectedValue(new Error('network'))
    await expect(
      backfillTweetMeta(
        { bookmarkId: 'b5', tweetId: '5' },
        new AbortController().signal,
        {
          fetchMeta,
          persistThumbnail: vi.fn(),
          persistVideoFlag: vi.fn(),
          persistMediaSlots: vi.fn(),
        },
      ),
    ).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk pnpm vitest run tests/lib/tweet-backfill.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement backfillTweetMeta**

Create `lib/board/tweet-backfill.ts`:

```ts
import type { TweetMeta, MediaSlot } from '@/lib/embed/types'

/** A single bookmark's identity for the backfill. */
export type TweetBackfillTarget = {
  readonly bookmarkId: string
  readonly tweetId: string
}

/** Side-effecting hooks the backfill calls when meta resolves. Passed in
 *  (rather than imported) so unit tests can inject mocks and so production
 *  callers can wire to React state through useBoardData. */
export type TweetBackfillHooks = {
  readonly fetchMeta: (tweetId: string) => Promise<TweetMeta | null>
  readonly persistThumbnail: (bookmarkId: string, url: string, force: boolean) => Promise<void>
  readonly persistVideoFlag: (bookmarkId: string, hasVideo: boolean) => Promise<void>
  readonly persistMediaSlots: (bookmarkId: string, slots: readonly MediaSlot[]) => Promise<void>
}

/** Fetch tweet meta once and write through to all three persisted fields.
 *  Returns silently on any failure or cancellation. Designed to be passed
 *  to a BackfillQueue as a task. */
export async function backfillTweetMeta(
  target: TweetBackfillTarget,
  signal: AbortSignal,
  hooks: TweetBackfillHooks,
): Promise<void> {
  let meta: TweetMeta | null
  try {
    meta = await hooks.fetchMeta(target.tweetId)
  } catch {
    return
  }
  if (!meta || signal.aborted) return

  // Thumbnail — write through always; the bookmarklet captures X's generic
  // placeholder for every tweet, so the syndication response is the only
  // source of truth here (force=true).
  const thumbUrl = meta.photoUrl ?? meta.videoPosterUrl ?? ''
  try {
    await hooks.persistThumbnail(target.bookmarkId, thumbUrl, true)
  } catch {
    /* per-field failure: keep going so the other fields still persist. */
  }
  if (signal.aborted) return

  // hasVideo flag — only flip to true. Never set back to false (cardinal
  // rule: backfill never removes user-visible state).
  if (meta.hasVideo) {
    try {
      await hooks.persistVideoFlag(target.bookmarkId, true)
    } catch {
      /* swallow */
    }
  }
  if (signal.aborted) return

  // mediaSlots — only when the fetched meta actually has slot data. Empty
  // array means text-only tweet, in which case we don't want to overwrite
  // anything (= no-op).
  if (meta.mediaSlots && meta.mediaSlots.length > 0) {
    try {
      await hooks.persistMediaSlots(target.bookmarkId, meta.mediaSlots)
    } catch {
      /* swallow */
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk pnpm vitest run tests/lib/tweet-backfill.test.ts`
Expected: PASS — all 5 cases green.

- [ ] **Step 5: Commit**

```bash
rtk git add lib/board/tweet-backfill.ts tests/lib/tweet-backfill.test.ts
rtk git commit -m "feat(board): tweet-backfill unifies thumbnail+hasVideo+mediaSlots persist"
```

---

## Task 3: BoardRoot.tsx — 既存 sequential loop を queue + tweet-backfill ベースに置換 (Phase B)

**Files:**
- Modify: `components/board/BoardRoot.tsx`

- [ ] **Step 1: Replace the existing tweet meta useEffect block**

Edit `components/board/BoardRoot.tsx` — replace the entire block from `processedTweetIdsRef` declaration through the closing `}, [loading, items.length, persistThumbnail, persistVideoFlag])` (lines ~651-688) with:

```ts
  // Phase B: rate-limit-driven backfill for every tweet bookmark. Replaces
  // the prior sequential loop (which persisted thumbnail + hasVideo). The
  // new path also persists mediaSlots from the same fetchTweetMeta call
  // (no extra API trips). Uses createBackfillQueue at parallel-3 +
  // 200ms intervals (spec §4-2 B-3) and an AbortController so navigation
  // away during a long sweep cancels in-flight tasks cleanly.
  //
  // processedTweetIdsRef dedupes across items.length re-fires so a freshly
  // arrived bookmark only enqueues if its tweet id has never been touched
  // in this session.
  const processedTweetIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (loading || items.length === 0) return
    const controller = new AbortController()
    const queue = createBackfillQueue({
      maxConcurrent: 3,
      minIntervalMs: 200,
      signal: controller.signal,
    })
    for (const it of items) {
      if (detectUrlType(it.url) !== 'tweet') continue
      const tweetId = extractTweetId(it.url)
      if (!tweetId) continue
      if (processedTweetIdsRef.current.has(tweetId)) continue
      // Spec §B-2 visible filter: items[] is already the post-filter,
      // post-soft-delete set produced by useBoardData. Iterating it
      // satisfies the "visible カード限定" requirement.
      processedTweetIdsRef.current.add(tweetId)
      void queue.add((signal) =>
        backfillTweetMeta(
          { bookmarkId: it.bookmarkId, tweetId },
          signal,
          {
            fetchMeta: fetchTweetMeta,
            persistThumbnail,
            persistVideoFlag,
            persistMediaSlots,
          },
        ),
      ).catch(() => {
        /* per-target failure isolated by the queue; nothing to do here. */
      })
    }
    return (): void => { controller.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, items.length, persistThumbnail, persistVideoFlag, persistMediaSlots])
```

- [ ] **Step 2: Update imports at the top of BoardRoot.tsx**

Add to the existing import block (around lines 19-26):

```ts
import { createBackfillQueue } from '@/lib/board/backfill-queue'
import { backfillTweetMeta } from '@/lib/board/tweet-backfill'
```

The existing `import { fetchTweetMeta } from '@/lib/embed/tweet-meta'` (line 22) stays. The existing `import { detectUrlType, extractTweetId } from '@/lib/utils/url'` (line 21) stays.

Confirm `persistMediaSlots` is destructured from `useBoardData()` (added in the mixed-media-tweet plan Task 8 Step 3).

- [ ] **Step 3: Verify the prior loop is removed**

Run: `rtk grep -n "processedTweetIdsRef" components/board/BoardRoot.tsx`
Expected: only ONE occurrence (the ref declaration inside the new useEffect). If TWO occurrences appear, the old block was not fully removed.

- [ ] **Step 4: Type check + unit suite**

Run: `rtk pnpm tsc --noEmit && rtk pnpm vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add components/board/BoardRoot.tsx
rtk git commit -m "refactor(board): Phase B tweet backfill via rate-limit queue + unified persist"
```

---

## Task 4: SaveIframeClient.tsx — Phase A fire-and-forget syndication fetch (extension flow)

**Files:**
- Modify: `app/save-iframe/SaveIframeClient.tsx`

- [ ] **Step 1: Wire Phase A into the save handler**

Edit `app/save-iframe/SaveIframeClient.tsx`. Add these imports at the top (alongside the existing `addBookmark` import):

```ts
import { initDB, addBookmark, persistMediaSlots } from '@/lib/storage/indexeddb'
import { detectUrlType, extractTweetId } from '@/lib/utils/url'
import { fetchTweetMeta } from '@/lib/embed/tweet-meta'
```

Replace the `try { ... } catch { ... }` block inside `handler` (around lines 97-118) with:

```ts
      try {
        const db = await initDB()
        const bm = await addBookmark(db, {
          url: payload.url,
          title: payload.title || payload.url,
          description: payload.description,
          thumbnail: payload.image,
          favicon: payload.favicon,
          siteName: payload.siteName,
          type: detectUrlType(payload.url),
          tags: [],
        })
        postBookmarkSaved({ bookmarkId: bm.id })
        reply({ type: 'booklage:save:result', nonce: payload.nonce, ok: true, bookmarkId: bm.id })

        // Phase A: fire-and-forget syndication fetch for X tweets so the
        // newly saved bookmark already has mediaSlots[] populated before
        // the user lands on the board. Offscreen iframe persists across
        // tab closes, so we don't need to block the reply on this.
        if (detectUrlType(payload.url) === 'tweet') {
          const tweetId = extractTweetId(payload.url)
          if (tweetId) {
            void fetchTweetMeta(tweetId).then((meta) => {
              if (meta?.mediaSlots && meta.mediaSlots.length > 0) {
                void persistMediaSlots(db, bm.id, meta.mediaSlots)
              }
            }).catch(() => { /* swallow — Phase B catches next mount */ })
          }
        }
      } catch (err) {
        reply({
          type: 'booklage:save:result',
          nonce: payload.nonce,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })
      }
```

The fire-and-forget pattern (`void ...then(...).catch(...)`) is identical to Lightbox.tsx's Phase C backfill.

- [ ] **Step 2: Verify compilation**

Run: `rtk pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
rtk git add app/save-iframe/SaveIframeClient.tsx
rtk git commit -m "feat(save): Phase A fire-and-forget mediaSlots backfill (extension flow)"
```

---

## Task 5: Cloudflare proxy cache header — max-age 3600 → 86400 (optional polish)

**Files:**
- Modify: `functions/api/tweet-meta.ts:72`

- [ ] **Step 1: Bump max-age + s-maxage to 24h**

Edit `functions/api/tweet-meta.ts` — replace line 72:

```ts
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
```

(The `public` directive stays so browser HTTP cache also keeps the response for 24h, eliminating duplicate fetches even from the same client.)

- [ ] **Step 2: Verify the proxy still type-checks**

Run: `rtk pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
rtk git add functions/api/tweet-meta.ts
rtk git commit -m "perf(proxy): tweet-meta edge cache 1h → 24h to slash invocation budget"
```

Rationale documented in spec §7-1: under typical usage this drops Cloudflare Pages Functions invocations by ~10x, comfortably keeping the project inside the 100k/day free tier even at 1k-bookmark scale.

---

## Task 6: E2E coverage — board-backfill (Phase B happy path)

**Files:**
- Create: `tests/e2e/board-backfill.spec.ts`

- [ ] **Step 1: Write the spec**

Create `tests/e2e/board-backfill.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

/* The /api/tweet-meta proxy is mocked at the route level so the test does
 * not depend on Twitter syndication availability or rate limits. The mock
 * returns a 2-photo mediaSlots payload that backfillTweetMeta will then
 * write through to IDB. */
test('Phase B: v12 photos-only bookmark gets mediaSlots backfilled within 5s of mount', async ({ page, context }) => {
  // Mock the proxy.
  await context.route('**/api/tweet-meta?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id_str: '12345',
        text: 'two photos',
        photos: [
          { url: 'https://pbs.twimg.com/a.jpg', width: 800, height: 600 },
          { url: 'https://pbs.twimg.com/b.jpg', width: 800, height: 600 },
        ],
        user: { name: 'A', screen_name: 'a' },
      }),
    })
  })

  // Seed a v12 photos-only bookmark.
  await page.addInitScript(() => {
    const open = indexedDB.open('booklage-db', 13)
    open.onupgradeneeded = (): void => {
      const db = open.result
      for (const store of ['bookmarks', 'cards', 'settings', 'preferences', 'moods']) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: store === 'settings' || store === 'preferences' ? 'key' : 'id' })
        }
      }
    }
    open.onsuccess = (): void => {
      const db = open.result
      const tx = db.transaction(['bookmarks', 'cards'], 'readwrite')
      tx.objectStore('bookmarks').put({
        id: 'b1',
        url: 'https://x.com/u/status/12345',
        title: 'old', description: '', thumbnail: '', favicon: '',
        siteName: 'X', type: 'tweet',
        savedAt: new Date().toISOString(),
        ogpStatus: 'fetched', tags: [],
        cardWidth: 240, sizePreset: 'S', orderIndex: 0,
        photos: ['https://pbs.twimg.com/a.jpg', 'https://pbs.twimg.com/b.jpg'],
        // intentionally no mediaSlots field
      })
      tx.objectStore('cards').put({
        id: 'c1', bookmarkId: 'b1', folderId: '',
        x: 240, y: 80, rotation: 0, scale: 1, zIndex: 1,
        gridIndex: 0, isManuallyPlaced: false,
        width: 240, height: 240,
      })
    }
  })

  await page.goto('/board')
  await page.waitForSelector('[data-bookmark-id="b1"]')

  // Wait up to 5s for the queue to drain (200ms interval × 1 task ≈ 200ms
  // dispatch + ~upstream fetch). 5s is generous to absorb CI variance.
  await expect.poll(async () => {
    return await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('booklage-db', 13)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      const tx = db.transaction('bookmarks', 'readonly')
      const get = tx.objectStore('bookmarks').get('b1')
      const bm = await new Promise<{ mediaSlots?: unknown[] } | undefined>((resolve, reject) => {
        get.onsuccess = () => resolve(get.result as never)
        get.onerror = () => reject(get.error)
      })
      return bm?.mediaSlots?.length ?? 0
    })
  }, { timeout: 5000, intervals: [200, 200, 400, 800] }).toBeGreaterThanOrEqual(2)
})
```

- [ ] **Step 2: Run the spec**

Run: `rtk pnpm exec playwright test board-backfill.spec.ts --reporter=line`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
rtk git add tests/e2e/board-backfill.spec.ts
rtk git commit -m "test(e2e): Phase B v12→v13 mediaSlots backfill within 5s of mount"
```

---

## Task 7: 検証 → 本番デプロイ → ユーザー実機確認

**Files:** (no code changes — verification + deploy + handoff)

- [ ] **Step 1: Full type check**

Run: `rtk pnpm tsc --noEmit`
Expected: zero errors.

- [ ] **Step 2: Full unit suite**

Run: `rtk pnpm vitest run`
Expected: pre-existing 425 + 11 from mixed-media-tweet plan + 9 from this plan (4 queue + 5 tweet-backfill) → 445 total. All PASS.

- [ ] **Step 3: Full Playwright suite (smoke)**

Run: `rtk pnpm exec playwright test --reporter=line`
Expected: PASS for `board-backfill.spec.ts` + `board-mixed-media.spec.ts` + `board-b-11-source-hide.spec.ts`. Pre-existing rot tests (DB_VERSION 9 hardcoded) are still expected to fail per session 11 notes — do NOT mark this task done if NEW failures appear.

- [ ] **Step 4: Build**

Run: `rtk pnpm build`
Expected: PASS.

- [ ] **Step 5: Deploy to Cloudflare Pages production**

Run:
```bash
npx wrangler pages deploy out/ --project-name=booklage --branch=master --commit-dirty=true --commit-message="feat: 3-tier backfill for mediaSlots"
```
Expected: deploy completes; URL `https://booklage.pages.dev` updates.

- [ ] **Step 6: User verification handoff**

Output to user:
> mediaSlots 3 段防御 backfill deploy 完了。 `https://booklage.pages.dev` をハードリロードして以下を確認してください:
>
> ① **既存ブクマ (Phase B)**: 過去保存した X 複数画像ブクマ (Lightbox 未 open のもの) を hover → 5 秒以内に dot 行が現れ、 hover swap が効くようになる。
>
> ② **新規ブクマ (Phase A, extension 経路)**: 拡張機能 ON で新しい X 複数画像投稿を保存 → 保存直後に板を開いて hover → ドット即出 (Phase A が裏で fire-and-forget で完了済)。
>
> ③ **bookmarklet 単体経路 (Phase A スキップ済)**: 拡張機能 OFF で bookmarklet popup で X 複数画像投稿を保存 → 直後の board hover ではドット未出 (Phase A スキップ仕様)。 ハードリロード後の board mount で Phase B が拾い、 5 秒以内にドット出現。
>
> ④ **動画+画像 mix tweet (mixed-media-tweet plan と相乗効果)**: Phase B が動作する事で mix tweet も自動で mediaSlots backfill → カードが ▶ 動画 tint dot を表示するようになる。

---

## Open Items (実装中に決める / 将来課題)

- **bookmarklet popup 経路 (Phase A スキップ)**: 80ms close で fetch が kill されるので除外。 将来 service worker + IndexedDB transaction queue で popup unload 後も fetch を継続する仕組みを別 spec で。
- **rate-limit の具体値 (並列 3 / 200ms)**: 本実装で固定。 Cloudflare edge cache 24h 化後の hit 率次第で緩めてよい (spec §11)。
- **filter 変更時の追加 backfill**: 本 plan 非対象 (spec §6-1)。 タグ機能完成後に追加 hook spec を作成。
- **削除済ブクマの backfill 対象外**: useBoardData の items が既に soft-delete を除外しているので自動的に対象外、 動作確認のみ。
- **Bluesky / Mastodon backfill**: 別 spec (spec §6-1 / §11)。 同じ backfill-queue を再利用可能。

---

## Self-Review Notes (writing-plans skill)

- ✅ Spec §2 主要決定事項 6 件 → Phase A (Task 4) / Phase B (Tasks 1-3) / Phase C (前提プランで完了) / rate-limit (Task 1) / 失敗時挙動 (Task 2) / 進捗 UI なし (本プランで何も UI 出さない設計を保持)
- ✅ Spec §3 アーキテクチャ 3 段防御 → Task 4 (A) + Task 3 (B) + Phase C は mixed-media-tweet plan Task 8 で完了
- ✅ Spec §4-1 Phase A → Task 4 (extension)。 popup スキップを Open Items に明記
- ✅ Spec §4-2 Phase B → Task 1 (queue) + Task 2 (unified persist) + Task 3 (wire)
- ✅ Spec §4-3 Phase C → 既存実装維持を本 plan 序文で明示
- ✅ Spec §5-2 cache header → Task 5 (optional polish 別 commit)
- ✅ Spec §5-3 AbortController → Task 1 で queue に統合
- ✅ Spec §6 制約 → Open Items に列挙
- ✅ Spec §7 コスト → Task 5 commit message で言及
- ✅ Spec §8 ファイル変更一覧 → Create / Modify ブロックで完全網羅
- ✅ Spec §9 テスト → unit (Tasks 1, 2) + E2E (Task 6)
- ✅ Spec §10 ロールアウト → Task 7 で deploy + 実機確認
- ✅ Type consistency: `MediaSlot` / `TweetMeta` / `BookmarkRecord` の field 名は mixed-media-tweet plan と一致 (本プラン内では新規型なし、 既存型のみ利用)
- ✅ No placeholders / TODO comments / future-style hedges
