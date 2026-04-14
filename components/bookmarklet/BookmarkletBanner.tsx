'use client'

import { useMemo } from 'react'
import { generateBookmarkletCode } from '@/lib/utils/bookmarklet'
import { APP_URL } from '@/lib/constants'
import styles from './BookmarkletBanner.module.css'

/**
 * Small banner on the board page showing a draggable bookmarklet link.
 * User drags this link to their bookmark bar to install the bookmarklet.
 */
export function BookmarkletBanner(): React.ReactElement {
  const bookmarkletUri = useMemo(() => generateBookmarkletCode(APP_URL), [])

  return (
    <div className={styles.banner}>
      <a
        className={styles.dragLink}
        href={bookmarkletUri}
        onClick={(e) => e.preventDefault()}
        title="ブックマークバーにドラッグしてください"
      >
        📌 Booklage に保存
      </a>
      <span className={styles.hint}>↑ ブックマークバーにドラッグ</span>
    </div>
  )
}
