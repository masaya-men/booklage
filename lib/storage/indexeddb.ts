import { openDB, type IDBPDatabase } from 'idb'
import { DB_NAME, DB_VERSION, FLOAT_ROTATION_RANGE } from '@/lib/constants'
import type { UrlType } from '@/lib/utils/url'
import { generateCardDimensions } from '@/lib/canvas/card-sizing'
import { MIN_CARD_WIDTH, presetToCardWidth, DEFAULT_CARD_WIDTH } from '@/lib/board/size-migration'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** OGP fetch lifecycle status */
export type OgpStatus = 'pending' | 'fetched' | 'failed'

/** Bookmark record stored in IndexedDB */
export interface BookmarkRecord {
  /** UUID primary key */
  id: string
  /** Original URL */
  url: string
  /** Page title (from OGP or document) */
  title: string
  /** Page description */
  description: string
  /** Thumbnail image URL */
  thumbnail: string
  /** Favicon URL */
  favicon: string
  /** Site name (e.g. "YouTube") */
  siteName: string
  /** Detected URL type */
  type: UrlType
  /** ISO 8601 timestamp */
  savedAt: string
  /** @deprecated post-v9 — kept for backward read compat only. Prefer tags[]. */
  folderId?: string
  /** OGP fetch status: pending (not yet fetched), fetched (done), failed (needs retry) */
  ogpStatus: OgpStatus
  // v6 additions
  /** Whether user has read this bookmark */
  isRead?: boolean
  /** Whether this bookmark is soft-deleted (B2 cleanup) */
  isDeleted?: boolean
  /** ISO 8601 timestamp for 30-day purge (B2) */
  deletedAt?: string
  // v8 additions
  /** Board display order (lower = earlier). Dense; rewrite on reorder. */
  orderIndex?: number
  /** @deprecated post-v10 — use cardWidth. Kept for migration read-back only. */
  sizePreset?: 'S' | 'M' | 'L'
  /** Continuous card width in CSS pixels. Replaces sizePreset post-v10.
   *  Stored value is only treated as a user-defined override when the
   *  companion `customCardWidth` flag is true; otherwise the board
   *  computes width from the active SizePicker level. */
  cardWidth?: number
  /** v11: when true, the user has manually resized this card via the
   *  corner ResizeHandle and `cardWidth` should be honored as the
   *  card's persistent width. The header Size 1-5 picker no longer
   *  affects this card. undefined / false = follow SizePicker default. */
  customCardWidth?: boolean
  /** v9: mood id array. Empty = Inbox. */
  tags: string[]
  /** v9: null = follow global displayMode (BoardConfig). */
  displayMode?: 'visual' | 'editorial' | 'native' | null
  /** True when the bookmark's underlying source is known to be a video.
   *  Set asynchronously by metadata backfills (tweet syndication for X
   *  videos; URL-pattern check for Instagram /reel/ and /tv/; URL-type
   *  itself for YouTube and TikTok). undefined means "we don't know" —
   *  card UI should NOT show a play overlay in that case to avoid
   *  misleading the user about a still photo.
   *  Stored as an optional field so existing IDB rows need no migration. */
  hasVideo?: boolean
}

/** Mood record (v9) — replaces the legacy folder concept. Stored in `moods` store. */
export interface MoodRecord {
  /** UUID primary key */
  id: string
  /** Display name */
  name: string
  /** Accent color hex string */
  color: string
  /** Sort order (ascending) */
  order: number
  /** Unix epoch milliseconds */
  createdAt: number
}

/** Input for creating a new mood (id and createdAt are auto-generated) */
export type MoodInput = Omit<MoodRecord, 'id' | 'createdAt'>

/** Card record — visual position of a bookmark on the canvas */
export interface CardRecord {
  /** UUID primary key */
  id: string
  /** Associated bookmark ID */
  bookmarkId: string
  /** Parent folder ID (denormalized for efficient queries) */
  folderId: string
  /** X position on canvas (collage mode) */
  x: number
  /** Y position on canvas (collage mode) */
  y: number
  /** Rotation in degrees (collage mode) */
  rotation: number
  /** Scale factor */
  scale: number
  /** Stacking order */
  zIndex: number
  /** Position index for grid mode ordering (auto-assigned) */
  gridIndex: number
  /** Whether user manually placed this card (vs auto-scatter) */
  isManuallyPlaced: boolean
  /** Card width in pixels */
  width: number
  /** Card height in pixels */
  height: number
  // v6 additions
  /** Whether card is locked (prevents interaction) */
  locked?: boolean
  /** Whether user manually resized this card (prevents aspect-ratio recompute overwrite) */
  isUserResized?: boolean
  /** Cached aspect ratio estimation */
  aspectRatio?: number
}

