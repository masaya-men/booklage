# destefanis Pivot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pivot Booklage board from folder-based to tag-based (mood bucket) model, adopt destefanis/twitter-bookmarks-grid visual identity, add Lightbox + Triage + entrance animation, and rewrite /save as a zero-friction top-center toast popup. All 14 locked brainstorm items land in MVP.

**Architecture:** Data layer migrates IDB v8 → v9 (new `moods` store, `bookmarks.tags[]` replaces `folderId`). Save flow auto-writes on /save load, sends BroadcastChannel, board tab listens and fade-ins the new card. Classification moves from save-time picker to a dedicated `/triage` ceremony route. Visuals adopt destefanis dark minimal (flat cards, 5-column 160px masonry, 10px gaps, Noto Serif JP titles). Lightbox overlays on card click with GSAP spring (replaces `window.open`). `BookmarkTagger` interface lets MVP `HeuristicTagger` be swapped for embedding/LLM variants post-launch.

**Tech Stack:** Next.js 16 App Router (existing), Vanilla CSS Modules (existing), `idb` (existing), GSAP (existing — used instead of `motion` for Lightbox spring; see §Design Notes below), vitest + Playwright (existing).

**Design Notes (must-read before implementing):**

1. **Animation library choice**: Spec §7.2 says "Motion One spring（or GSAP）". CLAUDE.md bans Framer Motion and the npm package `motion` is Framer Motion under its new name (Motion One is `@motionone/*`, a different author-split package but still off-piste vs. our existing GSAP). **Use GSAP** for Lightbox open/close spring and Triage card transitions — zero new deps, same easing quality. This matches CLAUDE.md's "GSAP Timeline" guidance for folder-like transitions.
2. **Brand color**: Spec §2 L2 locks "no brand color yet". All accents use white / neutral gray. Mood dot colors are identifying swatches only, not brand.
3. **dark-only**: Spec is destefanis-native. Light theme is explicitly out of scope (§13). Do not add theme toggling.
4. **Toolbar fate**: Existing `Toolbar.tsx` (Share-only pill) is replaced by top-right FilterPill + DisplayModeSwitch per spec §8. Delete the Share button — Plan B ShareModal is post-launch.
5. **Migration safety**: v8 → v9 runs against real user DBs in production. Every user has ≥1 folder (bookmarklet auto-creates "My Collage" on first save). Migration must be idempotent and tolerate a folder whose `color` is missing.
6. **Existing tests**: `tests/e2e/bookmarklet-save.spec.ts` currently asserts folder picker UI. Update in Task 11 after SaveToast lands.
7. **Existing board drag-to-reorder** (`use-card-reorder-drag.ts`) is preserved as-is. destefanis pivot reuses masonry; only the visual tuning changes.
8. **sidebar-width CSS vars** in `app/globals.css`: 240px / 52px collapsed. Reuse; do not change.
9. **SW CACHE_VERSION**: After all tasks land and `pnpm build` passes, bump `public/sw.js` CACHE_VERSION (Task 27) so deployed clients pick up the new JS.

---

## Task 1: IDB v9 migration (foundation)

**Files:**
- Modify: `lib/constants.ts:21` (`DB_VERSION = 8` → `9`)
- Modify: `lib/storage/indexeddb.ts` (add v8 → v9 upgrade block, extend types)
- Test: `tests/lib/idb-v9-migration.test.ts` (new)

- [ ] **Step 1: Write the failing migration test**

Create `tests/lib/idb-v9-migration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { openDB, type IDBPDatabase } from 'idb'
import { initDB } from '@/lib/storage/indexeddb'
import { DB_NAME } from '@/lib/constants'

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

describe('IDB v9 migration', () => {
  it('converts folders → moods and bookmarks.folderId → tags[moodId]', async () => {
    // Seed a v8 database manually
    const v8 = await openDB(DB_NAME, 8, {
      upgrade(d, _old, _new, tx) {
        if (!d.objectStoreNames.contains('bookmarks')) {
          const bm = d.createObjectStore('bookmarks', { keyPath: 'id' })
          bm.createIndex('by-folder', 'folderId')
          bm.createIndex('by-date', 'savedAt')
          bm.createIndex('by-ogp-status', 'ogpStatus')
        }
        if (!d.objectStoreNames.contains('folders')) d.createObjectStore('folders', { keyPath: 'id' })
        if (!d.objectStoreNames.contains('cards')) {
          const c = d.createObjectStore('cards', { keyPath: 'id' })
          c.createIndex('by-folder', 'folderId')
          c.createIndex('by-bookmark', 'bookmarkId')
        }
        if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings', { keyPath: 'key' })
        if (!d.objectStoreNames.contains('preferences')) d.createObjectStore('preferences', { keyPath: 'key' })
        void tx
      },
    })
    await v8.put('folders', { id: 'f1', name: 'Design', color: '#ff6b6b', order: 0, createdAt: '2026-04-01T00:00:00Z' })
    await v8.put('bookmarks', {
      id: 'b1', url: 'https://example.com', title: 'E', description: '', thumbnail: '',
      favicon: '', siteName: '', type: 'website', savedAt: '2026-04-02T00:00:00Z',
      folderId: 'f1', ogpStatus: 'fetched',
    })
    v8.close()

    // Open at v9 — triggers migration
    const v9 = await initDB()
    db = v9 as unknown as IDBPDatabase<unknown>

    // moods store exists with migrated folder
    const moods = await (v9 as unknown as IDBPDatabase<unknown>).getAll('moods')
    expect(moods).toHaveLength(1)
    expect(moods[0]).toMatchObject({ id: 'f1', name: 'Design', color: '#ff6b6b', order: 0 })

    // bookmark.folderId replaced with tags[]
    const bm = (await (v9 as unknown as IDBPDatabase<unknown>).get('bookmarks', 'b1')) as Record<string, unknown>
    expect(bm.tags).toEqual(['f1'])
    expect(bm.folderId).toBeUndefined()
    expect(bm.displayMode).toBeNull()

    // folders store removed
    expect((v9 as unknown as IDBPDatabase<unknown>).objectStoreNames.contains('folders')).toBe(false)
  })

  it('leaves bookmark with empty tags if folderId missing (Inbox default)', async () => {
    const v8 = await openDB(DB_NAME, 8, {
      upgrade(d) {
        if (!d.objectStoreNames.contains('bookmarks')) d.createObjectStore('bookmarks', { keyPath: 'id' })
        if (!d.objectStoreNames.contains('folders')) d.createObjectStore('folders', { keyPath: 'id' })
        if (!d.objectStoreNames.contains('cards')) d.createObjectStore('cards', { keyPath: 'id' })
        if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings', { keyPath: 'key' })
        if (!d.objectStoreNames.contains('preferences')) d.createObjectStore('preferences', { keyPath: 'key' })
      },
    })
    await v8.put('bookmarks', {
      id: 'b2', url: 'https://x.com', title: 'X', description: '', thumbnail: '',
      favicon: '', siteName: '', type: 'website', savedAt: '2026-04-02T00:00:00Z',
      folderId: '', ogpStatus: 'fetched',
    })
    v8.close()
    const v9 = await initDB()
    db = v9 as unknown as IDBPDatabase<unknown>
    const bm = (await (v9 as unknown as IDBPDatabase<unknown>).get('bookmarks', 'b2')) as Record<string, unknown>
    expect(bm.tags).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npx vitest run tests/lib/idb-v9-migration.test.ts`
Expected: FAIL — DB still at v8, no `moods` store.

- [ ] **Step 3: Bump DB_VERSION to 9**

Edit `lib/constants.ts:21`:

```typescript
/** IndexedDB schema version */
export const DB_VERSION = 9
```

- [ ] **Step 4: Add v8 → v9 upgrade block + type updates**

In `lib/storage/indexeddb.ts`, update `BookmarkRecord` (at line 14) to add new fields:

```typescript
export interface BookmarkRecord {
  id: string
  url: string
  title: string
  description: string
  thumbnail: string
  favicon: string
  siteName: string
  type: UrlType
  savedAt: string
  /** @deprecated post-v9 — kept for backward read compat only. Prefer tags[]. */
  folderId?: string
  ogpStatus: OgpStatus
  isRead?: boolean
  isDeleted?: boolean
  deletedAt?: string
  orderIndex?: number
  sizePreset?: 'S' | 'M' | 'L'
  /** v9: mood id array. Empty = Inbox. */
  tags: string[]
  /** v9: null = follow global displayMode (BoardConfig). */
  displayMode?: 'visual' | 'editorial' | 'native' | null
}
```

Add a new `MoodRecord` type:

```typescript
export interface MoodRecord {
  id: string
  name: string
  color: string
  order: number
  createdAt: number
}

export type MoodInput = Omit<MoodRecord, 'id' | 'createdAt'>
```

Update `BooklageDB` schema (at line 140):

```typescript
interface BooklageDB {
  bookmarks: BookmarkRecord
  moods: MoodRecord
  cards: CardRecord
  settings: SettingsRecord
  preferences: UserPreferencesRecord
}
```

Add the upgrade block inside `initDB`'s `upgrade` callback, after the `if (oldVersion < 8)` block:

```typescript
      // ── v8 → v9: tag-based model (destefanis pivot) ──
      // 1. Create moods store (1:1 copy of folders)
      // 2. Rewrite every bookmark: folderId → tags[folderId]; add displayMode=null
      // 3. Delete folders store
      if (oldVersion < 9) {
        if (!db.objectStoreNames.contains('moods')) {
          db.createObjectStore('moods', { keyPath: 'id' })
        }

        const folderMap = new Map<string, { id: string; name: string; color: string; order: number; createdAt: number }>()
        if (db.objectStoreNames.contains('folders')) {
          const folderStore = transaction.objectStore('folders')
          void folderStore.openCursor().then(async function copyFolder(
            cursor: Awaited<ReturnType<typeof folderStore.openCursor>>,
          ): Promise<void> {
            if (!cursor) return
            const f = cursor.value as { id: string; name?: string; color?: string; order?: number; createdAt?: string }
            const moodRec = {
              id: f.id,
              name: f.name ?? 'Untitled',
              color: f.color ?? '#7c5cfc',
              order: f.order ?? 0,
              createdAt: f.createdAt ? new Date(f.createdAt).getTime() : Date.now(),
            }
            folderMap.set(moodRec.id, moodRec)
            await transaction.objectStore('moods').put(moodRec)
            const next = await cursor.continue()
            return copyFolder(next)
          })
        }

        const bookmarkStore = transaction.objectStore('bookmarks')
        void bookmarkStore.openCursor().then(async function rewriteBookmark(
          cursor: Awaited<ReturnType<typeof bookmarkStore.openCursor>>,
        ): Promise<void> {
          if (!cursor) return
          const rec = cursor.value as BookmarkRecord & { folderId?: string }
          const tags = rec.folderId ? [rec.folderId] : []
          const next: BookmarkRecord = { ...rec, tags, displayMode: null }
          delete (next as { folderId?: string }).folderId
          await cursor.update(next)
          const cont = await cursor.continue()
          return rewriteBookmark(cont)
        })

        // Drop folders store after copy completes. idb runs upgrade in a
        // single versionchange transaction, so deleteObjectStore here is safe.
        if (db.objectStoreNames.contains('folders')) {
          db.deleteObjectStore('folders')
        }
      }
```

