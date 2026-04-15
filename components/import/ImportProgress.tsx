'use client'

import type { ImportProgress as ImportProgressData } from '@/lib/import/batch-import'
import styles from './ImportProgress.module.css'

/** Props for ImportProgress */
type ImportProgressProps = {
  /** Current progress data */
  progress: ImportProgressData
  /** Number of bookmarks saved */
  savedCount: number
  /** Number of duplicates skipped */
  skippedCount: number
  /** Whether the import is complete */
  isComplete: boolean
  /** Called when user closes the progress overlay */
  onClose: () => void
}

/**
 * Progress overlay shown during import execution.
 * Displays a progress bar, counter, phase text, and completion summary.
 */
export function ImportProgress({
  progress,
  savedCount,
  skippedCount,
  isComplete,
  onClose,
}: ImportProgressProps): React.ReactElement {
  const percent =
    progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0

  if (isComplete) {
    return (
      <div className={styles.container}>
        <div className={styles.completion}>
          <div className={styles.completionMessage}>
            {'\u2728 '}{savedCount}{'\u4EF6\u306E\u30D6\u30C3\u30AF\u30DE\u30FC\u30AF\u3092\u8FFD\u52A0\u3057\u307E\u3057\u305F\uFF01'}
          </div>

          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statValue}>{savedCount}</span>
              <span className={styles.statLabel}>{'\u4FDD\u5B58\u6E08\u307F'}</span>
            </div>
            {skippedCount > 0 && (
              <div className={styles.stat}>
                <span className={styles.statValue}>{skippedCount}</span>
                <span className={styles.statLabel}>{'\u30B9\u30AD\u30C3\u30D7'}</span>
              </div>
            )}
          </div>

          <button className={styles.closeButton} onClick={onClose} type="button">
            {'\u9589\u3058\u308B'}
          </button>
        </div>
      </div>
    )
  }

  const phaseText =
    progress.phase === 'saving'
      ? '\u4FDD\u5B58\u4E2D...'
      : '\u60C5\u5831\u3092\u53D6\u5F97\u4E2D...'

  return (
    <div className={styles.container}>
      <div className={styles.phaseText}>{phaseText}</div>

      <div className={styles.progressBarOuter}>
        <div className={styles.progressBarInner} style={{ width: `${percent}%` }} />
      </div>

      <div className={styles.counter}>
        <span className={styles.counterHighlight}>{progress.completed}</span>
        {' / '}
        {progress.total}
        {' \u4EF6\u5B8C\u4E86'}
      </div>
    </div>
  )
}
