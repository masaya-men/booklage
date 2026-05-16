# I-07 Multi-Image Hover — Phase 1 (X tweets) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make multi-image X (Twitter) posts viewable via hover-position image swap on the board and dot-indicator + keyboard nav inside the Lightbox.

**Architecture:** Persist photo URLs to IDB (v12 schema bump, optional field). Backfill happens as a side-effect of the existing Lightbox tweet-meta fetch — board mount stays untouched to protect PiP / first paint. ImageCard learns to read `item.photos` and swaps `<img src>` based on pointer X mapped to `[0..N-1]`. Lightbox `TweetMedia` becomes a tiny stateful carousel. All graceful fallbacks: missing photos → existing single-image behavior, unchanged.

**Tech Stack:** Next.js 14 App Router · TypeScript strict · idb / fake-indexeddb · vitest · Playwright · GSAP (existing) · vanilla CSS modules

**Spec:** [docs/superpowers/specs/2026-05-12-multi-image-hover-design.md](../specs/2026-05-12-multi-image-hover-design.md)

**Scope:** Phase 1 only (X tweets). Bluesky support is a separate plan/session (Phase 2).

---

## File Structure

**Create:**
- `tests/lib/idb-v12-photos.test.ts` — schema migration + persistPhotos test
- `tests/lib/tweet-meta.test.ts` — parseTweetData multi-image test
- `tests/lib/multi-image-hover.test.tsx` — ImageCard hover-position → image index mapping test (jsdom + @testing-library/react)
- `tests/e2e/board-i-07-multi-image.spec.ts` — full board hover + Lightbox carousel E2E

**Modify:**
- `lib/constants.ts:21` — `DB_VERSION` 11 → 12
- `lib/storage/indexeddb.ts` — add `photos?: readonly string[]` to `BookmarkRecord`, add v12 no-op migration block, add `persistPhotos()` function
- `lib/storage/use-board-data.ts` — `BoardItem.photos` pass-through, `persistPhotos` wired into the hook
- `lib/embed/types.ts` — `TweetMeta.photoUrls?: readonly string[]`
- `lib/embed/tweet-meta.ts` — `parseTweetData()` collects all photos
- `components/board/cards/ImageCard.tsx` — hover-position image swap, lazy preload, dot indicator
- `components/board/cards/ImageCard.module.css` — dot indicator styles
- `components/board/Lightbox.tsx` — `TweetMedia` carousel state + keyboard ↑↓ + backfill side-effect
- `components/board/Lightbox.module.css` — Lightbox dot indicator styles

---

## Task 1: IDB v12 schema — add `photos` field to BookmarkRecord

**Files:**
- Modify: `lib/constants.ts:21`
- Modify: `lib/storage/indexeddb.ts` (BookmarkRecord type + v12 migration block)
- Create: `tests/lib/idb-v12-photos.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/idb-v12-photos.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { openDB, type IDBPDatabase } from 'idb'
import { initDB } from '@/lib/storage/indexeddb'
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

describe('IDB v12: photos field on BookmarkRecord', () => {
  it('DB_VERSION is 12', () => {
    expect(DB_VERSION).toBe(12)
  })

  it('initDB opens at v12 and bookmarks store accepts photos field', async () => {
    db = await initDB()
    expect(db.version).toBe(12)

    const bookmark = {
      id: 'b1',
      url: 'https://x.com/u/status/1',
      title: 'Test tweet',
      savedAt: Date.now(),
      orderIndex: 0,
      cardWidth: 240,
      tags: [],
      photos: ['https://pbs.twimg.com/a.jpg', 'https://pbs.twimg.com/b.jpg'],
    }
    await db.put('bookmarks', bookmark)
    const read = await db.get('bookmarks', 'b1')
    expect(read?.photos).toEqual([
      'https://pbs.twimg.com/a.jpg',
      'https://pbs.twimg.com/b.jpg',
    ])
  })

  it('existing v11 records with no photos field read as undefined', async () => {
    // Seed a v11-shaped row via low-level openDB (no photos field)
    const seedDb = await openDB(DB_NAME, 11, {
      upgrade(d) {
        if (!d.objectStoreNames.contains('bookmarks')) {
          d.createObjectStore('bookmarks', { keyPath: 'id' })
        }
      },
    })
    await seedDb.put('bookmarks', {
      id: 'b-legacy',
      url: 'https://x.com/u/status/2',
      title: 'Legacy',
      savedAt: Date.now(),
      orderIndex: 0,
      cardWidth: 240,
      tags: [],
    })
    seedDb.close()

    db = await initDB()
    expect(db.version).toBe(12)
    const read = await db.get('bookmarks', 'b-legacy')
    expect(read?.photos).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/idb-v12-photos.test.ts`
Expected: FAIL with "DB_VERSION is 11" (not 12) and/or schema mismatch

- [ ] **Step 3: Bump DB_VERSION**

Edit `lib/constants.ts` line 21:

```ts
export const DB_VERSION = 12
```

- [ ] **Step 4: Add photos field to BookmarkRecord**

In `lib/storage/indexeddb.ts`, locate the `BookmarkRecord` interface (around line 30-72) and add this field just before the closing brace:

```ts
  /** v12: 複数画像投稿で取得した全画像 URL の配列。 photos[0] は thumbnail と
   *  一致。 1 枚しかない投稿 / 未対応 SNS では undefined。 X tweet なら
   *  syndication API、 Bluesky なら public API から取得 (取得失敗時は
   *  undefined のまま、 既存単一画像表示に fallback)。 */
  photos?: readonly string[]
```

- [ ] **Step 5: Add v12 no-op migration block**

In `lib/storage/indexeddb.ts`, locate the v11 migration block (around line 474-478) and add immediately after it (before the closing `},` of the upgrade callback):

```ts
      // ── v11 → v12: introduce optional photos[] field on bookmarks (no-op
      // rewrite). Existing rows have `photos: undefined`, which the read
      // path treats as "no multi-image data" — no cursor sweep needed.
      // Bumping the schema version still serves as a tripwire so future
      // migrations can assume the field is observable when oldVersion >= 12.
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/idb-v12-photos.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 7: Run full vitest to confirm no regression**

Run: `rtk vitest run`
Expected: PASS for all tests except the known pre-existing `channel.test.ts` BroadcastChannel failure (not our concern)

- [ ] **Step 8: Commit**

```bash
rtk git add lib/constants.ts lib/storage/indexeddb.ts tests/lib/idb-v12-photos.test.ts
rtk git commit -m "$(cat <<'EOF'
feat(idb): v12 schema — optional photos[] field on BookmarkRecord

I-07 Phase 1 data layer. No-op migration; existing v11 rows have
photos: undefined and continue working unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: TweetMeta.photoUrls + parseTweetData multi-image