export interface UserPreferencesRecord {
  key: 'main'
  bgTheme: string
  cardStyle: 'glass' | 'polaroid' | 'newspaper' | 'magnet'
  uiTheme: 'auto' | 'dark' | 'light'
  defaultCardSize: 'random' | 'S' | 'M' | 'L' | 'XL'
  defaultAspectRatio: 'random' | 'auto' | '1:1' | '16:9' | '3:4'
  reducedMotion: boolean
  cursorStyle?: string
  canvasMode?: 'flat' | 'sphere'
}

/** Settings record — user preferences */
export interface SettingsRecord {
  /** Setting key (primary key) */
  key: string
  /** UI theme */
  theme?: string
  /** Locale code */
  locale?: string
  /** Card display style */
  cardStyle?: string
  /** Custom background image URL */
  customImage?: string
}

// ---------------------------------------------------------------------------
// Input types (fields the caller provides; auto-generated fields omitted)
// ---------------------------------------------------------------------------

/** Input for creating a new bookmark (id and savedAt are auto-generated) */
export type BookmarkInput = Omit<
  BookmarkRecord,
  'id' | 'savedAt' | 'ogpStatus' | 'tags' | 'displayMode' | 'folderId'
> & {
  /** Mood id array. Default [] (Inbox). */
  tags?: string[]
  /** null/undefined = follow global displayMode. */
  displayMode?: BookmarkRecord['displayMode']
  /** Defaults to 'fetched' when omitted. */
  ogpStatus?: OgpStatus
}

// ---------------------------------------------------------------------------
// Database schema
// ---------------------------------------------------------------------------

interface BooklageDB {
  bookmarks: BookmarkRecord
  moods: MoodRecord
  cards: CardRecord
  settings: SettingsRecord
  preferences: UserPreferencesRecord
}

type BooklageIDB = IDBPDatabase<BooklageDB>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a UUID v4 */
function uuid(): string {
  return crypto.randomUUID()
}

/**
 * Generate a random rotation within +/- FLOAT_ROTATION_RANGE degrees.
 */
function randomRotation(): number {
  return (Math.random() * 2 - 1) * FLOAT_ROTATION_RANGE
}

/**
 * Generate a random canvas position (initial placement area).
 */
function randomPosition(): { x: number; y: number } {
  return {
    // Start x at 220 to avoid overlapping with FolderNav (left panel, ~200px wide)
    x: Math.floor(Math.random() * 600) + 220,
    y: Math.floor(Math.random() * 400) + 80,
  }
}

// ---------------------------------------------------------------------------
// Database initialization
// ---------------------------------------------------------------------------

/**
 * Open (or create) the IndexedDB database with the application schema.
 * @returns The opened IDBPDatabase instance
 */