Also remove the `by-folder` index from the bookmarks store — but keep backwards compat: the old index reference becomes a no-op since no code will use it post-pivot. To stay simple, leave the index in place (it just indexes on the now-unused `folderId` field, which future records won't carry). Moving forward, the bookmark store has no folder-based index.

- [ ] **Step 5: Run test to verify it passes**

Run: `rtk npx vitest run tests/lib/idb-v9-migration.test.ts`
Expected: PASS (both cases).

- [ ] **Step 6: Run full test suite to ensure no regression**

Run: `rtk npx vitest run`
Expected: PASS. Existing `tests/lib/indexeddb.test.ts` calls `addFolder` / `getAllFolders` which are no longer schema-backed; fix those tests in Task 2 when we delete those functions. **For now the test may still pass** because the `folders` store exists transiently during v1 creation in tests (test inits to v9 directly, so no folders store). If `addFolder` breaks compile or runtime, temporarily adapt by keeping the function pointing to a stub until Task 2 removes it. Expected concrete failure: `addFolder` calls `db.put('folders', ...)` which throws because the store doesn't exist at v9. Resolution: mark `addFolder` / `getAllFolders` / `FolderRecord` / `FolderInput` as **deprecated — throw at runtime** until Task 2 deletes them. For this task, leave them as-is; they will only break if invoked. The existing `indexeddb.test.ts` DOES invoke them — so that file will red. Gate this: update `tests/lib/indexeddb.test.ts` to skip `describe('folders')` and any `addFolder`-using tests with `describe.skip` + a `// TODO(Task 2): remove after folder API deletion` comment.

- [ ] **Step 7: Commit**

```bash
rtk git add lib/constants.ts lib/storage/indexeddb.ts tests/lib/idb-v9-migration.test.ts tests/lib/indexeddb.test.ts
rtk git commit -m "feat(idb): v9 migration — folders→moods, folderId→tags[]"
```

---

## Task 2: MoodRecord CRUD + delete legacy folder API

**Files:**
- Create: `lib/storage/moods.ts`
- Modify: `lib/storage/indexeddb.ts` (delete FolderRecord, addFolder, getAllFolders, FolderInput)
- Modify: `components/bookmarklet/SavePopup.tsx` (temporary: stop importing FOLDER_COLORS/folders — this file will be deleted in Task 9, but we need it to still compile meanwhile)
- Test: `tests/lib/moods.test.ts` (new)
- Test: `tests/lib/indexeddb.test.ts` (remove skipped `describe('folders')`, drop `addFolder` calls in other blocks)

- [ ] **Step 1: Write the failing MoodRecord CRUD test**

Create `tests/lib/moods.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import type { IDBPDatabase } from 'idb'
import { initDB } from '@/lib/storage/indexeddb'
import { addMood, getAllMoods, updateMood, deleteMood, reorderMoods } from '@/lib/storage/moods'

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

describe('moods CRUD', () => {
  it('addMood creates a mood with generated id + createdAt', async () => {
    const d = await initDB()
    db = d as unknown as IDBPDatabase<unknown>
    const m = await addMood(d, { name: 'design', color: '#7c5cfc', order: 0 })
    expect(m.id).toMatch(/[-0-9a-f]+/)
    expect(typeof m.createdAt).toBe('number')
    expect(m.name).toBe('design')
  })

  it('getAllMoods returns moods sorted by order', async () => {
    const d = await initDB()
    db = d as unknown as IDBPDatabase<unknown>
    await addMood(d, { name: 'b', color: '#aaa', order: 1 })
    await addMood(d, { name: 'a', color: '#bbb', order: 0 })
    const moods = await getAllMoods(d)
    expect(moods.map((m) => m.name)).toEqual(['a', 'b'])
  })

  it('updateMood merges fields', async () => {
    const d = await initDB()
    db = d as unknown as IDBPDatabase<unknown>
    const m = await addMood(d, { name: 'design', color: '#aaa', order: 0 })
    await updateMood(d, m.id, { name: 'Design' })
    const [updated] = await getAllMoods(d)
    expect(updated.name).toBe('Design')
    expect(updated.color).toBe('#aaa')
  })

  it('deleteMood removes the record', async () => {
    const d = await initDB()
    db = d as unknown as IDBPDatabase<unknown>
    const m = await addMood(d, { name: 'tmp', color: '#aaa', order: 0 })
    await deleteMood(d, m.id)
    expect(await getAllMoods(d)).toHaveLength(0)
  })

  it('reorderMoods rewrites order atomically', async () => {
    const d = await initDB()
    db = d as unknown as IDBPDatabase<unknown>
    const a = await addMood(d, { name: 'a', color: '#aaa', order: 0 })
    const b = await addMood(d, { name: 'b', color: '#bbb', order: 1 })
    const c = await addMood(d, { name: 'c', color: '#ccc', order: 2 })
    await reorderMoods(d, [c.id, a.id, b.id])
    const moods = await getAllMoods(d)
    expect(moods.map((m) => m.name)).toEqual(['c', 'a', 'b'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npx vitest run tests/lib/moods.test.ts`
Expected: FAIL — module `@/lib/storage/moods` does not exist.

- [ ] **Step 3: Implement lib/storage/moods.ts**

Create `lib/storage/moods.ts`:

```typescript
import type { IDBPDatabase } from 'idb'
import type { MoodRecord, MoodInput } from './indexeddb'

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbLike = IDBPDatabase<any>

function uuid(): string {
  return crypto.randomUUID()
}

export async function addMood(db: DbLike, input: MoodInput): Promise<MoodRecord> {
  const mood: MoodRecord = {
    id: uuid(),
    name: input.name,
    color: input.color,
    order: input.order,
    createdAt: Date.now(),
  }
  await db.put('moods', mood)
  return mood
}

export async function getAllMoods(db: DbLike): Promise<MoodRecord[]> {
  const list = (await db.getAll('moods')) as MoodRecord[]
  return list.sort((a, b) => a.order - b.order)
}

export async function updateMood(
  db: DbLike,
  id: string,
  updates: Partial<Omit<MoodRecord, 'id' | 'createdAt'>>,
): Promise<void> {
  const existing = (await db.get('moods', id)) as MoodRecord | undefined
  if (!existing) return
  await db.put('moods', { ...existing, ...updates })
}

export async function deleteMood(db: DbLike, id: string): Promise<void> {
  await db.delete('moods', id)
}

export async function reorderMoods(db: DbLike, orderedIds: readonly string[]): Promise<void> {
  const tx = db.transaction('moods', 'readwrite')
  const store = tx.objectStore('moods')
  for (let i = 0; i < orderedIds.length; i++) {
    const existing = (await store.get(orderedIds[i])) as MoodRecord | undefined
    if (!existing) continue
    await store.put({ ...existing, order: i })
  }
  await tx.done
}
```

- [ ] **Step 4: Delete legacy folder API + update existing tests**

In `lib/storage/indexeddb.ts`:

1. Delete `FolderRecord`, `FolderInput`, `addFolder`, `getAllFolders`, `getBookmarksByFolder`, `getCardsByFolder` functions (and their JSDoc).
2. Remove `folders: FolderRecord` from `BooklageDB`.
3. Update `addBookmark` — instead of accepting `folderId`, take a bookmark input with `tags: string[]` and use `getAllBookmarks(db)` length for `orderIndex`. Update `BookmarkInput`:

```typescript
export type BookmarkInput = Omit<
  BookmarkRecord,
  'id' | 'savedAt' | 'ogpStatus' | 'tags' | 'displayMode' | 'folderId'
> & {
  tags?: string[]            // default [] (Inbox)
  displayMode?: BookmarkRecord['displayMode']
  ogpStatus?: OgpStatus
}
```

Rewrite `addBookmark` body:

```typescript
export async function addBookmark(
  db: IDBPDatabase<BooklageDB>,
  input: BookmarkInput,
): Promise<BookmarkRecord> {
  const existingCount = await db.count('bookmarks')
  const nextOrder = existingCount

  const bookmark: BookmarkRecord = {
    id: uuid(),
    url: input.url,
    title: input.title,
    description: input.description,
    thumbnail: input.thumbnail,
    favicon: input.favicon,
    siteName: input.siteName,
    type: input.type,
    savedAt: new Date().toISOString(),
    ogpStatus: input.ogpStatus ?? 'fetched',
    orderIndex: nextOrder,
    sizePreset: 'S',
    tags: input.tags ?? [],
    displayMode: input.displayMode ?? null,
  }

  const tx = db.transaction(['bookmarks', 'cards'], 'readwrite')
  await tx.objectStore('bookmarks').put(bookmark)
  const existingCards = await tx.objectStore('cards').count()
  const pos = randomPosition()
  const dimensions = generateCardDimensions('random', 'random')
  const card: CardRecord = {
    id: uuid(),
    bookmarkId: bookmark.id,
    folderId: '',          // legacy column, kept for schema compat (v8 type still has it)
    x: pos.x, y: pos.y,
    rotation: randomRotation(),
    scale: 1,
    zIndex: 1,
    gridIndex: existingCards,
    isManuallyPlaced: false,
    width: dimensions.width,
    height: dimensions.height,
  }
  await tx.objectStore('cards').put(card)
  await tx.done

  return bookmark
}
```

Also rewrite `deleteBookmark` to not use the `by-folder` index. Use `by-bookmark` on cards only:

```typescript
export async function deleteBookmark(
  db: IDBPDatabase<BooklageDB>,
  bookmarkId: string,
): Promise<void> {
  const tx = db.transaction(['bookmarks', 'cards'], 'readwrite')
  await tx.objectStore('bookmarks').delete(bookmarkId)
  const cardStore = tx.objectStore('cards')
  let cursor = await cardStore.index('by-bookmark').openCursor(bookmarkId)
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  await tx.done
}
```

Rewrite `addBookmarkBatch` the same way — use `db.count('bookmarks')` and `tx.objectStore('cards').count()` for offsets; drop folder lookups.

In `tests/lib/indexeddb.test.ts`:
- Remove the entire `describe('folders')` block.
- In each remaining test, replace `addFolder(...)` + `folderId: folder.id` with direct `addBookmark(db, { ..., tags: [] })` call; replace `getBookmarksByFolder(db, folderId)` with `getAllBookmarks(db)` and `getCardsByFolder(db, folderId)` with `db.getAll('cards')`. Drop the `by-folder` card index in favor of just listing all cards and filtering client-side (we have a handful in tests).

In `components/bookmarklet/SavePopup.tsx`:
- Replace `FOLDER_COLORS` + folder-picking code paths with a minimal stub that just returns `null` for `selectedFolder` and hides the section (the whole file is deleted in Task 9). Simplest: gate the folder section behind `false &&` until the file is replaced. Confirm TypeScript still compiles.

Actually cleaner: since Task 9 rewrites this file entirely, prepend a `// TODO(Task 9): replaced by SaveToast` comment and rewrite just the broken imports:
- Drop `import { FOLDER_COLORS } ...`
- Drop `import { ..., addFolder, getAllFolders, type FolderRecord } ...` — replace with `import { initDB, addBookmark } ...`
- In `handleCreateFolder`, stub as `async (): Promise<void> => {}`.
- In `handleSave`, change `folderId: selectedFolder` call to `tags: []`.
- Delete the `state === 'loading'`/folders UI section; render only title preview + save button until Task 9 overhauls.

- [ ] **Step 5: Run moods test to verify it passes**

Run: `rtk npx vitest run tests/lib/moods.test.ts`
Expected: PASS.

- [ ] **Step 6: Run full test suite**

Run: `rtk npx vitest run && rtk tsc --noEmit`
Expected: PASS. If any test file still references deleted folder functions, surface those explicitly. Fix each by either deleting or updating to use moods API.

- [ ] **Step 7: Commit**

```bash
rtk git add lib/storage/moods.ts lib/storage/indexeddb.ts tests/lib/moods.test.ts tests/lib/indexeddb.test.ts components/bookmarklet/SavePopup.tsx
rtk git commit -m "feat(moods): add MoodRecord CRUD, remove legacy folder API"
```

---

## Task 3: BoardConfig extensions (displayMode + activeFilter)

**Files:**
- Modify: `lib/board/types.ts` (extend `BoardConfig`, add `DisplayMode` and `BoardFilter`)
- Modify: `lib/storage/board-config.ts` (defaults)
- Test: `tests/lib/board-config.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/lib/board-config.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import type { IDBPDatabase } from 'idb'
import { initDB } from '@/lib/storage/indexeddb'
import { DEFAULT_BOARD_CONFIG, loadBoardConfig, saveBoardConfig } from '@/lib/storage/board-config'

let db: IDBPDatabase<unknown> | null = null

beforeEach(async () => {
  const databases = await indexedDB.databases()
  for (const info of databases) {
    if (info.name) indexedDB.deleteDatabase(info.name)
  }
})
afterEach(() => { if (db) { db.close(); db = null } })

describe('BoardConfig v9 extensions', () => {
  it('defaults include displayMode=visual and activeFilter=all', () => {
    expect(DEFAULT_BOARD_CONFIG.displayMode).toBe('visual')
    expect(DEFAULT_BOARD_CONFIG.activeFilter).toBe('all')
  })

  it('round-trips displayMode and activeFilter', async () => {
    const d = await initDB()
    db = d as unknown as IDBPDatabase<unknown>
    await saveBoardConfig(d, {
      ...DEFAULT_BOARD_CONFIG,
      displayMode: 'editorial',
      activeFilter: 'inbox',
    })
    const loaded = await loadBoardConfig(d)
    expect(loaded.displayMode).toBe('editorial')
    expect(loaded.activeFilter).toBe('inbox')
  })

  it('round-trips mood filter', async () => {
    const d = await initDB()
    db = d as unknown as IDBPDatabase<unknown>
    await saveBoardConfig(d, {
      ...DEFAULT_BOARD_CONFIG,
      activeFilter: 'mood:abc123',
    })
    const loaded = await loadBoardConfig(d)
    expect(loaded.activeFilter).toBe('mood:abc123')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npx vitest run tests/lib/board-config.test.ts`
Expected: FAIL — `displayMode`/`activeFilter` not in config.

- [ ] **Step 3: Extend BoardConfig types**

In `lib/board/types.ts`, after `BoardConfig`, add:

```typescript
export type DisplayMode = 'visual' | 'editorial' | 'native'

export type BoardFilter = 'all' | 'inbox' | 'archive' | `mood:${string}`

export type BoardConfig = {
  readonly frameRatio: FrameRatio
  readonly themeId: ThemeId
  readonly displayMode: DisplayMode
  readonly activeFilter: BoardFilter
}
```

Replace the existing `BoardConfig` definition with this extended one.

- [ ] **Step 4: Update defaults + merge fallback**

In `lib/storage/board-config.ts`, change `DEFAULT_BOARD_CONFIG`:

```typescript
export const DEFAULT_BOARD_CONFIG: BoardConfig = {
  frameRatio: { kind: 'preset', presetId: DEFAULT_PRESET_ID },
  themeId: DEFAULT_THEME_ID,
  displayMode: 'visual',
  activeFilter: 'all',
}
```

Also harden `loadBoardConfig` against pre-v9 records missing new fields:

```typescript
export async function loadBoardConfig(db: DbLike): Promise<BoardConfig> {
  const record = (await db.get('settings', CONFIG_KEY)) as ConfigRecord | undefined
  return { ...DEFAULT_BOARD_CONFIG, ...(record?.config ?? {}) }
}
```

Merge (not replace) so an old record written with only `{ frameRatio, themeId }` still resolves `displayMode` + `activeFilter` to their defaults at read time.

- [ ] **Step 5: Run test to verify it passes**

Run: `rtk npx vitest run tests/lib/board-config.test.ts`
Expected: PASS.

- [ ] **Step 6: Run full suite**

Run: `rtk npx vitest run && rtk tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
rtk git add lib/board/types.ts lib/storage/board-config.ts tests/lib/board-config.test.ts
rtk git commit -m "feat(board): extend BoardConfig with displayMode + activeFilter"
```

---

## Task 4: Filter pure function (applyFilter)

**Files:**
- Create: `lib/board/filter.ts`
- Test: `tests/lib/filter.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/lib/filter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { applyFilter } from '@/lib/board/filter'
import type { BoardItem } from '@/lib/storage/use-board-data'

function mk(partial: Partial<BoardItem> & { bookmarkId: string; tags?: string[] }): BoardItem {
  return {
    bookmarkId: partial.bookmarkId,
    cardId: 'c-' + partial.bookmarkId,
    title: partial.bookmarkId,
    url: 'https://example.com/' + partial.bookmarkId,
    aspectRatio: 1,
    gridIndex: 0,
    orderIndex: 0,
    sizePreset: 'S',
    isRead: partial.isRead ?? false,
    isDeleted: partial.isDeleted ?? false,
    tags: partial.tags ?? [],
    displayMode: null,
  } as BoardItem
}

describe('applyFilter', () => {
  const items: BoardItem[] = [
    mk({ bookmarkId: 'a', tags: ['m1'] }),
    mk({ bookmarkId: 'b', tags: [] }),
    mk({ bookmarkId: 'c', tags: ['m2'], isDeleted: true }),
    mk({ bookmarkId: 'd', tags: ['m1', 'm2'] }),
  ]

  it("'all' returns non-deleted items", () => {
    expect(applyFilter(items, 'all').map((x) => x.bookmarkId)).toEqual(['a', 'b', 'd'])
  })

  it("'inbox' returns non-deleted items with empty tags", () => {
    expect(applyFilter(items, 'inbox').map((x) => x.bookmarkId)).toEqual(['b'])
  })

  it("'archive' returns deleted items only", () => {
    expect(applyFilter(items, 'archive').map((x) => x.bookmarkId)).toEqual(['c'])
  })

  it("'mood:<id>' returns non-deleted items whose tags include id", () => {
    expect(applyFilter(items, 'mood:m1').map((x) => x.bookmarkId)).toEqual(['a', 'd'])
    expect(applyFilter(items, 'mood:m2').map((x) => x.bookmarkId)).toEqual(['d']) // c is deleted
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npx vitest run tests/lib/filter.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement applyFilter**

Create `lib/board/filter.ts`:

```typescript
import type { BoardItem } from '@/lib/storage/use-board-data'
import type { BoardFilter } from './types'

export function applyFilter(items: ReadonlyArray<BoardItem>, filter: BoardFilter): BoardItem[] {
  if (filter === 'all') {
    return items.filter((it) => !it.isDeleted)
  }
  if (filter === 'inbox') {
    return items.filter((it) => !it.isDeleted && it.tags.length === 0)
  }
  if (filter === 'archive') {
    return items.filter((it) => it.isDeleted)
  }
  // template literal: `mood:${id}`
  const moodId = filter.slice(5)
  return items.filter((it) => !it.isDeleted && it.tags.includes(moodId))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk npx vitest run tests/lib/filter.test.ts`
Expected: PASS. If it fails on `BoardItem` shape (missing `tags`/`displayMode`), that's expected — Task 5 extends `BoardItem`. For now, add the fields as stubs directly to `BoardItem` type:

In `lib/storage/use-board-data.ts` (line 19-33), add `tags: string[]` and `displayMode: 'visual' | 'editorial' | 'native' | null` to `BoardItem` type so this test compiles. Wiring in `toItem` happens in Task 5.

Re-run: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add lib/board/filter.ts tests/lib/filter.test.ts lib/storage/use-board-data.ts
rtk git commit -m "feat(board): applyFilter pure function for BoardFilter"
```

---

## Task 5: useBoardData — tags / displayMode / filter integration

**Files:**
- Modify: `lib/storage/use-board-data.ts` (toItem includes tags, displayMode; add persistTags, persistDisplayMode)
- Test: `tests/lib/use-board-data.test.ts` (new — smoke test only since hook is React)

- [ ] **Step 1: Write the failing test**

Create `tests/lib/use-board-data.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { initDB, addBookmark } from '@/lib/storage/indexeddb'

beforeEach(async () => {
  const databases = await indexedDB.databases()
  for (const info of databases) {
    if (info.name) indexedDB.deleteDatabase(info.name)
  }
})

describe('BoardItem shape after pivot', () => {
  it('addBookmark persists tags and displayMode defaults', async () => {
    const db = await initDB()
    const bm = await addBookmark(db, {
      url: 'https://example.com', title: 'E', description: '',
      thumbnail: '', favicon: '', siteName: '', type: 'website',
    })
    expect(bm.tags).toEqual([])
    expect(bm.displayMode).toBeNull()
  })

  it('addBookmark accepts explicit tags', async () => {
    const db = await initDB()
    const bm = await addBookmark(db, {
      url: 'https://example.com', title: 'E', description: '',
      thumbnail: '', favicon: '', siteName: '', type: 'website',
      tags: ['design'],
    })
    expect(bm.tags).toEqual(['design'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails (or passes if Task 2 already did this)**

Run: `rtk npx vitest run tests/lib/use-board-data.test.ts`
Expected: PASS after Task 2 (addBookmark already accepts `tags`). If FAIL, fix addBookmark to default `tags: []`.

- [ ] **Step 3: Extend BoardItem toItem + persist functions**

In `lib/storage/use-board-data.ts`:

Update `BoardItem` (at line 19) — add `tags` + `displayMode`:

```typescript
export type BoardItem = {
  readonly bookmarkId: string
  readonly cardId: string
  readonly title: string
  readonly thumbnail?: string
  readonly url: string
  readonly aspectRatio: number
  readonly gridIndex: number
  readonly orderIndex: number
  readonly sizePreset: 'S' | 'M' | 'L'
  readonly freePos?: FreePosition
  readonly userOverridePos?: CardPosition
  readonly isRead: boolean
  readonly isDeleted: boolean
  readonly tags: readonly string[]
  readonly displayMode: 'visual' | 'editorial' | 'native' | null
}
```

Update `toItem` (after line 93) to include:

```typescript
    tags: b.tags ?? [],
    displayMode: b.displayMode ?? null,
```

Add two new persist callbacks. After `persistSoftDelete`, add:

```typescript
  const persistTags = useCallback(
    async (bookmarkId: string, tags: readonly string[]): Promise<void> => {
      const db = dbRef.current
      if (!db || !bookmarkId) return
      const existing = (await db.get('bookmarks', bookmarkId)) as BookmarkRecord | undefined
      if (!existing) return
      await db.put('bookmarks', { ...existing, tags: [...tags] })
      setItems((prev) => prev.map((it) => (it.bookmarkId === bookmarkId ? { ...it, tags: [...tags] } : it)))
    },
    [],
  )

  const persistDisplayMode = useCallback(
    async (bookmarkId: string, displayMode: BoardItem['displayMode']): Promise<void> => {
      const db = dbRef.current
      if (!db || !bookmarkId) return
      const existing = (await db.get('bookmarks', bookmarkId)) as BookmarkRecord | undefined
      if (!existing) return
      await db.put('bookmarks', { ...existing, displayMode })
      setItems((prev) =>
        prev.map((it) => (it.bookmarkId === bookmarkId ? { ...it, displayMode } : it)),
      )
    },
    [],
  )
```

Add both to the return object and to the return type signature:

```typescript
    persistTags: (bookmarkId: string, tags: readonly string[]) => Promise<void>
    persistDisplayMode: (bookmarkId: string, displayMode: BoardItem['displayMode']) => Promise<void>
```

Also add a `reload()` method the entrance animator (Task 20) can call when a BroadcastChannel event arrives:

```typescript
  const reload = useCallback(async (): Promise<void> => {
    const db = dbRef.current
    if (!db) return
    const bookmarks = await getAllBookmarks(db as Parameters<typeof getAllBookmarks>[0])
    const cards = (await db.getAll('cards')) as CardRecord[]
    const cardByBookmark = new Map<string, CardRecord>()
    for (const c of cards) cardByBookmark.set(c.bookmarkId, c)
    const all = bookmarks
      .filter((b) => !b.isDeleted)
      .map((b) => toItem(b, cardByBookmark.get(b.id)))
      .sort((a, b) => a.orderIndex - b.orderIndex)
    setItems(all)
  }, [])
```

Add `reload` to return + signature.

Also — the initial `useEffect` body has inline loading logic duplicating `reload`. Refactor: pull the load out into an inline helper named `loadAll()` and have both the mount effect and `reload` call it. Simplest version: keep the mount effect's inline fetch; have `reload` do the same fetch. Minor dup, OK.

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk npx vitest run tests/lib/use-board-data.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full suite + tsc**

Run: `rtk npx vitest run && rtk tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add lib/storage/use-board-data.ts tests/lib/use-board-data.test.ts
rtk git commit -m "feat(board): BoardItem tags/displayMode + persistTags/persistDisplayMode/reload"
```

---

## Task 6: BookmarkTagger abstraction + HeuristicTagger MVP

**Files:**
- Create: `lib/tagger/types.ts`
- Create: `lib/tagger/heuristic.ts`
- Test: `tests/lib/tagger-heuristic.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/lib/tagger-heuristic.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { HeuristicTagger } from '@/lib/tagger/heuristic'

const moods = [
  { id: 'm-code', name: 'code', color: '#aaa', order: 0, createdAt: 0 },
  { id: 'm-photo', name: 'photography', color: '#bbb', order: 1, createdAt: 0 },
  { id: 'm-design', name: 'design', color: '#ccc', order: 2, createdAt: 0 },
]

describe('HeuristicTagger', () => {
  it('suggests code mood for github.com URL', async () => {
    const t = new HeuristicTagger({ moods })
    const suggestions = await t.suggest({
      url: 'https://github.com/user/repo', title: 'repo', description: '', siteName: 'GitHub',
    })
    expect(suggestions.map((s) => s.moodId)).toContain('m-code')
    expect(suggestions[0].reason).toBe('domain')
  })

  it('suggests photography mood when title contains "photo"', async () => {
    const t = new HeuristicTagger({ moods })
    const suggestions = await t.suggest({
      url: 'https://example.com/x', title: 'My photo diary', description: '', siteName: '',
    })
    expect(suggestions.map((s) => s.moodId)).toContain('m-photo')
  })

  it('returns empty when nothing matches', async () => {
    const t = new HeuristicTagger({ moods })
    const suggestions = await t.suggest({
      url: 'https://randomsite.test/x', title: 'x', description: '', siteName: '',
    })
    expect(suggestions).toEqual([])
  })

  it('confidence is between 0 and 1', async () => {
    const t = new HeuristicTagger({ moods })
    const suggestions = await t.suggest({
      url: 'https://github.com/x', title: 'x', description: '', siteName: '',
    })
    for (const s of suggestions) {
      expect(s.confidence).toBeGreaterThan(0)
      expect(s.confidence).toBeLessThanOrEqual(1)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npx vitest run tests/lib/tagger-heuristic.test.ts`
Expected: FAIL — modules don't exist.

- [ ] **Step 3: Implement tagger types + HeuristicTagger**

Create `lib/tagger/types.ts`:

```typescript
import type { MoodRecord } from '@/lib/storage/indexeddb'

export type TagReason = 'domain' | 'keyword' | 'embedding' | 'llm'

export interface TagSuggestion {
  readonly moodId: string
  readonly confidence: number
  readonly reason: TagReason
}

export interface BookmarkTaggerInput {
  readonly url: string
  readonly title: string
  readonly description: string
  readonly siteName: string
}

export interface BookmarkTagger {
  suggest(input: BookmarkTaggerInput): Promise<TagSuggestion[]>
}

export interface BookmarkTaggerContext {
  readonly moods: ReadonlyArray<MoodRecord>
}
```

Create `lib/tagger/heuristic.ts`:

```typescript
import type { BookmarkTagger, BookmarkTaggerContext, BookmarkTaggerInput, TagSuggestion } from './types'

const DOMAIN_TO_KEYWORD: Record<string, string[]> = {
  'github.com': ['code', 'dev', 'programming'],
  'gitlab.com': ['code', 'dev'],
  'stackoverflow.com': ['code', 'dev'],
  'youtube.com': ['video', 'music'],
  'youtu.be': ['video', 'music'],
  'vimeo.com': ['video', 'film'],
  'tiktok.com': ['video'],
  'twitter.com': ['social'],
  'x.com': ['social'],
  'instagram.com': ['photo', 'photography', 'social'],
  'medium.com': ['article', 'writing'],
  'substack.com': ['article', 'writing'],
  'figma.com': ['design'],
  'dribbble.com': ['design'],
  'behance.net': ['design'],
  'pinterest.com': ['design', 'photo'],
  'unsplash.com': ['photo', 'photography'],
  'flickr.com': ['photo', 'photography'],
}

function hostname(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

export class HeuristicTagger implements BookmarkTagger {
  constructor(private ctx: BookmarkTaggerContext) {}

  async suggest(input: BookmarkTaggerInput): Promise<TagSuggestion[]> {
    const suggestions: TagSuggestion[] = []
    const host = hostname(input.url)
    const haystack = (input.title + ' ' + input.description + ' ' + input.siteName).toLowerCase()

    const domainKeywords = DOMAIN_TO_KEYWORD[host] ?? []
    const moods = this.ctx.moods

    for (const mood of moods) {
      const moodName = mood.name.toLowerCase()
      // Domain match: high confidence
      if (domainKeywords.some((kw) => kw === moodName || moodName.includes(kw) || kw.includes(moodName))) {
        suggestions.push({ moodId: mood.id, confidence: 0.8, reason: 'domain' })
        continue
      }
      // Keyword match in title/description/siteName
      if (haystack.includes(moodName) && moodName.length >= 3) {
        suggestions.push({ moodId: mood.id, confidence: 0.5, reason: 'keyword' })
      }
    }

    // De-duplicate by moodId, keep highest confidence
    const byId = new Map<string, TagSuggestion>()
    for (const s of suggestions) {
      const prev = byId.get(s.moodId)
      if (!prev || prev.confidence < s.confidence) byId.set(s.moodId, s)
    }
    return Array.from(byId.values()).sort((a, b) => b.confidence - a.confidence)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk npx vitest run tests/lib/tagger-heuristic.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add lib/tagger/types.ts lib/tagger/heuristic.ts tests/lib/tagger-heuristic.test.ts
rtk git commit -m "feat(tagger): BookmarkTagger interface + HeuristicTagger MVP"
```

---

## Task 7: BroadcastChannel listener helper

**Files:**
- Create: `lib/board/channel.ts`
- Test: `tests/lib/channel.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/lib/channel.test.ts`:

```typescript
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { postBookmarkSaved, subscribeBookmarkSaved } from '@/lib/board/channel'

describe('BroadcastChannel helper', () => {
  it('subscriber receives postBookmarkSaved event', async () => {
    const handler = vi.fn()
    const unsub = subscribeBookmarkSaved(handler)
    postBookmarkSaved({ bookmarkId: 'b1' })
    // BroadcastChannel delivers async on the next microtask
    await new Promise((r) => setTimeout(r, 0))
    expect(handler).toHaveBeenCalledWith({ bookmarkId: 'b1' })
    unsub()
  })

  it('unsubscribe stops the handler from firing', async () => {
    const handler = vi.fn()
    const unsub = subscribeBookmarkSaved(handler)
    unsub()
    postBookmarkSaved({ bookmarkId: 'b2' })
    await new Promise((r) => setTimeout(r, 0))
    expect(handler).not.toHaveBeenCalled()
  })
})
```

Note: jsdom ships BroadcastChannel since v22 (we have v29 per package.json). If not, use a stub in vitest.setup.ts.

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npx vitest run tests/lib/channel.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement channel wrapper**

Create `lib/board/channel.ts`:

```typescript
const CHANNEL_NAME = 'booklage'

export type BookmarkSavedMessage = {
  readonly type: 'bookmark-saved'
  readonly bookmarkId: string
}

export function postBookmarkSaved(payload: { bookmarkId: string }): void {
  if (typeof BroadcastChannel === 'undefined') return
  try {
    const ch = new BroadcastChannel(CHANNEL_NAME)
    ch.postMessage({ type: 'bookmark-saved', bookmarkId: payload.bookmarkId } satisfies BookmarkSavedMessage)
    ch.close()
  } catch {
    /* ignore */
  }
}

export function subscribeBookmarkSaved(
  handler: (msg: { bookmarkId: string }) => void,
): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {}
  const ch = new BroadcastChannel(CHANNEL_NAME)
  const listener = (ev: MessageEvent): void => {
    const data = ev.data as Partial<BookmarkSavedMessage> | null
    if (!data || data.type !== 'bookmark-saved' || !data.bookmarkId) return
    handler({ bookmarkId: data.bookmarkId })
  }
  ch.addEventListener('message', listener)
  return (): void => {
    ch.removeEventListener('message', listener)
    ch.close()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk npx vitest run tests/lib/channel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add lib/board/channel.ts tests/lib/channel.test.ts
rtk git commit -m "feat(board): BroadcastChannel helper for cross-tab bookmark-saved"
```

---

## Task 8: Bookmarklet URI — 320×120 top-center popup

**Files:**
- Modify: `lib/utils/bookmarklet.ts` (update BOOKMARKLET_SOURCE size/position)
- Test: `tests/lib/bookmarklet.test.ts` (new; if existing, extend)

- [ ] **Step 1: Write the failing test**

Create `tests/lib/bookmarklet.test.ts` (or extend if present):

```typescript
import { describe, it, expect } from 'vitest'
import { generateBookmarkletUri } from '@/lib/utils/bookmarklet'

describe('generateBookmarkletUri', () => {
  it('uses 320x120 popup window dims', () => {
    const uri = generateBookmarkletUri('https://booklage.pages.dev')
    expect(uri).toContain('width=320')
    expect(uri).toContain('height=120')
  })

  it('positions popup at top-center via dynamic left calc', () => {
    const uri = generateBookmarkletUri('https://booklage.pages.dev')
    // source contains `(screen.width-320)/2` and `top=40`
    expect(uri).toMatch(/left=.*screen\.width-320.*\/2/)
    expect(uri).toContain('top=40')
  })

  it('includes Booklage origin', () => {
    const uri = generateBookmarkletUri('https://booklage.pages.dev')
    expect(uri).toContain('https://booklage.pages.dev/save')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npx vitest run tests/lib/bookmarklet.test.ts`
Expected: FAIL — current source uses width=480,height=600 and no `left`/`top`.

- [ ] **Step 3: Update BOOKMARKLET_SOURCE**

Edit `lib/utils/bookmarklet.ts:44`. Replace the `window.open` call inside the IIFE with dynamic dim + position computation:

```typescript
const BOOKMARKLET_SOURCE = `(function(){var d=document,l=location,m=function(s){var e=d.querySelector(s);return e?e.getAttribute('content')||'':'';},k=function(s){var e=d.querySelector(s);return e?e.getAttribute('href')||'':'';},u=l.href,t=m('meta[property="og:title"]')||d.title||u,i=m('meta[property="og:image"]')||m('meta[name="twitter:image"]')||'',ds=(m('meta[property="og:description"]')||m('meta[name="description"]')||'').slice(0,200),sn=m('meta[property="og:site_name"]')||l.hostname,f=k('link[rel="icon"]')||k('link[rel="shortcut icon"]')||'/favicon.ico';if(f&&!/^https?:/.test(f)){try{f=new URL(f,u).href}catch(e){f=''}}var p=new URLSearchParams({url:u,title:t,image:i,desc:ds,site:sn,favicon:f}),w=320,h=120,lx=Math.max(0,Math.round((screen.width-w)/2));window.open(__APP_URL__+'/save?'+p.toString(),'booklage-save','width='+w+',height='+h+',left='+lx+',top=40,toolbar=0,menubar=0,location=0,status=0,resizable=0,scrollbars=0')})();`
```

The test regex expects `screen.width-320` and `top=40` literally — keep those substrings exact.

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk npx vitest run tests/lib/bookmarklet.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add lib/utils/bookmarklet.ts tests/lib/bookmarklet.test.ts
rtk git commit -m "feat(bookmarklet): 320x120 top-center popup window"
```

---

## Task 9: SaveToast component (replaces SavePopup)

**Files:**
- Create: `components/bookmarklet/SaveToast.tsx`
- Create: `components/bookmarklet/SaveToast.module.css`
- Delete: `components/bookmarklet/SavePopup.tsx`
- Delete: `components/bookmarklet/SavePopup.module.css`
- Modify: `app/(app)/save/page.tsx` (swap import)
- Modify: `messages/ja.json` (add toast keys)

- [ ] **Step 1: Add i18n keys**

Edit `messages/ja.json`, add under the root `bookmarklet` namespace (create if missing):

```json
  "bookmarklet": {
    "toast": {
      "saving": "保存中…",
      "saved": "Inbox に保存しました",
      "error": "保存に失敗しました"
    }
  }
```

Preserve existing keys; insert this block as a sibling of `board`, `share`, etc.

- [ ] **Step 2: Write the component**

Create `components/bookmarklet/SaveToast.module.css`:

```css
.container {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 18px;
  background: #ffffff;
  border-radius: 10px;
  font-family: system-ui, -apple-system, sans-serif;
  color: #1a1a1a;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
}
.icon {
  width: 24px; height: 24px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.spinner {
  width: 20px; height: 20px; border-radius: 50%;
  border: 2px solid rgba(0,0,0,0.1);
  border-top-color: #1a1a1a;
  animation: spin 700ms linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.checkmark {
  width: 24px; height: 24px; border-radius: 50%;
  background: #1a1a1a;
  display: flex; align-items: center; justify-content: center;
  animation: pop 420ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.checkmark svg { stroke: #fff; stroke-width: 2.5; fill: none; stroke-linecap: round; stroke-linejoin: round; }
.errorIcon {
  width: 24px; height: 24px; border-radius: 50%;
  background: #d04a4a;
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700;
}
@keyframes pop {
  0% { transform: scale(0); opacity: 0; }
  60% { transform: scale(1.12); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
.body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.brand { font-family: 'Playfair Display', Georgia, serif; font-style: italic; font-size: 15px; color: #1a1a1a; }
.label { font-size: 13px; color: #6a6a6a; }
.label.saved { color: #1a1a1a; font-weight: 600; animation: fadeIn 280ms ease-out; }
.label.error { color: #d04a4a; font-weight: 600; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
```

Create `components/bookmarklet/SaveToast.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useSearchParams } from 'next/navigation'
import { initDB, addBookmark } from '@/lib/storage/indexeddb'
import { detectUrlType } from '@/lib/utils/url'
import { postBookmarkSaved } from '@/lib/board/channel'
import { t } from '@/lib/i18n/t'
import styles from './SaveToast.module.css'

type State = 'saving' | 'saved' | 'error'

export function SaveToast(): ReactElement {
  const params = useSearchParams()
  const url = params.get('url') ?? ''
  const title = params.get('title') || url
  const desc = params.get('desc') ?? ''
  const image = params.get('image') ?? ''
  const site = params.get('site') ?? ''
  const favicon = params.get('favicon') ?? ''

  const [state, setState] = useState<State>('saving')
  const savedRef = useRef(false)

  useEffect(() => {
    if (!url || savedRef.current) return
    savedRef.current = true
    let timer: ReturnType<typeof setTimeout> | null = null
    let closeTimer: ReturnType<typeof setTimeout> | null = null

    ;(async (): Promise<void> => {
      try {
        const db = await initDB()
        const bm = await addBookmark(db, {
          url,
          title,
          description: desc,
          thumbnail: image,
          favicon,
          siteName: site,
          type: detectUrlType(url),
          tags: [],
        })
        postBookmarkSaved({ bookmarkId: bm.id })
        // Hold spinner visually for at least ~800ms to avoid flash on fast machines,
        // then transition to saved state.
        timer = setTimeout(() => setState('saved'), 800)
        closeTimer = setTimeout(() => {
          try { window.close() } catch { /* browser blocked */ }
        }, 2300)
      } catch {
        setState('error')
        closeTimer = setTimeout(() => {
          try { window.close() } catch { /* ignore */ }
        }, 3000)
      }
    })()

    return () => {
      if (timer) clearTimeout(timer)
      if (closeTimer) clearTimeout(closeTimer)
    }
  }, [url, title, desc, image, site, favicon])

  // No-URL fallback
  if (!url) {
    return (
      <div className={styles.container} data-state="no-url">
        <div className={styles.icon}>📌</div>
        <div className={styles.body}>
          <span className={styles.brand}>Booklage</span>
          <span className={styles.label}>ブックマークレットから開いてください</span>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container} data-state={state} data-testid="save-toast">
      <div className={styles.icon}>
        {state === 'saving' && <div className={styles.spinner} aria-hidden />}
        {state === 'saved' && (
          <div className={styles.checkmark} role="img" aria-label={t('bookmarklet.toast.saved')}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M3 7 L6 10 L11 4" /></svg>
          </div>
        )}
        {state === 'error' && <div className={styles.errorIcon} role="img" aria-label={t('bookmarklet.toast.error')}>✗</div>}
      </div>
      <div className={styles.body}>
        <span className={styles.brand}>Booklage</span>
        <span className={`${styles.label} ${state === 'saved' ? styles.saved : ''} ${state === 'error' ? styles.error : ''}`.trim()}>
          {state === 'saving' && t('bookmarklet.toast.saving')}
          {state === 'saved' && t('bookmarklet.toast.saved')}
          {state === 'error' && t('bookmarklet.toast.error')}
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Delete SavePopup**

```bash
rtk git rm components/bookmarklet/SavePopup.tsx components/bookmarklet/SavePopup.module.css
```

- [ ] **Step 4: Update /save route**

Rewrite `app/(app)/save/page.tsx`:

```tsx
import { Suspense } from 'react'
import { SaveToast } from '@/components/bookmarklet/SaveToast'

export default function SavePage(): React.ReactElement {
  return (
    <Suspense fallback={<div style={{ padding: 16, textAlign: 'center' }}>…</div>}>
      <SaveToast />
    </Suspense>
  )
}
```

Also ensure `app/(app)/layout.tsx` does not inject any outer shell that would push the toast off the 320×120 popup viewport. If it applies full-viewport backgrounds/padding, wrap /save in a bare layout or use `className` reset via globals.css. Check:

```bash
rtk read app/\(app\)/layout.tsx
```

If the layout adds a full-height wrapper, put the toast in its own route group `app/save/page.tsx` outside the `(app)` group (moving the file) so it skips that layout. Minimal approach: add CSS override in `app/globals.css` that targets `body[data-route="save"]` and zero margin/padding. Pragmatic: move the route to `app/save/page.tsx` (top-level, not under `(app)`).

Concrete move:

```bash
mkdir -p app/save
git mv app/\(app\)/save/page.tsx app/save/page.tsx
```

If `app/(app)/save/` directory is now empty, remove it.

- [ ] **Step 5: Build + tsc**

Run: `rtk tsc --noEmit && rtk pnpm build`
Expected: both pass. If `pnpm build` fails on missing references to SavePopup, surface and fix.

- [ ] **Step 6: Commit**

```bash
rtk git add components/bookmarklet/SaveToast.tsx components/bookmarklet/SaveToast.module.css app/save/page.tsx messages/ja.json
rtk git commit -m "feat(bookmarklet): replace SavePopup with zero-friction SaveToast"
```

---

## Task 10: Update bookmarklet-save E2E test for new flow

**Files:**
- Modify: `tests/e2e/bookmarklet-save.spec.ts`

- [ ] **Step 1: Rewrite the E2E test to assert the toast flow**

Replace `tests/e2e/bookmarklet-save.spec.ts` content:

```typescript
import { test, expect, type Page } from '@playwright/test'

const DB_NAME = 'booklage-db'
const DB_VERSION = 9

async function clearDb(page: Page): Promise<void> {
  await page.evaluate(
    async ({ dbName, dbVersion }) => {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion)
        const timer = window.setTimeout(() => reject(new Error('clearDb open timeout')), 10_000)
        req.onsuccess = () => {
          window.clearTimeout(timer)
          const db = req.result
          const tx = db.transaction(['bookmarks', 'cards'], 'readwrite')
          tx.objectStore('bookmarks').clear()
          tx.objectStore('cards').clear()
          tx.oncomplete = () => { db.close(); resolve() }
          tx.onerror = () => reject(new Error('clear tx error'))
        }
        req.onerror = () => reject(new Error('open error'))
      })
    },
    { dbName: DB_NAME, dbVersion: DB_VERSION },
  )
}

async function readAllBookmarks(page: Page): Promise<Array<{ id: string; tags: string[] }>> {
  return page.evaluate(
    async ({ dbName, dbVersion }) =>
      new Promise<Array<{ id: string; tags: string[] }>>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction('bookmarks', 'readonly')
          const all = tx.objectStore('bookmarks').getAll()
          all.onsuccess = () => {
            db.close()
            resolve(
              (all.result as Array<{ id: string; tags?: string[] }>).map((b) => ({
                id: b.id, tags: b.tags ?? [],
              })),
            )
          }
          all.onerror = () => reject(new Error('getAll error'))
        }
        req.onerror = () => reject(new Error('open error'))
      }),
    { dbName: DB_NAME, dbVersion: DB_VERSION },
  )
}

test.describe('Bookmarklet save toast flow', () => {
  test('auto-saves and shows checkmark', async ({ page }) => {
    await page.goto('/board')
    await page.waitForLoadState('networkidle')
    await clearDb(page)

    const params = new URLSearchParams({
      url: 'https://example.com/article',
      title: 'Example Article',
      image: 'https://example.com/og.png',
      desc: 'Sample description',
      site: 'Example',
      favicon: 'https://example.com/favicon.ico',
    })
    await page.goto(`/save?${params.toString()}`)

    await expect(page.getByTestId('save-toast')).toBeVisible()
    await expect(page.getByTestId('save-toast')).toHaveAttribute('data-state', 'saved', { timeout: 3000 })
    await expect(page.getByText('Inbox に保存しました')).toBeVisible()

    const bookmarks = await readAllBookmarks(page)
    expect(bookmarks).toHaveLength(1)
    expect(bookmarks[0].tags).toEqual([])
  })

  test('shows instructions when opened without url param', async ({ page }) => {
    await page.goto('/save')
    await expect(page.getByText('ブックマークレットから開いてください')).toBeVisible()
  })
})
```

- [ ] **Step 2: Run the test**

Run: `rtk npx playwright test tests/e2e/bookmarklet-save.spec.ts`
Expected: PASS.

- [ ] **Step 3: Run full E2E suite to check for regressions**

Run: `rtk npx playwright test`
Expected: PASS. Other specs may not depend on the folder flow.

- [ ] **Step 4: Commit**

```bash
rtk git add tests/e2e/bookmarklet-save.spec.ts
rtk git commit -m "test(e2e): update bookmarklet-save for SaveToast flow"
```

---

## Task 11: destefanis color system + board visual tuning (CSS vars + masonry)

**Files:**
- Modify: `app/globals.css` (add/replace destefanis color vars)
- Modify: `lib/board/constants.ts` (masonry tuning: `TARGET_COLUMN_UNIT_PX: 160`, `GAP_PX: 10`)
- Modify: `components/board/BoardRoot.tsx` (background: `#0a0a0a`, drop `--sidebar-width` light assumption)

- [ ] **Step 1: Add destefanis CSS variables**

Edit `app/globals.css`. At the top of `:root`, add (or merge with existing) a block:

```css
:root {
  /* destefanis pivot (2026-04-21) */
  --bg-dark: #0a0a0a;
  --card-white: #ffffff;
  --card-dark-alt: #101010;
  --card-border-dark: rgba(255, 255, 255, 0.05);
  --sidebar-bg: rgba(15, 15, 15, 0.6);
  --text-primary: #f2f2f2;
  --text-body: #bbbbbb;
  --text-meta: #777777;
  --text-muted: #555555;
  --text-signature: #444444;
  --card-radius: 10px;
  --lightbox-media-radius: 6px;
  --lightbox-backdrop: rgba(10, 10, 10, 0.95);
}
```

Set `body { background: var(--bg-dark); color: var(--text-primary); }` (replacing any existing body background).

- [ ] **Step 2: Tune masonry constants**

Edit `lib/board/constants.ts:99-102`:

```typescript
export const COLUMN_MASONRY = {
  TARGET_COLUMN_UNIT_PX: 160,
  GAP_PX: 10,
} as const
```

- [ ] **Step 3: Confirm BoardRoot reflects dark bg**

In `components/board/BoardRoot.tsx`, confirm the root `div style={{ ... }}` does not set `background: '#fff'`. Currently it's `overflow: 'hidden'` only — good, body bg bleeds through. If ThemeLayer paints white, add a conditional or simply keep current themes (dotted-notebook / grid-paper) — they already look fine on dark bg? If the themes lay down light patterns, keep them; destefanis scope is *board* not *theme*. Leave ThemeLayer as-is for now.

- [ ] **Step 4: Run tsc + build + existing board e2e**

Run: `rtk tsc --noEmit && rtk pnpm build`
Expected: PASS.

Run: `rtk npx playwright test tests/e2e/board-b0.spec.ts`
Expected: PASS (masonry still computes, positions updated but test asserts shape not exact pixels).

- [ ] **Step 5: Commit**

```bash
rtk git add app/globals.css lib/board/constants.ts
rtk git commit -m "feat(board): destefanis color vars + 160px/10px masonry tuning"
```

---

## Task 12: Sidebar redesign — Library + Moods driven by MoodRecord

**Files:**
- Modify: `components/board/Sidebar.tsx` (Inbox/Archive items, Moods section from DB)
- Modify: `components/board/Sidebar.module.css` (dark minimal)
- Modify: `components/board/BoardRoot.tsx` (load moods, pass to Sidebar, handle filter change)
- Modify: `lib/storage/use-board-data.ts` (extend `sidebarCounts` to include `inbox` / `archive`)
- Modify: `messages/ja.json` (Inbox/Archive/filter labels)

- [ ] **Step 1: Add new i18n keys**

Edit `messages/ja.json`, extend `board.sidebar`:

```json
      "inbox": "Inbox",
      "archive": "Archive",
      "moodsHeader": "MOODS",
      "newMood": "+ 新しい mood",
      "triageCta": "仕分けを始める"
```

Remove the deprecated `foldersHeader` / `foldersPlaceholder` keys (no longer used).

- [ ] **Step 2: Extend sidebarCounts in BoardRoot**

In `components/board/BoardRoot.tsx`, line 316 `sidebarCounts` useMemo, change to:

```typescript
  const sidebarCounts = useMemo(() => {
    const active = items.filter((i) => !i.isDeleted)
    const deleted = items.filter((i) => i.isDeleted)
    return {
      all: active.length,
      inbox: active.filter((i) => i.tags.length === 0).length,
      archive: deleted.length,
    }
  }, [items])
```

Remove `unread` and `read` — not part of destefanis IA.

- [ ] **Step 3: Add useMoods hook**

Create `lib/storage/use-moods.ts`:

```typescript
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { IDBPDatabase } from 'idb'
import type { MoodRecord, MoodInput } from './indexeddb'
import { initDB } from './indexeddb'
import { addMood, getAllMoods, updateMood as updMood, deleteMood as delMood } from './moods'

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbLike = IDBPDatabase<any>

export function useMoods(): {
  moods: MoodRecord[]
  loading: boolean
  create: (input: MoodInput) => Promise<MoodRecord>
  rename: (id: string, name: string) => Promise<void>
  remove: (id: string) => Promise<void>
  reload: () => Promise<void>
} {
  const [moods, setMoods] = useState<MoodRecord[]>([])
  const [loading, setLoading] = useState(true)
  const dbRef = useRef<DbLike | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    const db = dbRef.current
    if (!db) return
    const list = await getAllMoods(db)
    setMoods(list)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async (): Promise<void> => {
      const db = (await initDB()) as unknown as DbLike
      if (cancelled) return
      dbRef.current = db
      const list = await getAllMoods(db)
      if (cancelled) return
      setMoods(list)
      setLoading(false)
    })().catch(() => {
      if (!cancelled) setLoading(false)
    })
    return (): void => { cancelled = true }
  }, [])

  const create = useCallback(async (input: MoodInput): Promise<MoodRecord> => {
    const db = dbRef.current
    if (!db) throw new Error('moods db not ready')
    const created = await addMood(db, input)
    setMoods((prev) => [...prev, created].sort((a, b) => a.order - b.order))
    return created
  }, [])

  const rename = useCallback(async (id: string, name: string): Promise<void> => {
    const db = dbRef.current
    if (!db) return
    await updMood(db, id, { name })
    setMoods((prev) => prev.map((m) => (m.id === id ? { ...m, name } : m)))
  }, [])

  const remove = useCallback(async (id: string): Promise<void> => {
    const db = dbRef.current
    if (!db) return
    await delMood(db, id)
    setMoods((prev) => prev.filter((m) => m.id !== id))
  }, [])

  return { moods, loading, create, rename, remove, reload }
}
```

- [ ] **Step 4: Rewrite Sidebar**

Rewrite `components/board/Sidebar.tsx`:

```tsx
'use client'

import type { ReactElement } from 'react'
import { LiquidGlass } from './LiquidGlass'
import { BookmarkletInstall } from '@/components/bookmarklet/BookmarkletInstall'
import { t } from '@/lib/i18n/t'
import type { BoardFilter } from '@/lib/board/types'
import type { MoodRecord } from '@/lib/storage/indexeddb'
import styles from './Sidebar.module.css'

type Props = {
  readonly collapsed: boolean
  readonly onToggle: () => void
  readonly counts: { readonly all: number; readonly inbox: number; readonly archive: number }
  readonly activeFilter: BoardFilter
  readonly onFilterChange: (f: BoardFilter) => void
  readonly moods: ReadonlyArray<MoodRecord>
  readonly moodCounts: Readonly<Record<string, number>>
  readonly onCreateMood: () => void
  readonly onOpenBookmarkletModal?: () => void
  readonly onTriageStart?: () => void
}

export function Sidebar({
  collapsed, onToggle, counts, activeFilter, onFilterChange,
  moods, moodCounts, onCreateMood, onOpenBookmarkletModal, onTriageStart,
}: Props): ReactElement {
  const isActive = (f: BoardFilter): boolean => activeFilter === f
  return (
    <aside
      className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`.trim()}
      data-testid="board-sidebar"
      aria-label="ボードナビゲーション"
    >
      <LiquidGlass className={styles.sidebarGlass}>
        <div className={styles.inner}>
          <div className={styles.brand}>
            <span className={styles.brandName}>Booklage</span>
            <button
              type="button"
              className={styles.collapseBtn}
              onClick={onToggle}
              aria-label={collapsed ? t('board.sidebar.expandAria') : t('board.sidebar.collapseAria')}
            >{collapsed ? '⇥' : '⇤'}</button>
          </div>

          <div className={styles.search}>
            <span className={styles.searchIcon}>🔍</span>
            <span className={styles.searchPlaceholder}>{t('board.sidebar.searchPlaceholder')}</span>
            <span className={styles.searchHint}>{t('board.sidebar.searchHint')}</span>
          </div>

          <div className={styles.sectionHeader}>{t('board.sidebar.libraryHeader')}</div>
          <button type="button"
            className={`${styles.navItem} ${isActive('all') ? styles.active : ''}`.trim()}
            onClick={() => onFilterChange('all')}>
            <span className={styles.navLabel}>{t('board.sidebar.all')}</span>
            <span className={styles.navCount}>{counts.all}</span>
          </button>
          <button type="button"
            className={`${styles.navItem} ${isActive('inbox') ? styles.active : ''}`.trim()}
            onClick={() => onFilterChange('inbox')}>
            <span className={styles.navLabel}>{t('board.sidebar.inbox')}</span>
            <span className={`${styles.navCount} ${counts.inbox > 0 ? styles.navCountHot : ''}`.trim()}>{counts.inbox}</span>
          </button>
          <button type="button"
            className={`${styles.navItem} ${isActive('archive') ? styles.active : ''}`.trim()}
            onClick={() => onFilterChange('archive')}>
            <span className={styles.navLabel}>{t('board.sidebar.archive')}</span>
            <span className={styles.navCount}>{counts.archive}</span>
          </button>

          {counts.inbox > 0 && onTriageStart && (
            <button type="button" className={styles.triageCta} onClick={onTriageStart}>
              {t('board.sidebar.triageCta')}
            </button>
          )}

          <BookmarkletInstall onClick={onOpenBookmarkletModal ?? (() => {})} />

          <div className={styles.sectionHeader}>{t('board.sidebar.moodsHeader')}</div>
          {moods.map((m) => {
            const f: BoardFilter = `mood:${m.id}`
            const active = activeFilter === f
            return (
              <button key={m.id} type="button"
                className={`${styles.navItem} ${active ? styles.active : ''}`.trim()}
                onClick={() => onFilterChange(f)}>
                <span className={styles.moodDot} style={{ background: m.color }} />
                <span className={styles.navLabel}>{m.name}</span>
                <span className={styles.navCount}>{moodCounts[m.id] ?? 0}</span>
              </button>
            )
          })}
          <button type="button" className={styles.newMoodBtn} onClick={onCreateMood}>
            {t('board.sidebar.newMood')}
          </button>

          <div className={styles.spacer} />
          <div className={styles.signature}>{t('board.sidebar.signature')}</div>
        </div>
      </LiquidGlass>
    </aside>
  )
}
```

- [ ] **Step 5: Update Sidebar.module.css — dark minimal**

In `components/board/Sidebar.module.css`, review and update rules so that:
- `.sidebar` / `.inner` use `color: var(--text-body)`
- `.brandName` uses `color: var(--text-primary); font-family: 'Playfair Display', serif; font-style: italic;`
- `.navItem` uses `color: var(--text-body); border: 0; background: transparent; text-align: left; padding: 8px 12px; border-radius: 6px; display: flex; align-items: center; gap: 10px; width: 100%;`
- `.navItem:hover` uses `background: rgba(255,255,255,0.03);`
- `.navItem.active` uses `background: rgba(255,255,255,0.08); color: var(--text-primary);`
- `.navCount` uses `margin-left: auto; color: var(--text-meta); font-size: 12px;`
- `.navCountHot` uses `color: var(--text-primary); font-weight: 600;`
- `.moodDot` is 8×8 `border-radius: 50%; flex-shrink: 0;`
- `.newMoodBtn` is `color: var(--text-meta); border: 1px dashed rgba(255,255,255,0.08); padding: 6px 10px; border-radius: 6px; background: transparent; cursor: pointer; text-align: left;`
- `.triageCta` is `margin: 8px 0; background: rgba(255,255,255,0.08); color: var(--text-primary); border: 0; padding: 10px; border-radius: 8px; cursor: pointer; font-weight: 600;`
- `.signature` is `writing-mode: vertical-rl; color: var(--text-signature); font-size: 10px; letter-spacing: 0.2em; padding-left: 6px;` — keep existing geometry.

Delete any rules referencing `.foldersPlaceholder` / `.themeBtn` / `.footRow` / `.hideHint`.

Preserve `.sidebar`, `.sidebarGlass`, `.collapsed`, `.brand`, `.collapseBtn`, `.search*`, `.sectionHeader`, `.spacer` — update colors to dark palette.

- [ ] **Step 6: Wire Sidebar in BoardRoot**

In `components/board/BoardRoot.tsx`:

1. Import `useMoods` from `@/lib/storage/use-moods`.
2. Import `useBoardData` already present — we need activeFilter state + onFilterChange:
3. Add state for `activeFilter: BoardFilter` — hydrate from `loadBoardConfig` (default 'all'), persist on change.
4. Compute `moodCounts` via useMemo:
   ```typescript
   const moodCounts = useMemo(() => {
     const counts: Record<string, number> = {}
     for (const it of items) {
       if (it.isDeleted) continue
       for (const tag of it.tags) counts[tag] = (counts[tag] ?? 0) + 1
     }
     return counts
   }, [items])
   ```
5. Remove the legacy `handleThemeClick` and `themeId` cycle call on the sidebar (theme picker is post-launch).
6. Delete state for `themeId`/theme cycle — keep it on `DEFAULT_THEME_ID` as a locked constant; ThemeLayer still needs a themeId prop.

Render pass:

```tsx
<Sidebar
  collapsed={sidebarCollapsed}
  onToggle={handleSidebarToggle}
  counts={sidebarCounts}
  activeFilter={activeFilter}
  onFilterChange={handleFilterChange}
  moods={moods}
  moodCounts={moodCounts}
  onCreateMood={handleCreateMood}
  onOpenBookmarkletModal={handleOpenBookmarkletModal}
  onTriageStart={handleTriageStart}
/>
```

`handleCreateMood` stub: for Task 12, open a `window.prompt` asking for the name and call `createMood({ name, color: DEFAULT_MOOD_COLORS[i % 5], order: moods.length })`. A better inline UI is post-launch. `handleTriageStart`: `() => router.push('/triage')` (use `useRouter` from `next/navigation`). `handleFilterChange` persists via `saveBoardConfig` (debounce: just await, not a hot path).

Define `DEFAULT_MOOD_COLORS` inline near the top of the file:

```typescript
const DEFAULT_MOOD_COLORS = ['#7c5cfc', '#e066d7', '#4ecdc4', '#f5a623', '#ff6b6b'] as const
```

- [ ] **Step 7: Filter items before passing to CardsLayer / masonry**

Import `applyFilter` from `@/lib/board/filter`. Compute `filteredItems = useMemo(() => applyFilter(items, activeFilter), [items, activeFilter])`. Use `filteredItems` wherever `items` was used for layout + culling + masonryCards. `masonryCards` uses `filteredItems`, `CardsLayer` gets `items={filteredItems}`.

- [ ] **Step 8: Manual smoke test + tsc**

Run: `rtk tsc --noEmit`
Expected: PASS.

Run: `rtk npx vitest run`
Expected: PASS.

Run: `rtk pnpm build`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
rtk git add components/board/Sidebar.tsx components/board/Sidebar.module.css components/board/BoardRoot.tsx lib/storage/use-moods.ts messages/ja.json
rtk git commit -m "feat(sidebar): Library (All/Inbox/Archive) + Moods driven by MoodRecord"
```

---

## Task 13: Toolbar replacement — FilterPill + DisplayModeSwitch (top-right)

**Files:**
- Create: `components/board/FilterPill.tsx`
- Create: `components/board/FilterPill.module.css`
- Create: `components/board/DisplayModeSwitch.tsx`
- Create: `components/board/DisplayModeSwitch.module.css`
- Modify: `components/board/Toolbar.tsx` → render FilterPill + DisplayModeSwitch, remove Share button
- Modify: `components/board/Toolbar.module.css` → top-right position (change from top-center)
- Modify: `components/board/BoardRoot.tsx` → pass filter/displayMode props
- Modify: `lib/storage/board-config.ts` is fine as-is
- Modify: `messages/ja.json` → add `board.filter.*` + `board.display.*`

- [ ] **Step 1: Add i18n keys**

In `messages/ja.json`:

```json
    "filter": {
      "label": "すべて",
      "all": "すべて",
      "inbox": "Inbox",
      "archive": "Archive"
    },
    "display": {
      "label": "表示",
      "visual": "Visual",
      "editorial": "Editorial",
      "native": "Native"
    }
```

Insert under `board`.

- [ ] **Step 2: FilterPill component**

Create `components/board/FilterPill.module.css`:

```css
.pill {
  background: rgba(20, 20, 20, 0.92);
  color: var(--text-primary);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 100px;
  padding: 8px 14px;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  backdrop-filter: blur(10px);
}
.pill:hover { background: rgba(30, 30, 30, 0.96); }
.menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: rgba(20, 20, 20, 0.96);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  padding: 6px;
  min-width: 180px;
  backdrop-filter: blur(12px);
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
}
.item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; border-radius: 6px;
  cursor: pointer; color: var(--text-body);
  border: 0; background: transparent; width: 100%; text-align: left;
  font-size: 13px;
}
.item:hover { background: rgba(255,255,255,0.05); }
.item.active { background: rgba(255,255,255,0.1); color: var(--text-primary); }
.dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.wrap { position: relative; }
```

Create `components/board/FilterPill.tsx`:

```tsx
'use client'

import { useRef, useState, type ReactElement, useEffect } from 'react'
import type { BoardFilter } from '@/lib/board/types'
import type { MoodRecord } from '@/lib/storage/indexeddb'
import { t } from '@/lib/i18n/t'
import styles from './FilterPill.module.css'

type Props = {
  readonly value: BoardFilter
  readonly onChange: (f: BoardFilter) => void
  readonly moods: ReadonlyArray<MoodRecord>
  readonly counts: { readonly all: number; readonly inbox: number; readonly archive: number }
}

function label(f: BoardFilter, moods: ReadonlyArray<MoodRecord>): string {
  if (f === 'all') return t('board.filter.all')
  if (f === 'inbox') return t('board.filter.inbox')
  if (f === 'archive') return t('board.filter.archive')
  const moodId = f.slice(5)
  return moods.find((m) => m.id === moodId)?.name ?? '—'
}

export function FilterPill({ value, onChange, moods, counts }: Props): ReactElement {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent): void => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return (): void => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const select = (f: BoardFilter): void => { onChange(f); setOpen(false) }

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <button type="button" className={styles.pill} onClick={() => setOpen((v) => !v)} data-testid="filter-pill">
        {label(value, moods)} ▾
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <button type="button" className={`${styles.item} ${value === 'all' ? styles.active : ''}`.trim()} onClick={() => select('all')}>
            {t('board.filter.all')} <span style={{ marginLeft: 'auto', color: 'var(--text-meta)' }}>{counts.all}</span>
          </button>
          <button type="button" className={`${styles.item} ${value === 'inbox' ? styles.active : ''}`.trim()} onClick={() => select('inbox')}>
            {t('board.filter.inbox')} <span style={{ marginLeft: 'auto', color: 'var(--text-meta)' }}>{counts.inbox}</span>
          </button>
          <button type="button" className={`${styles.item} ${value === 'archive' ? styles.active : ''}`.trim()} onClick={() => select('archive')}>
            {t('board.filter.archive')} <span style={{ marginLeft: 'auto', color: 'var(--text-meta)' }}>{counts.archive}</span>
          </button>
          {moods.length > 0 && <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '6px 4px' }} />}
          {moods.map((m) => {
            const f: BoardFilter = `mood:${m.id}`
            return (
              <button key={m.id} type="button"
                className={`${styles.item} ${value === f ? styles.active : ''}`.trim()}
                onClick={() => select(f)}>
                <span className={styles.dot} style={{ background: m.color }} />
                {m.name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: DisplayModeSwitch component**

Create `components/board/DisplayModeSwitch.module.css`:

```css
.pill {
  background: rgba(20, 20, 20, 0.92);
  color: var(--text-primary);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 100px;
  padding: 8px 14px;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  backdrop-filter: blur(10px);
}
.pill:hover { background: rgba(30, 30, 30, 0.96); }
.wrap { position: relative; }
.menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: rgba(20, 20, 20, 0.96);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  padding: 6px;
  min-width: 160px;
  backdrop-filter: blur(12px);
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
}
.item {
  display: flex; align-items: center;
  padding: 8px 10px; border-radius: 6px;
  cursor: pointer; color: var(--text-body);
  border: 0; background: transparent; width: 100%; text-align: left;
  font-size: 13px;
}
.item:hover { background: rgba(255,255,255,0.05); }
.item.active { background: rgba(255,255,255,0.1); color: var(--text-primary); }
```

Create `components/board/DisplayModeSwitch.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { DisplayMode } from '@/lib/board/types'
import { t } from '@/lib/i18n/t'
import styles from './DisplayModeSwitch.module.css'

type Props = {
  readonly value: DisplayMode
  readonly onChange: (m: DisplayMode) => void
}

export function DisplayModeSwitch({ value, onChange }: Props): ReactElement {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent): void => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return (): void => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const label = (m: DisplayMode): string => t(`board.display.${m}`)
  const select = (m: DisplayMode): void => { onChange(m); setOpen(false) }

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <button type="button" className={styles.pill} onClick={() => setOpen((v) => !v)} data-testid="display-mode-pill">
        {t('board.display.label')}: {label(value)} ▾
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          {(['visual', 'editorial', 'native'] as const).map((m) => (
            <button key={m} type="button"
              className={`${styles.item} ${value === m ? styles.active : ''}`.trim()}
              onClick={() => select(m)}>{label(m)}</button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Replace Toolbar contents + reposition**

Rewrite `components/board/Toolbar.tsx`:

```tsx
'use client'

import type { ReactElement } from 'react'
import type { BoardFilter, DisplayMode } from '@/lib/board/types'
import type { MoodRecord } from '@/lib/storage/indexeddb'
import { FilterPill } from './FilterPill'
import { DisplayModeSwitch } from './DisplayModeSwitch'
import styles from './Toolbar.module.css'

type Props = {
  readonly activeFilter: BoardFilter
  readonly onFilterChange: (f: BoardFilter) => void
  readonly displayMode: DisplayMode
  readonly onDisplayModeChange: (m: DisplayMode) => void
  readonly moods: ReadonlyArray<MoodRecord>
  readonly counts: { readonly all: number; readonly inbox: number; readonly archive: number }
}

export function Toolbar({ activeFilter, onFilterChange, displayMode, onDisplayModeChange, moods, counts }: Props): ReactElement {
  return (
    <div className={styles.container} data-testid="board-toolbar">
      <FilterPill value={activeFilter} onChange={onFilterChange} moods={moods} counts={counts} />
      <DisplayModeSwitch value={displayMode} onChange={onDisplayModeChange} />
    </div>
  )
}
```

Edit `components/board/Toolbar.module.css`. Change `.container` positioning from top-center to top-right:

```css
.container {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 110;
  display: flex;
  gap: 8px;
  align-items: center;
}
```

Delete the old `.button` / `.primary` rules — no longer used.

- [ ] **Step 5: Wire Toolbar in BoardRoot**

In `components/board/BoardRoot.tsx`, replace the Toolbar render call:

```tsx
<Toolbar
  activeFilter={activeFilter}
  onFilterChange={handleFilterChange}
  displayMode={displayMode}
  onDisplayModeChange={handleDisplayModeChange}
  moods={moods}
  counts={sidebarCounts}
/>
```

Add `displayMode` state with hydrate-from-board-config, and `handleDisplayModeChange` that `saveBoardConfig` persists.

Delete the `handleShare` callback (Share button is gone). Delete `handleThemeClick` (theme cycle moved out).

- [ ] **Step 6: Build + tsc**

Run: `rtk tsc --noEmit && rtk pnpm build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
rtk git add components/board/FilterPill.tsx components/board/FilterPill.module.css components/board/DisplayModeSwitch.tsx components/board/DisplayModeSwitch.module.css components/board/Toolbar.tsx components/board/Toolbar.module.css components/board/BoardRoot.tsx messages/ja.json
rtk git commit -m "feat(board): replace Toolbar with FilterPill + DisplayModeSwitch"
```

---

## Task 14: Card variants by displayMode (Visual / Editorial / Native)

**Files:**
- Modify: `components/board/cards/index.ts` — add `displayMode` to `CardComponentProps`
- Modify: `components/board/cards/TweetCard.tsx` — branch on displayMode (Visual = image-first, Editorial = serif pullquote + border, Native = react-tweet full)
- Modify: `components/board/cards/ImageCard.tsx` — branch on displayMode
- Modify: `components/board/cards/TextCard.tsx` — branch on displayMode
- Modify: `components/board/cards/VideoThumbCard.tsx` — branch on displayMode (Visual = image + ▶ only, Editorial = image + title + source line, Native = image + caption)
- Modify: `components/board/CardsLayer.tsx` — pass displayMode prop through to cards

- [ ] **Step 1: Extend CardComponentProps**

In `components/board/cards/index.ts`, update the type:

```typescript
export type CardComponentProps = {
  readonly item: BoardItem
  readonly persistMeasuredAspect?: (cardId: string, aspectRatio: number) => Promise<void>
  readonly cardWidth?: number
  readonly cardHeight?: number
  readonly displayMode: 'visual' | 'editorial' | 'native'
}
```

- [ ] **Step 2: Pass displayMode through CardsLayer**

In `components/board/CardsLayer.tsx`, add `readonly displayMode: DisplayMode` to `CardsLayerProps`. Import `DisplayMode` from `@/lib/board/types`. Pass `displayMode={it.displayMode ?? displayMode}` to each Card component where rendered (per-bookmark override wins; else global).

Update the props destructuring and the `<Card item={it} ... />` call site.

- [ ] **Step 3: Branch each card's render on displayMode**

For each of `TweetCard.tsx`, `ImageCard.tsx`, `TextCard.tsx`, `VideoThumbCard.tsx`:

1. Read the file.
2. Introduce `const mode = props.displayMode` at top.
3. Wrap the existing render (which is roughly "Native" semantics today — full content) in `if (mode === 'native') return <existing/>`.
4. Add a `visual` branch that renders only the image + minimal caption (1 line title) — for ImageCard / TweetCard use the existing `thumbnail` image; for TextCard use just title in large serif (current); for VideoThumbCard keep image + ▶ badge (current minimal form). Essentially Visual ≈ current look.
5. Add `editorial` branch that adds a serif pullquote + border chrome — for TweetCard wrap the full body in a `<blockquote>` with `border-left: 3px solid var(--text-meta); padding-left: 12px; font-family: 'Noto Serif JP', serif;`. For Image/Video cards, keep image and render full `description` below in serif. For TextCard, show `description` below the title in serif body.

Because each card is existing, keep Visual = current body. Only editorial adds chrome. Native branches keep existing (for TweetCard, means react-tweet full). This is faithful to destefanis §6.3 PEM table.

Concrete TweetCard branching sketch (rest follow similar shape):

```tsx
if (mode === 'visual') return <VisualTweet ... />
if (mode === 'editorial') return <EditorialTweet ... />
return <NativeTweet ... /> // existing react-tweet render
```

The three inner components can live inline in the same file. For the Visual variant, render thumbnail + 1-line avatar/handle line. Edge case: if thumbnail is empty, degrade to Native.

**Acceptance**: a destefanis-faithful "Visual" card looks image-first / avatar below, no tweet chrome. "Editorial" adds a serif pullquote frame. "Native" renders unchanged.

Keep each branch simple. If a card type only has 1 sensible rendering (e.g. VideoThumbCard doesn't have a Native-distinct form), make all three branches render the current implementation — OK for MVP.

- [ ] **Step 4: Run tsc + build**

Run: `rtk tsc --noEmit && rtk pnpm build`
Expected: PASS.

- [ ] **Step 5: Manual check**

Start dev server: `rtk pnpm dev` — open `/board`, cycle DisplayModeSwitch. Cards visibly change between the 3 modes. No console errors.

- [ ] **Step 6: Commit**

```bash
rtk git add components/board/cards/ components/board/CardsLayer.tsx
rtk git commit -m "feat(cards): displayMode branching (visual/editorial/native)"
```

---

## Task 15: Lightbox component (GSAP spring)

**Files:**
- Create: `components/board/Lightbox.tsx`
- Create: `components/board/Lightbox.module.css`
- Modify: `components/board/BoardRoot.tsx` (render Lightbox, manage open state)
- Modify: `messages/ja.json` (close label)

- [ ] **Step 1: Add i18n keys**

In `messages/ja.json` under `board`:

```json
    "lightbox": {
      "close": "閉じる",
      "openSource": "元ページを開く"
    }
```

- [ ] **Step 2: Lightbox styles**

Create `components/board/Lightbox.module.css`:

```css
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: var(--lightbox-backdrop);
  opacity: 0;
  pointer-events: none;
  display: grid;
  place-items: center;
}
.backdrop.open { opacity: 1; pointer-events: auto; transition: opacity 200ms ease-out; }
.frame {
  position: relative;
  width: min(92vw, 820px);
  max-height: 88vh;
  display: grid;
  grid-template-columns: 1.3fr 1fr;
  gap: 40px;
  align-items: start;
}
@media (max-width: 900px) {
  .frame { grid-template-columns: 1fr; gap: 28px; max-height: 92vh; overflow-y: auto; }
}
.media {
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
  border-radius: var(--lightbox-media-radius);
  box-shadow: 0 30px 80px rgba(0,0,0,0.5);
  background: rgba(255,255,255,0.02);
}
.media img { max-width: 100%; max-height: 88vh; display: block; }
.text {
  color: #e8e8e8;
  font-family: 'Noto Serif JP', Georgia, serif;
  font-size: 17px;
  line-height: 1.65;
  display: flex; flex-direction: column; gap: 16px;
}
.meta { display: flex; align-items: center; gap: 10px; color: var(--text-meta); font-size: 13px; font-family: system-ui, sans-serif; }
.favicon { width: 16px; height: 16px; border-radius: 3px; }
.sourceLink { color: var(--text-body); text-decoration: underline; font-size: 13px; font-family: system-ui, sans-serif; }
.sourceLink:hover { color: var(--text-primary); }
.close {
  position: absolute;
  top: 16px; right: 16px;
  width: 36px; height: 36px; border-radius: 50%;
  background: rgba(255,255,255,0.06);
  color: #fff;
  border: 0;
  cursor: pointer;
  font-size: 20px; line-height: 1;
}
.close:hover { background: rgba(255,255,255,0.12); }
```

- [ ] **Step 3: Lightbox component**

Create `components/board/Lightbox.tsx`:

```tsx
'use client'

import { useEffect, useRef, type ReactElement } from 'react'
import { gsap } from 'gsap'
import type { BoardItem } from '@/lib/storage/use-board-data'
import { t } from '@/lib/i18n/t'
import styles from './Lightbox.module.css'

type Props = {
  readonly item: BoardItem | null
  readonly onClose: () => void
}

export function Lightbox({ item, onClose }: Props): ReactElement | null {
  const backdropRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)

  // Escape key closes
  useEffect(() => {
    if (!item) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return (): void => window.removeEventListener('keydown', onKey)
  }, [item, onClose])

  // Open animation: spring scale-in from 0.86 + fade
  useEffect(() => {
    if (!item || !frameRef.current) return
    const el = frameRef.current
    gsap.fromTo(
      el,
      { scale: 0.86, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.42, ease: 'back.out(1.3)' },
    )
  }, [item])

  if (!item) return null

  return (
    <div
      ref={backdropRef}
      className={`${styles.backdrop} ${styles.open}`.trim()}
      onClick={(e) => { if (e.target === backdropRef.current) onClose() }}
      data-testid="lightbox"
    >
      <div ref={frameRef} className={styles.frame}>
        <div className={styles.media}>
          {item.thumbnail
            ? <img src={item.thumbnail} alt={item.title} />
            : <div style={{ padding: 32, color: 'var(--text-body)' }}>{item.title}</div>}
        </div>
        <div className={styles.text}>
          <h1 style={{ fontSize: 28, margin: 0, color: 'var(--text-primary)' }}>{item.title}</h1>
          <div className={styles.meta}>
            {(() => {
              try {
                const host = new URL(item.url).hostname.replace(/^www\./, '')
                return <span>{host}</span>
              } catch { return <span /> }
            })()}
          </div>
          <a href={item.url} target="_blank" rel="noopener noreferrer" className={styles.sourceLink}>
            {t('board.lightbox.openSource')} →
          </a>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={styles.close}
          aria-label={t('board.lightbox.close')}
        >✕</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Wire Lightbox in BoardRoot**

In `components/board/BoardRoot.tsx`:

1. Add state `const [lightboxItemId, setLightboxItemId] = useState<string | null>(null)`.
2. Rewrite `handleCardClick` to open the Lightbox instead of `window.open`:
   ```typescript
   const handleCardClick = useCallback((bookmarkId: string): void => {
     setLightboxItemId(bookmarkId)
   }, [])
   ```
3. Derive `lightboxItem = useMemo(() => items.find((it) => it.bookmarkId === lightboxItemId) ?? null, [items, lightboxItemId])`.
4. Render after the board wrapper:
   ```tsx
   <Lightbox item={lightboxItem} onClose={() => setLightboxItemId(null)} />
   ```

- [ ] **Step 5: Build + tsc**

Run: `rtk tsc --noEmit && rtk pnpm build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add components/board/Lightbox.tsx components/board/Lightbox.module.css components/board/BoardRoot.tsx messages/ja.json
rtk git commit -m "feat(board): Lightbox with GSAP spring (replaces window.open on click)"
```

---

## Task 16: Lightbox E2E test

**Files:**
- Create: `tests/e2e/lightbox-flow.spec.ts`

- [ ] **Step 1: Write the test**

Create `tests/e2e/lightbox-flow.spec.ts`:

```typescript
import { test, expect, type Page } from '@playwright/test'

const DB_NAME = 'booklage-db'
const DB_VERSION = 9

async function clearDb(page: Page): Promise<void> {
  await page.evaluate(
    async ({ dbName, dbVersion }) => {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction(['bookmarks', 'cards', 'moods'], 'readwrite')
          tx.objectStore('bookmarks').clear()
          tx.objectStore('cards').clear()
          tx.objectStore('moods').clear()
          tx.oncomplete = () => { db.close(); resolve() }
          tx.onerror = () => reject(new Error('clear tx error'))
        }
        req.onerror = () => reject(new Error('open error'))
      })
    },
    { dbName: DB_NAME, dbVersion: DB_VERSION },
  )
}

test('click card → lightbox opens → × closes it', async ({ page }) => {
  await page.goto('/board')
  await page.waitForLoadState('networkidle')
  await clearDb(page)

  // Seed one bookmark via /save
  const params = new URLSearchParams({
    url: 'https://example.com/a', title: 'Hello', image: 'https://via.placeholder.com/200',
    desc: '', site: 'Example', favicon: '',
  })
  await page.goto(`/save?${params.toString()}`)
  await page.waitForSelector('[data-state="saved"]', { timeout: 3000 })

  // Back to board
  await page.goto('/board')
  await page.waitForLoadState('networkidle')

  // Click the card
  await page.getByText('Hello').first().click()
  await expect(page.getByTestId('lightbox')).toBeVisible()

  // Close via button
  await page.getByRole('button', { name: '閉じる' }).click()
  await expect(page.getByTestId('lightbox')).toBeHidden()
})
```

- [ ] **Step 2: Run**

Run: `rtk npx playwright test tests/e2e/lightbox-flow.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
rtk git add tests/e2e/lightbox-flow.spec.ts
rtk git commit -m "test(e2e): lightbox open/close flow"
```

---

## Task 17: BroadcastChannel listener + entrance animation (bug fix)

**Files:**
- Modify: `components/board/BoardRoot.tsx` (subscribe to channel, trigger reload + entrance)
- Modify: `components/board/CardsLayer.tsx` (accept `newlyAddedIds` set, fade-in animation)

- [ ] **Step 1: BoardRoot subscribes to BroadcastChannel**

In `components/board/BoardRoot.tsx`:

1. Import `subscribeBookmarkSaved` from `@/lib/board/channel`.
2. Import `reload` from useBoardData destructure: `const { items, loading, ..., reload } = useBoardData()`.
3. Add state `const [newlyAddedIds, setNewlyAddedIds] = useState<ReadonlySet<string>>(new Set())`.
4. Add effect:
   ```typescript
   useEffect(() => {
     const unsub = subscribeBookmarkSaved(async ({ bookmarkId }) => {
       await reload()
       setNewlyAddedIds((prev) => {
         const next = new Set(prev)
         next.add(bookmarkId)
         return next
       })
       // Clear the "new" flag after entrance animation completes
       setTimeout(() => {
         setNewlyAddedIds((prev) => {
           const next = new Set(prev)
           next.delete(bookmarkId)
           return next
         })
       }, 800)
     })
     return (): void => unsub()
   }, [reload])
   ```
5. Pass `newlyAddedIds={newlyAddedIds}` to CardsLayer.

- [ ] **Step 2: CardsLayer fade-in for new cards**

In `components/board/CardsLayer.tsx`:

1. Add `readonly newlyAddedIds: ReadonlySet<string>` to `CardsLayerProps`.
2. In the render of each card wrapper, add CSS for new ones:
   ```tsx
   style={{
     ...existing,
     opacity: newlyAddedIds.has(it.bookmarkId) ? 0 : 1,
     animation: newlyAddedIds.has(it.bookmarkId) ? 'booklage-entrance-a 400ms ease-out forwards' : undefined,
   }}
   ```
3. In `app/globals.css`, add:
   ```css
   @keyframes booklage-entrance-a {
     from { opacity: 0; transform: translateY(-4px); }
     to { opacity: 1; transform: translateY(0); }
   }
   ```

FLIP reflow (§7.1) is already handled by the existing `useLayoutEffect` in CardsLayer — when new card is inserted and masonry re-computes, existing cards' prev positions differ, so they gsap.to into place. Good.

- [ ] **Step 3: Build + tsc**

Run: `rtk tsc --noEmit && rtk pnpm build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
rtk git add components/board/BoardRoot.tsx components/board/CardsLayer.tsx app/globals.css
rtk git commit -m "fix(board): BroadcastChannel listener + entrance animation for new cards"
```

---

## Task 18: Save → Board E2E bug-fix test

**Files:**
- Create: `tests/e2e/destefanis-save-flow.spec.ts`

- [ ] **Step 1: Write the test**

Create `tests/e2e/destefanis-save-flow.spec.ts`:

```typescript
import { test, expect, type Page } from '@playwright/test'

const DB_NAME = 'booklage-db'
const DB_VERSION = 9

async function clearDb(page: Page): Promise<void> {
  await page.evaluate(
    async ({ dbName, dbVersion }) => {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction(['bookmarks', 'cards', 'moods'], 'readwrite')
          tx.objectStore('bookmarks').clear()
          tx.objectStore('cards').clear()
          tx.objectStore('moods').clear()
          tx.oncomplete = () => { db.close(); resolve() }
          tx.onerror = () => reject(new Error('clear tx error'))
        }
        req.onerror = () => reject(new Error('open error'))
      })
    },
    { dbName: DB_NAME, dbVersion: DB_VERSION },
  )
}

test('save via /save popup → board tab fades in new card without manual refresh', async ({ context }) => {
  const boardPage = await context.newPage()
  await boardPage.goto('/board')
  await boardPage.waitForLoadState('networkidle')
  await clearDb(boardPage)

  const savePage = await context.newPage()
  const params = new URLSearchParams({
    url: 'https://example.com/hello', title: 'Hello', image: '', desc: '', site: 'Example', favicon: '',
  })
  await savePage.goto(`/save?${params.toString()}`)
  await savePage.waitForSelector('[data-state="saved"]', { timeout: 3000 })

  // Board tab should reflect the new card within 2 seconds (BroadcastChannel + reload)
  await expect(boardPage.getByText('Hello').first()).toBeVisible({ timeout: 2000 })
})
```

- [ ] **Step 2: Run**

Run: `rtk npx playwright test tests/e2e/destefanis-save-flow.spec.ts`
Expected: PASS. If timing flakes, bump the timeout to 3000.

- [ ] **Step 3: Commit**

```bash
rtk git add tests/e2e/destefanis-save-flow.spec.ts
rtk git commit -m "test(e2e): save popup → board cross-tab fade-in"
```

---

## Task 19: /triage route scaffold + TriagePage container

**Files:**
- Create: `app/(app)/triage/page.tsx`
- Create: `components/triage/TriagePage.tsx`
- Create: `components/triage/TriagePage.module.css`
- Modify: `messages/ja.json` (triage keys)

- [ ] **Step 1: Add i18n keys**

In `messages/ja.json`:

```json
  "triage": {
    "progress": "{current} / {total}",
    "empty": "仕分ける bookmark がありません",
    "empty_cta": "/board に戻る",
    "hint": "1-9 付与 · S スキップ · Z 取り消し",
    "newMood": "+ 新しい mood",
    "moodNamePlaceholder": "mood 名",
    "skip": "Skip",
    "undo": "Undo",
    "done_title": "仕分け完了",
    "done_back": "ボードへ戻る"
  }
```

Use this nesting under the top-level root `triage`.

- [ ] **Step 2: Container scaffold**

Create `app/(app)/triage/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { TriagePage } from '@/components/triage/TriagePage'

export const metadata: Metadata = { title: 'Triage' }

export default function Page(): React.ReactElement {
  return <TriagePage />
}
```

Create `components/triage/TriagePage.module.css`:

```css
.root {
  position: fixed; inset: 0;
  background: var(--bg-dark);
  color: var(--text-primary);
  display: flex; flex-direction: column;
  padding: 32px;
}
.header {
  display: flex; align-items: center; justify-content: space-between;
  font-family: 'Noto Serif JP', Georgia, serif;
  color: var(--text-meta); font-size: 13px;
}
.main {
  flex: 1; display: grid; place-items: center;
}
.footer { padding-top: 24px; color: var(--text-muted); font-size: 12px; text-align: center; }
.empty { text-align: center; color: var(--text-body); }
.backBtn { margin-top: 12px; color: var(--text-primary); text-decoration: underline; background: transparent; border: 0; cursor: pointer; font-size: 14px; }
```

Create `components/triage/TriagePage.tsx`:

```tsx
'use client'

import { useMemo, useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { useBoardData } from '@/lib/storage/use-board-data'
import { useMoods } from '@/lib/storage/use-moods'
import { t } from '@/lib/i18n/t'
import { TriageCard } from './TriageCard'
import { TagPicker } from './TagPicker'
import styles from './TriagePage.module.css'

export function TriagePage(): ReactElement {
  const router = useRouter()
  const { items, persistTags, loading } = useBoardData()
  const { moods, create } = useMoods()
  const queue = useMemo(() => items.filter((it) => !it.isDeleted && it.tags.length === 0), [items])
  const [index, setIndex] = useState(0)
  const [lastAction, setLastAction] = useState<{ bookmarkId: string; prev: readonly string[] } | null>(null)

  const current = queue[index] ?? null
  const total = queue.length

  const advance = (): void => setIndex((i) => i + 1)

  const handleTag = async (moodId: string): Promise<void> => {
    if (!current) return
    setLastAction({ bookmarkId: current.bookmarkId, prev: [...current.tags] })
    await persistTags(current.bookmarkId, [moodId])
    advance()
  }

  const handleSkip = (): void => {
    if (!current) return
    // Skip: do not tag; just advance
    advance()
  }

  const handleUndo = async (): Promise<void> => {
    if (!lastAction) return
    await persistTags(lastAction.bookmarkId, lastAction.prev)
    setLastAction(null)
    setIndex((i) => Math.max(0, i - 1))
  }

  const handleNewMood = async (name: string): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed) return
    const colors = ['#7c5cfc', '#e066d7', '#4ecdc4', '#f5a623', '#ff6b6b']
    const color = colors[moods.length % colors.length]
    const created = await create({ name: trimmed, color, order: moods.length })
    await handleTag(created.id)
  }

  const exit = (): void => router.push('/board')

  if (loading) return <div className={styles.root}><div>Loading…</div></div>

  if (!current) {
    return (
      <div className={styles.root}>
        <div className={styles.main}>
          <div className={styles.empty}>
            <div style={{ fontSize: 20, fontFamily: "'Noto Serif JP', serif" }}>
              {total === 0 ? t('triage.empty') : t('triage.done_title')}
            </div>
            <button type="button" className={styles.backBtn} onClick={exit}>
              {total === 0 ? t('triage.empty_cta') : t('triage.done_back')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.root} data-testid="triage-page">
      <div className={styles.header}>
        <span>{t('triage.progress').replace('{current}', String(index + 1)).replace('{total}', String(total))}</span>
        <button type="button" className={styles.backBtn} onClick={exit}>Esc</button>
      </div>
      <div className={styles.main}>
        <TriageCard key={current.bookmarkId} item={current} />
      </div>
      <TagPicker
        moods={moods}
        onTag={handleTag}
        onSkip={handleSkip}
        onUndo={lastAction ? handleUndo : null}
        onCreateMood={handleNewMood}
      />
      <div className={styles.footer}>{t('triage.hint')}</div>
    </div>
  )
}
```

- [ ] **Step 3: Build + tsc (TriageCard / TagPicker stubs next step)**

Before building, stub the two missing components so compile passes:

Create `components/triage/TriageCard.tsx`:

```tsx
'use client'
import type { ReactElement } from 'react'
import type { BoardItem } from '@/lib/storage/use-board-data'

export function TriageCard({ item }: { item: BoardItem }): ReactElement {
  return <div data-testid="triage-card">{item.title}</div>
}
```

Create `components/triage/TagPicker.tsx`:

```tsx
'use client'
import type { ReactElement } from 'react'
import type { MoodRecord } from '@/lib/storage/indexeddb'

type Props = {
  readonly moods: ReadonlyArray<MoodRecord>
  readonly onTag: (moodId: string) => void
  readonly onSkip: () => void
  readonly onUndo: (() => void) | null
  readonly onCreateMood: (name: string) => void
}

export function TagPicker(_props: Props): ReactElement {
  return <div data-testid="tag-picker-stub" />
}
```

Run: `rtk tsc --noEmit && rtk pnpm build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
rtk git add app/\(app\)/triage/ components/triage/ messages/ja.json
rtk git commit -m "feat(triage): /triage route scaffold with TriagePage container"
```

---

## Task 20: TriageCard — center card display (destefanis minimal)

**Files:**
- Modify: `components/triage/TriageCard.tsx`
- Create: `components/triage/TriageCard.module.css`

- [ ] **Step 1: Style + component**

Create `components/triage/TriageCard.module.css`:

```css
.card {
  width: 320px;
  max-width: 80vw;
  aspect-ratio: 4 / 5;
  background: var(--card-white);
  color: #1a1a1a;
  border-radius: var(--card-radius);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  display: flex; flex-direction: column;
  animation: triageIn 180ms ease-out;
}
.card.exiting { animation: triageOut 120ms ease-out forwards; }
@keyframes triageIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes triageOut { from { opacity: 1; } to { opacity: 0; } }
.image { flex: 1; background-size: cover; background-position: center; }
.body { padding: 14px 16px; }
.title { font-family: 'Noto Serif JP', Georgia, serif; font-size: 18px; line-height: 1.35; color: #1a1a1a; }
.meta { margin-top: 8px; display: flex; gap: 6px; align-items: center; color: #7a7a7a; font-size: 12px; }
.favicon { width: 14px; height: 14px; border-radius: 3px; }
```

Replace `components/triage/TriageCard.tsx`:

```tsx
'use client'

import type { ReactElement } from 'react'
import type { BoardItem } from '@/lib/storage/use-board-data'
import styles from './TriageCard.module.css'

export function TriageCard({ item }: { item: BoardItem }): ReactElement {
  let host = ''
  try { host = new URL(item.url).hostname.replace(/^www\./, '') } catch { /* ignore */ }
  return (
    <div className={styles.card} data-testid="triage-card">
      {item.thumbnail && (
        <div className={styles.image} style={{ backgroundImage: `url(${JSON.stringify(item.thumbnail).slice(1, -1)})` }} />
      )}
      <div className={styles.body}>
        <div className={styles.title}>{item.title}</div>
        <div className={styles.meta}><span>{host}</span></div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build + tsc**

Run: `rtk tsc --noEmit && rtk pnpm build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
rtk git add components/triage/TriageCard.tsx components/triage/TriageCard.module.css
rtk git commit -m "feat(triage): TriageCard destefanis minimal with 4:5 aspect"
```

---

## Task 21: TagPicker — tag chips + 1-9 / S / Z keys + NewMoodInput

**Files:**
- Modify: `components/triage/TagPicker.tsx`
- Create: `components/triage/TagPicker.module.css`
- Create: `components/triage/NewMoodInput.tsx`

- [ ] **Step 1: NewMoodInput**

Create `components/triage/NewMoodInput.tsx`:

```tsx
'use client'

import { useState, type ReactElement } from 'react'
import { t } from '@/lib/i18n/t'

type Props = {
  readonly onCreate: (name: string) => void
}

export function NewMoodInput({ onCreate }: Props): ReactElement {
  const [active, setActive] = useState(false)
  const [value, setValue] = useState('')
  if (!active) {
    return (
      <button type="button" onClick={() => setActive(true)} data-testid="new-mood-chip"
        style={{
          border: '1px dashed rgba(255,255,255,0.2)',
          background: 'transparent',
          color: 'var(--text-meta)',
          padding: '8px 14px',
          borderRadius: 100,
          cursor: 'pointer',
          fontSize: 13,
        }}>
        {t('triage.newMood')}
      </button>
    )
  }
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => { setActive(false); setValue('') }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { onCreate(value); setValue(''); setActive(false) }
        if (e.key === 'Escape') { setActive(false); setValue('') }
      }}
      placeholder={t('triage.moodNamePlaceholder')}
      data-testid="new-mood-input"
      style={{
        background: 'rgba(255,255,255,0.06)',
        color: 'var(--text-primary)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 100,
        padding: '8px 14px',
        fontSize: 13,
        outline: 'none',
      }}
    />
  )
}
```

- [ ] **Step 2: TagPicker with keyboard handler**

Create `components/triage/TagPicker.module.css`:

```css
.row {
  display: flex; flex-wrap: wrap; gap: 8px;
  justify-content: center; align-items: center;
  margin-top: 24px;
}
.chip {
  display: inline-flex; align-items: center; gap: 8px;
  background: rgba(255,255,255,0.06);
  color: var(--text-primary);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 100px;
  padding: 8px 14px;
  font-size: 13px;
  cursor: pointer;
}
.chip:hover { background: rgba(255,255,255,0.1); }
.num { color: var(--text-meta); font-size: 11px; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.util { background: transparent; border: 0; color: var(--text-meta); cursor: pointer; font-size: 13px; padding: 8px 12px; }
.util:hover { color: var(--text-primary); }
```

Replace `components/triage/TagPicker.tsx`:

```tsx
'use client'

import { useEffect, type ReactElement } from 'react'
import type { MoodRecord } from '@/lib/storage/indexeddb'
import { t } from '@/lib/i18n/t'
import { NewMoodInput } from './NewMoodInput'
import styles from './TagPicker.module.css'

type Props = {
  readonly moods: ReadonlyArray<MoodRecord>
  readonly onTag: (moodId: string) => void
  readonly onSkip: () => void
  readonly onUndo: (() => void) | null
  readonly onCreateMood: (name: string) => void
}

export function TagPicker({ moods, onTag, onSkip, onUndo, onCreateMood }: Props): ReactElement {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (e.key >= '1' && e.key <= '9') {
        const idx = Number(e.key) - 1
        const mood = moods[idx]
        if (mood) { e.preventDefault(); onTag(mood.id) }
        return
      }
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); onSkip(); return }
      if ((e.key === 'z' || e.key === 'Z') && onUndo) { e.preventDefault(); onUndo(); return }
    }
    window.addEventListener('keydown', onKey)
    return (): void => window.removeEventListener('keydown', onKey)
  }, [moods, onTag, onSkip, onUndo])

  return (
    <div className={styles.row} data-testid="tag-picker">
      {moods.slice(0, 9).map((m, i) => (
        <button key={m.id} type="button" className={styles.chip}
          onClick={() => onTag(m.id)}
          data-testid={`mood-chip-${m.id}`}>
          <span className={styles.num}>{i + 1}</span>
          <span className={styles.dot} style={{ background: m.color }} />
          <span>{m.name}</span>
        </button>
      ))}
      <NewMoodInput onCreate={onCreateMood} />
      <button type="button" className={styles.util} onClick={onSkip}>{t('triage.skip')}</button>
      {onUndo && <button type="button" className={styles.util} onClick={onUndo}>{t('triage.undo')}</button>}
    </div>
  )
}
```

- [ ] **Step 3: Build + tsc**

Run: `rtk tsc --noEmit && rtk pnpm build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
rtk git add components/triage/TagPicker.tsx components/triage/TagPicker.module.css components/triage/NewMoodInput.tsx
rtk git commit -m "feat(triage): TagPicker with 1-9/S/Z keys + NewMoodInput chip"
```

---

## Task 22: Triage E2E test

**Files:**
- Create: `tests/e2e/triage-flow.spec.ts`

- [ ] **Step 1: Write the test**

Create `tests/e2e/triage-flow.spec.ts`:

```typescript
import { test, expect, type Page } from '@playwright/test'

const DB_NAME = 'booklage-db'
const DB_VERSION = 9

async function clearDb(page: Page): Promise<void> {
  await page.evaluate(
    async ({ dbName, dbVersion }) => {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction(['bookmarks', 'cards', 'moods'], 'readwrite')
          tx.objectStore('bookmarks').clear()
          tx.objectStore('cards').clear()
          tx.objectStore('moods').clear()
          tx.oncomplete = () => { db.close(); resolve() }
          tx.onerror = () => reject(new Error('clear tx error'))
        }
        req.onerror = () => reject(new Error('open error'))
      })
    },
    { dbName: DB_NAME, dbVersion: DB_VERSION },
  )
}

async function seedBookmarks(page: Page, titles: string[]): Promise<void> {
  for (const title of titles) {
    const params = new URLSearchParams({
      url: `https://example.com/${title}`, title, image: '', desc: '', site: '', favicon: '',
    })
    await page.goto(`/save?${params.toString()}`)
    await page.waitForSelector('[data-state="saved"]', { timeout: 3000 })
  }
}

test('triage: 3 inbox cards tagged via numbered chips → board has mood filter', async ({ page }) => {
  await page.goto('/board')
  await page.waitForLoadState('networkidle')
  await clearDb(page)

  // Seed 3 inbox bookmarks
  await seedBookmarks(page, ['A', 'B', 'C'])

  // Visit board, open triage
  await page.goto('/board')
  await page.getByRole('button', { name: '仕分けを始める' }).click()
  await expect(page).toHaveURL(/\/triage/)
  await expect(page.getByTestId('triage-page')).toBeVisible()

  // Create a new mood on first card
  await page.getByTestId('new-mood-chip').click()
  await page.getByTestId('new-mood-input').fill('design')
  await page.getByTestId('new-mood-input').press('Enter')

  // Second card: use the now-existing chip via "1" key
  await page.waitForTimeout(250)
  await page.keyboard.press('1')

  // Third card: skip
  await page.waitForTimeout(250)
  await page.keyboard.press('s')

  // Return to board
  await page.getByRole('button', { name: 'ボードへ戻る' }).click()
  await expect(page).toHaveURL(/\/board/)

  // Filter by "design" mood via sidebar
  await page.getByRole('button', { name: /design/ }).first().click()
  await expect(page.getByText('A')).toBeVisible()
  await expect(page.getByText('B')).toBeVisible()
})
```

- [ ] **Step 2: Run**

Run: `rtk npx playwright test tests/e2e/triage-flow.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
rtk git add tests/e2e/triage-flow.spec.ts
rtk git commit -m "test(e2e): triage 3-card classify flow"
```

---

## Task 23: DisplayMode E2E test

**Files:**
- Create: `tests/e2e/display-mode.spec.ts`

- [ ] **Step 1: Test**

Create `tests/e2e/display-mode.spec.ts`:

```typescript
import { test, expect, type Page } from '@playwright/test'

const DB_NAME = 'booklage-db'
const DB_VERSION = 9

async function clearDb(page: Page): Promise<void> {
  await page.evaluate(
    async ({ dbName, dbVersion }) => {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction(['bookmarks', 'cards', 'moods'], 'readwrite')
          tx.objectStore('bookmarks').clear()
          tx.objectStore('cards').clear()
          tx.objectStore('moods').clear()
          tx.oncomplete = () => { db.close(); resolve() }
          tx.onerror = () => reject(new Error('clear tx error'))
        }
        req.onerror = () => reject(new Error('open error'))
      })
    },
    { dbName: DB_NAME, dbVersion: DB_VERSION },
  )
}

