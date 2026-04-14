'use client'

import { useEffect, useMemo, useRef } from 'react'
import { generateBookmarkletCode } from '@/lib/utils/bookmarklet'
import { APP_URL } from '@/lib/constants'
import styles from './BookmarkletBanner.module.css'

/**
 * Small banner on the board page showing a draggable bookmarklet link.
 * User drags this link to their bookmark bar to install the bookmarklet.
 *
 * React 19 blocks `javascript:` URLs in href attributes as a security measure.
 * We bypass this by setting the href directly on the DOM element via a ref.
 */
export function BookmarkletBanner(): React.ReactElement {
  const bookmarkletUri = useMemo(() => generateBookmarkletCode(APP_URL), [])
  const linkRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    if (linkRef.current) {
      linkRef.current.href = bookmarkletUri
    }
  }, [bookmarkletUri])

  return (
    <div className={styles.banner}>
      <a
        ref={linkRef}
        className={styles.dragLink}
        href="#bookmarklet"
        onClick={(e) => e.preventDefault()}
        title="ブックマークバーにドラッグしてください"
      >
        📌 Booklage に保存
      </a>
      <span className={styles.hint}>↑ ブックマークバーにドラッグ</span>
    </div>
  )
}
