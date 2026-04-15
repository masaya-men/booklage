import type { ImportedBookmark } from './types'
import { normalizeUrl } from './normalize-url'

/**
 * Result of deduplication check
 */
export interface DeduplicateResult {
  /** Bookmarks that are not duplicates */
  unique: ImportedBookmark[]
  /** Bookmarks that are duplicates (of existing or within incoming list) */
  duplicates: ImportedBookmark[]
}

/**
 * Finds duplicates in the incoming bookmark list by comparing against existing URLs
 * and within the incoming list itself using URL normalization.
 *
 * @param incoming - Bookmarks to check for duplicates
 * @param existingUrls - URLs already stored in the app (IndexedDB)
 * @returns Object containing unique and duplicate bookmarks
 */
export function findDuplicates(
  incoming: ImportedBookmark[],
  existingUrls: string[],
): DeduplicateResult {
  const existingNormalized = new Set(existingUrls.map(normalizeUrl))
  const seenNormalized = new Set<string>()
  const unique: ImportedBookmark[] = []
  const duplicates: ImportedBookmark[] = []

  for (const bookmark of incoming) {
    const normalized = normalizeUrl(bookmark.url)
    if (existingNormalized.has(normalized) || seenNormalized.has(normalized)) {
      duplicates.push(bookmark)
    } else {
      seenNormalized.add(normalized)
      unique.push(bookmark)
    }
  }

  return { unique, duplicates }
}