test('displayMode pill switches between Visual / Editorial / Native', async ({ page }) => {
  await page.goto('/board')
  await page.waitForLoadState('networkidle')
  await clearDb(page)

  // Seed one bookmark
  await page.goto('/save?' + new URLSearchParams({
    url: 'https://example.com/abc', title: 'Hello', image: 'https://via.placeholder.com/100',
    desc: 'Description long enough to show in editorial', site: 'Example', favicon: '',
  }).toString())
  await page.waitForSelector('[data-state="saved"]', { timeout: 3000 })

  await page.goto('/board')
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('display-mode-pill')).toContainText('Visual')

  await page.getByTestId('display-mode-pill').click()
  await page.getByRole('button', { name: 'Editorial' }).click()
  await expect(page.getByTestId('display-mode-pill')).toContainText('Editorial')

  await page.getByTestId('display-mode-pill').click()
  await page.getByRole('button', { name: 'Native' }).click()
  await expect(page.getByTestId('display-mode-pill')).toContainText('Native')

  // Persistence across reload
  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('display-mode-pill')).toContainText('Native')
})
```

- [ ] **Step 2: Run**

Run: `rtk npx playwright test tests/e2e/display-mode.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
rtk git add tests/e2e/display-mode.spec.ts
rtk git commit -m "test(e2e): displayMode switch + persistence"
```

---

## Task 24: HeuristicTagger integration in Triage (show suggestions)

**Files:**
- Modify: `components/triage/TriagePage.tsx` (pass suggestions to TagPicker)
- Modify: `components/triage/TagPicker.tsx` (accept `suggestedMoodIds` highlighting)

- [ ] **Step 1: Compute suggestions in TriagePage**

In `components/triage/TriagePage.tsx`, before render:

```typescript
import { HeuristicTagger } from '@/lib/tagger/heuristic'