**Files:**
- Modify: `lib/embed/types.ts` (TweetMeta type)
- Modify: `lib/embed/tweet-meta.ts` (parseTweetData)
- Create: `tests/lib/tweet-meta.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/tweet-meta.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseTweetData } from '@/lib/embed/tweet-meta'

describe('parseTweetData — photoUrls', () => {
  it('returns photoUrls for 4-photo tweet, photoUrl[0] for backwards compat', () => {
    const raw = {
      id_str: '123',
      text: 'four photos',
      photos: [
        { url: 'https://pbs.twimg.com/a.jpg', width: 800, height: 600 },
        { url: 'https://pbs.twimg.com/b.jpg', width: 800, height: 600 },
        { url: 'https://pbs.twimg.com/c.jpg', width: 800, height: 600 },
        { url: 'https://pbs.twimg.com/d.jpg', width: 800, height: 600 },
      ],
      user: { name: 'A', screen_name: 'a' },
    }
    const meta = parseTweetData(raw)
    expect(meta).not.toBeNull()
    expect(meta?.photoUrls).toEqual([
      'https://pbs.twimg.com/a.jpg',
      'https://pbs.twimg.com/b.jpg',
      'https://pbs.twimg.com/c.jpg',
      'https://pbs.twimg.com/d.jpg',
    ])
    expect(meta?.photoUrl).toBe('https://pbs.twimg.com/a.jpg')
    expect(meta?.hasPhoto).toBe(true)
  })

  it('returns empty photoUrls array for text-only tweet', () => {
    const raw = { id_str: '456', text: 'just text', user: { name: 'A', screen_name: 'a' } }
    const meta = parseTweetData(raw)
    expect(meta?.photoUrls).toEqual([])
    expect(meta?.photoUrl).toBeUndefined()
    expect(meta?.hasPhoto).toBe(false)
  })

  it('returns single-element photoUrls for 1-photo tweet', () => {
    const raw = {
      id_str: '789',
      text: 'one photo',
      photos: [{ url: 'https://pbs.twimg.com/single.jpg', width: 800, height: 600 }],
      user: { name: 'A', screen_name: 'a' },
    }
    const meta = parseTweetData(raw)
    expect(meta?.photoUrls).toEqual(['https://pbs.twimg.com/single.jpg'])
    expect(meta?.photoUrl).toBe('https://pbs.twimg.com/single.jpg')
  })

  it('returns null for invalid input', () => {
    expect(parseTweetData(null)).toBeNull()
    expect(parseTweetData({})).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/tweet-meta.test.ts`
Expected: FAIL with "photoUrls undefined" or compile error

- [ ] **Step 3: Add photoUrls to TweetMeta type**

In `lib/embed/types.ts`, find the `TweetMeta` type (line 4-30) and add this field below `photoUrl?`:

```ts
  /** All photo URLs for multi-image tweets (X allows up to 4). photoUrls[0]
   *  always equals photoUrl when present. Empty array for text-only or
   *  video-only tweets. Persisted to IDB.photos for board-side hover swap.
   *  (I-07) */
  readonly photoUrls?: readonly string[]
```

- [ ] **Step 4: Update parseTweetData to populate photoUrls**

In `lib/embed/tweet-meta.ts`, find the `parseTweetData` function (line 72-102) and modify the return statement to also include `photoUrls`. Replace lines 78 and 83-101 like so:

Locate:
```ts
  const text = r.full_text ?? r.text ?? ''
  const photo = r.photos?.[0]
```

Replace with:
```ts
  const text = r.full_text ?? r.text ?? ''
  const photos = r.photos ?? []
  const photo = photos[0]
  const photoUrls = photos.map((p) => p.url)
```

Then in the return object, add `photoUrls` next to `photoUrl`:

Locate:
```ts
    photoUrl: photo?.url,
```

Replace with:
```ts
    photoUrl: photo?.url,
    photoUrls,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/tweet-meta.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 6: Run full vitest + tsc to confirm no regression**

Run: `rtk vitest run && rtk tsc --noEmit`
Expected: PASS / clean tsc

- [ ] **Step 7: Commit**

```bash
rtk git add lib/embed/types.ts lib/embed/tweet-meta.ts tests/lib/tweet-meta.test.ts
rtk git commit -m "$(cat <<'EOF'
feat(tweet-meta): parse all photos[] from syndication, expose photoUrls

I-07 Phase 1. parseTweetData() was discarding photos[1..N-1]; now returns
the full array as photoUrls. photoUrl (single) is kept for backwards compat
and equals photoUrls[0].

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: BoardItem.photos pass-through + persistPhotos function

**Files:**
- Modify: `lib/storage/use-board-data.ts` (BoardItem type, mapper, persistPhotos)
- Modify: `lib/storage/indexeddb.ts` (persistPhotos low-level helper)
- Add tests: `tests/lib/idb-v12-photos.test.ts` (extend existing)

- [ ] **Step 1: Extend the test**

Append to `tests/lib/idb-v12-photos.test.ts`:

```ts
describe('persistPhotos', () => {
  it('writes photos to bookmark and skips when array deep-equals existing', async () => {
    const { persistPhotos } = await import('@/lib/storage/indexeddb')
    db = await initDB()

    await db.put('bookmarks', {
      id: 'b-photos',
      url: 'https://x.com/u/status/1',
      title: 'T',
      savedAt: Date.now(),
      orderIndex: 0,
      cardWidth: 240,
      tags: [],
    })

    await persistPhotos(db, 'b-photos', [
      'https://pbs.twimg.com/a.jpg',
      'https://pbs.twimg.com/b.jpg',
    ])
    let r = await db.get('bookmarks', 'b-photos')
    expect(r?.photos).toEqual([
      'https://pbs.twimg.com/a.jpg',
      'https://pbs.twimg.com/b.jpg',
    ])

    // Idempotent: same array should not re-write (read-modify-write skips)
    const writeBefore = JSON.stringify(r)
    await persistPhotos(db, 'b-photos', [
      'https://pbs.twimg.com/a.jpg',
      'https://pbs.twimg.com/b.jpg',
    ])
    r = await db.get('bookmarks', 'b-photos')
    expect(JSON.stringify(r)).toBe(writeBefore)
  })

  it('clears photos when passed empty array', async () => {
    const { persistPhotos } = await import('@/lib/storage/indexeddb')
    db = await initDB()

    await db.put('bookmarks', {
      id: 'b-clear',
      url: 'https://x.com/u/status/1',
      title: 'T',
      savedAt: Date.now(),
      orderIndex: 0,
      cardWidth: 240,
      tags: [],
      photos: ['x'],
    })

    await persistPhotos(db, 'b-clear', [])
    const r = await db.get('bookmarks', 'b-clear')
    expect(r?.photos).toBeUndefined()
  })

  it('no-ops for non-existent bookmark', async () => {
    const { persistPhotos } = await import('@/lib/storage/indexeddb')
    db = await initDB()
    await expect(persistPhotos(db, 'no-such-id', ['x'])).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/idb-v12-photos.test.ts`
Expected: FAIL with "persistPhotos is not a function"

- [ ] **Step 3: Implement persistPhotos in indexeddb.ts**

In `lib/storage/indexeddb.ts`, locate the existing `persistCustomCardWidth` function (around line 670-705) and add this new function nearby (use the same pattern):

