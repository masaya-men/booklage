'use client'

import { useEffect, useState } from 'react'
import type { IDBPDatabase } from 'idb'
import type { ImportedBookmark, ParseResult, FolderAssignment } from '@/lib/import/types'
import { buildFolderAssignments } from '@/lib/import/batch-import'
import { findDuplicates } from '@/lib/import/deduplicate'
import { getAllBookmarks } from '@/lib/storage/indexeddb'
import styles from './ImportPreview.module.css'

/** Props for ImportPreview */
type ImportPreviewProps = {
  /** Parsed result from the file uploader */
  parseResult: ParseResult
  /** IndexedDB database instance */
  db: IDBPDatabase<unknown>
  /** Called when user confirms import with final bookmarks and folder assignments */
  onExecute: (bookmarks: ImportedBookmark[], assignments: FolderAssignment[]) => void
  /** Called when user wants to go back to file upload */
  onBack: () => void
}

/**
 * Step 3: Preview parsed bookmarks, show folder assignments,
 * duplicate warnings, and confirm import.
 */
export function ImportPreview({
  parseResult,
  db,
  onExecute,
  onBack: _onBack,
}: ImportPreviewProps): React.ReactElement {
  const [assignments, setAssignments] = useState<FolderAssignment[]>([])
  const [duplicateCount, setDuplicateCount] = useState(0)
  const [uniqueBookmarks, setUniqueBookmarks] = useState<ImportedBookmark[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function prepare(): Promise<void> {
      try {
        // Build folder assignments
        const folderAssignments = await buildFolderAssignments(db, parseResult.bookmarks)

        // Check for duplicates
        const typedDb = db as Parameters<typeof getAllBookmarks>[0]
        const existingBookmarks = await getAllBookmarks(typedDb)
        const existingUrls = existingBookmarks.map((b) => b.url)
        const { unique, duplicates } = findDuplicates(parseResult.bookmarks, existingUrls)

        if (!cancelled) {
          setAssignments(folderAssignments)
          setDuplicateCount(duplicates.length)
          setUniqueBookmarks(unique)
          setIsLoading(false)
        }
      } catch {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void prepare()
    return () => {
      cancelled = true
    }
  }, [db, parseResult.bookmarks])

  const handleExecute = (): void => {
    onExecute(uniqueBookmarks, assignments)
  }

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.summary}>
          <span className={styles.summaryIcon}>{'\u{1F50D}'}</span>
          <div className={styles.summaryText}>
            <span className={styles.summaryCount}>{'\u2026'}</span>
            <span className={styles.summaryLabel}>{'\u89E3\u6790\u4E2D...'}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {/* Summary */}
      <div className={styles.summary}>
        <span className={styles.summaryIcon}>{'\u{1F4DA}'}</span>
        <div className={styles.summaryText}>
          <div className={styles.summaryCount}>
            {uniqueBookmarks.length}{'\u4EF6'}
          </div>
          <div className={styles.summaryLabel}>
            {'\u30A4\u30F3\u30DD\u30FC\u30C8\u53EF\u80FD\u306A\u30D6\u30C3\u30AF\u30DE\u30FC\u30AF'}
          </div>
        </div>
      </div>

      {/* Duplicate warning */}
      {duplicateCount > 0 && (
        <div className={styles.duplicateWarning}>
          <span className={styles.duplicateIcon}>{'\u26A0\uFE0F'}</span>
          <span className={styles.duplicateText}>
            {duplicateCount}{'\u4EF6\u306E\u91CD\u8907\u304C\u898B\u3064\u304B\u308A\u307E\u3057\u305F\u3002\u81EA\u52D5\u7684\u306B\u30B9\u30AD\u30C3\u30D7\u3055\u308C\u307E\u3059\u3002'}
          </span>
        </div>
      )}

      {/* Parse errors */}
      {parseResult.errors.length > 0 && (
        <div className={styles.parseErrors}>
          <span className={styles.parseErrorsTitle}>
            {'\u89E3\u6790\u30A8\u30E9\u30FC\uFF08'}{parseResult.errors.length}{'\u4EF6\uFF09'}
          </span>
          {parseResult.errors.slice(0, 5).map((err, i) => (
            <span key={i} className={styles.parseError}>{err}</span>
          ))}
          {parseResult.errors.length > 5 && (
            <span className={styles.parseError}>
              {'\u4ED6 '}{parseResult.errors.length - 5}{'\u4EF6...'}
            </span>
          )}
        </div>
      )}

      {/* Folder assignments */}
      {assignments.length > 0 && (
        <div className={styles.folderSection}>
          <span className={styles.folderSectionTitle}>{'\u30D5\u30A9\u30EB\u30C0\u632F\u308A\u5206\u3051'}</span>
          <div className={styles.folderList}>
            {assignments.map((a, i) => (
              <div key={i} className={styles.folderRow}>
                <span className={styles.folderIcon}>{'\u{1F4C2}'}</span>
                <span className={styles.folderName}>{a.sourceName}</span>
                <span className={styles.folderCount}>{a.count}{'\u4EF6'}</span>
                <span className={a.isNew ? styles.badgeNew : styles.badgeExisting}>
                  {a.isNew ? '\u65B0\u30D5\u30A9\u30EB\u30C0' : '\u65E2\u5B58\u30D5\u30A9\u30EB\u30C0'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action */}
      <div className={styles.actionArea}>
        <button
          className={styles.importButton}
          onClick={handleExecute}
          disabled={uniqueBookmarks.length === 0}
          type="button"
        >
          {uniqueBookmarks.length}{'\u4EF6\u3092\u30A4\u30F3\u30DD\u30FC\u30C8'}
        </button>
      </div>
    </div>
  )
}
