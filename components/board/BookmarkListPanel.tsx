'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { useLiquidGlass } from '@/lib/glass/use-liquid-glass'
import { Z_INDEX } from '@/lib/constants'
import type { BookmarkRecord, CardRecord, FolderRecord } from '@/lib/storage/indexeddb'
import styles from './BookmarkListPanel.module.css'

// ---------------------------------------------------------------------------
// Source icon mapping
// ---------------------------------------------------------------------------

const SOURCE_ICONS: Record<string, string> = {
  tweet: '𝕏',
  youtube: '▶',
  tiktok: '♪',
  instagram: '📷',
  website: '🔗',
}

/**
 * Extract the hostname from a URL for display.
 * Returns the hostname without "www." prefix, or the raw URL on failure.
 */
function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Props for BookmarkListPanel */
type BookmarkListPanelProps = {
  /** Whether the panel is currently visible */
  isOpen: boolean
  /** Called when the panel should close */
  onClose: () => void
  /** All bookmark+card pairs to display */
  items: Array<{ card: CardRecord; bookmark: BookmarkRecord }>
  /** Available folders */
  folders: FolderRecord[]
  /** Called when a bookmark item is clicked to navigate canvas */
  onNavigateToCard: (cardId: string, x: number, y: number) => void
  /** Called when the OGP retry button is clicked */
  onRetryOgp: (bookmarkId: string) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Slide-in side panel that lists all bookmarks grouped by folder.
 *
 * - Collapsible folder sections with color dots and counts.
 * - Click a bookmark to pan the canvas to its card.
 * - Failed OGP items show a pulsing red dot with retry action.
 * - GSAP-powered slide animation from the right edge.
 */
export function BookmarkListPanel({
  isOpen,
  onClose,
  items,
  folders,
  onNavigateToCard,
  onRetryOgp,
}: BookmarkListPanelProps): React.ReactElement {
  const panelRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())
  const glass = useLiquidGlass({ id: 'bookmark-list-panel', strength: 'strong', fixedSize: false })

  // ── Group items by folder ───────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, Array<{ card: CardRecord; bookmark: BookmarkRecord }>>()
    for (const item of items) {
      const folderId = item.bookmark.folderId
      if (!map.has(folderId)) {
        map.set(folderId, [])
      }
      map.get(folderId)!.push(item)
    }
    return map
  }, [items])

  // ── Folder lookup ───────────────────────────────────────────
  const folderMap = useMemo(() => {
    const map = new Map<string, FolderRecord>()
    for (const folder of folders) {
      map.set(folder.id, folder)
    }
    return map
  }, [folders])

  // ── Sorted folder IDs (by folder order, ungrouped last) ─────
  const sortedFolderIds = useMemo(() => {
    const ids = Array.from(grouped.keys())
    return ids.sort((a, b) => {
      const fa = folderMap.get(a)
      const fb = folderMap.get(b)
      return (fa?.order ?? Infinity) - (fb?.order ?? Infinity)
    })
  }, [grouped, folderMap])

  // ── GSAP slide animation ────────────────────────────────────
  useEffect(() => {
    const panel = panelRef.current
    const backdrop = backdropRef.current
    if (!panel || !backdrop) return

    if (isOpen) {
      // Slide in
      gsap.set(panel, { x: '100%' })
      gsap.to(panel, {
        x: 0,
        duration: 0.4,
        ease: 'expo.out',
      })
      gsap.to(backdrop, {
        opacity: 1,
        duration: 0.3,
        ease: 'power2.out',
      })
    } else {
      // Slide out
      gsap.to(panel, {
        x: '100%',
        duration: 0.3,
        ease: 'power2.in',
      })
      gsap.to(backdrop, {
        opacity: 0,
        duration: 0.25,
        ease: 'power2.in',
      })
    }
  }, [isOpen])

  // ── Toggle folder collapse ──────────────────────────────────
  const toggleFolder = useCallback((folderId: string): void => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
  }, [])

  // ── Handle bookmark click ──────────────────────────────────
  const handleItemClick = useCallback(
    (card: CardRecord): void => {
      onNavigateToCard(card.id, card.x, card.y)
    },
    [onNavigateToCard],
  )

  // ── Handle OGP retry (stop propagation to avoid navigation) ──
  const handleRetry = useCallback(
    (e: React.MouseEvent, bookmarkId: string): void => {
      e.stopPropagation()
      onRetryOgp(bookmarkId)
    },
    [onRetryOgp],
  )

  // ── Handle backdrop click ──────────────────────────────────
  const handleBackdropClick = useCallback((): void => {
    onClose()
  }, [onClose])

  return (
    <>
      {/* Backdrop overlay */}
      <div
        ref={backdropRef}
        className={styles.backdrop}
        style={{
          zIndex: Z_INDEX.LIST_PANEL - 1,
          pointerEvents: isOpen ? 'auto' : 'none',
          opacity: 0,
        }}
        onClick={handleBackdropClick}
        role="presentation"
      />

      {/* Panel */}
      <div
        ref={(el) => {
          // Merge GSAP ref and liquid glass ref
          (panelRef as React.MutableRefObject<HTMLDivElement | null>).current = el
          glass.ref(el)
        }}
        className={`${styles.panel} ${glass.className}`}
        style={{
          ...glass.style,
          zIndex: Z_INDEX.LIST_PANEL,
        }}
        role="complementary"
        aria-label="ブックマーク一覧"
      >
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>ブックマーク一覧</h2>
          <button
            className={styles.closeButton}
            onClick={onClose}
            type="button"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {items.length === 0 ? (
            <div className={styles.empty}>ブックマークがありません</div>
          ) : (
            sortedFolderIds.map((folderId) => {
              const folder = folderMap.get(folderId)
              const folderItems = grouped.get(folderId) ?? []
              const isCollapsed = collapsedFolders.has(folderId)

              return (
                <div key={folderId} className={styles.folderGroup}>
                  {/* Folder header */}
                  <button
                    className={styles.folderHeader}
                    onClick={() => toggleFolder(folderId)}
                    type="button"
                  >
                    <span className={isCollapsed ? styles.chevron : styles.chevronOpen}>
                      ▸
                    </span>
                    <span
                      className={styles.folderDot}
                      style={{ backgroundColor: folder?.color ?? '#868e96' }}
                    />
                    <span className={styles.folderName}>
                      {folder?.name ?? '不明なフォルダ'}
                    </span>
                    <span className={styles.folderCount}>{folderItems.length}</span>
                  </button>

                  {/* Folder items (collapsible) */}
                  {!isCollapsed && (
                    <div className={styles.folderItems}>
                      {folderItems.map(({ card, bookmark }) => (
                        <button
                          key={card.id}
                          className={styles.bookmarkItem}
                          onClick={() => handleItemClick(card)}
                          type="button"
                        >
                          {/* Thumbnail */}
                          {bookmark.thumbnail ? (
                            <img
                              className={styles.thumbnail}
                              src={bookmark.thumbnail}
                              alt=""
                              loading="lazy"
                            />
                          ) : (
                            <div className={styles.thumbnailFallback}>
                              {SOURCE_ICONS[bookmark.type] ?? '🔗'}
                            </div>
                          )}

                          {/* Info */}
                          <div className={styles.bookmarkInfo}>
                            <span className={styles.bookmarkTitle}>
                              {bookmark.title || bookmark.url}
                            </span>
                            <div className={styles.bookmarkMeta}>
                              <span className={styles.sourceIcon}>
                                {SOURCE_ICONS[bookmark.type] ?? '🔗'}
                              </span>
                              <span className={styles.hostname}>
                                {getHostname(bookmark.url)}
                              </span>
                            </div>
                          </div>

                          {/* OGP failed indicator */}
                          {bookmark.ogpStatus === 'failed' && (
                            <span
                              className={styles.failedDot}
                              onClick={(e) => handleRetry(e, bookmark.id)}
                              role="button"
                              tabIndex={0}
                              aria-label="OGP情報を再取得"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.stopPropagation()
                                  onRetryOgp(bookmark.id)
                                }
                              }}
                            />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </>
  )
}