// inside the component, after `current` derivation:
const [suggestedMoodIds, setSuggestedMoodIds] = useState<ReadonlyArray<string>>([])
useEffect(() => {
  if (!current) { setSuggestedMoodIds([]); return }
  const tagger = new HeuristicTagger({ moods })
  void (async (): Promise<void> => {
    const suggestions = await tagger.suggest({
      url: current.url,
      title: current.title,
      description: '',
      siteName: '',
    })
    setSuggestedMoodIds(suggestions.map((s) => s.moodId))
  })()
}, [current, moods])
```

Pass `suggestedMoodIds={suggestedMoodIds}` into `<TagPicker>`.

- [ ] **Step 2: Extend TagPicker**

In `components/triage/TagPicker.tsx`, add to Props:

```typescript
readonly suggestedMoodIds?: ReadonlyArray<string>
```

In the chip render, add a dot + outline if the mood id is suggested:

```tsx
className={`${styles.chip} ${(suggestedMoodIds ?? []).includes(m.id) ? styles.suggested : ''}`.trim()}
```

In `TagPicker.module.css`, add:

```css
.chip.suggested { outline: 1px solid rgba(255,255,255,0.3); }
```

- [ ] **Step 3: Build + tsc**

Run: `rtk tsc --noEmit && rtk pnpm build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
rtk git add components/triage/TriagePage.tsx components/triage/TagPicker.tsx components/triage/TagPicker.module.css
rtk git commit -m "feat(triage): HeuristicTagger suggestion highlights in TagPicker"
```

---

## Task 25: Full-suite verification + deploy prep (SW bump)

**Files:**
- Modify: `public/sw.js` (bump CACHE_VERSION)

- [ ] **Step 1: Run full verification**

Run: `rtk tsc --noEmit && rtk npx vitest run && rtk npx playwright test && rtk pnpm build`
Expected: ALL PASS. Address any failures by fixing the root cause (not by marking tests skip).

- [ ] **Step 2: Bump SW CACHE_VERSION**

Open `public/sw.js`, find `CACHE_VERSION = '<current>'`, bump to `'v10-2026-04-21-destefanis-pivot'` (use whatever next-integer scheme matches existing versioning).

- [ ] **Step 3: Commit and deploy**

```bash
rtk git add public/sw.js
rtk git commit -m "chore(sw): bump CACHE_VERSION for destefanis pivot"
rtk git push origin master
rtk pnpm build
npx wrangler pages deploy out/ --project-name=booklage --branch=master --commit-dirty=true
```

Deploy output URL: `https://booklage.pages.dev`. User verifies by hard-reload and runs through: bookmarklet click → popup saves → card fades into board → click card → lightbox → close → Inbox button → /triage → tag 1 card → back to board.