```ts
/**
 * Persist a multi-image bookmark's photo URL array. Pass an empty array to
 * clear the photos field back to undefined (returns the bookmark to
 * single-image display). No-ops if the bookmark doesn't exist or the new
 * array deep-equals the existing one (avoids triggering re-renders for
 * idempotent backfills). I-07 Phase 1.
 */
export async function persistPhotos(
  db: IDBPDatabase<AllMarksDB>,
  bookmarkId: string,
  photos: readonly string[],
): Promise<void> {
  const existing = await db.get('bookmarks', bookmarkId)
  if (!existing) return

  const next = photos.length === 0 ? undefined : photos
  const existingArr = existing.photos
  // Deep equality check — same array values → skip write
  if (
    (existingArr === undefined && next === undefined) ||
    (existingArr !== undefined &&
      next !== undefined &&
      existingArr.length === next.length &&
      existingArr.every((u, i) => u === next[i]))
  ) {
    return
  }

  const updated: BookmarkRecord = { ...existing, photos: next }
  await db.put('bookmarks', updated)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/idb-v12-photos.test.ts`
Expected: PASS, 6 tests total (3 from Task 1 + 3 new)

- [ ] **Step 5: Add photos to BoardItem in use-board-data.ts**

In `lib/storage/use-board-data.ts`, find the `BoardItem` type (line 22-48) and add this field after `hasVideo?`:

```ts
  /** All photo URLs for multi-image posts (X tweets with up to 4 images,
   *  Bluesky posts with up to 4 images). photos[0] equals thumbnail. Empty
   *  / undefined → single-image card with no hover swap. I-07 Phase 1. */
  readonly photos?: readonly string[]
```

- [ ] **Step 6: Map photos field from BookmarkRecord to BoardItem**

In `lib/storage/use-board-data.ts`, find the bookmark → BoardItem mapping (around line 95-115). After the line `hasVideo: b.hasVideo,` add:

```ts
    photos: b.photos,
```

- [ ] **Step 7: Expose persistPhotos through the hook**

In `lib/storage/use-board-data.ts`, find the hook's return type (around line 130-160 — where `persistThumbnail` etc. are declared). Add this method:

```ts
  /** Persist the multi-image photo URL array for a bookmark. Pass an empty
   *  array to clear back to single-image. I-07 Phase 1. */
  persistPhotos: (bookmarkId: string, photos: readonly string[]) => Promise<void>
```

Find the hook implementation (look for the existing `persistThumbnail = useCallback(...)` block around line 286-320). Add an analogous block:

```ts
  const persistPhotos = useCallback(
    async (bookmarkId: string, photos: readonly string[]): Promise<void> => {
      const db = await getDB()
      const { persistPhotos: persist } = await import('@/lib/storage/indexeddb')
      await persist(db, bookmarkId, photos)
      const next = photos.length === 0 ? undefined : photos
      setItems((prev) =>
        prev.map((it) =>
          it.bookmarkId === bookmarkId ? { ...it, photos: next } : it,
        ),
      )
    },
    [],
  )
```

(Note: `getDB`, `setItems` should already exist in this file. If `getDB` is imported elsewhere, follow the existing pattern. If it's already destructured at the top of the hook, use that.)

Then in the hook's return object (around line 480-485 where `persistCustomWidth` etc. are returned), add:

```ts
    persistPhotos,
```

- [ ] **Step 8: Run tsc + full vitest**

Run: `rtk tsc --noEmit && rtk vitest run`
Expected: clean tsc, all tests pass

- [ ] **Step 9: Commit**

```bash
rtk git add lib/storage/indexeddb.ts lib/storage/use-board-data.ts tests/lib/idb-v12-photos.test.ts
rtk git commit -m "$(cat <<'EOF'
feat(storage): persistPhotos helper + BoardItem.photos pass-through

I-07 Phase 1. Adds persistPhotos low-level + hook-level functions for
backfilling multi-image photo URLs to a bookmark. BoardItem now carries
photos[] so UI layers can read it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: ImageCard hover-position image swap (no UI chrome yet)

**Files:**
- Modify: `components/board/cards/ImageCard.tsx`
- Create: `tests/lib/multi-image-hover.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/multi-image-hover.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ImageCard } from '@/components/board/cards/ImageCard'
import type { BoardItem } from '@/lib/storage/use-board-data'

const baseItem: BoardItem = {
  bookmarkId: 'b1',
  cardId: 'c1',
  title: 'Test',
  description: '',
  thumbnail: 'https://example.com/0.jpg',
  url: 'https://x.com/u/status/1',
  aspectRatio: 1,
  gridIndex: 0,
  orderIndex: 0,
  cardWidth: 240,
  customCardWidth: false,
  isRead: false,
  isDeleted: false,
  tags: [],
  displayMode: null,
  photos: [
    'https://example.com/0.jpg',
    'https://example.com/1.jpg',
    'https://example.com/2.jpg',
    'https://example.com/3.jpg',
  ],
}

