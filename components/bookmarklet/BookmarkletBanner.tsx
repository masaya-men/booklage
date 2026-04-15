'use client'

import { useEffect, useRef } from 'react'
import { generateBookmarkletCode } from '@/lib/utils/bookmarklet'
import styles from './BookmarkletBanner.module.css'

/**
 * Small banner on the board page showing a draggable bookmarklet link.
 * User drags this link to their bookmark bar to install the bookmarklet.
 *
 * React 19 blocks `javascript:` URLs in href — even via refs.
 * We bypass React entirely by creating the <a> element with raw DOM API,
 * and compute the origin inside useEffect (client-side only) to avoid
 * SSR/hydration issues where window.location.origin is unavailable.
 */
export function BookmarkletBanner(): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Generate bookmarklet with the CURRENT origin (works on any deployment)
    const uri = generateBookmarkletCode(window.location.origin)

    container.innerHTML = ''

    const a = document.createElement('a')
    a.href = uri
    a.className = styles.dragLink
    a.title = 'ブックマークバーにドラッグしてください'
    a.textContent = 'Booklage'
    a.addEventListener('click', (e) => e.preventDefault())

    container.appendChild(a)
  }, [])

  return (
    <div className={styles.banner}>
      <div ref={containerRef} />
      <span className={styles.hint}>↑ ブックマークバーにドラッグ</span>
    </div>
  )
}