export async function initDB(): Promise<IDBPDatabase<BooklageDB>> {
  return openDB<BooklageDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      // ── v0 → v1: initial schema ──
      if (oldVersion < 1) {
        const bookmarkStore = db.createObjectStore('bookmarks', { keyPath: 'id' })
        bookmarkStore.createIndex('by-folder', 'folderId')
        bookmarkStore.createIndex('by-date', 'savedAt')

        db.createObjectStore('folders', { keyPath: 'id' })

        const cardStore = db.createObjectStore('cards', { keyPath: 'id' })
        cardStore.createIndex('by-folder', 'folderId')
        cardStore.createIndex('by-bookmark', 'bookmarkId')

        db.createObjectStore('settings', { keyPath: 'key' })
      }

      // ── v1 → v2: add gridIndex + isManuallyPlaced to cards ──
      if (oldVersion < 2) {
        const cardStore = transaction.objectStore('cards')
        void cardStore.openCursor().then(function addFields(
          cursor: Awaited<ReturnType<typeof cardStore.openCursor>>,
        ): Promise<void> | undefined {
          if (!cursor) return
          const card: CardRecord = {
            ...cursor.value,
            gridIndex: (cursor.value as CardRecord & { gridIndex?: number }).gridIndex ?? 0,
            isManuallyPlaced:
              (cursor.value as CardRecord & { isManuallyPlaced?: boolean }).isManuallyPlaced ?? false,
          }
          void cursor.update(card)
          return cursor.continue().then(addFields)
        })
      }

      // ── v2 → v3: add preferences store + width/height to cards ──
      if (oldVersion < 3) {
        db.createObjectStore('preferences', { keyPath: 'key' })

        const cardStore = transaction.objectStore('cards')
        void cardStore.openCursor().then(function addSizeFields(
          cursor: Awaited<ReturnType<typeof cardStore.openCursor>>,
        ): Promise<void> | undefined {
          if (!cursor) return
          const card = {
            ...cursor.value,
            width: (cursor.value as CardRecord & { width?: number }).width ?? 240,
            height: (cursor.value as CardRecord & { height?: number }).height ?? 180,
          }
          void cursor.update(card)
          return cursor.continue().then(addSizeFields)
        })
      }

      // ── v3 → v4: add ogpStatus to bookmarks ──
      if (oldVersion < 4) {
        const bookmarkStore = transaction.objectStore('bookmarks')
        bookmarkStore.createIndex('by-ogp-status', 'ogpStatus')
        void bookmarkStore.openCursor().then(function addOgpStatus(
          cursor: Awaited<ReturnType<typeof bookmarkStore.openCursor>>,
        ): Promise<void> | undefined {
          if (!cursor) return
          const bookmark = {
            ...cursor.value,
            ogpStatus: (cursor.value as BookmarkRecord & { ogpStatus?: string }).ogpStatus ?? 'fetched',
          }
          void cursor.update(bookmark)
          return cursor.continue().then(addOgpStatus)
        })
      }

      // ── v4 → v5: clear legacy isManuallyPlaced from old infinite-canvas
      //            positions. B0 justified grid treats every card as auto-layout
      //            on first load; fresh user drags re-set the flag via updateCard.
      if (oldVersion < 5) {
        const cardStore = transaction.objectStore('cards')
        void cardStore.openCursor().then(function clearManualPlacement(
          cursor: Awaited<ReturnType<typeof cardStore.openCursor>>,
        ): Promise<void> | undefined {
          if (!cursor) return
          void cursor.update({ ...cursor.value, isManuallyPlaced: false })
          return cursor.continue().then(clearManualPlacement)
        })
      }

      // ── v5 → v6: add locked / isUserResized / aspectRatio to cards;
      //            add isRead / isDeleted / deletedAt to bookmarks
      if (oldVersion < 6) {
        const cardStore = transaction.objectStore('cards')
        void cardStore.openCursor().then(function addV6CardFields(
          cursor: Awaited<ReturnType<typeof cardStore.openCursor>>,
        ): Promise<void> | undefined {
          if (!cursor) return
          const card = {
            ...cursor.value,
            locked: (cursor.value as CardRecord & { locked?: boolean }).locked ?? false,
            isUserResized: (cursor.value as CardRecord & { isUserResized?: boolean }).isUserResized ?? false,
            aspectRatio: (cursor.value as CardRecord & { aspectRatio?: number }).aspectRatio,
          }
          void cursor.update(card)
          return cursor.continue().then(addV6CardFields)
        })

        const bookmarkStore = transaction.objectStore('bookmarks')
        void bookmarkStore.openCursor().then(function addV6BookmarkFields(
          cursor: Awaited<ReturnType<typeof bookmarkStore.openCursor>>,
        ): Promise<void> | undefined {
          if (!cursor) return
          const b = {
            ...cursor.value,
            isRead: (cursor.value as BookmarkRecord & { isRead?: boolean }).isRead ?? false,
            isDeleted: (cursor.value as BookmarkRecord & { isDeleted?: boolean }).isDeleted ?? false,
          }
          void cursor.update(b)
          return cursor.continue().then(addV6BookmarkFields)
        })
      }

      // ── v6 → v7: strip `layoutMode` from BoardConfig (always-free canvas).
      //            BoardConfig is stored in `settings` as
      //            { key: 'board-config', config: BoardConfig }; unwrap and
      //            delete the nested field.
      if (oldVersion < 7) {
        const settingsStore = transaction.objectStore('settings')
        void settingsStore.openCursor().then(function stripLayoutMode(
          cursor: Awaited<ReturnType<typeof settingsStore.openCursor>>,
        ): Promise<void> | undefined {
          if (!cursor) return
          if (cursor.key === 'board-config') {
            const rec = cursor.value as { key: string; config?: Record<string, unknown> }
            if (rec.config && 'layoutMode' in rec.config) {
              const { layoutMode: _drop, ...restConfig } = rec.config
              void _drop
              void cursor.update({ key: rec.key, config: restConfig })
            }
          }
          return cursor.continue().then(stripLayoutMode)
        })
      }

      // ── v7 → v8: seed orderIndex (dense, by savedAt) + sizePreset='S'
      if (oldVersion < 8) {
        const bookmarkStore = transaction.objectStore('bookmarks')
        const all: BookmarkRecord[] = []
        void bookmarkStore.openCursor().then(function collect(
          cursor: Awaited<ReturnType<typeof bookmarkStore.openCursor>>,
        ): Promise<void> | undefined {
          if (!cursor) {
            all.sort((a, b) => a.savedAt.localeCompare(b.savedAt))
            for (let i = 0; i < all.length; i++) {
              const b = all[i]
              const next: BookmarkRecord = {
                ...b,
                orderIndex: b.orderIndex ?? i,
                sizePreset: b.sizePreset ?? 'S',
              }
              void bookmarkStore.put(next)
            }
            return
          }
          all.push(cursor.value)
          return cursor.continue().then(collect)
        })
      }

      // ── v8 → v9: tag-based model (destefanis pivot) ──
      // 1. Create moods store (1:1 copy of folders)
      // 2. Rewrite every bookmark: folderId → tags[folderId]; add displayMode=null
      // 3. Delete folders store
      let v9BookmarkRewritePromise: Promise<void> = Promise.resolve()
      if (oldVersion < 9) {
        if (!db.objectStoreNames.contains('moods')) {
          db.createObjectStore('moods', { keyPath: 'id' })
        }

        // Step 1: copy folders → moods (cursor chain resolves within the
        // versionchange tx; we drop the store in step 3 after it completes).
        const hadFolders = db.objectStoreNames.contains('folders')
        const copyFoldersPromise: Promise<void> = hadFolders
          ? (() => {
              const folderStore = transaction.objectStore('folders')
              const moodsStore = transaction.objectStore('moods')
              return folderStore.openCursor().then(function copyFolder(
                cursor: Awaited<ReturnType<typeof folderStore.openCursor>>,
              ): Promise<void> | undefined {
                if (!cursor) return
                const f = cursor.value as {
                  id: string
                  name?: string
                  color?: string
                  order?: number
                  createdAt?: string
                }
                const moodRec: MoodRecord = {
                  id: f.id,
                  name: f.name ?? 'Untitled',
                  color: f.color ?? '#7c5cfc',
                  order: f.order ?? 0,
                  createdAt: f.createdAt ? new Date(f.createdAt).getTime() : Date.now(),
                }
                void moodsStore.put(moodRec)
                return cursor.continue().then(copyFolder)
              })
            })()
          : Promise.resolve()

        // Step 2: rewrite every bookmark — capture the promise so v10 can chain on it.
        const bookmarkStore = transaction.objectStore('bookmarks')
        v9BookmarkRewritePromise = bookmarkStore.openCursor().then(function rewriteBookmark(
          cursor: Awaited<ReturnType<typeof bookmarkStore.openCursor>>,
        ): Promise<void> | undefined {
          if (!cursor) return
          const rec = cursor.value as BookmarkRecord & { folderId?: string }
          const tags = rec.folderId ? [rec.folderId] : []
          const next: BookmarkRecord = { ...rec, tags, displayMode: null }
          delete (next as { folderId?: string }).folderId
          void cursor.update(next)
          return cursor.continue().then(rewriteBookmark)
        })

        // Step 3: drop folders store after copy finishes. Chain on the copy
        // promise so the deletion only fires once the cursor has drained.
        if (hadFolders) {
          void copyFoldersPromise.then(() => {
            if (db.objectStoreNames.contains('folders')) {
              db.deleteObjectStore('folders')
            }
          })
        }
      }

      // ── v9 → v10: seed cardWidth from sizePreset ──
      // Chain on v9BookmarkRewritePromise to avoid a cursor race when upgrading
      // from v8 directly to v10: the v9 rewrite must finish writing tags before
      // the v10 cursor reads and re-writes each record.
      if (oldVersion < 10) {
        void v9BookmarkRewritePromise.then(() => {
          const bookmarkStore = transaction.objectStore('bookmarks')
          void bookmarkStore.openCursor().then(function seedCardWidth(
            cursor: Awaited<ReturnType<typeof bookmarkStore.openCursor>>,
          ): Promise<void> | undefined {
            if (!cursor) return
            const rec = cursor.value as BookmarkRecord
            if (typeof rec.cardWidth !== 'number') {
              const next: BookmarkRecord = {
                ...rec,
                cardWidth: presetToCardWidth(rec.sizePreset),
              }
              void cursor.update(next)
            }
            return cursor.continue().then(seedCardWidth)
          })
        })
      }

      // ── v10 → v11: introduce customCardWidth flag (no-op rewrite).
      // Existing rows have `customCardWidth: undefined`, which the read
      // path treats as `false` — no cursor sweep needed. Bumping the
      // schema version still serves as a tripwire so future migrations
      // can assume the field exists when oldVersion >= 11.
    },
  })
}

