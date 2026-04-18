import type { ImportedBookmark, FolderAssignment, OgpStatus } from './types'
import type { BookmarkInput, BookmarkRecord } from '@/lib/storage/indexeddb'
import { detectUrlType } from '@/lib/utils/url'
import { fetchOgp } from '@/lib/scraper/ogp'
import {
  addFolder,
  getAllFolders,
  addBookmarkBatch,
  getAllBookmarks,
  updateBookmarkOgp,
  type FolderRecord,
} from '@/lib/storage/indexeddb'
import { findDuplicates } from './deduplicate'
import { FOLDER_COLORS } from '@/lib/constants'
import type { IDBPDatabase } from 'idb'

/**
 * Build the canonical name for an "import bucket" folder based on a local date.
 * Format: `インポート YYYY-MM-DD`. Uses Swedish locale for stable ISO date output.
 */
export function formatImportFolderName(date: Date): string {
  return `インポート ${date.toLocaleDateString('sv-SE')}`
}

/**
 * Look up the "インポート YYYY-MM-DD" folder for the given local date.
 * Returns null if no folder exists with that exact name yet.
 */
export async function findImportFolder(
  db: IDBPDatabase<unknown>,
  date: Date,
): Promise<FolderRecord | null> {
  const typedDb = db as Parameters<typeof getAllFolders>[0]
  const folders = await getAllFolders(typedDb)
  const target = formatImportFolderName(date)
  return folders.find((f) => f.name === target) ?? null
}

/** Progress callback for import operations */
export interface ImportProgress {
  phase: 'saving' | 'ogp'
  completed: number
  total: number
}

/**
 * Build folder assignments from parsed bookmarks.
 * Maps source folder names to existing or new Booklage folders.
 *
 * @param db - The IndexedDB database instance
 * @param bookmarks - Parsed bookmarks from an import file
 * @returns Array of folder assignments for the import preview UI
 */
export async function buildFolderAssignments(
  db: IDBPDatabase<unknown>,
  bookmarks: ImportedBookmark[],
): Promise<FolderAssignment[]> {
  const existingFolders = await getAllFolders(db as Parameters<typeof getAllFolders>[0])
  const folderMap = new Map<string, FolderAssignment>()
  const noFolderKey = '__no_folder__'

  for (const bm of bookmarks) {
    const key = bm.folder ?? noFolderKey
    if (folderMap.has(key)) {
      folderMap.get(key)!.count++
      continue
    }
    const existing = bm.folder
      ? existingFolders.find((f) => f.name === bm.folder)
      : existingFolders[0]
    folderMap.set(key, {
      sourceName: bm.folder ?? 'インポート',
      targetFolderId: existing?.id ?? '',
      isNew: !existing && !!bm.folder,
      count: 1,
    })
  }
  return Array.from(folderMap.values())
}

/**
 * Execute the import: find-or-create today's "インポート" folder,
 * deduplicate, batch save, start OGP queue.
 *
 * All bookmarks go into a single `インポート YYYY-MM-DD` folder regardless of
 * the `folder` field produced by parsers. Same-day re-import appends to the
 * existing folder.
 *
 * @param db - The IndexedDB database instance
 * @param bookmarks - Parsed bookmarks to import
 * @param now - The current date, injectable for deterministic tests
 * @param onProgress - Optional callback for save/OGP progress
 * @param onOgpUpdate - Optional callback fired when a single bookmark's OGP is fetched
 * @returns Summary of saved/skipped counts and the folder ID that received them
 */
