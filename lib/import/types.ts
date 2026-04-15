import type { UrlType } from '@/lib/utils/url'

/** Supported import sources */
export type ImportSource = 'browser' | 'youtube' | 'tiktok' | 'reddit' | 'twitter' | 'instagram' | 'url-list'

/**
 * A single bookmark parsed from an import file
 */
export interface ImportedBookmark {
  /** The URL of the bookmarked page */
  url: string
  /** Page title (from file metadata or empty) */
  title: string
  /** Optional description */
  description?: string
  /** Folder name from the source (e.g. Chrome folder, playlist name) */
  folder?: string
  /** When the bookmark was originally saved (ISO 8601) */
  addedAt?: string
  /** Which platform this was imported from */
  source: ImportSource
}

/**
 * Result of parsing an import file
 */
export interface ParseResult {
  /** Successfully parsed bookmarks */
  bookmarks: ImportedBookmark[]
  /** Errors encountered during parsing (non-fatal) */
  errors: string[]
}

/**
 * OGP fetch status for a bookmark
 * NOTE: Will be re-exported from @/lib/storage/indexeddb once Task 2 adds it there.
 */
export type OgpStatus = 'pending' | 'fetched' | 'failed'

/**
 * Folder assignment for import preview
 */
export interface FolderAssignment {
  /** Source folder name (from file) */
  sourceName: string
  /** Target Booklage folder ID (existing or new) */
  targetFolderId: string
  /** Whether this folder needs to be created */
  isNew: boolean
  /** Number of bookmarks in this folder */
  count: number
}

// Re-export UrlType for convenience within the import module
export type { UrlType }
