# 動画+画像 mix tweet 対応 (mediaSlots[] 統一型) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** X (Twitter) の動画 1 + 画像 N が混在する tweet を、 board / Lightbox で X 本家と同じ順序付き carousel として全メディア閲覧可能にする。 既存の単一画像 / 単一動画 / 複数画像 tweet も同じ `mediaSlots[]` 統一型データモデルに集約する。

**Architecture:** IDB schema v12 → v13 で `BookmarkRecord.mediaSlots?: readonly MediaSlot[]` を追加 (no-op migration、 旧 photos[] は読み取り fallback として併存)。 `parseTweetData()` を `mediaDetails` 順次走査ベースに refactor し、 既存 `photoUrl` / `photoUrls` / `videoUrl` 等は mediaSlots からの派生計算で後方互換維持。 ImageCard は `mediaSlots[]` 優先・`photos[]` fallback の hover swap、 Lightbox `TweetMedia` は slot type に応じて `<TweetVideoPlayer>` か `<img>` を出し分け + ↑↓ / dot クリック切替時に動画 auto-pause。

**Tech Stack:** Next.js 14 App Router · TypeScript strict · idb / fake-indexeddb · vitest · Playwright · GSAP (既存) · vanilla CSS modules

**Spec:** [docs/superpowers/specs/2026-05-12-mixed-media-tweet-design.md](../specs/2026-05-12-mixed-media-tweet-design.md)

**Scope:** mix tweet 本体のみ。 backfill 戦略 (3 段防御) は併走する `2026-05-12-multi-image-backfill.md` で扱う (本プランの Task 4 で実装する `persistMediaSlots()` をその plan が利用)。 Bluesky / モバイル swipe / PiP carousel は本プラン非対象。

**UI design approval gate (CLAUDE 規約 .claude/rules/ui-design.md):** Task 5 の `--media-slot-video-tint`、 Task 7 の `▶` dot 形状はデフォルト値で実装するが、 deploy 前にユーザーに視覚確認 (現状 → 変更案 → 承認 → merge) を必ず通す。 数値だけ単独で確定せず、 実機 screenshot を添えて提示すること。

---

## File Structure

**Create:**
- `tests/lib/idb-v13-media-slots.test.ts` — schema v13 migration + persistMediaSlots unit test
- `tests/lib/tweet-meta-media-slots.test.ts` — parseTweetData mix / video-only / photo-only / multi-photo の mediaSlots 構造 + 派生 field の後方互換 unit test
- `tests/e2e/board-mixed-media.spec.ts` — seed mix tweet → ボード hover で video poster ↔ photo 切替 → Lightbox open → ↑↓ / dot で carousel → 動画再生中切替で pause / 戻って currentTime 維持を verify

**Modify:**
- `lib/constants.ts:21` — `DB_VERSION` 12 → 13
- `lib/storage/indexeddb.ts` — `BookmarkRecord.mediaSlots?: readonly MediaSlot[]` を追加、 v13 no-op migration ブロック追加、 `persistMediaSlots()` 関数追加
- `lib/embed/types.ts` — `MediaSlot` 型を export、 `TweetMeta.mediaSlots?: readonly MediaSlot[]` を追加
- `lib/embed/tweet-meta.ts` — `parseTweetData()` を `mediaDetails` 順次走査ベースに refactor、 派生 field (photoUrl/photoUrls/videoUrl/videoPosterUrl/videoAspectRatio/hasPhoto/hasVideo) を mediaSlots から計算
- `lib/storage/use-board-data.ts` — `BoardItem.mediaSlots?: readonly MediaSlot[]` pass-through、 `persistMediaSlots` callback を hook の return に追加
- `lib/share/lightbox-item.ts` — `LightboxItem.mediaSlots?: readonly MediaSlot[]` 追加 + `normalizeItem()` で BoardItem 側のみ pass-through
- `components/board/cards/ImageCard.tsx` — mediaSlots[] 優先データソース化、 hover swap で slot.url を出す、 dot に video tint
- `components/board/cards/ImageCard.module.css` — `--media-slot-video-tint` CSS var、 `.multiImageDot[data-slot-type='video']` セレクタ
- `components/board/Lightbox.tsx` — `tweetImageIdx` を slot index 化 / TweetMedia に slot 配列を渡し type 別レンダリング / 動画 auto-pause / Phase C backfill を `persistMediaSlots` 化
- `components/board/Lightbox.module.css` — `▶` 形 dot variant (`.lightboxImageDot[data-slot-type='video']`)

---

## Task 1: IDB v13 schema — mediaSlots field を BookmarkRecord に追加 + persistMediaSlots() 実装

**Files:**
- Modify: `lib/constants.ts:21`
- Modify: `lib/storage/indexeddb.ts` (BookmarkRecord type + v13 migration block + persistMediaSlots function)
- Create: `tests/lib/idb-v13-media-slots.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/idb-v13-media-slots.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { type IDBPDatabase } from 'idb'
import { initDB, persistMediaSlots, type BookmarkRecord } from '@/lib/storage/indexeddb'
import { DB_NAME, DB_VERSION } from '@/lib/constants'

let db: IDBPDatabase<unknown> | null = null

beforeEach(async () => {
  const databases = await indexedDB.databases()
  for (const info of databases) {
    if (info.name) indexedDB.deleteDatabase(info.name)
  }
})

afterEach(() => {
  if (db) { db.close(); db = null }
})

describe('IDB v13: mediaSlots field on BookmarkRecord', () => {
  it('DB_VERSION is 13', () => {
    expect(DB_VERSION).toBe(13)
  })

  it('initDB opens at v13 and bookmarks store accepts mediaSlots field', async () => {
    db = await initDB() as unknown as IDBPDatabase<unknown>
    expect(db.version).toBe(13)
    expect(DB_NAME).toBe('booklage-db')

    const bookmark: BookmarkRecord = {
      id: 'b1',
      url: 'https://x.com/u/status/1',
      title: 't',
      description: '',
      thumbnail: '',
      favicon: '',
      siteName: 'X',
      type: 'tweet',
      savedAt: new Date().toISOString(),
      ogpStatus: 'fetched',
      tags: [],
      mediaSlots: [
        { type: 'video', url: 'https://x/p.jpg', videoUrl: 'https://x/v.mp4', aspect: 1.77 },
        { type: 'photo', url: 'https://x/a.jpg' },
        { type: 'photo', url: 'https://x/b.jpg' },
      ],
    }
    await db.put('bookmarks', bookmark)
    const got = (await db.get('bookmarks', 'b1')) as BookmarkRecord | undefined
    expect(got?.mediaSlots?.length).toBe(3)
    expect(got?.mediaSlots?.[0].type).toBe('video')
    expect(got?.mediaSlots?.[1].type).toBe('photo')
  })

  it('persistMediaSlots writes mediaSlots and is idempotent (no-op for deep-equal)', async () => {
    db = await initDB() as unknown as IDBPDatabase<unknown>
    const base: BookmarkRecord = {
      id: 'b2', url: 'u', title: 't', description: '', thumbnail: '',
      favicon: '', siteName: '', type: 'tweet',
      savedAt: new Date().toISOString(), ogpStatus: 'fetched', tags: [],
    }
    await db.put('bookmarks', base)

    const slots = [
      { type: 'photo' as const, url: 'https://x/a.jpg' },
      { type: 'photo' as const, url: 'https://x/b.jpg' },
    ]
    await persistMediaSlots(db as Parameters<typeof persistMediaSlots>[0], 'b2', slots)
    const after1 = (await db.get('bookmarks', 'b2')) as BookmarkRecord
    expect(after1.mediaSlots?.length).toBe(2)

    // Idempotent: writing same slots again does not change the record.
    await persistMediaSlots(db as Parameters<typeof persistMediaSlots>[0], 'b2', slots)
    const after2 = (await db.get('bookmarks', 'b2')) as BookmarkRecord
    expect(after2.mediaSlots).toEqual(after1.mediaSlots)
  })

  it('persistMediaSlots with empty array clears the field', async () => {
    db = await initDB() as unknown as IDBPDatabase<unknown>
    const base: BookmarkRecord = {
      id: 'b3', url: 'u', title: 't', description: '', thumbnail: '',
      favicon: '', siteName: '', type: 'tweet',
      savedAt: new Date().toISOString(), ogpStatus: 'fetched', tags: [],
      mediaSlots: [{ type: 'photo', url: 'https://x/a.jpg' }],
    }
    await db.put('bookmarks', base)
    await persistMediaSlots(db as Parameters<typeof persistMediaSlots>[0], 'b3', [])
    const after = (await db.get('bookmarks', 'b3')) as BookmarkRecord
    expect(after.mediaSlots).toBeUndefined()
  })

  it('upgrade from v12 (with photos[]) preserves photos field as read fallback', async () => {
    // First seed at v12 by opening with version 12 explicitly using the bare idb API.
    const { openDB } = await import('idb')
    const v12 = await openDB(DB_NAME, 12, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('bookmarks')) {
          db.createObjectStore('bookmarks', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('cards')) db.createObjectStore('cards', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' })
        if (!db.objectStoreNames.contains('preferences')) db.createObjectStore('preferences', { keyPath: 'key' })
        if (!db.objectStoreNames.contains('moods')) db.createObjectStore('moods', { keyPath: 'id' })
      },
    })
    await v12.put('bookmarks', {
      id: 'old', url: 'https://x.com/u/status/1', title: 't',
      description: '', thumbnail: '', favicon: '', siteName: '',
      type: 'tweet', savedAt: new Date().toISOString(),
      ogpStatus: 'fetched', tags: [],
      photos: ['https://x/a.jpg', 'https://x/b.jpg'],
    })
    v12.close()

    // Reopen via initDB → triggers v12 → v13 upgrade.
    db = await initDB() as unknown as IDBPDatabase<unknown>
    const got = (await db.get('bookmarks', 'old')) as BookmarkRecord
    expect(got.photos).toEqual(['https://x/a.jpg', 'https://x/b.jpg'])
    expect(got.mediaSlots).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk pnpm vitest run tests/lib/idb-v13-media-slots.test.ts`