describe('ImageCard — multi-image hover swap', () => {
  it('shows photos[0] initially', () => {
    render(<ImageCard item={baseItem} displayMode="visual" cardWidth={240} cardHeight={240} />)
    const img = screen.getByRole('img', { hidden: true })
    expect(img.getAttribute('src')).toBe('https://example.com/0.jpg')
  })

  it('swaps to photos[N-1] when pointerX is at the right edge', () => {
    const { container } = render(
      <ImageCard item={baseItem} displayMode="visual" cardWidth={240} cardHeight={240} />,
    )
    const card = container.firstChild as HTMLElement
    // Mock getBoundingClientRect to return a card at (0,0) of width 240
    card.getBoundingClientRect = (): DOMRect => ({
      left: 0, top: 0, right: 240, bottom: 240,
      width: 240, height: 240, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect)

    // pointerX = 235 → ratio = 235/240 ≈ 0.98 → floor(0.98 * 4) = 3
    fireEvent.pointerMove(card, { clientX: 235, clientY: 100 })
    const img = screen.getByRole('img', { hidden: true })
    expect(img.getAttribute('src')).toBe('https://example.com/3.jpg')
  })

  it('swaps to photos[1] at ~30% across', () => {
    const { container } = render(
      <ImageCard item={baseItem} displayMode="visual" cardWidth={240} cardHeight={240} />,
    )
    const card = container.firstChild as HTMLElement
    card.getBoundingClientRect = (): DOMRect => ({
      left: 0, top: 0, right: 240, bottom: 240,
      width: 240, height: 240, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect)

    // pointerX = 72 → ratio = 0.3 → floor(0.3 * 4) = 1
    fireEvent.pointerMove(card, { clientX: 72, clientY: 100 })
    const img = screen.getByRole('img', { hidden: true })
    expect(img.getAttribute('src')).toBe('https://example.com/1.jpg')
  })

  it('reverts to photos[0] on pointer leave', () => {
    const { container } = render(
      <ImageCard item={baseItem} displayMode="visual" cardWidth={240} cardHeight={240} />,
    )
    const card = container.firstChild as HTMLElement
    card.getBoundingClientRect = (): DOMRect => ({
      left: 0, top: 0, right: 240, bottom: 240,
      width: 240, height: 240, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect)

    fireEvent.pointerMove(card, { clientX: 200, clientY: 100 })
    let img = screen.getByRole('img', { hidden: true })
    expect(img.getAttribute('src')).not.toBe('https://example.com/0.jpg')

    fireEvent.pointerLeave(card)
    img = screen.getByRole('img', { hidden: true })
    expect(img.getAttribute('src')).toBe('https://example.com/0.jpg')
  })

  it('does NOT swap for single-photo items', () => {
    const single: BoardItem = { ...baseItem, photos: ['https://example.com/only.jpg'], thumbnail: 'https://example.com/only.jpg' }
    const { container } = render(
      <ImageCard item={single} displayMode="visual" cardWidth={240} cardHeight={240} />,
    )
    const card = container.firstChild as HTMLElement
    card.getBoundingClientRect = (): DOMRect => ({
      left: 0, top: 0, right: 240, bottom: 240,
      width: 240, height: 240, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect)
    fireEvent.pointerMove(card, { clientX: 200, clientY: 100 })
    const img = screen.getByRole('img', { hidden: true })
    expect(img.getAttribute('src')).toBe('https://example.com/only.jpg')
  })

  it('does NOT swap when photos is undefined', () => {
    const noPhotos: BoardItem = { ...baseItem, photos: undefined }
    const { container } = render(
      <ImageCard item={noPhotos} displayMode="visual" cardWidth={240} cardHeight={240} />,
    )
    const card = container.firstChild as HTMLElement
    card.getBoundingClientRect = (): DOMRect => ({
      left: 0, top: 0, right: 240, bottom: 240,
      width: 240, height: 240, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect)
    fireEvent.pointerMove(card, { clientX: 200, clientY: 100 })
    const img = screen.getByRole('img', { hidden: true })
    expect(img.getAttribute('src')).toBe('https://example.com/0.jpg')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/multi-image-hover.test.tsx`
Expected: FAIL (current ImageCard has no hover swap)

- [ ] **Step 3: Add hover-state to ImageCard**

In `components/board/cards/ImageCard.tsx`, modify the imports and function. Replace the entire file body (after the imports and ASPECT_EPSILON constant — keep those as-is) with:

```tsx
export function ImageCard({ item, persistMeasuredAspect }: Props): ReactNode {
  const imgRef = useRef<HTMLImageElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const urlType = detectUrlType(item.url)
  const isReel = urlType === 'instagram' && isInstagramReel(item.url)

  // I-07: multi-image hover swap. photos[0] is the default; pointerX maps
  // to [0..N-1] across the card width. Single-photo / undefined photos
  // → no swap, idx stays 0.
  const photos = item.photos ?? []
  const hasMultiple = photos.length > 1
  const [imageIdx, setImageIdx] = useState<number>(0)
  const displayedSrc = hasMultiple ? photos[imageIdx] : item.thumbnail

  const handlePointerMove = useCallback((e: PointerEvent<HTMLDivElement>): void => {
    if (!hasMultiple) return
    const el = cardRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const next = Math.min(photos.length - 1, Math.floor(ratio * photos.length))
    setImageIdx((prev) => (prev === next ? prev : next))
  }, [hasMultiple, photos.length])

  const handlePointerLeave = useCallback((): void => {
    if (!hasMultiple) return
    setImageIdx(0)
  }, [hasMultiple])

  // ... (existing useEffect for persistMeasuredAspect goes here unchanged) ...

  const thumbClass = isReel
    ? `${styles.thumb} ${styles.thumbInstagramReel}`
    : styles.thumb

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
          alt=""
          draggable={false}
          loading="lazy"
        />
      )}
      {isReel && <div className={styles.tintInstagramReel} aria-hidden="true" />}
    </div>
  )
}
```

Note: the existing `useEffect` block for `persistMeasuredAspect` MUST be preserved — paste it back into the function body in the same position (after `handlePointerLeave`). The imports also need to add `useCallback, useState, type PointerEvent` to the existing `import { useEffect, useRef, type ReactNode } from 'react'` line. Final import line:

```tsx
import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/multi-image-hover.test.tsx`
Expected: PASS, 6 tests

- [ ] **Step 5: Run tsc + full vitest**

Run: `rtk tsc --noEmit && rtk vitest run`
Expected: clean tsc, all tests pass (except the known pre-existing channel.test.ts)

- [ ] **Step 6: Commit**

```bash
rtk git add components/board/cards/ImageCard.tsx tests/lib/multi-image-hover.test.tsx
rtk git commit -m "$(cat <<'EOF'
feat(image-card): hover-position image swap for multi-image posts

I-07 Phase 1. ImageCard reads item.photos[] and swaps src based on
pointerX / cardWidth → [0..N-1] mapping. Single-photo / undefined
photos: no swap, identical to prior behaviour. State is local to
ImageCard — no parent re-render storm.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: ImageCard dot indicator (hover-revealed)

**Files:**
- Modify: `components/board/cards/ImageCard.tsx` (render dots)
- Modify: `components/board/cards/ImageCard.module.css` (styles)
- Extend: `tests/lib/multi-image-hover.test.tsx` (dot visibility tests)

- [ ] **Step 1: Extend the test**

Append to `tests/lib/multi-image-hover.test.tsx`:

```tsx
describe('ImageCard — dot indicator', () => {
  it('renders N dots when photos.length > 1', () => {
    render(<ImageCard item={baseItem} displayMode="visual" cardWidth={240} cardHeight={240} />)
    const dots = screen.getAllByTestId('multi-image-dot')
    expect(dots).toHaveLength(4)
  })

  it('first dot is active by default; pointer-move activates corresponding dot', () => {
    const { container } = render(
      <ImageCard item={baseItem} displayMode="visual" cardWidth={240} cardHeight={240} />,
    )
    const card = container.firstChild as HTMLElement
    card.getBoundingClientRect = (): DOMRect => ({
      left: 0, top: 0, right: 240, bottom: 240,
      width: 240, height: 240, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect)

    let dots = screen.getAllByTestId('multi-image-dot')
    expect(dots[0].dataset.active).toBe('true')

    fireEvent.pointerMove(card, { clientX: 200, clientY: 100 })  // → idx 3
    dots = screen.getAllByTestId('multi-image-dot')
    expect(dots[3].dataset.active).toBe('true')
    expect(dots[0].dataset.active).toBe('false')
  })

  it('does NOT render dots when single photo', () => {
    const single: BoardItem = { ...baseItem, photos: ['only.jpg'] }
    render(<ImageCard item={single} displayMode="visual" cardWidth={240} cardHeight={240} />)
    expect(screen.queryAllByTestId('multi-image-dot')).toHaveLength(0)
  })

  it('does NOT render dots when photos undefined', () => {
    const none: BoardItem = { ...baseItem, photos: undefined }
    render(<ImageCard item={none} displayMode="visual" cardWidth={240} cardHeight={240} />)
    expect(screen.queryAllByTestId('multi-image-dot')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/multi-image-hover.test.tsx`
Expected: FAIL on dot tests (no dot rendering yet)

- [ ] **Step 3: Render the dots in ImageCard.tsx**

In `components/board/cards/ImageCard.tsx`, modify the return statement. Replace the existing return with:

```tsx
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
          alt=""
          draggable={false}
          loading="lazy"
        />
      )}
      {isReel && <div className={styles.tintInstagramReel} aria-hidden="true" />}
      {hasMultiple && (
        <div className={styles.multiImageDots} aria-hidden="true">
          {photos.map((_, i) => (
            <span
              key={i}
              data-testid="multi-image-dot"
              data-active={i === imageIdx ? 'true' : 'false'}
              className={styles.multiImageDot}
            />
          ))}
        </div>
      )}
    </div>
  )
```

- [ ] **Step 4: Add CSS for the dots**

In `components/board/cards/ImageCard.module.css`, append:

```css
/* I-07: multi-image hover dots. Hover-revealed at the card's bottom edge,
 * showing the photo count and current index. pointer-events: none so the
 * card's hover zone is not interrupted. */
.multiImageDots {
  position: absolute;
  bottom: 10px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  gap: 6px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 200ms ease-out;
  z-index: 5;
}

.imageCard:hover .multiImageDots {
  opacity: 1;
}

.multiImageDot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.4);
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
  transition: background 150ms ease-out, transform 150ms ease-out;
}

.multiImageDot[data-active='true'] {
  background: rgba(255, 255, 255, 0.95);
  transform: scale(1.2);
}
```

Also ensure the `.imageCard` selector has `position: relative` so the absolutely-positioned dots anchor correctly. Check the existing CSS — if `.imageCard` does not already have `position: relative` or `position: absolute`, add it.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/multi-image-hover.test.tsx`
Expected: PASS, 10 tests total

- [ ] **Step 6: Run tsc + full vitest**

Run: `rtk tsc --noEmit && rtk vitest run`
Expected: clean

- [ ] **Step 7: Commit**

```bash
rtk git add components/board/cards/ImageCard.tsx components/board/cards/ImageCard.module.css tests/lib/multi-image-hover.test.tsx
rtk git commit -m "$(cat <<'EOF'
feat(image-card): hover-revealed dot indicator for multi-image cards

I-07 Phase 1. Tiny dot row at the card's bottom edge shows photo count
and current index. Hover-only (opacity 0 → 1 over 200ms). Hidden for
single-photo cards.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: ImageCard lazy preload on first hover

**Files:**
- Modify: `components/board/cards/ImageCard.tsx` (preload)
- (no new tests — preload is a side effect of pointer event, hard to assert in jsdom; Playwright E2E covers it)

- [ ] **Step 1: Add preload logic to handlePointerMove**

In `components/board/cards/ImageCard.tsx`, add a ref for preload state at the top of the component (just below `cardRef`):

```tsx
  // I-07: lazy-preload all photos on first hover. After the user enters
  // the card once, subsequent swaps hit the browser HTTP cache instantly.
  // Eager preload at board mount is intentionally avoided to protect PiP
  // and Lightbox bandwidth.
  const preloadedRef = useRef<boolean>(false)
```

Then modify `handlePointerMove` to trigger preload once:

```tsx
  const handlePointerMove = useCallback((e: PointerEvent<HTMLDivElement>): void => {
    if (!hasMultiple) return
    if (!preloadedRef.current) {
      // Fire-and-forget: kick off Image() for photos[1..N-1]. photos[0] is
      // already in the DOM <img>.
      for (let i = 1; i < photos.length; i++) {
        const img = new Image()
        img.src = photos[i]
      }
      preloadedRef.current = true
    }
    const el = cardRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const next = Math.min(photos.length - 1, Math.floor(ratio * photos.length))
    setImageIdx((prev) => (prev === next ? prev : next))
  }, [hasMultiple, photos])
```

(Note: dep array changed from `[hasMultiple, photos.length]` to `[hasMultiple, photos]` because we now reference the array values.)

- [ ] **Step 2: Run tsc + full vitest**

Run: `rtk tsc --noEmit && rtk vitest run`
Expected: clean (existing tests should still pass; preload is invisible to jsdom)

- [ ] **Step 3: Commit**

```bash
rtk git add components/board/cards/ImageCard.tsx
rtk git commit -m "$(cat <<'EOF'
perf(image-card): lazy preload remaining photos on first hover

I-07 Phase 1. Triggers new Image() for photos[1..N-1] only after the
user actually hovers the card. Avoids the eager-preload pitfall of
50 cards × 4 photos = 200 simultaneous requests that would compete with
PiP and Lightbox bandwidth at board mount.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Lightbox TweetMedia carousel state

**Files:**
- Modify: `components/board/Lightbox.tsx` (TweetMedia component)

- [ ] **Step 1: Refactor TweetMedia to track currentImageIndex**

In `components/board/Lightbox.tsx`, locate the `TweetMedia` function (around line 993-1011). Replace its body with:

```tsx
function TweetMedia({
  item,
  meta,
}: {
  readonly item: LightboxItem
  readonly meta: TweetMeta | null
}): ReactNode {
  // Carousel state: index into the photos array for this tweet. Resets to
  // 0 whenever the underlying item changes (chevron-nav between cards).
  // I-07 Phase 1.
  const [imageIdx, setImageIdx] = useState<number>(0)
  useEffect(() => {
    setImageIdx(0)
  }, [item.bookmarkId])

  if (meta?.videoUrl) {
    return <TweetVideoPlayer item={item} meta={meta} />
  }

  // Source of truth for photos: meta.photoUrls (fresh from syndication)
  // first, then item.photos (IDB-persisted backfill) as fallback. Either
  // can lead.
  const photos = (meta?.photoUrls?.length ?? 0) > 0
    ? meta!.photoUrls!
    : (item.photos ?? [])
  const hasMultiple = photos.length > 1
  const photoUrl = hasMultiple
    ? photos[imageIdx]
    : (meta?.photoUrl ?? item.thumbnail)

  if (photoUrl) {
    return (
      <div className={styles.tweetMediaCarousel}>
        <img src={photoUrl} alt={item.title} />
        {hasMultiple && (
          <LightboxImageDots
            count={photos.length}
            currentIdx={imageIdx}
            onJump={setImageIdx}
          />
        )}
      </div>
    )
  }
  if (meta?.text) {
    return <p className={styles.tweetTextOnly}>{meta.text}</p>
  }
  return <div className={styles.placeholder}>{item.title}</div>
}
```

- [ ] **Step 2: Add LightboxImageDots sub-component**

Below the `TweetMedia` function, add this new component:

```tsx
/** Dot indicator for Lightbox carousel. Larger and more clickable than the
 *  board-side card dots — these are the primary nav mechanism (along with
 *  keyboard ↑↓). I-07 Phase 1. */
function LightboxImageDots({
  count,
  currentIdx,
  onJump,
}: {
  readonly count: number
  readonly currentIdx: number
  readonly onJump: (idx: number) => void
}): ReactNode {
  return (
    <div className={styles.lightboxImageDots} role="tablist" aria-label="画像切替">
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          type="button"
          role="tab"
          aria-selected={i === currentIdx}
          aria-label={`画像 ${i + 1} / ${count}`}
          data-active={i === currentIdx ? 'true' : 'false'}
          className={styles.lightboxImageDot}
          onClick={(): void => onJump(i)}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Add CSS for the Lightbox dots and carousel wrapper**

In `components/board/Lightbox.module.css`, append:

```css
/* I-07: tweet media carousel wrapper. The <img> displays the current
 * photo; dots sit below as the nav mechanism. */
.tweetMediaCarousel {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.lightboxImageDots {
  display: flex;
  justify-content: center;
  gap: 12px;
  padding: 4px 0;
}

.lightboxImageDot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.35);
  border: none;
  cursor: pointer;
  padding: 0;
  /* Hit area extends 6px outward from the visible dot, matching the
   * 24×24 minimum click target per project convention. */
  position: relative;
  transition: background 150ms ease-out, transform 150ms ease-out;
}

.lightboxImageDot::before {
  content: '';
  position: absolute;
  inset: -6px;
}

.lightboxImageDot[data-active='true'] {
  background: rgba(255, 255, 255, 0.95);
  transform: scale(1.2);
}

.lightboxImageDot:hover:not([data-active='true']) {
  background: rgba(255, 255, 255, 0.6);
}
```

- [ ] **Step 4: Verify imports in Lightbox.tsx**

At the top of `Lightbox.tsx`, ensure `useState` and `useEffect` are imported. They likely already are; verify by grep:

Run: `rtk grep -n "useState\|useEffect" components/board/Lightbox.tsx | head -3`

Expected output: should show that useState/useEffect are already imported. If not, add them to the existing React import line.

- [ ] **Step 5: Run tsc**

Run: `rtk tsc --noEmit`
Expected: clean

- [ ] **Step 6: Run full vitest**

Run: `rtk vitest run`
Expected: PASS for all (no new tests yet, but no regressions)

- [ ] **Step 7: Commit**

```bash
rtk git add components/board/Lightbox.tsx components/board/Lightbox.module.css
rtk git commit -m "$(cat <<'EOF'
feat(lightbox): multi-image carousel state + dot indicator

I-07 Phase 1. TweetMedia now reads photos[] (from meta.photoUrls or
item.photos as fallback) and tracks a local image index. Dots below
the photo let the user jump; keyboard nav comes next.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Lightbox keyboard ↑↓ for image nav

**Files:**
- Modify: `components/board/Lightbox.tsx` (keydown handler)

- [ ] **Step 1: Find the existing Esc keydown handler**

Run: `rtk grep -n "Escape\|keydown" components/board/Lightbox.tsx | head -5`

Expected: shows the existing keydown handler around line 207-217 (per session 9 notes, ESC was already wired here).

- [ ] **Step 2: Extend the keydown handler to ↑↓**

The challenge: TweetMedia owns the image index state (local). To handle ↑↓ at the Lightbox level, we lift the state up OR expose a ref. Simplest: lift the state.

Refactor: move `imageIdx` state from `TweetMedia` up to `Lightbox` and pass it down as a prop.

In `Lightbox.tsx`, near the existing useState declarations around line 159 (`tweetMeta`), add:

```tsx
  // I-07: image carousel index — lifted from TweetMedia so the Lightbox-
  // level keydown handler can drive it via ↑ / ↓.
  const [tweetImageIdx, setTweetImageIdx] = useState<number>(0)
  useEffect(() => {
    setTweetImageIdx(0)
  }, [item?.bookmarkId])
```

(Adjust `item?.bookmarkId` to match the local variable name used for the current item in Lightbox.tsx — could be `view`, `current`, etc. Verify by reading the surrounding code.)

- [ ] **Step 3: Update TweetMedia call site to receive imageIdx/setImageIdx**

Find the call site for `<TweetMedia ... />` (probably elsewhere in Lightbox.tsx). Change it to pass the lifted state:

```tsx
<TweetMedia
  item={item}
  meta={tweetMeta}
  imageIdx={tweetImageIdx}
  onImageIdxChange={setTweetImageIdx}
/>
```

And update the `TweetMedia` function signature:

```tsx
function TweetMedia({
  item,
  meta,
  imageIdx,
  onImageIdxChange,
}: {
  readonly item: LightboxItem
  readonly meta: TweetMeta | null
  readonly imageIdx: number
  readonly onImageIdxChange: (idx: number) => void
}): ReactNode {
  // (delete the local useState + useEffect for imageIdx — it's lifted now)
  // ...rest of function unchanged, except replace `setImageIdx` with `onImageIdxChange`
}
```

- [ ] **Step 4: Wire ↑↓ to the Lightbox keydown handler**

Locate the existing keydown handler. Inside it, add ↑↓ handling. The exact wording depends on the handler's structure; the additions are:

```tsx
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      // I-07: image carousel nav inside multi-image tweets. Falls back to
      // a no-op when the current item is not a multi-image tweet (the
      // photo array length check handles this).
      const photos = tweetMeta?.photoUrls ?? item?.photos ?? []
      if (photos.length <= 1) return  // no swap → fall through to default
      e.preventDefault()
      if (e.key === 'ArrowDown') {
        setTweetImageIdx((idx) => Math.min(photos.length - 1, idx + 1))
      } else {
        setTweetImageIdx((idx) => Math.max(0, idx - 1))
      }
      return
    }
```

Insert this branch BEFORE the existing `Escape` / `Arrow Left/Right` (chevron-nav) handling so it has priority for ↑/↓ keys. Make sure left/right keys still flow to chevron-nav (do NOT consume them).

- [ ] **Step 5: Run tsc**

Run: `rtk tsc --noEmit`
Expected: clean

- [ ] **Step 6: Manually verify in dev server (no automated test yet)**

- Open `http://localhost:3000/board`
- Seed a multi-image tweet (or use the E2E test seeding code from Task 10)
- Click into the card → Lightbox opens with photos[0]
- Press ↓ → moves to photos[1], dots update
- Press ↑ → back to photos[0]
- Press → → chevron-nav to next card (not image nav)

Expected: ↑↓ navigates within images, ←→ navigates between cards. Both work without crashing.

- [ ] **Step 7: Run full vitest**

Run: `rtk vitest run`
Expected: clean

- [ ] **Step 8: Commit**

```bash
rtk git add components/board/Lightbox.tsx
rtk git commit -m "$(cat <<'EOF'
feat(lightbox): keyboard ↑↓ for multi-image carousel nav

I-07 Phase 1. Lifts the carousel index state from TweetMedia up to
Lightbox so the existing keydown handler can drive it. ↑ / ↓ moves
within images; ← / → preserves existing card-nav (chevron-rail).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Lightbox backfill — write photos[] to IDB on meta fetch

**Files:**
- Modify: `components/board/Lightbox.tsx` (existing fetchTweetMeta effect)

- [ ] **Step 1: Find the existing meta fetch effect**

In `Lightbox.tsx`, locate the `useEffect` that calls `fetchTweetMeta` (around line 160-170).

- [ ] **Step 2: Add the backfill side-effect**

The backfill needs access to the `persistPhotos` function. It's exposed by `useBoardData()`. Lightbox's parent (BoardRoot) likely has access. We'll pass `persistPhotos` as a prop into Lightbox.

First, check the Lightbox prop signature: it should already accept various callbacks. Find the props type and add:

```tsx
  /** I-07 Phase 1: called with (bookmarkId, photos[]) whenever a
   *  tweet meta fetch reveals a multi-image post, so the board card can
   *  show hover swap next time the user is on the board. Pass through
   *  from useBoardData().persistPhotos. */
  readonly persistPhotos?: (bookmarkId: string, photos: readonly string[]) => Promise<void>
```

In the meta fetch effect, change:

```tsx
  void fetchTweetMeta(tweetId).then((meta) => {
    if (!cancelled) setTweetMeta(meta)
  })
```

to:

```tsx
  void fetchTweetMeta(tweetId).then((meta) => {
    if (cancelled) return
    setTweetMeta(meta)
    // I-07: backfill IDB so the board card can do hover swap next time.
    // Fire-and-forget: no await, errors ignored.
    if (meta?.photoUrls && meta.photoUrls.length > 1 && item?.bookmarkId && persistPhotos) {
      const existing = item.photos ?? []
      const same = existing.length === meta.photoUrls.length
        && existing.every((u, i) => u === meta.photoUrls![i])
      if (!same) {
        void persistPhotos(item.bookmarkId, meta.photoUrls)
      }
    }
  })
```

(Adjust `item?.bookmarkId` and `item.photos` to match the actual local variable for the current LightboxItem.)

- [ ] **Step 3: Pass persistPhotos from BoardRoot to Lightbox**

In `components/board/BoardRoot.tsx`, find where `useBoardData` is destructured (search for `persistThumbnail` to find the right block). Add `persistPhotos` to the destructure:

```tsx
  const {
    items,
    persistThumbnail,
    persistVideoFlag,
    persistCustomWidth,
    resetCustomWidth,
    resetAllCustomWidths,
    persistPhotos,  // ← add
  } = useBoardData()
```

Then find the Lightbox render site (search for `<Lightbox`) and add the prop:

```tsx
<Lightbox
  ...
  persistPhotos={persistPhotos}
/>
```

- [ ] **Step 4: Run tsc**

Run: `rtk tsc --noEmit`
Expected: clean

- [ ] **Step 5: Run full vitest**

Run: `rtk vitest run`
Expected: clean

- [ ] **Step 6: Commit**

```bash
rtk git add components/board/Lightbox.tsx components/board/BoardRoot.tsx
rtk git commit -m "$(cat <<'EOF'
feat(lightbox): backfill bookmark.photos from syndication on meta fetch

I-07 Phase 1. When fetchTweetMeta returns photoUrls.length > 1, persist
the array to IDB so the board card learns about hover swap next render.
Fire-and-forget; failures don't affect lightbox UX.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: E2E test — full multi-image flow

**Files:**
- Create: `tests/e2e/board-i-07-multi-image.spec.ts`

- [ ] **Step 1: Write the E2E test**

Create `tests/e2e/board-i-07-multi-image.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test'

const DB_NAME = 'booklage-db'

async function clearDb(page: Page): Promise<void> {
  await page.evaluate(async (dbName) => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.open(dbName)
      req.onsuccess = () => {
        const db = req.result
        const stores: string[] = []
        for (const name of Array.from(db.objectStoreNames)) {
          if (['bookmarks', 'cards', 'moods'].includes(name)) stores.push(name)
        }
        if (stores.length === 0) { db.close(); resolve(); return }
        const tx = db.transaction(stores, 'readwrite')
        for (const name of stores) tx.objectStore(name).clear()
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = () => resolve()
      }
      req.onerror = () => resolve()
    })
  }, DB_NAME)
}

/** Seed a multi-image X tweet bookmark directly into IDB with photos[]
 *  pre-populated, so we can test the UI without hitting the network. */
async function seedMultiImageBookmark(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const req = indexedDB.open('booklage-db')
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(new Error('open failed'))
    })
    const id = 'multi-image-test-1'
    const cardId = 'card-' + id
    const photos = [
      'https://via.placeholder.com/400x300?text=1',
      'https://via.placeholder.com/400x300?text=2',
      'https://via.placeholder.com/400x300?text=3',
      'https://via.placeholder.com/400x300?text=4',
    ]
    const tx = db.transaction(['bookmarks', 'cards'], 'readwrite')
    await Promise.all([
      tx.objectStore('bookmarks').put({
        id,
        url: 'https://x.com/test/status/9999',
        title: 'Multi-image test tweet',
        savedAt: Date.now(),
        orderIndex: 0,
        cardWidth: 240,
        tags: [],
        thumbnail: photos[0],
        photos,
      }),
      tx.objectStore('cards').put({
        id: cardId,
        bookmarkId: id,
        folderId: null,
        gridIndex: 0,
        orderIndex: 0,
        width: 240,
        height: 180,
        aspectRatio: 4 / 3,
        rotation: 0,
        floatDelay: 0,
        isManuallyPlaced: false,
      }),
    ])
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => { db.close(); reject(new Error('seed tx failed')) }
    })
    return id
  })
}

test.describe('I-07 multi-image hover & lightbox carousel', () => {
  test('card hover swaps image; lightbox dots + ↑↓ nav work', async ({ page }) => {
    await page.goto('/board')
    await page.waitForLoadState('networkidle')
    await clearDb(page)
    const bookmarkId = await seedMultiImageBookmark(page)
    await page.goto('/board')
    await page.waitForSelector(`[data-bookmark-id="${bookmarkId}"]`, { timeout: 10000 })

    const card = page.locator(`[data-bookmark-id="${bookmarkId}"]`)
    const img = card.locator('img').first()

    // Initial: photos[0]
    await expect(img).toHaveAttribute('src', /\?text=1$/)

    // Hover at ~75% across the card → photos[2] (idx=2 with 4 photos)
    const box = await card.boundingBox()
    if (!box) throw new Error('no bounding box')
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.5)
    await expect(img).toHaveAttribute('src', /\?text=3$/)

    // Hover at ~95% → photos[3]
    await page.mouse.move(box.x + box.width * 0.95, box.y + box.height * 0.5)
    await expect(img).toHaveAttribute('src', /\?text=4$/)

    // Dots visible during hover (4 dots, last one active)
    const dots = card.locator('[data-testid="multi-image-dot"]')
    await expect(dots).toHaveCount(4)
    await expect(dots.nth(3)).toHaveAttribute('data-active', 'true')

    // Leave the card → revert to photos[0]
    await page.mouse.move(box.x + box.width + 100, box.y + box.height * 0.5)
    await expect(img).toHaveAttribute('src', /\?text=1$/)

    // Click into the card to open Lightbox
    await card.click()
    const lightbox = page.getByTestId('lightbox')
    await expect(lightbox).toBeVisible({ timeout: 3000 })

    // Lightbox shows photos[0] initially
    const lbImg = lightbox.locator('img').first()
    await expect(lbImg).toHaveAttribute('src', /\?text=1$/)

    // Press ↓ → photos[1]
    await page.keyboard.press('ArrowDown')
    await expect(lbImg).toHaveAttribute('src', /\?text=2$/)

    // Press ↓ twice more → photos[3]
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect(lbImg).toHaveAttribute('src', /\?text=4$/)

    // Press ↓ at the end → stays at photos[3]
    await page.keyboard.press('ArrowDown')
    await expect(lbImg).toHaveAttribute('src', /\?text=4$/)

    // Press ↑ → photos[2]
    await page.keyboard.press('ArrowUp')
    await expect(lbImg).toHaveAttribute('src', /\?text=3$/)

    // Click on dot 0 → photos[0]
    const lbDots = lightbox.locator('[role="tab"]')
    await expect(lbDots).toHaveCount(4)
    await lbDots.nth(0).click()
    await expect(lbImg).toHaveAttribute('src', /\?text=1$/)

    // Esc closes
    await page.keyboard.press('Escape')
    await expect(lightbox).toBeHidden({ timeout: 2000 })
  })

  test('single-photo card has no dots and no hover swap', async ({ page }) => {
    await page.goto('/board')
    await page.waitForLoadState('networkidle')
    await clearDb(page)

    // Seed single-photo bookmark
    const id = await page.evaluate(async () => {
      const req = indexedDB.open('booklage-db')
      const db = await new Promise<IDBDatabase>((resolve) => {
        req.onsuccess = () => resolve(req.result)
      })
      const bid = 'single-photo-test'
      const tx = db.transaction(['bookmarks', 'cards'], 'readwrite')
      await Promise.all([
        tx.objectStore('bookmarks').put({
          id: bid,
          url: 'https://example.com/single',
          title: 'Single',
          savedAt: Date.now(),
          orderIndex: 0,
          cardWidth: 240,
          tags: [],
          thumbnail: 'https://via.placeholder.com/400x300?text=ONLY',
        }),
        tx.objectStore('cards').put({
          id: 'c-' + bid,
          bookmarkId: bid,
          folderId: null,
          gridIndex: 0,
          orderIndex: 0,
          width: 240,
          height: 180,
          aspectRatio: 4 / 3,
          rotation: 0,
          floatDelay: 0,
          isManuallyPlaced: false,
        }),
      ])
      await new Promise<void>((resolve) => { tx.oncomplete = () => { db.close(); resolve() } })
      return bid
    })

    await page.goto('/board')
    await page.waitForSelector(`[data-bookmark-id="${id}"]`, { timeout: 10000 })
    const card = page.locator(`[data-bookmark-id="${id}"]`)
    await card.hover()
    await expect(card.locator('[data-testid="multi-image-dot"]')).toHaveCount(0)
  })
})
```

- [ ] **Step 2: Run the E2E test**

Make sure the dev server is running at :3000 first (`pnpm dev`). Then:

Run: `pnpm playwright test tests/e2e/board-i-07-multi-image.spec.ts`
Expected: PASS, 2 tests

If anything fails, read the trace, fix the underlying issue, and re-run.

- [ ] **Step 3: Commit**

```bash
rtk git add tests/e2e/board-i-07-multi-image.spec.ts
rtk git commit -m "$(cat <<'EOF'
test(e2e): multi-image hover + lightbox carousel flow

I-07 Phase 1. Seeds 4-image and 1-image bookmarks directly into IDB,
then exercises the full UX path: hover position swap, dot indicator,
Lightbox arrow-key nav, dot click jump, single-photo no-dots.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Build + deploy + manual verification on production

**Files:** none — verification only

- [ ] **Step 1: Run full type + test suite**

Run: `rtk tsc --noEmit && rtk vitest run`
Expected: clean tsc, all vitest pass (except the known pre-existing `channel.test.ts` failure)

- [ ] **Step 2: Build for production**

Run: `rtk pnpm build`
Expected: build completes, no errors. The `out/` directory contains the static export.

- [ ] **Step 3: Deploy to Cloudflare Pages**

Per [CLAUDE.md](../../../CLAUDE.md) deploy rules:

```bash
npx wrangler pages deploy out/ --project-name=booklage --branch=master --commit-dirty=true --commit-message="I-07 Phase 1: multi-image hover + lightbox carousel"
```

- [ ] **Step 4: Manual smoke test on production**

Open `https://booklage.pages.dev` in a hard-reloaded browser tab. Then:

1. Add a new X tweet with 4 images (any public 4-image tweet, e.g. from the user's bookmarks)
2. After save, open the Lightbox once → triggers backfill
3. Close Lightbox
4. Hover over the card at different X positions → image should swap
5. Hover-revealed dots visible at the bottom of the card
6. Click the card → Lightbox opens with carousel
7. Press ↑ / ↓ → image cycles
8. Click dots → image jumps
9. ← / → chevron-navigates between cards (existing behavior preserved)
10. Esc closes

If any step fails, capture screenshot / video and revert before fixing (do not leave a broken deploy live).

- [ ] **Step 5: Update TODO.md with completion**

Edit `docs/TODO.md`:

Replace the I-07 entry in the "新機能アイデア" section with a ✅ completed entry, and update the "セッション 14 開始時の優先順位" (or whichever session) section. Move I-07 Phase 1 to a completed section and note Phase 2 (Bluesky) as the next priority.

Specifically, append a new section after the "セッション 13 で実施したこと" section:

```markdown
### セッション 14 (or N) で実施したこと

✅ **I-07 Phase 1 完了** — X (Twitter) 複数画像投稿の hover 切替 + Lightbox carousel 実装。

- IDB v12 schema (photos field 追加)
- tweet syndication parse で photos[] 全配列取得
- ImageCard で hover-position 切替 + dot indicator + lazy preload
- Lightbox で carousel + dot click jump + ↑↓ キーボード nav
- 既存 X tweet の自動 backfill (Lightbox open 時)
- Playwright E2E pass、 本番 deploy 実機確認 OK

**次セッション**: Phase 2 (Bluesky 対応) — spec の Section 4-2 参照、 0.5-1 セッション見込み。
```

- [ ] **Step 6: Final commit**

```bash
rtk git add docs/TODO.md
rtk git commit -m "$(cat <<'EOF'
docs(todo): I-07 Phase 1 complete — X multi-image hover live

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Spec Coverage Self-Review

Checking each spec section against the plan:

- **§1 Scope (X only for Phase 1)** → Tasks 2, 4-9 (no Bluesky code here)
- **§2 主要決定事項** → all 6 covered: storage (Task 1, 3), nav (Tasks 7, 8), card indicator (Task 5), preload (Task 6), backfill (Task 9), fallback (handled across)
- **§3 データモデル (IDB v12 + photos)** → Tasks 1, 3
- **§4-1 X syndication parse** → Task 2
- **§4-3 Save flow** → INTENTIONALLY DEFERRED. Backfill via Lightbox open (Task 9) is the primary path per spec §6-2; eager save-time fetch is not in Phase 1.
- **§5-1 Card hover UX (formula, dots, revert)** → Tasks 4, 5
- **§5-2 Lightbox carousel (dots + ↑↓, no media click)** → Tasks 7, 8
- **§6 Performance / non-blocking** → Task 6 (lazy preload), Task 9 (lazy backfill), Task 7 (local state)
- **§6-5 graceful fallback** → all components no-op when photos is undefined/empty (Tasks 4, 5, 7)
- **§7 File list** → matches plan File Structure section
- **§8 Test plan** → unit (Tasks 1-5 have vitest), E2E (Task 10)
- **§9 Rollout** → independent commits per task make revert easy; Task 11 deploys

Gaps fixed: none — coverage is complete for Phase 1 scope.

---

## Open Implementation Notes (decide while coding)

- **Existing variable names** in Lightbox.tsx (`view`, `item`, `current`?) — read surrounding code before editing Task 8's lift; the exact name appears in the existing fetchTweetMeta effect.
- **Dot fade-in duration** (200ms in spec §5-1 / Task 5 CSS) — tweak after seeing it live if it feels off.
- **`<img>` accessibility** for swapped images — alt text stays as item.title (the bookmark title applies to the whole tweet, not per-photo). Acceptable for MVP.
- **Bookmark save flow** for new tweets: NOT touched in Phase 1. User adds a multi-image tweet → first Lightbox open backfills photos[]. Subsequent renders show hover swap. Acceptable per spec §4-3 + §6-2.
