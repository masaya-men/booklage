import { openDB, type IDBPDatabase } from 'idb'
import { DB_NAME, DB_VERSION, FLOAT_ROTATION_RANGE } from '@/lib/constants'
import type { UrlType } from '@/lib/utils/url'
import { generateCardDimensions } from '@/lib/canvas/card-sizing'

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
  /** Parent folder ID */
  folderId: string
  /** OGP fetch status: pending (not yet fetched), fetched (done), failed (needs retry) */
  ogpStatus: OgpStatus
}

/** Folder record stored in IndexedDB */
export interface FolderRecord {
  /** UUID primary key */
  id: string
  /** Display name */
  name: string
  /** Accent color hex string */
  color: string
  /** ISO 8601 timestamp */
  createdAt: string
  /** Sort order (ascending) */
  order: number
}

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
}

export interface UserPreferencesRecord {
  key: 'main'
  bgTheme: string
  cardStyle: 'glass' | 'polaroid' | 'newspaper' | 'magnet'
  uiTheme: 'auto' | 'dark' | 'light'
  defaultCardSize: 'random' | 'S' | 'M' | 'L' | 'XL'
  defaultAspectRatio: 'random' | 'auto' | '1:1' | '16:9' | '3:4'
  reducedMotion: boolean
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
export type BookmarkInput = Omit<BookmarkRecord, 'id' | 'savedAt' | 'ogpStatus'> & { ogpStatus?: OgpStatus }

/** Input for creating a new folder (id and createdAt are auto-generated) */
export type FolderInput = Omit<FolderRecord, 'id' | 'createdAt'>

// ---------------------------------------------------------------------------
// Database schema
// ---------------------------------------------------------------------------

interface BooklageDB {
  bookmarks: BookmarkRecord
  folders: FolderRecord
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
    },
  })
}

// ---------------------------------------------------------------------------
// Folder CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new folder.
 * @param db - The database instance
 * @param input - Folder data (name, color, order)
 * @returns The created FolderRecord
 */
export async function addFolder(
  db: IDBPDatabase<BooklageDB>,
  input: FolderInput,
): Promise<FolderRecord> {
  const folder: FolderRecord = {
    id: uuid(),
    name: input.name,
    color: input.color,
    createdAt: new Date().toISOString(),
    order: input.order,
  }
  await db.put('folders', folder)
  return folder
}

/**
 * Get all folders sorted by their order field.
 * @param db - The database instance
 * @returns Array of FolderRecord sorted by order (ascending)
 */
export async function getAllFolders(
  db: IDBPDatabase<BooklageDB>,
): Promise<FolderRecord[]> {
  const folders = await db.getAll('folders')
  return folders.sort((a, b) => a.order - b.order)
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
    folderId: input.folderId,
    ogpStatus: input.ogpStatus ?? 'fetched',
  }

  // Use a transaction to atomically create both bookmark and card
  const tx = db.transaction(['bookmarks', 'cards'], 'readwrite')
  await tx.objectStore('bookmarks').put(bookmark)

  // Count existing cards to determine gridIndex
  const existingCards = await tx.objectStore('cards').index('by-folder').getAll(bookmark.folderId)
  const gridIndex = existingCards.length

  const pos = randomPosition()
  const dimensions = generateCardDimensions('random', 'random')
  const card: CardRecord = {
    id: uuid(),
    bookmarkId: bookmark.id,
    folderId: bookmark.folderId,
    x: pos.x,
    y: pos.y,
    rotation: randomRotation(),
    scale: 1,
    zIndex: 1,
    gridIndex,
    isManuallyPlaced: false,
    width: dimensions.width,
    height: dimensions.height,
  }
  await tx.objectStore('cards').put(card)
  await tx.done

  return bookmark
}

/**
 * Get all bookmarks belonging to a folder.
 * @param db - The database instance
 * @param folderId - The folder ID to filter by
 * @returns Array of BookmarkRecord
 */
export async function getBookmarksByFolder(
  db: IDBPDatabase<BooklageDB>,
  folderId: string,
): Promise<BookmarkRecord[]> {
  return db.getAllFromIndex('bookmarks', 'by-folder', folderId)
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

  // Delete all associated cards
  const cardStore = tx.objectStore('cards')
  const cardIndex = cardStore.index('by-bookmark')
  let cursor = await cardIndex.openCursor(bookmarkId)
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
 * Get all cards belonging to a folder.
 * @param db - The database instance
 * @param folderId - The folder ID to filter by
 * @returns Array of CardRecord
 */
export async function getCardsByFolder(
  db: IDBPDatabase<BooklageDB>,
  folderId: string,
): Promise<CardRecord[]> {
  return db.getAllFromIndex('cards', 'by-folder', folderId)
}

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

// ---------------------------------------------------------------------------
// Bulk / cross-folder queries
// ---------------------------------------------------------------------------

/**
 * Get all bookmarks across all folders.
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

  for (let i = 0; i < inputs.length; i += batchSize) {
    const batch = inputs.slice(i, i + batchSize)
    const tx = db.transaction(['bookmarks', 'cards'], 'readwrite')
    const bookmarkStore = tx.objectStore('bookmarks')
    const cardStore = tx.objectStore('cards')

    const existingCards = await cardStore.index('by-folder').getAll(batch[0].folderId)
    let gridIndex = existingCards.length

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
        folderId: input.folderId,
        ogpStatus: input.ogpStatus ?? 'fetched',
      }
      await bookmarkStore.put(bookmark)

      const pos = randomPosition()
      const dimensions = generateCardDimensions('random', 'random')
      const card: CardRecord = {
        id: uuid(),
        bookmarkId: bookmark.id,
        folderId: bookmark.folderId,
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
