'use client'

import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useSearchParams } from 'next/navigation'
import { initDB, addBookmark } from '@/lib/storage/indexeddb'
import { detectUrlType } from '@/lib/utils/url'
import { postBookmarkSaved } from '@/lib/board/channel'
import { t } from '@/lib/i18n/t'
import styles from './SaveToast.module.css'

type State = 'saving' | 'saved' | 'error'

export function SaveToast(): ReactElement {
  const params = useSearchParams()
  const url = params.get('url') ?? ''
  const title = params.get('title') || url
  const desc = params.get('desc') ?? ''
  const image = params.get('image') ?? ''
  const site = params.get('site') ?? ''
  const favicon = params.get('favicon') ?? ''

  const [state, setState] = useState<State>('saving')
  const savedRef = useRef(false)

  useEffect(() => {
    if (!url || savedRef.current) return
    savedRef.current = true
    let timer: ReturnType<typeof setTimeout> | null = null
    let closeTimer: ReturnType<typeof setTimeout> | null = null

    ;(async (): Promise<void> => {
      try {
        const db = await initDB()
        const bm = await addBookmark(db, {
          url,
          title,
          description: desc,
          thumbnail: image,
          favicon,
          siteName: site,
          type: detectUrlType(url),
          tags: [],
        })
        postBookmarkSaved({ bookmarkId: bm.id })
        // Hold spinner visually for at least ~800ms to avoid flash on fast machines,
        // then transition to saved state.
        timer = setTimeout(() => setState('saved'), 800)
        closeTimer = setTimeout(() => {
          try { window.close() } catch { /* browser blocked */ }
        }, 2300)
      } catch {
        setState('error')
        closeTimer = setTimeout(() => {
          try { window.close() } catch { /* ignore */ }
        }, 3000)
      }
    })()

    return () => {
      if (timer) clearTimeout(timer)
      if (closeTimer) clearTimeout(closeTimer)
    }
  }, [url, title, desc, image, site, favicon])

  // No-URL fallback
  if (!url) {
    return (
      <div className={styles.container} data-state="no-url">
        <div className={styles.icon}>📌</div>
        <div className={styles.body}>
          <span className={styles.brand}>Booklage</span>
          <span className={styles.label}>ブックマークレットから開いてください</span>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container} data-state={state} data-testid="save-toast">
      <div className={styles.icon}>
        {state === 'saving' && <div className={styles.spinner} aria-hidden />}
        {state === 'saved' && (
          <div className={styles.checkmark} role="img" aria-label={t('bookmarklet.toast.saved')}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M3 7 L6 10 L11 4" /></svg>
          </div>
        )}
        {state === 'error' && <div className={styles.errorIcon} role="img" aria-label={t('bookmarklet.toast.error')}>✗</div>}
      </div>
      <div className={styles.body}>
        <span className={styles.brand}>Booklage</span>
        <span className={`${styles.label} ${state === 'saved' ? styles.saved : ''} ${state === 'error' ? styles.error : ''}`.trim()}>
          {state === 'saving' && t('bookmarklet.toast.saving')}
          {state === 'saved' && t('bookmarklet.toast.saved')}
          {state === 'error' && t('bookmarklet.toast.error')}
        </span>
      </div>
    </div>
  )
}
