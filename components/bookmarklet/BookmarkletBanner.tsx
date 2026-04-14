'use client'

import { useEffect, useMemo, useRef } from 'react'
import { generateBookmarkletCode } from '@/lib/utils/bookmarklet'
import { APP_URL } from '@/lib/constants'
import styles from './BookmarkletBanner.module.css'

/**
 * Small banner on the board page showing a draggable bookmarklet link.
 * User drags this link to their bookmark bar to install the bookmarklet.
 *
 * React 19 blocks `javascript:` URLs in href — even via refs.
 * We bypass React entirely by creating the <a> element with raw DOM API.
 */
export function BookmarkletBanner(): React.ReactElement {
  // Use current origin so the bookmarklet works on any deployment (not hardcoded localhost)
  const bookmarkletUri = useMemo(
    () => (typeof window !== 'undefined' ? generateBookmarkletCode(window.location.origin) : ''),
    [],
  )
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Remove any existing link (in case of re-render)
    container.innerHTML = ''

    // Create <a> entirely outside React so javascript: href is not sanitized
    const a = document.createElement('a')
    a.href = bookmarkletUri
    a.className = styles.dragLink
    a.title = 'ブックマークバーにドラッグしてください'
    a.textContent = 'Booklage'
    a.addEventListener('click', (e) => e.preventDefault())

    container.appendChild(a)
  }, [bookmarkletUri])

  return (
    <div className={styles.banner}>
      <div ref={containerRef} />
      <span className={styles.hint}>↑ ブックマークバーにドラッグ</span>
    </div>
  )
}