// ---------------------------------------------------------------------------
// Bookmark CRUD
// ---------------------------------------------------------------------------

/**
 * Add a new bookmark and automatically create an associated card.
 * @param db - The database instance
 * @param input - Bookmark data
 * @returns The created BookmarkRecord
 */
export async function addBookmark(
  db: IDBPDatabase<BooklageDB>,
  input: BookmarkInput,
): Promise<BookmarkRecord> {
  // Append to the end of the current bookmark list (board-wide ordering).
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
    cardWidth: DEFAULT_CARD_WIDTH,
    tags: input.tags ?? [],
    displayMode: input.displayMode ?? null,
  }

  // Use a transaction to atomically create both bookmark and card
  const tx = db.transaction(['bookmarks', 'cards'], 'readwrite')
  await tx.objectStore('bookmarks').put(bookmark)

  const existingCards = await tx.objectStore('cards').count()

  const pos = randomPosition()
  const dimensions = generateCardDimensions('random', 'random')
  const card: CardRecord = {
    id: uuid(),
    bookmarkId: bookmark.id,
    // Legacy column kept for v8 schema compatibility; retired in a later task.
    folderId: '',
    x: pos.x,
    y: pos.y,
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

/**
 * Delete a bookmark and all its associated cards.
 * @param db - The database instance
 * @param bookmarkId - The bookmark ID to delete
 */
export async function deleteBookmark(
  db: IDBPDatabase<BooklageDB>,
  bookmarkId: string,
): Promise<void> {
  const tx = db.transaction(['bookmarks', 'cards'], 'readwrite')

  // Delete the bookmark
  await tx.objectStore('bookmarks').delete(bookmarkId)

  // Delete all associated cards (lookup by bookmark id only — folder index is gone).
  const cardStore = tx.objectStore('cards')
  let cursor = await cardStore.index('by-bookmark').openCursor(bookmarkId)
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }

  await tx.done
}

