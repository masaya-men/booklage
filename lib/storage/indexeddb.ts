import { openDB, type IDBPDatabase } from 'idb'
import { DB_NAME, DB_VERSION, FLOAT_ROTATION_RANGE } from '@/lib/constants'
import type { UrlType } from '@/lib/utils/url'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
export type BookmarkInput = Omit<BookmarkRecord, 'id' | 'savedAt'>

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
    x: Math.floor(Math.random() * 600) + 50,
    y: Math.floor(Math.random() * 400) + 50,
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
  }

  // Use a transaction to atomically create both bookmark and card
  const tx = db.transaction(['bookmarks', 'cards'], 'readwrite')
  await tx.objectStore('bookmarks').put(bookmark)

  // Count existing cards to determine gridIndex
  const existingCards = await tx.objectStore('cards').index('by-folder').getAll(bookmark.folderId)
  const gridIndex = existingCards.length

  const pos = randomPosition()
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