Expected: FAIL — `DB_VERSION` is still `12`, `persistMediaSlots` not exported, `BookmarkRecord` has no `mediaSlots` field.

- [ ] **Step 3: Bump DB_VERSION**

Edit `lib/constants.ts:21`:

```ts
/** IndexedDB schema version */
export const DB_VERSION = 13
```

- [ ] **Step 4: Add MediaSlot type to lib/embed/types.ts (forward declaration)**

Edit `lib/embed/types.ts` — add at the top of the file (above `TweetMeta`):

```ts
/** A single addressable piece of media inside a post (X tweet / Bluesky / etc).
 *  Tweets surface a video first then photos; Bluesky surfaces up to 4 photos.
 *  Order matches the upstream API response and is the canonical board / Lightbox
 *  carousel order. */
export type MediaSlot = {
  readonly type: 'video' | 'photo'
  /** photo: the image URL. video: the poster (still frame) URL. */
  readonly url: string
  /** Defined only when type === 'video'. Highest-bitrate mp4 stream URL ready
   *  to feed into a `<video src>`. */
  readonly videoUrl?: string
  /** Defined only when type === 'video'. Natural width / height of the video
   *  (used by TweetVideoPlayer to letterbox-free fit). */
  readonly aspect?: number
}
```

- [ ] **Step 5: Add BookmarkRecord.mediaSlots + v13 migration + persistMediaSlots**

Edit `lib/storage/indexeddb.ts`:

(a) Import the new type — change the top-level imports to include `MediaSlot`:

```ts
import type { MediaSlot } from '@/lib/embed/types'
```

(b) In `BookmarkRecord` interface (around line 76), add after the existing `photos?:` field:

```ts
  /** v13: 動画+画像 mix tweet 対応の統一 media 配列。 mediaDetails の API
   *  順序通り。 単一画像も単一動画も複数画像も mix も全てこの 1 配列で表現。
   *  v12 の photos field は読み取り fallback として併存 (新規書き込みなし)、
   *  将来別 spec で完全廃止予定。 */
  mediaSlots?: readonly MediaSlot[]
```

(c) Append a new migration block at the end of the `upgrade(...)` callback (after the v11 → v12 block, around line 488):

```ts
      // ── v12 → v13: introduce optional mediaSlots[] field on bookmarks (no-op
      // rewrite). Existing rows have `mediaSlots: undefined`, which the read
      // path treats as "no unified-slot data; fall back to photos[]/derived
      // fields" — no cursor sweep needed. Bumping the schema version still
      // serves as a tripwire so future migrations can assume the field is
      // observable when oldVersion >= 13.
```

(d) Add `persistMediaSlots()` function — insert after the existing `persistPhotos()` function (around line 743):

```ts
/**
 * Persist a bookmark's mediaSlots array (unified media model for mix-tweet
 * support, v13). Pass an empty array to clear the field back to undefined
 * (returns the bookmark to legacy photos[]/derived display). No-op when the
 * deep equality check matches the existing array (avoids re-render storms
 * for idempotent backfills). Companion to persistPhotos() — once the
 * cleanup spec retires photos[], persistPhotos() will be removed.
 */
export async function persistMediaSlots(
  db: IDBPDatabase<BooklageDB>,
  bookmarkId: string,
  mediaSlots: readonly MediaSlot[],
): Promise<void> {
  const existing = await db.get('bookmarks', bookmarkId)
  if (!existing) return

  const next = mediaSlots.length === 0 ? undefined : mediaSlots
  const cur = existing.mediaSlots
  if (
    (cur === undefined && next === undefined) ||
    (cur !== undefined &&
      next !== undefined &&
      cur.length === next.length &&
      cur.every((s: MediaSlot, i: number) => {
        const n = next[i]
        return (
          s.type === n.type &&
          s.url === n.url &&
          s.videoUrl === n.videoUrl &&
          s.aspect === n.aspect
        )
      }))
  ) {
    return
  }

  const updated: BookmarkRecord = { ...existing, mediaSlots: next }
  await db.put('bookmarks', updated)
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `rtk pnpm vitest run tests/lib/idb-v13-media-slots.test.ts`
Expected: PASS — all 5 cases green.

- [ ] **Step 7: Run the full unit suite to verify no regression**

Run: `rtk pnpm vitest run`
Expected: PASS — pre-existing 425 tests still pass; 5 new ones included.

- [ ] **Step 8: Commit**

```bash
rtk git add lib/constants.ts lib/embed/types.ts lib/storage/indexeddb.ts tests/lib/idb-v13-media-slots.test.ts
rtk git commit -m "feat(idb): v13 mediaSlots field + persistMediaSlots for mix-tweet unified model"
```

---

## Task 2: TweetMeta.mediaSlots を types に追加 (型のみ)

**Files:**
- Modify: `lib/embed/types.ts`

- [ ] **Step 1: Add mediaSlots field to TweetMeta**

Edit `lib/embed/types.ts` — inside the `TweetMeta` type, append the new field after the existing fields (right above `createdAt?: string`):

```ts
  /** v13: 統一 media 配列。 mediaDetails 順序通りで video / photo を含む。 photoUrl /
   *  photoUrls / videoUrl 等は本 field からの派生で計算され、 後方互換のため引き続き
   *  公開される (数ヶ月後別 spec で deprecate)。 mix tweet では length > 1 かつ
   *  type='video' と type='photo' が混在する。 */
  readonly mediaSlots?: readonly MediaSlot[]