// ---------------------------------------------------------------------------
// Card CRUD
// ---------------------------------------------------------------------------

/**
 * Update specific fields of a card (e.g. position, rotation, scale).
 * @param db - The database instance
 * @param cardId - The card ID to update
 * @param updates - Partial card fields to merge
 */
export async function updateCard(
  db: IDBPDatabase<BooklageDB>,
  cardId: string,
  updates: Partial<Omit<CardRecord, 'id' | 'bookmarkId' | 'folderId'>>,
): Promise<void> {
  const existing = await db.get('cards', cardId)
  if (!existing) {
    throw new Error(`Card not found: ${cardId}`)
  }
  const updated: CardRecord = { ...existing, ...updates }
  await db.put('cards', updated)
}

// ---------------------------------------------------------------------------
// Preferences CRUD
// ---------------------------------------------------------------------------

export const DEFAULT_PREFERENCES: UserPreferencesRecord = {
  key: 'main',
  bgTheme: 'dark',
  cardStyle: 'glass',
  uiTheme: 'auto',
  defaultCardSize: 'random',
  defaultAspectRatio: 'random',
  reducedMotion: false,
}

/**
 * Check if user has saved preferences (vs first-time defaults).
 */
export async function hasSavedPreferences(
  db: IDBPDatabase<BooklageDB>,
): Promise<boolean> {
  const prefs = await db.get('preferences', 'main')
  return prefs !== undefined
}

