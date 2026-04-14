'use client'

import type { BookmarkRecord } from '@/lib/storage/indexeddb'
import styles from './BookmarkCard.module.css'

/** Props for the BookmarkCard component */
type BookmarkCardProps = {
  /** The bookmark data to display */
  bookmark: BookmarkRecord
  /** Inline styles for positioning, rotation, etc. */
  style?: React.CSSProperties
  /** Card width in pixels (sets --card-width CSS variable) */
  width?: number
  /** Card height in pixels (reserved for future use) */
  height?: number
}

/**
 * Visual-first bookmark card.
 *
 * - When a thumbnail exists: shows the image prominently with title on hover.
 * - When no thumbnail: shows a large favicon with title and site name.
 */
export function BookmarkCard({ bookmark, style, width, height: _height }: BookmarkCardProps): React.ReactElement {
  const hasThumbnail = bookmark.thumbnail.length > 0

  const cardStyle: React.CSSProperties = {
    ...style,
    ...(width !== undefined ? { ['--card-width' as string]: `${width}px` } : {}),
  }

  return (
    <div className={styles.card} style={cardStyle}>
      {hasThumbnail ? (
        <>
          <div className={styles.thumbnailWrapper}>
            <img
              className={styles.thumbnail}
              src={bookmark.thumbnail}
              alt={bookmark.title}
              loading="lazy"
            />
            <div className={styles.overlay}>
              <span className={styles.overlayTitle}>{bookmark.title}</span>
            </div>
          </div>
          <div className={styles.info}>
            {bookmark.favicon && (
              <img
                className={styles.favicon}
                src={bookmark.favicon}
                alt=""
                loading="lazy"
              />
            )}
            <span className={styles.siteName}>
              {bookmark.siteName || new URL(bookmark.url).hostname}
            </span>
          </div>
        </>
      ) : (
        <>
          <div className={styles.noThumbBody}>
            {bookmark.favicon ? (
              <img
                className={styles.largeFavicon}
                src={bookmark.favicon}
                alt=""
                loading="lazy"
              />
            ) : (
              <div
                className={styles.largeFavicon}
                style={{
                  background: 'var(--color-bg-tertiary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 'var(--text-lg)',
                  color: 'var(--color-text-tertiary)',
                }}
              >
                🔗
              </div>
            )}
            <span className={styles.noThumbTitle}>
              {bookmark.title || bookmark.url}
            </span>
          </div>
          <div className={styles.info}>
            {bookmark.favicon && (
              <img
                className={styles.favicon}
                src={bookmark.favicon}
                alt=""
                loading="lazy"
              />
            )}
            <span className={styles.siteName}>
              {bookmark.siteName || new URL(bookmark.url).hostname}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
