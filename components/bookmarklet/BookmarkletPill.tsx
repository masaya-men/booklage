'use client'

import { useEffect, useRef, useState, type ReactElement } from 'react'
import { generateBookmarkletUri } from '@/lib/utils/bookmarklet'
import styles from './BookmarkletPill.module.css'

/**
 * Always-visible bookmarklet drag-target pinned to the bottom-left of the
 * board's outer margin. The href is the real `javascript:` URI, so users
 * can drag the pill straight into their browser bookmark bar — no modal
 * step required. Click is suppressed because executing the IIFE on the
 * board page itself would just open a save popup pointing at /board.
 *
 * Provisional placement for an early-tester onboarding flow; revisit once
 * the marketing page handles bookmarklet install on its own.
 */
export function BookmarkletPill(): ReactElement | null {
  const linkRef = useRef<HTMLAnchorElement>(null)
  const [appUrl, setAppUrl] = useState<string>('')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAppUrl(window.location.origin)
    }
  }, [])

  // React 19 blocks `javascript:` URLs in href, so set via DOM after mount.
  useEffect(() => {
    if (appUrl && linkRef.current) {
      linkRef.current.setAttribute('href', generateBookmarkletUri(appUrl))
    }
  }, [appUrl])

  if (!appUrl) return null

  return (
    <a
      ref={linkRef}
      className={styles.pill}
      draggable="true"
      onClick={(e): void => e.preventDefault()}
      title="ブックマークバーにドラッグして設置 / Drag to your bookmark bar"
      data-testid="bookmarklet-pill"
    >
      <span className={styles.icon} aria-hidden="true">📌</span>
      <span className={styles.label}>Booklage</span>
      <span className={styles.hint}>↤ Drag me</span>
    </a>
  )
}