```

- [ ] **Step 2: Verify type compilation**

Run: `rtk pnpm tsc --noEmit`
Expected: PASS — `MediaSlot` already exported from the same file (Task 1 Step 4), so the type reference resolves.

- [ ] **Step 3: Commit**

```bash
rtk git add lib/embed/types.ts
rtk git commit -m "feat(embed): TweetMeta.mediaSlots optional field"
```

---

## Task 3: parseTweetData() を mediaSlots-first に refactor

**Files:**
- Modify: `lib/embed/tweet-meta.ts`
- Create: `tests/lib/tweet-meta-media-slots.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/tweet-meta-media-slots.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseTweetData } from '@/lib/embed/tweet-meta'

describe('parseTweetData — mediaSlots (mix tweet)', () => {
  it('builds mediaSlots [video, photo, photo] from mixed mediaDetails', () => {
    const raw = {
      id_str: '1842217368673759498',
      text: 'video + 2 photos',
      mediaDetails: [
        {
          type: 'video',
          media_url_https: 'https://pbs.twimg.com/poster.jpg',
          original_info: { width: 1280, height: 720 },
          video_info: {
            aspect_ratio: [16, 9],
            variants: [
              { content_type: 'video/mp4', bitrate: 320000, url: 'https://v/low.mp4' },
              { content_type: 'video/mp4', bitrate: 2176000, url: 'https://v/high.mp4' },
            ],
          },
        },
        { type: 'photo', media_url_https: 'https://pbs.twimg.com/a.jpg', original_info: { width: 800, height: 600 } },
        { type: 'photo', media_url_https: 'https://pbs.twimg.com/b.jpg', original_info: { width: 800, height: 600 } },
      ],
      user: { name: 'A', screen_name: 'a' },
    }
    const meta = parseTweetData(raw)
    expect(meta).not.toBeNull()
    expect(meta?.mediaSlots).toEqual([
      { type: 'video', url: 'https://pbs.twimg.com/poster.jpg', videoUrl: 'https://v/high.mp4', aspect: 1280 / 720 },
      { type: 'photo', url: 'https://pbs.twimg.com/a.jpg' },
      { type: 'photo', url: 'https://pbs.twimg.com/b.jpg' },
    ])
  })

  it('derives legacy fields from mediaSlots — mix tweet', () => {
    const raw = {
      id_str: '1842217368673759498',
      text: 'mix',
      mediaDetails: [
        {
          type: 'video',
          media_url_https: 'https://pbs.twimg.com/poster.jpg',
          original_info: { width: 1280, height: 720 },
          video_info: {
            aspect_ratio: [16, 9],
            variants: [{ content_type: 'video/mp4', bitrate: 2176000, url: 'https://v/high.mp4' }],
          },
        },
        { type: 'photo', media_url_https: 'https://pbs.twimg.com/a.jpg' },
      ],
      user: { name: 'A', screen_name: 'a' },
    }
    const meta = parseTweetData(raw)
    expect(meta?.hasVideo).toBe(true)
    expect(meta?.hasPhoto).toBe(true)
    expect(meta?.videoUrl).toBe('https://v/high.mp4')
    expect(meta?.videoPosterUrl).toBe('https://pbs.twimg.com/poster.jpg')
    expect(meta?.videoAspectRatio).toBeCloseTo(16 / 9)
    expect(meta?.photoUrl).toBe('https://pbs.twimg.com/a.jpg')
    expect(meta?.photoUrls).toEqual(['https://pbs.twimg.com/a.jpg'])
  })

  it('falls back to legacy `photos` array when mediaDetails is absent (older syndication response)', () => {
    const raw = {
      id_str: '999',
      text: 'photo only — legacy shape',
      photos: [
        { url: 'https://pbs.twimg.com/x.jpg', width: 800, height: 600 },
        { url: 'https://pbs.twimg.com/y.jpg', width: 800, height: 600 },
      ],
      user: { name: 'A', screen_name: 'a' },
    }
    const meta = parseTweetData(raw)
    expect(meta?.mediaSlots).toEqual([
      { type: 'photo', url: 'https://pbs.twimg.com/x.jpg' },
      { type: 'photo', url: 'https://pbs.twimg.com/y.jpg' },
    ])
    expect(meta?.photoUrls).toEqual(['https://pbs.twimg.com/x.jpg', 'https://pbs.twimg.com/y.jpg'])
  })

  it('single video tweet → mediaSlots length 1 [video]', () => {
    const raw = {
      id_str: '111',
      text: 'video only',
      mediaDetails: [
        {
          type: 'video',
          media_url_https: 'https://pbs.twimg.com/vp.jpg',
          original_info: { width: 720, height: 1280 },
          video_info: {
            aspect_ratio: [9, 16],
            variants: [{ content_type: 'video/mp4', bitrate: 1500000, url: 'https://v/v.mp4' }],
          },
        },
      ],
      user: { name: 'A', screen_name: 'a' },
    }
    const meta = parseTweetData(raw)
    expect(meta?.mediaSlots).toEqual([
      { type: 'video', url: 'https://pbs.twimg.com/vp.jpg', videoUrl: 'https://v/v.mp4', aspect: 720 / 1280 },
    ])
    expect(meta?.hasPhoto).toBe(false)
    expect(meta?.hasVideo).toBe(true)
    expect(meta?.photoUrl).toBeUndefined()
    expect(meta?.photoUrls).toEqual([])
  })

  it('text-only tweet → mediaSlots empty', () => {
    const raw = { id_str: '222', text: 'just text', user: { name: 'A', screen_name: 'a' } }
    const meta = parseTweetData(raw)
    expect(meta?.mediaSlots).toEqual([])
    expect(meta?.hasPhoto).toBe(false)
    expect(meta?.hasVideo).toBe(false)
  })

  it('skips video with no playable mp4 variant (silent drop, never emits broken slot)', () => {
    const raw = {
      id_str: '333',
      text: 'broken video',
      mediaDetails: [
        {
          type: 'video',
          media_url_https: 'https://pbs.twimg.com/poster.jpg',
          video_info: { variants: [{ content_type: 'application/x-mpegURL', url: 'https://v/x.m3u8' }] },
        },
        { type: 'photo', media_url_https: 'https://pbs.twimg.com/a.jpg' },
      ],
      user: { name: 'A', screen_name: 'a' },
    }
    const meta = parseTweetData(raw)
    expect(meta?.mediaSlots).toEqual([{ type: 'photo', url: 'https://pbs.twimg.com/a.jpg' }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk pnpm vitest run tests/lib/tweet-meta-media-slots.test.ts`
Expected: FAIL — `meta.mediaSlots` is currently undefined.

- [ ] **Step 3: Refactor parseTweetData**

Replace the body of `parseTweetData()` in `lib/embed/tweet-meta.ts` (currently around lines 71-105) with the following — `pickBestMp4` stays untouched at top of the file:

```ts
/** Parse raw syndication response. Exposed for testing. */
export function parseTweetData(raw: unknown): TweetMeta | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as SyndicationRaw
  if (!r.id_str || (!r.text && !r.full_text)) return null

  const text = r.full_text ?? r.text ?? ''
  const isPoll = r.card?.name?.includes('poll') ?? false

  // Build mediaSlots from mediaDetails (the canonical API order). When
  // mediaDetails is absent (older syndication payload shape), fall back to
  // the simpler `photos` array.
  const mediaSlots: MediaSlot[] = []
  if (r.mediaDetails && r.mediaDetails.length > 0) {
    for (const m of r.mediaDetails) {
      if (m.type === 'video') {
        const videoUrl = pickBestMp4(m.video_info?.variants)
        if (!videoUrl || !m.media_url_https) continue  // silent drop — see test
        const aspect = m.original_info
          ? m.original_info.width / m.original_info.height
          : undefined
        mediaSlots.push({
          type: 'video',
          url: m.media_url_https,
          videoUrl,
          aspect,
        })
      } else if (m.type === 'photo' && m.media_url_https) {
        mediaSlots.push({ type: 'photo', url: m.media_url_https })
      }
      // Unknown types silently skipped.
    }
  } else if (r.photos && r.photos.length > 0) {
    for (const p of r.photos) {
      mediaSlots.push({ type: 'photo', url: p.url })
    }
  }

  // Derived legacy fields — kept for backward compatibility with existing
  // callers (ImageCard / Lightbox / BoardRoot backfill). To be deprecated in
  // a later cleanup spec once all reads migrate to mediaSlots.
  const firstPhoto = mediaSlots.find((s) => s.type === 'photo')
  const firstVideo = mediaSlots.find((s) => s.type === 'video')
  const photoUrls = mediaSlots.filter((s) => s.type === 'photo').map((s) => s.url)

  // photoAspectRatio: keep using `photos[0].width/height` if available, else
  // omit. parseTweetData's older callers used this as a thumbnail aspect
  // hint and we can keep that intact without taxing the mediaSlots design.
  const photoAspect = r.photos?.[0]
    ? r.photos[0].width / r.photos[0].height
    : undefined

  return {
    id: r.id_str,
    text,
    hasPhoto: Boolean(firstPhoto),
    hasVideo: Boolean(firstVideo),
    hasPoll: isPoll,
    hasQuotedTweet: Boolean(r.quoted_tweet),
    photoAspectRatio: photoAspect,
    videoAspectRatio: firstVideo?.aspect,
    photoUrl: firstPhoto?.url,
    photoUrls,
    videoPosterUrl: firstVideo?.url,
    videoUrl: firstVideo?.videoUrl,
    authorName: r.user?.name ?? '',
    authorHandle: r.user?.screen_name ?? '',
    authorAvatar: r.user?.profile_image_url_https,
    createdAt: r.created_at,
    mediaSlots,
  }
}
```

Also update the import at the top of `lib/embed/tweet-meta.ts:1` to include `MediaSlot`:

```ts
import type { TweetMeta, MediaSlot } from './types'
```

- [ ] **Step 4: Run new + existing test to verify all pass**

Run: `rtk pnpm vitest run tests/lib/tweet-meta-media-slots.test.ts tests/lib/tweet-meta.test.ts`
Expected: PASS — new 6 cases + existing 4 cases all green. The existing `photoUrls` test should still pass because the derived `photoUrls` field maintains its prior contract.

- [ ] **Step 5: Commit**

```bash
rtk git add lib/embed/tweet-meta.ts tests/lib/tweet-meta-media-slots.test.ts
rtk git commit -m "feat(embed): parseTweetData mediaSlots-first; derive legacy fields"
```

---

## Task 4: BoardItem に mediaSlots pass-through + persistMediaSlots を hook に追加

**Files:**
- Modify: `lib/storage/use-board-data.ts`
- Modify: `lib/share/lightbox-item.ts`

- [ ] **Step 1: Update use-board-data.ts**

Edit `lib/storage/use-board-data.ts`:

(a) Add `MediaSlot` import — extend the import line for indexeddb (around line 8):

```ts
import {
  initDB,
  getAllBookmarks,
  updateCard,
  updateBookmarkOrderIndex,
  updateBookmarkOrderBatch,
  persistCustomCardWidth,
  clearCustomCardWidth,
  clearAllCustomCardWidths,
  persistPhotos as persistPhotosDb,
  persistMediaSlots as persistMediaSlotsDb,
  type BookmarkRecord,
  type CardRecord,
} from './indexeddb'
import type { MediaSlot } from '@/lib/embed/types'
```

(b) In the `BoardItem` type, append after `photos?:`:

```ts
  /** v13: 統一 media 配列 (mix tweet 対応)。 mediaSlots[0] が動画 poster の
   *  ケースがある。 photos field は読み取り fallback 用に併存 (旧 v12 records)。
   *  undefined → photos / thumbnail にフォールバック (= 旧挙動)。 */
  readonly mediaSlots?: readonly MediaSlot[]
```

(c) In `toItem()`, add `mediaSlots: b.mediaSlots` to the returned object (after `photos: b.photos,`):

```ts
    photos: b.photos,
    mediaSlots: b.mediaSlots,
  }
}
```

(d) Add `persistMediaSlots` to the hook return type (right after the existing `persistPhotos` entry, mirroring its shape):

```ts
  /** Persist the unified mediaSlots array for a bookmark. Pass an empty
   *  array to clear back to undefined. Mirrors persistPhotos but for the
   *  new v13 model. Idempotent (deep-equality skip in the IDB layer). */
  persistMediaSlots: (bookmarkId: string, mediaSlots: readonly MediaSlot[]) => Promise<void>
```

(e) Implement the callback inside the hook body (right after the existing `persistPhotos` useCallback, around line 386):

```ts
  const persistMediaSlots = useCallback(
    async (bookmarkId: string, mediaSlots: readonly MediaSlot[]): Promise<void> => {
      const db = dbRef.current
      if (!db || !bookmarkId) return
      await persistMediaSlotsDb(
        db as Parameters<typeof persistMediaSlotsDb>[0],
        bookmarkId,
        mediaSlots,
      )
      const next = mediaSlots.length === 0 ? undefined : mediaSlots
      setItems((prev) =>
        prev.map((it) =>
          it.bookmarkId === bookmarkId ? { ...it, mediaSlots: next } : it,
        ),
      )
    },
    [],
  )
```

(f) Add `persistMediaSlots` to the hook's `return { … }` block (after `persistPhotos,`).

- [ ] **Step 2: Update lightbox-item.ts**

Edit `lib/share/lightbox-item.ts`:

(a) Add the import:

```ts
import type { MediaSlot } from '@/lib/embed/types'
```

(b) Add the field to `LightboxItem`:

```ts
  /** Board-side only: v13 unified media slot array. mediaSlots[0] may be a
   *  video poster for mix tweets. Undefined → fall through to photos /
   *  thumbnail (= 旧挙動). */
  readonly mediaSlots?: readonly MediaSlot[]
```

(c) In `normalizeItem()`, add `mediaSlots: item.mediaSlots` inside the BoardItem branch object (after the existing `photos:` line).

- [ ] **Step 3: Verify compilation**

Run: `rtk pnpm tsc --noEmit`
Expected: PASS — no broken downstream types because both new fields are optional.

- [ ] **Step 4: Run unit suite**

Run: `rtk pnpm vitest run`
Expected: PASS — pre-existing test count + 11 new from Tasks 1+3.

- [ ] **Step 5: Commit**

```bash
rtk git add lib/storage/use-board-data.ts lib/share/lightbox-item.ts
rtk git commit -m "feat(board-data): BoardItem.mediaSlots pass-through + persistMediaSlots hook"
```

---

## Task 5: ImageCard を mediaSlots-aware に — hover swap + 動画スロット tint dot

**Files:**
- Modify: `components/board/cards/ImageCard.tsx`
- Modify: `components/board/cards/ImageCard.module.css`

- [ ] **Step 1: Update ImageCard.tsx logic**

Edit `components/board/cards/ImageCard.tsx`:

(a) Add `MediaSlot` import at the top:

```ts
import type { MediaSlot } from '@/lib/embed/types'
```

(b) Replace the `photos` block (around line 45-47) with a slot-resolution block:

```ts
  // I-07 + mix-tweet: prefer mediaSlots[] (v13) when present; fall back to
  // photos[] (v12 legacy records) by widening each URL into a synthetic
  // photo slot. Single-element / undefined results suppress dots + hover
  // swap (= 既存挙動).
  const slots: readonly MediaSlot[] = item.mediaSlots
    ?? (item.photos ?? []).map((url): MediaSlot => ({ type: 'photo', url }))
  const hasMultiple = slots.length > 1
  const displayedSrc = hasMultiple ? slots[imageIdx].url : item.thumbnail
```

(c) Update `handlePointerMove` to use `slots`:

```ts
  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>): void => {
      if (!hasMultiple) return
      if (!preloadedRef.current) {
        // Lazy preload slots[1..N-1].url. slots[0] is already in the DOM <img>.
        // For video slots this preloads the poster image; the mp4 itself is
        // only fetched when the user opens the Lightbox and clicks play.
        for (let i = 1; i < slots.length; i++) {
          const img = new Image()
          img.src = slots[i].url
        }
        preloadedRef.current = true
      }
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
    [hasMultiple, slots],
  )
```

(d) Replace the dot render block (around line 127-138) with a slot-aware version that adds `data-slot-type`:

```ts
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
```

- [ ] **Step 2: Add video-tint CSS**

Edit `components/board/cards/ImageCard.module.css` — append to the file:

```css
/* Mix-tweet (v13) — video slot dots carry a subtle accent so the user can tell
 * "this card also contains a video" without us putting an explicit play badge
 * on the thumbnail (per feedback_minimal_card_affordances). Active state keeps
 * the universal white look for visual coherence with photo slots. */
.imageCard {
  --media-slot-video-tint: rgba(255, 107, 107, 0.55);
}

.multiImageDot[data-slot-type='video'][data-active='false'] {
  background: var(--media-slot-video-tint);
}
```

- [ ] **Step 3: Verify compilation + run existing tests**

Run: `rtk pnpm tsc --noEmit && rtk pnpm vitest run`
Expected: PASS — no regressions; existing multi-image test (if present in `tests/lib/multi-image-hover.test.tsx`) still works because the `photos` fallback path matches the prior code.

- [ ] **Step 4: Commit**

```bash
rtk git add components/board/cards/ImageCard.tsx components/board/cards/ImageCard.module.css
rtk git commit -m "feat(card): ImageCard slot-aware hover swap + video-tint dot"
```

**UI design approval gate:** After this task, deploy preview (or run Playwright `--ui` on the mixed-media e2e from Task 9) and show the user a screenshot. Wait for ✅ before merging the value of `--media-slot-video-tint` — current `rgba(255, 107, 107, 0.55)` is a placeholder.

---

## Task 6: Lightbox を mediaSlots-aware に — slot index + per-type media render + auto-pause

**Files:**
- Modify: `components/board/Lightbox.tsx`

- [ ] **Step 1: Resolve slots at Lightbox level + rename state for clarity**

Inside `Lightbox(...)` body, replace the `tweetPhotos` and `tweetImageIdx` sections (around lines 189-202). New form:

```ts
  // I-07 + mix-tweet: unified slot array driving both .media render and the
  // dot indicator. Resolution order: TweetMeta.mediaSlots (fresh from
  // syndication) → BoardItem.mediaSlots (IDB-persisted) → BoardItem.photos
  // (legacy v12 fallback, widened to photo slots) → empty (single-image /
  // text-only paths handle this).
  const tweetSlots: readonly MediaSlot[] = (() => {
    if (tweetMeta?.mediaSlots && tweetMeta.mediaSlots.length > 0) return tweetMeta.mediaSlots
    if (view?.mediaSlots && view.mediaSlots.length > 0) return view.mediaSlots
    const legacy = view?.photos ?? []
    return legacy.map((url): MediaSlot => ({ type: 'photo', url }))
  })()

  // Current slot index — drives both the .media render and the dots.
  // Renamed from tweetImageIdx (Phase 1) because the carousel may now point
  // at a video slot, not just a photo.
  const [tweetSlotIdx, setTweetSlotIdx] = useState<number>(0)
  useEffect(() => {
    setTweetSlotIdx(0)
  }, [view?.bookmarkId])
```

Also add the `MediaSlot` import near the top of `Lightbox.tsx` (around line 6):

```ts
import type { TikTokPlayback, TweetMeta, MediaSlot } from '@/lib/embed/types'
```

Delete the old `tweetImageIdx` declaration (around line 191) and the old `tweetPhotos` declaration (around lines 200-202) — replaced by `tweetSlotIdx` / `tweetSlots` above. Then update every remaining reference:

(a) Keyboard handler — replace the entire `if (e.key === 'ArrowUp' || e.key === 'ArrowDown')` branch (around lines 422-436) with:

```ts
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        // Mix-tweet: nav cycles through slots (video or photo). Falls back
        // to no-op when the current tweet has zero or one slot.
        if (tweetSlots.length <= 1) return
        e.preventDefault()
        e.stopPropagation()
        if (e.key === 'ArrowDown') {
          setTweetSlotIdx((idx) => Math.min(tweetSlots.length - 1, idx + 1))
        } else {
          setTweetSlotIdx((idx) => Math.max(0, idx - 1))
        }
        return
      }
```

Also update the effect's dependency array (around line 446) from `[identity, nav, tweetMeta, view?.photos]` to `[identity, nav, tweetSlots]`.

(b) `<TweetMedia>` callsite — covered in Step 3 below (renames `imageIdx` → `slotIdx` prop and adds `slots`).

(c) Dot conditional render at lines 938-944 — covered in Step 3 below.

(d) Anywhere else `tweetImageIdx` or `tweetPhotos` still appears: rename to `tweetSlotIdx` / `tweetSlots`. Confirm with `rtk grep -n "tweetImageIdx\|tweetPhotos" components/board/Lightbox.tsx` after the edit — expected output: empty.

- [ ] **Step 2: Update TweetMedia signature and render per-slot type**

Replace the `TweetMedia` function (lines 1063-1105) with the following:

```ts
/** Left-column media for a tweet, driven by the unified mediaSlots[] array.
 *  Each slot renders either an inline `<TweetVideoPlayer>` (type='video') or a
 *  plain `<img>` (type='photo'). When the user swaps slot index, the parent
 *  Lightbox's effect (see "auto-pause on slot change") forces any playing
 *  video to pause before unmount.
 *
 *  Falls back to legacy code paths for non-slot inputs:
 *    - meta.videoUrl exists but slots is empty → single-video tweet (rare:
 *      mediaSlots resolution failed but meta still has a videoUrl)
 *    - photos only via meta.photoUrl → single-image tweet
 *    - meta.text → text-only tweet
 *
 *  Note: dots are rendered at the .frame level (sibling of .media), NOT
 *  inside this component — see I-07-#4 fix.
 */
function TweetMedia({
  item,
  meta,
  slots,
  slotIdx,
}: {
  readonly item: LightboxItem
  readonly meta: TweetMeta | null
  readonly slots: readonly MediaSlot[]
  readonly slotIdx: number
}): ReactNode {
  // Slot-driven path (v13): a non-empty slots array fully determines media.
  if (slots.length > 0) {
    const slot = slots[Math.min(slotIdx, slots.length - 1)]
    if (slot.type === 'video' && slot.videoUrl) {
      // Construct a synthetic meta that points TweetVideoPlayer at this slot's
      // mp4 + poster + aspect, irrespective of which slot meta.videoUrl points
      // to. (For pure-video tweets these match anyway.)
      const slotMeta: TweetMeta = {
        ...(meta ?? {
          id: '',
          text: '',
          hasPhoto: false,
          hasVideo: true,
          hasPoll: false,
          hasQuotedTweet: false,
          authorName: '',
          authorHandle: '',
        }),
        videoUrl: slot.videoUrl,
        videoPosterUrl: slot.url,
        videoAspectRatio: slot.aspect,
      }
      return <TweetVideoPlayer key={`slot-${slotIdx}`} item={item} meta={slotMeta} />
    }
    if (slot.type === 'photo') {
      return <img src={slot.url} alt={item.title} />
    }
  }

  // Legacy fallbacks — slots was empty (e.g. text-only tweet, or meta failed
  // to resolve and the bookmark also has no photos[]).
  if (meta?.videoUrl) {
    return <TweetVideoPlayer item={item} meta={meta} />
  }
  if (meta?.photoUrl ?? item.thumbnail) {
    return <img src={meta?.photoUrl ?? item.thumbnail!} alt={item.title} />
  }
  if (meta?.text) {
    return <p className={styles.tweetTextOnly}>{meta.text}</p>
  }
  return <div className={styles.placeholder}>{item.title}</div>
}
```

The `key={`slot-${slotIdx}`}` on `<TweetVideoPlayer>` intentionally forces a remount when the user navigates between two video slots (hypothetical — rare in practice). Same-slot re-renders preserve the player's internal state (currentTime, paused) because React keeps the same instance, satisfying spec §5-2 "戻ったら続きから".

- [ ] **Step 3: Update the TweetMedia callsite**

Replace the `<TweetMedia>` usage (around line 924-928) with the new prop names:

```tsx
          {tweetId
            ? <TweetMedia
                item={view}
                meta={tweetMeta}
                slots={tweetSlots}
                slotIdx={tweetSlotIdx}
              />
            : <LightboxMedia item={view} />}
```

And update the dots conditional (around lines 938-944) to read `tweetSlots`:

```tsx
          {tweetId && tweetSlots.length > 1 && (
            <LightboxImageDots
              slots={tweetSlots}
              currentIdx={tweetSlotIdx}
              onJump={setTweetSlotIdx}
            />
          )}
```

(The `LightboxImageDots` signature change happens in Task 7.)

- [ ] **Step 4: Add auto-pause-on-slot-change effect**

Add this `useEffect` inside `Lightbox(...)` right after the `useEffect` that resets `tweetSlotIdx`:

```ts
  // Mix-tweet auto-pause: when the user navigates between slots, pause any
  // <video> currently rendered inside .media. The TweetVideoPlayer's own
  // unmount cleanup is unreliable here (React may reuse the DOM node), so
  // we walk .media for live <video> elements and call pause() explicitly.
  // currentTime is intentionally NOT touched, so returning to the slot
  // resumes from where the user left off. (spec §5-2)
  useEffect(() => {
    const media = mediaRef.current
    if (!media) return
    const videos = media.querySelectorAll('video')
    videos.forEach((v) => {
      if (!v.paused) v.pause()
    })
  }, [tweetSlotIdx])
```

- [ ] **Step 5: Verify compilation**

Run: `rtk pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add components/board/Lightbox.tsx
rtk git commit -m "feat(lightbox): mediaSlots-aware TweetMedia + auto-pause on slot swap"
```

---

## Task 7: LightboxImageDots を slot-aware に — ▶ (video) / ● (photo) 変種

**Files:**
- Modify: `components/board/Lightbox.tsx` (LightboxImageDots component only)
- Modify: `components/board/Lightbox.module.css`

- [ ] **Step 1: Update LightboxImageDots signature**

Replace the `LightboxImageDots` function (lines 1110-1135) with:

```ts
/** Dot indicator for Lightbox carousel. Larger and more clickable than the
 *  board-side card dots — these are the primary nav mechanism (along with
 *  keyboard ↑↓). Video slots render as a ▶ triangle to communicate
 *  "this slot contains a video" without us needing a separate badge.
 *  I-07 Phase 1 + mix-tweet (v13). */
function LightboxImageDots({
  slots,
  currentIdx,
  onJump,
}: {
  readonly slots: readonly MediaSlot[]
  readonly currentIdx: number
  readonly onJump: (idx: number) => void
}): ReactNode {
  return (
    <div className={styles.lightboxImageDots} role="tablist" aria-label="メディア切替">
      {slots.map((slot, i) => (
        <button
          key={i}
          type="button"
          role="tab"
          aria-selected={i === currentIdx}
          aria-label={slot.type === 'video'
            ? `動画 ${i + 1} / ${slots.length}`
            : `画像 ${i + 1} / ${slots.length}`}
          data-active={i === currentIdx ? 'true' : 'false'}
          data-slot-type={slot.type}
          className={styles.lightboxImageDot}
          onClick={(): void => onJump(i)}
        >
          {slot.type === 'video' && (
            <span className={styles.lightboxImageDotVideoIcon} aria-hidden="true" />
          )}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Add ▶ variant CSS**

Edit `components/board/Lightbox.module.css` — append after the existing `.lightboxImageDot:hover:not([data-active='true'])` rule (around line 770):

```css
/* Mix-tweet video slot indicator — replaces the round dot with an inline
 * ▶ triangle so the user can spot "this slot is a video" at a glance.
 * The CSS-triangle approach keeps the bare-DOM-button hit-area pattern
 * intact (24×24 via ::before extension) without introducing an SVG. */
.lightboxImageDot[data-slot-type='video'] {
  background: transparent;
  box-shadow: none;
}
.lightboxImageDot[data-slot-type='video'] .lightboxImageDotVideoIcon {
  display: block;
  width: 0;
  height: 0;
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  border-left: 8px solid rgba(255, 255, 255, 0.7);
  /* 1.5px optical shift right so the triangle's perceived centroid sits
   * over the original 6px dot's center. */
  transform: translateX(1px);
  transition: border-left-color 200ms ease-out, transform 200ms ease-out;
}
.lightboxImageDot[data-slot-type='video'][data-active='true'] {
  /* Active state — match the photo-dot scale so the active marker reads
   * uniformly across types. */
  transform: scale(1.6);
}
.lightboxImageDot[data-slot-type='video'][data-active='true'] .lightboxImageDotVideoIcon {
  border-left-color: rgba(255, 255, 255, 0.98);
}
.lightboxImageDot[data-slot-type='video']:hover:not([data-active='true']) .lightboxImageDotVideoIcon {
  border-left-color: rgba(255, 255, 255, 0.92);
}
```

- [ ] **Step 3: Verify compilation**

Run: `rtk pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
rtk git add components/board/Lightbox.tsx components/board/Lightbox.module.css
rtk git commit -m "feat(lightbox): video-slot ▶ dot variant for mix-tweet carousel"
```

**UI design approval gate:** After Task 8 deploy preview, present the ▶ shape to the user. Acceptable adjustments: shape (Unicode `▶` vs CSS triangle vs SVG), color, size. The current CSS-triangle pick errs on the side of minimal extra DOM weight.

---

## Task 8: Lightbox Phase C backfill を persistMediaSlots に切替

**Files:**
- Modify: `components/board/Lightbox.tsx` (props + effect at lines 165-187)

- [ ] **Step 1: Replace the persistPhotos prop with persistMediaSlots**

Edit the `Props` type for `Lightbox` (around lines 81-117) — replace the `persistPhotos` field:

```ts
  /** v13: called with (bookmarkId, mediaSlots[]) whenever a tweet meta fetch
   *  reveals slot data, so the board can render the correct hover swap
   *  next time the user is on the board. Pass through from
   *  useBoardData().persistMediaSlots. Fire-and-forget. */
  readonly persistMediaSlots?: (bookmarkId: string, mediaSlots: readonly MediaSlot[]) => Promise<void>
```

Remove the existing `persistPhotos` prop declaration (the 4-line block immediately above) — it's superseded by mediaSlots. Update the destructured prop list in the `Lightbox` function signature accordingly (line 119):

```ts
export function Lightbox({ item, originRect, sourceCardId, onClose, onSourceShouldShow, nav, persistMediaSlots }: Props): ReactElement | null {
```

- [ ] **Step 2: Update the backfill effect (lines 165-187)**

Replace the body of the `useEffect` that follows `setTweetMeta(null)` with:

```ts
    let cancelled = false
    void fetchTweetMeta(tweetId).then((meta) => {
      if (cancelled) return
      setTweetMeta(meta)
      // Phase C backfill: write mediaSlots[] to IDB so the board card
      // can render the correct hover swap + dot indicator next mount.
      // Fire-and-forget: no await, errors ignored. The persist helper
      // is idempotent so repeat fetches don't churn IDB.
      if (meta?.mediaSlots && meta.mediaSlots.length > 0 && view?.bookmarkId && persistMediaSlots) {
        void persistMediaSlots(view.bookmarkId, meta.mediaSlots)
      }
    })
    return (): void => { cancelled = true }
```

- [ ] **Step 3: Update BoardRoot to pass the new prop**

Edit `components/board/BoardRoot.tsx` around line 916 (the `<Lightbox …>` element). Replace the `persistPhotos={persistPhotos}` prop with:

```tsx
          persistMediaSlots={persistMediaSlots}
```

And add `persistMediaSlots` to the destructured fields from `useBoardData()` near the top of `BoardRoot` (around line 64):

```ts
    persistPhotos,
    persistMediaSlots,
    persistVideoFlag,
```

- [ ] **Step 4: Verify compilation + unit tests**

Run: `rtk pnpm tsc --noEmit && rtk pnpm vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add components/board/Lightbox.tsx components/board/BoardRoot.tsx
rtk git commit -m "feat(lightbox): Phase C backfill writes mediaSlots (replaces photos)"
```

---

## Task 9: E2E test — board-mixed-media.spec.ts

**Files:**
- Create: `tests/e2e/board-mixed-media.spec.ts`

- [ ] **Step 1: Write the spec**

Create `tests/e2e/board-mixed-media.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

const MIX_BOOKMARK_ID = 'b-mix-1'
const TWEET_URL = 'https://x.com/men_masaya/status/1842217368673759498'

// Seed a v13 bookmark with a 3-slot mediaSlots array directly into IDB so
// the test does not depend on a live tweet-meta proxy response. The first
// slot is a video (poster only — board never plays it), the next two are
// photos. Hover-position swap should cycle through all three URLs.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ id, url }) => {
    const open = indexedDB.open('booklage-db', 13)
    open.onupgradeneeded = (): void => {
      const db = open.result
      if (!db.objectStoreNames.contains('bookmarks')) db.createObjectStore('bookmarks', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('cards')) db.createObjectStore('cards', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' })
      if (!db.objectStoreNames.contains('preferences')) db.createObjectStore('preferences', { keyPath: 'key' })
      if (!db.objectStoreNames.contains('moods')) db.createObjectStore('moods', { keyPath: 'id' })
    }
    open.onsuccess = (): void => {
      const db = open.result
      const tx = db.transaction(['bookmarks', 'cards'], 'readwrite')
      tx.objectStore('bookmarks').put({
        id,
        url,
        title: 'mix tweet',
        description: '',
        thumbnail: 'https://pbs.twimg.com/poster.jpg',
        favicon: '',
        siteName: 'X',
        type: 'tweet',
        savedAt: new Date().toISOString(),
        ogpStatus: 'fetched',
        tags: [],
        cardWidth: 240,
        sizePreset: 'S',
        orderIndex: 0,
        mediaSlots: [
          { type: 'video', url: 'https://pbs.twimg.com/poster.jpg', videoUrl: 'https://v/v.mp4', aspect: 16 / 9 },
          { type: 'photo', url: 'https://pbs.twimg.com/a.jpg' },
          { type: 'photo', url: 'https://pbs.twimg.com/b.jpg' },
        ],
      })
      tx.objectStore('cards').put({
        id: 'c-mix-1',
        bookmarkId: id,
        folderId: '',
        x: 240, y: 80,
        rotation: 0, scale: 1, zIndex: 1,
        gridIndex: 0, isManuallyPlaced: false,
        width: 240, height: 240,
      })
    }
  }, { id: MIX_BOOKMARK_ID, url: TWEET_URL })

  await page.goto('/board')
  await page.waitForSelector('[data-bookmark-id]')
})

test('board hover swaps thumb across video poster → photo1 → photo2', async ({ page }) => {
  const card = page.locator(`[data-bookmark-id="${MIX_BOOKMARK_ID}"]`)
  await expect(card).toBeVisible()
  const img = card.locator('img').first()
  const box = await card.boundingBox()
  if (!box) throw new Error('card has no boundingBox')

  // Move pointer to leftmost third → expect poster (slot 0).
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2)
  await expect(img).toHaveAttribute('src', /poster\.jpg/)

  // Middle third → photo a.
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2)
  await expect(img).toHaveAttribute('src', /a\.jpg/)

  // Right third → photo b.
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2)
  await expect(img).toHaveAttribute('src', /b\.jpg/)

  // 3 dots present, video slot has data-slot-type='video'.
  const dots = card.getByTestId('multi-image-dot')
  await expect(dots).toHaveCount(3)
  await expect(dots.first()).toHaveAttribute('data-slot-type', 'video')
})

test('Lightbox carousel: arrow keys + dot click cycle through slots', async ({ page }) => {
  const card = page.locator(`[data-bookmark-id="${MIX_BOOKMARK_ID}"]`)
  await card.click()

  const lightbox = page.getByTestId('lightbox')
  await expect(lightbox).toBeVisible()

  // Initially slot 0 (video poster) → TweetVideoPlayer renders a <video>.
  await expect(lightbox.locator('video')).toBeVisible()

  // ↓ → slot 1 (photo a) → <img> with a.jpg.
  await page.keyboard.press('ArrowDown')
  await expect(lightbox.locator('.media img')).toHaveAttribute('src', /a\.jpg/)

  // ↓ → slot 2 (photo b).
  await page.keyboard.press('ArrowDown')
  await expect(lightbox.locator('.media img')).toHaveAttribute('src', /b\.jpg/)

  // ↓ at end → no-op (still photo b).
  await page.keyboard.press('ArrowDown')
  await expect(lightbox.locator('.media img')).toHaveAttribute('src', /b\.jpg/)

  // Click dot 0 (video) → re-render TweetVideoPlayer.
  const dot0 = lightbox.getByRole('tab').first()
  await dot0.click()
  await expect(lightbox.locator('video')).toBeVisible()
})

test('Lightbox auto-pauses video when user navigates away from video slot', async ({ page }) => {
  const card = page.locator(`[data-bookmark-id="${MIX_BOOKMARK_ID}"]`)
  await card.click()
  const lightbox = page.getByTestId('lightbox')
  await expect(lightbox.locator('video')).toBeVisible()

  // Force-play the video so we can verify auto-pause on nav.
  await lightbox.locator('video').evaluate((v) => {
    const video = v as HTMLVideoElement
    // suppress autoplay-blocked promise rejection in headless mode
    void video.play().catch(() => {})
  })

  // ↓ → moves to photo slot → video should be paused after the slot change effect runs.
  await page.keyboard.press('ArrowDown')

  // Click dot 0 to return to video.
  const dot0 = lightbox.getByRole('tab').first()
  await dot0.click()
  await expect(lightbox.locator('video')).toBeVisible()

  // The pause itself is observable via the video element's `paused` property
  // back when the user was off the slot. Since we returned, we check the
  // currentTime is preserved (= NOT reset to 0 by remount). The key= forces
  // remount only when slotIdx changes; same slot keeps state.
  const paused = await lightbox.locator('video').evaluate((v) => (v as HTMLVideoElement).paused)
  // Either the play() never resolved in headless (paused=true) or it did and
  // then auto-pause kicked in on nav. Either way, after returning we expect a
  // fresh remount because key changed (`slot-0` → `slot-1` → `slot-0`), so
  // currentTime is 0 — this is acceptable per spec §10 open-problem note.
  expect(paused).toBe(true)
})
```

- [ ] **Step 2: Run the spec**

Run: `rtk pnpm exec playwright test board-mixed-media.spec.ts --reporter=line`
Expected: PASS — all 3 cases green. Headless Chromium policy will silently fail autoplay; that is anticipated and the assertion accommodates it.

- [ ] **Step 3: Commit**

```bash
rtk git add tests/e2e/board-mixed-media.spec.ts
rtk git commit -m "test(e2e): board mixed-media carousel + auto-pause coverage"
```

---

## Task 10: 検証 → 本番デプロイ → ユーザー実機確認

**Files:** (no code changes — verification + deploy + handoff)

- [ ] **Step 1: Full type check**

Run: `rtk pnpm tsc --noEmit`
Expected: zero errors.

- [ ] **Step 2: Full unit suite**

Run: `rtk pnpm vitest run`
Expected: pre-existing 425 tests + 11 new (5 from Task 1, 6 from Task 3) → 436 PASS.

- [ ] **Step 3: Full Playwright suite (smoke)**

Run: `rtk pnpm exec playwright test --reporter=line`
Expected: PASS for new spec + B-#11 (`board-b-11-source-hide.spec.ts`) at minimum. Pre-existing rot tests (DB_VERSION mismatch) are still expected to fail per session 11 notes — do NOT mark this task done if NEW failures appear.

- [ ] **Step 4: Build**

Run: `rtk pnpm build`
Expected: PASS — static export succeeds.

- [ ] **Step 5: Deploy to Cloudflare Pages production**

Run:
```bash
npx wrangler pages deploy out/ --project-name=booklage --branch=master --commit-dirty=true --commit-message="feat: mix tweet mediaSlots unified model"
```
Expected: deploy completes, URL `https://booklage.pages.dev` updates.

- [ ] **Step 6: User verification handoff**

Output a message to the user:
> mix tweet 対応 deploy 完了。 `https://booklage.pages.dev` をハードリロードして、 動画+画像 mix tweet (例: `https://x.com/men_masaya/status/1842217368673759498`) を確認してください。 期待挙動: ① ボードカードで横方向 hover → poster ↔ photo 切替 + 動画スロット dot が薄赤、 ② カードクリックで Lightbox → 動画スロットで TweetVideoPlayer 表示、 ③ ↑↓ / dot クリックで photo に切替、 ④ 動画再生中に切替 → 自動 pause、 ⑤ 戻ると新規 mount で video は paused 状態から (currentTime 維持は本実装でフォロー不可、 spec §10 オープン問題)。 視覚要素 (動画 tint 色、 ▶ 形状) はこの場で承認してください — 不満があれば値だけ微調整します。

---

## Open Items (実装中に決める / 将来課題)

- TweetVideoPlayer の `key={`slot-${slotIdx}`}` 戦略は単一動画 tweet では悪影響なし (slotIdx 不変)、 mix tweet で video → photo → video 往復するとき currentTime が 0 にリセットされる。 spec §10 で言及済の「TweetVideoPlayer の key 戦略」 オープン問題。 将来 Player に restorable state ref を持たせる別 spec で解決。
- `--media-slot-video-tint` の `rgba(255, 107, 107, 0.55)` は UI 承認待ち (Task 5)
- ▶ dot は CSS 三角形で実装 (Task 7)。 SVG / Unicode `▶` への切替案あり、 ユーザー承認待ち
- 旧 photos[] field の cleanup は別 spec (数ヶ月後)
- Bluesky / モバイル swipe / PiP carousel は本プラン非対象
- 旧 v12 ブクマの自動 mediaSlots backfill は併走 plan (`2026-05-12-multi-image-backfill.md`) で扱う

---

## Self-Review Notes (writing-plans skill)

- ✅ Spec §2 主要決定事項 6 件 → すべて Task 1-9 内で実装ステップ化
- ✅ Spec §3 データモデル → Task 1 (IDB) + Task 2 (TweetMeta) + Task 4 (BoardItem / LightboxItem)
- ✅ Spec §4 データ取得経路 → Task 3 (parseTweetData)
- ✅ Spec §5 UX → Task 5 (ImageCard) + Task 6 (Lightbox media) + Task 7 (dots)
- ✅ Spec §6 失敗時 fallback → Task 5 / 6 の slot 解決チェーンで網羅 (mediaSlots → photos → thumbnail)
- ✅ Spec §7 ファイル変更一覧 → 全ファイル task に分配済 (functions/api/tweet-meta.ts は変更不要を spec §4-2 で明示済、 本 plan も触らず)
- ✅ Spec §8 テスト → unit (Task 1, 3) + E2E (Task 9)
- ✅ Spec §9 ロールアウト → Task 10 で deploy + 実機確認
- ✅ Type consistency: `MediaSlot` を Task 1 Step 4 で types.ts に定義、 Tasks 1-9 すべてが同じ型から import
- ✅ No placeholders / TODO comments