export async function executeImport(
  db: IDBPDatabase<unknown>,
  bookmarks: ImportedBookmark[],
  now: Date = new Date(),
  onProgress?: (progress: ImportProgress) => void,
  onOgpUpdate?: (bookmarkId: string, bookmark: BookmarkRecord) => void,
): Promise<{ saved: number; skipped: number; failed: string[]; importFolderId: string }> {
  const typedDb = db as Parameters<typeof getAllFolders>[0]

  // 1. Find or create today's import folder
  const existing = await findImportFolder(db, now)
  let importFolder: FolderRecord
  if (existing) {
    importFolder = existing
  } else {
    const allFolders = await getAllFolders(typedDb)
    const colorIdx = allFolders.length % FOLDER_COLORS.length
    importFolder = await addFolder(typedDb, {
      name: formatImportFolderName(now),
      color: FOLDER_COLORS[colorIdx],
      order: allFolders.length,
    })
  }

  // 2. Deduplicate against existing bookmarks (all folders) and within the batch
  const existingBookmarks = await getAllBookmarks(typedDb)
  const existingUrls = existingBookmarks.map((b) => b.url)
  const { unique, duplicates } = findDuplicates(bookmarks, existingUrls)

  // 3. Prepare bookmark inputs — every item goes to importFolder
  const inputs: BookmarkInput[] = unique.map((bm) => {
    const urlType = detectUrlType(bm.url)
    const needsOgp = urlType !== 'tweet' && urlType !== 'youtube'
    return {
      url: bm.url,
      title: bm.title,
      description: bm.description ?? '',
      thumbnail: '',
      favicon: '',
      siteName: '',
      type: urlType,
      folderId: importFolder.id,
      ogpStatus: (needsOgp ? 'pending' : 'fetched') as OgpStatus,
    }
  })

  // 4. Batch save (no-op when inputs is empty)
  const saved = inputs.length > 0
    ? await addBookmarkBatch(typedDb, inputs, 50, (completed) => {
        onProgress?.({ phase: 'saving', completed, total: inputs.length })
      })
    : []

  // 5. Start background OGP fetch for pending bookmarks
  const pendingOgp = saved.filter((b) => b.ogpStatus === 'pending')
  if (pendingOgp.length > 0) {
    void fetchOgpBatch(typedDb, pendingOgp, onProgress, onOgpUpdate)
  }

  return {
    saved: saved.length,
    skipped: duplicates.length,
    failed: [],
    importFolderId: importFolder.id,
  }
}

/**
 * Fetch OGP data in batches with concurrency control and retry.
 * Runs in background (fire-and-forget from executeImport).
 *
 * @param db - The IndexedDB database instance
 * @param bookmarks - Bookmarks that need OGP fetching
 * @param onProgress - Optional callback for OGP fetch progress
 * @param onUpdate - Optional callback fired when a single bookmark's OGP is fetched
 */
async function fetchOgpBatch(
  db: Parameters<typeof updateBookmarkOgp>[0],
  bookmarks: BookmarkRecord[],
  onProgress?: (progress: ImportProgress) => void,
  onUpdate?: (bookmarkId: string, bookmark: BookmarkRecord) => void,
): Promise<void> {
  const CONCURRENCY = 5
  let completed = 0
  const total = bookmarks.length

  async function fetchOne(bookmark: BookmarkRecord): Promise<void> {
    let retries = 1
    while (retries >= 0) {
      try {
        const ogp = await fetchOgp(bookmark.url)
        const updates = {
          title: ogp.title || bookmark.title,
          description: ogp.description,
          thumbnail: ogp.image,
          favicon: ogp.favicon,
          siteName: ogp.siteName,
          ogpStatus: 'fetched' as OgpStatus,
        }
        await updateBookmarkOgp(db, bookmark.id, updates)
        const updated: BookmarkRecord = { ...bookmark, ...updates }
        onUpdate?.(bookmark.id, updated)
        break
      } catch {
        if (retries > 0) {
          retries--
          await new Promise((r) => setTimeout(r, 3000))
        } else {
          await updateBookmarkOgp(db, bookmark.id, { ogpStatus: 'failed' })
          onUpdate?.(bookmark.id, { ...bookmark, ogpStatus: 'failed' })
        }
      }
    }
    completed++
    onProgress?.({ phase: 'ogp', completed, total })
  }

  for (let i = 0; i < bookmarks.length; i += CONCURRENCY) {
    const chunk = bookmarks.slice(i, i + CONCURRENCY)
    await Promise.all(chunk.map(fetchOne))
  }
}