/**
 * Get user preferences, returning defaults if not yet saved.
 * @param db - The database instance
 * @returns The stored UserPreferencesRecord or DEFAULT_PREFERENCES
 */
export async function getPreferences(
  db: IDBPDatabase<BooklageDB>,
): Promise<UserPreferencesRecord> {
  const prefs = await db.get('preferences', 'main')
  return prefs ?? DEFAULT_PREFERENCES
}

/**
 * Save (merge) user preference updates.
 * @param db - The database instance
 * @param prefs - Partial preferences to merge with existing values
 */
export async function savePreferences(
  db: IDBPDatabase<BooklageDB>,
  prefs: Partial<Omit<UserPreferencesRecord, 'key'>>,
): Promise<void> {
  const current = await getPreferences(db)
  await db.put('preferences', { ...current, ...prefs, key: 'main' })
}

// ---------------------------------------------------------------------------
// OGP helpers
// ---------------------------------------------------------------------------

/**
 * Update a bookmark's OGP data after background fetch.
 * @param db - The database instance
 * @param bookmarkId - The bookmark ID to update
 * @param ogpData - OGP fields to merge plus the new ogpStatus
 */
export async function updateBookmarkOgp(
  db: IDBPDatabase<BooklageDB>,
  bookmarkId: string,
  ogpData: {
    title?: string
    description?: string
    thumbnail?: string
    favicon?: string
    siteName?: string
    ogpStatus: OgpStatus
  },
): Promise<void> {
  const existing = await db.get('bookmarks', bookmarkId)
  if (!existing) return
  const updated: BookmarkRecord = { ...existing, ...ogpData }
  await db.put('bookmarks', updated)
}

/**
 * Persist a user-defined card width and flip the `customCardWidth` flag
 * to true so the header Size picker no longer touches this card. Called
 * from ResizeHandle pointerup.
 *
 * Only the MIN floor is enforced here — ResizeHandle already clamps the
 * upper bound to the live viewport width during the drag, so the value
 * arriving here is always already viewport-bounded. Re-clamping with
 * MAX_CARD_WIDTH (480) was a leftover from the S/M/L preset era and
 * silently truncated any custom width above 480 to 480 on persist,
 * causing reloaded boards to "snap to nearest preset" — bug fix.
 */
export async function persistCustomCardWidth(
  db: IDBPDatabase<BooklageDB>,
  bookmarkId: string,
  width: number,
): Promise<void> {
  const existing = await db.get('bookmarks', bookmarkId)
  if (!existing) return
  const safeWidth = Number.isFinite(width)
    ? Math.max(MIN_CARD_WIDTH, width)
    : DEFAULT_CARD_WIDTH
  await db.put('bookmarks', {
    ...existing,
    cardWidth: safeWidth,
    customCardWidth: true,
  })
}

/**
 * Clear the `customCardWidth` flag for a single bookmark. The stored
 * `cardWidth` is left intact (cheap, harmless) — it just stops being
 * honored once the flag is false. Used by the per-card "reset size"
 * affordance.
 */
export async function clearCustomCardWidth(
  db: IDBPDatabase<BooklageDB>,
  bookmarkId: string,
): Promise<void> {
  const existing = await db.get('bookmarks', bookmarkId)
  if (!existing) return
  if (existing.customCardWidth !== true) return
  await db.put('bookmarks', { ...existing, customCardWidth: false })
}

/**
 * Bulk reset every bookmark whose `customCardWidth` flag is true.
 * Used by the header "Reset all" button.
 * @returns The bookmark ids that were actually reset (so callers can
 *   prune their in-memory override map without diffing the whole list).
 */