- [ ] **Step 4: Update TODO handoff**

Append to `docs/TODO.md` "現在の状態" section:
- "destefanis pivot MVP 実装完了 (2026-04-?? deploy)"
- Any follow-up bugs found during user smoke test go into a new TODO item.

---

## Post-launch backlog (explicitly out of scope — parking here for reference)

The following are **deferred** per spec §10 / §14 — do not implement in MVP:

- EmbeddingTagger (MiniLM 23MB)
- GemmaTagger (270M on-device)
- WASD Directional Triage
- HTML-in-canvas ピーリング
- Multi-playback (inline video play)
- Lightbox video/iframe embed + text scroll
- i18n 15 言語展開
- Mood color picker UI
- Soft-delete undo timer / 30-day purge
- Mood reorder drag handle in sidebar

---

## File Structure Summary

### New files
- `lib/storage/moods.ts`
- `lib/storage/use-moods.ts`
- `lib/tagger/types.ts`
- `lib/tagger/heuristic.ts`
- `lib/board/filter.ts`
- `lib/board/channel.ts`
- `components/bookmarklet/SaveToast.tsx` + `.module.css`
- `components/board/FilterPill.tsx` + `.module.css`
- `components/board/DisplayModeSwitch.tsx` + `.module.css`
- `components/board/Lightbox.tsx` + `.module.css`
- `components/triage/TriagePage.tsx` + `.module.css`
- `components/triage/TriageCard.tsx` + `.module.css`
- `components/triage/TagPicker.tsx` + `.module.css`
- `components/triage/NewMoodInput.tsx`
- `app/(app)/triage/page.tsx`
- `app/save/page.tsx` (moved from `app/(app)/save/page.tsx`)
- Tests: `idb-v9-migration`, `moods`, `board-config`, `filter`, `use-board-data`, `tagger-heuristic`, `channel`, `bookmarklet` (unit), and E2E: `lightbox-flow`, `destefanis-save-flow`, `triage-flow`, `display-mode`.

