'use client'

import { useEffect, useState } from 'react'
import type { IDBPDatabase } from 'idb'
import type { ImportedBookmark, ParseResult } from '@/lib/import/types'
import { findDuplicates } from '@/lib/import/deduplicate'
import { getAllBookmarks, getBookmarksByFolder } from '@/lib/storage/indexeddb'
import { findImportFolder, formatImportFolderName } from '@/lib/import/batch-import'
import styles from './ImportPreview.module.css'

/** Props for ImportPreview */
type ImportPreviewProps = {
  /** Parsed result from the file uploader */
  parseResult: ParseResult
  /** IndexedDB database instance */
  db: IDBPDatabase<unknown>
  /** Called when user confirms import with the unique bookmarks */
  onExecute: (bookmarks: ImportedBookmark[]) => void
  /** Called when user wants to go back to file upload */
  onBack: () => void
}

/**
 * Step 3: Preview parsed bookmarks, show duplicate warnings, and confirm import.
 * All bookmarks will be placed in a single `インポート YYYY-MM-DD` folder.
 */
export function ImportPreview({
  parseResult,
  db,
  onExecute,
  onBack: _onBack,
}: ImportPreviewProps): React.ReactElement {
  const [duplicateCount, setDuplicateCount] = useState(0)
  const [uniqueBookmarks, setUniqueBookmarks] = useState<ImportedBookmark[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [targetFolderName, setTargetFolderName] = useState('')
  const [targetIsNew, setTargetIsNew] = useState(true)
  const [targetExistingCount, setTargetExistingCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function prepare(): Promise<void> {
      try {
        const now = new Date()
        const folderName = formatImportFolderName(now)
        const existing = await findImportFolder(db, now)
        let existingCount = 0
        if (existing) {
          const typedDb = db as Parameters<typeof getBookmarksByFolder>[0]
          const inFolder = await getBookmarksByFolder(typedDb, existing.id)
          existingCount = inFolder.length
        }

        const typedDbAll = db as Parameters<typeof getAllBookmarks>[0]
        const existingBookmarks = await getAllBookmarks(typedDbAll)
        const existingUrls = existingBookmarks.map((b) => b.url)
        const { unique, duplicates } = findDuplicates(parseResult.bookmarks, existingUrls)

        if (!cancelled) {
          setDuplicateCount(duplicates.length)
          setUniqueBookmarks(unique)
          setTargetFolderName(folderName)
          setTargetIsNew(!existing)
          setTargetExistingCount(existingCount)
          setIsLoading(false)
        }
      } catch {
        if (!cancelled) setIsLoading(false)
      }
    }

    void prepare()
    return () => {
      cancelled = true
    }
  }, [db, parseResult.bookmarks])

  const handleExecute = (): void => {
    onExecute(uniqueBookmarks)
  }

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.summary}>
          <span className={styles.summaryIcon}>{'\u{1F50D}'}</span>
          <div className={styles.summaryText}>
            <span className={styles.summaryCount}>{'\u2026'}</span>
            <span className={styles.summaryLabel}>{'解析中...'}</span>
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
            {uniqueBookmarks.length}{'件'}
          </div>
          <div className={styles.summaryLabel}>
            {'インポート可能なブックマーク'}
          </div>
        </div>
      </div>

      {/* Duplicate warning */}
      {duplicateCount > 0 && (
        <div className={styles.duplicateWarning}>
          <span className={styles.duplicateIcon}>{'\u26A0\uFE0F'}</span>
          <span className={styles.duplicateText}>
            {duplicateCount}{'件の重複が見つかりました。自動的にスキップされます。'}
          </span>
        </div>
      )}

      {/* Parse errors */}
      {parseResult.errors.length > 0 && (
        <div className={styles.parseErrors}>
          <span className={styles.parseErrorsTitle}>
            {'解析エラー('}{parseResult.errors.length}{'件)'}
          </span>
          {parseResult.errors.slice(0, 5).map((err, i) => (
            <span key={i} className={styles.parseError}>{err}</span>
          ))}
          {parseResult.errors.length > 5 && (
            <span className={styles.parseError}>
              {'他 '}{parseResult.errors.length - 5}{'件...'}
            </span>
          )}
        </div>
      )}

      {/* Destination announcement */}
      <div className={styles.destination}>
        <span className={styles.destinationIcon}>{'\u{1F4C2}'}</span>
        <span className={styles.destinationText}>
          {targetIsNew
            ? `新しいフォルダ「${targetFolderName}」を作成して追加します`
            : `既存の「${targetFolderName}」に追加します(現在 ${targetExistingCount} 件)`}
        </span>
      </div>

      {/* Action */}
      <div className={styles.actionArea}>
        <button
          className={styles.importButton}
          onClick={handleExecute}
          disabled={uniqueBookmarks.length === 0}
          type="button"
        >
          {uniqueBookmarks.length}{'件をインポート'}
        </button>
      </div>
    </div>
  )
}