export async function clearAllCustomCardWidths(
  db: IDBPDatabase<BooklageDB>,
): Promise<readonly string[]> {
  const tx = db.transaction('bookmarks', 'readwrite')
  const store = tx.objectStore('bookmarks')
  const cleared: string[] = []
  let cursor = await store.openCursor()
  while (cursor) {
    const rec = cursor.value
    if (rec.customCardWidth === true) {
      await cursor.update({ ...rec, customCardWidth: false })
      cleared.push(rec.id)
    }
    cursor = await cursor.continue()
  }
  await tx.done
  return cleared
}

/**
 * Set a single bookmark's orderIndex. Caller is responsible for renumber
 * consistency across siblings (use updateBookmarkOrderBatch for multi-card
 * reorder).
 */
export async function updateBookmarkOrderIndex(
  db: IDBPDatabase<BooklageDB>,
  bookmarkId: string,
  orderIndex: number,
): Promise<void> {
  const existing = await db.get('bookmarks', bookmarkId)
  if (!existing) return
  await db.put('bookmarks', { ...existing, orderIndex })
}

/**
 * Atomically rewrite orderIndex for multiple bookmarks in one transaction.
 * Use for drag-to-reorder: caller supplies the new complete order by ID.
 */
export async function updateBookmarkOrderBatch(
  db: IDBPDatabase<BooklageDB>,
  orderedBookmarkIds: readonly string[],
): Promise<void> {
  const tx = db.transaction('bookmarks', 'readwrite')
  const store = tx.objectStore('bookmarks')
  for (let i = 0; i < orderedBookmarkIds.length; i++) {
    const id = orderedBookmarkIds[i]
    const existing = await store.get(id)
    if (!existing) continue
    await store.put({ ...existing, orderIndex: i })
  }
  await tx.done
}

// ---------------------------------------------------------------------------
// Bulk queries
// ---------------------------------------------------------------------------

/**
 * Get every bookmark.
 * @param db - The database instance
 * @returns Array of all BookmarkRecord
 */
export async function getAllBookmarks(
  db: IDBPDatabase<BooklageDB>,
): Promise<BookmarkRecord[]> {
  return db.getAll('bookmarks')
}

/**
 * Add multiple bookmarks in batches with associated cards.
 * Writes are batched across transactions for performance on large imports.
 * @param db - The database instance
 * @param inputs - Array of bookmark inputs to create
 * @param batchSize - Number of bookmarks per transaction (default: 50)
 * @param onProgress - Optional callback called after each batch with total completed count
 * @returns Array of created BookmarkRecord
 */
export async function addBookmarkBatch(
  db: IDBPDatabase<BooklageDB>,
  inputs: BookmarkInput[],
  batchSize: number = 50,
  onProgress?: (completed: number) => void,
): Promise<BookmarkRecord[]> {
  const results: BookmarkRecord[] = []

  // Seed the running offsets from the current store sizes once, then advance
  // them locally — keeps each per-batch transaction independent of the others.
  let nextOrder = await db.count('bookmarks')
  let gridIndex = await db.count('cards')

  for (let i = 0; i < inputs.length; i += batchSize) {
    const batch = inputs.slice(i, i + batchSize)
    const tx = db.transaction(['bookmarks', 'cards'], 'readwrite')
    const bookmarkStore = tx.objectStore('bookmarks')
    const cardStore = tx.objectStore('cards')

    for (const input of batch) {
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
        orderIndex: nextOrder++,
        sizePreset: 'S',
        cardWidth: DEFAULT_CARD_WIDTH,
        tags: input.tags ?? [],
        displayMode: input.displayMode ?? null,
      }
      await bookmarkStore.put(bookmark)

      const pos = randomPosition()
      const dimensions = generateCardDimensions('random', 'random')
      const card: CardRecord = {
        id: uuid(),
        bookmarkId: bookmark.id,
        // Legacy column kept for v8 schema compatibility; retired in a later task.
        folderId: '',
        x: pos.x,
        y: pos.y,
        rotation: randomRotation(),
        scale: 1,
        zIndex: 1,
        gridIndex: gridIndex++,
        isManuallyPlaced: false,
        width: dimensions.width,
        height: dimensions.height,
      }
      await cardStore.put(card)
      results.push(bookmark)
    }

    await tx.done
    onProgress?.(results.length)
  }

  return results
}