### Modified files
- `lib/constants.ts` (DB_VERSION 9)
- `lib/storage/indexeddb.ts` (v9 migration, moods store, delete folder API)
- `lib/storage/use-board-data.ts` (tags/displayMode, persistTags, persistDisplayMode, reload)
- `lib/board/types.ts` (BoardConfig ext, DisplayMode, BoardFilter, MoodRecord-based types)
- `lib/storage/board-config.ts` (defaults)
- `lib/utils/bookmarklet.ts` (320×120 top-center)
- `lib/board/constants.ts` (COLUMN_MASONRY tuning)
- `app/globals.css` (destefanis CSS vars + entrance keyframe)
- `components/board/BoardRoot.tsx` (filter/displayMode state, Toolbar wiring, Sidebar wiring, Lightbox, BroadcastChannel listener)
- `components/board/CardsLayer.tsx` (displayMode prop, newlyAddedIds fade-in)
- `components/board/Sidebar.tsx` + `.module.css` (dark minimal, Library/Moods)
- `components/board/Toolbar.tsx` + `.module.css` (FilterPill + DisplayModeSwitch, top-right)
- `components/board/cards/{TweetCard,ImageCard,TextCard,VideoThumbCard}.tsx` (displayMode branching)
- `components/board/cards/index.ts` (`displayMode` prop)
- `messages/ja.json` (bookmarklet.toast, board.sidebar.{inbox,archive,moodsHeader,newMood,triageCta}, board.filter.*, board.display.*, board.lightbox.*, triage.*)
- `app/(app)/save/page.tsx` → moved to `app/save/page.tsx`
- `tests/e2e/bookmarklet-save.spec.ts` (rewritten for SaveToast)
- `tests/lib/indexeddb.test.ts` (drop legacy folder blocks)
- `public/sw.js` (CACHE_VERSION bump)

### Deleted files
- `components/bookmarklet/SavePopup.tsx` + `.module.css`

---

## Execution guidance

25 tasks total. Expected cumulative wall-clock: 1.5–2.5 weeks depending on E2E flakiness. Launch target 2026-05-05; +1 week buffer per user direction.

Tasks 1–7 are data/logic foundations — parallelizable after Task 1 lands. Tasks 8–10 are the /save rewrite (linear). Tasks 11–14 are board visual pivot (linear-ish). Tasks 15–18 close the save→board loop (Lightbox + entrance). Tasks 19–22 ship Triage. Tasks 23–24 finish displayMode + tagger integration. Task 25 is deploy.
