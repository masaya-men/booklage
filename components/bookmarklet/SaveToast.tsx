'use client'

import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useSearchParams } from 'next/navigation'
import { initDB, addBookmark } from '@/lib/storage/indexeddb'
import { detectUrlType } from '@/lib/utils/url'
import { postBookmarkSaved } from '@/lib/board/channel'
import { t } from '@/lib/i18n/t'
import styles from './SaveToast.module.css'

type State = 'saving' | 'saved' | 'error'

/**
 * Reset the global Booklage body/html styling for the duration of the
 * bookmarklet popup window. The popup inherits the app shell's dark
 * canvas background and flex-column min-height, which would otherwise
 * paint a "frame" around the toast pill. By making body/html transparent
 * + zero-margin, the pill floats on the popup's native window background
 * with no visible chrome.
 */
function useTransparentPopupShell(): void {
  useEffect(() => {
    if (typeof document === 'undefined') return
    const body = document.body
    const html = document.documentElement
    const prev = {
      bodyMinHeight: body.style.minHeight,
      bodyDisplay: body.style.display,
      bodyBackground: body.style.background,
      bodyMargin: body.style.margin,
      bodyPadding: body.style.padding,
      htmlBackground: html.style.background,
      htmlMargin: html.style.margin,
    }
    body.style.minHeight = '0'
    body.style.display = 'block'
    body.style.background = 'transparent'
    body.style.margin = '0'
    body.style.padding = '0'
    html.style.background = 'transparent'
    html.style.margin = '0'
    return (): void => {
      body.style.minHeight = prev.bodyMinHeight
      body.style.display = prev.bodyDisplay
      body.style.background = prev.bodyBackground
      body.style.margin = prev.bodyMargin
      body.style.padding = prev.bodyPadding
      html.style.background = prev.htmlBackground
      html.style.margin = prev.htmlMargin
    }
  }, [])
}

export function SaveToast(): ReactElement {
  useTransparentPopupShell()

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
        // Hold the spinner ~600ms so the success state never just flashes
        // by — even on instant saves the user gets a beat to register the
        // pill before it dismisses.
        timer = setTimeout(() => setState('saved'), 600)
        closeTimer = setTimeout(() => {
          try { window.close() } catch { /* browser blocked */ }
        }, 1800)
      } catch {
        setState('error')
        closeTimer = setTimeout(() => {
          try { window.close() } catch { /* ignore */ }
        }, 2600)
      }
    })()

    return () => {
      if (timer) clearTimeout(timer)
      if (closeTimer) clearTimeout(closeTimer)
    }
  }, [url, title, desc, image, site, favicon])

  // No-URL fallback (popup opened without query params).
  if (!url) {
    return (
      <div className={styles.container} data-state="no-url">
        <div className={styles.pill}>
          <span className={styles.icon} aria-hidden="true">
            <span className={styles.spinner} style={{ borderTopColor: 'transparent', borderColor: 'rgba(255,255,255,0.24)' }} />
          </span>
          <span className={styles.text}>
            <span className={styles.brand}>Booklage</span>
            <span className={styles.sep}>·</span>
            <span className={styles.label}>ブックマークレットから開いてください</span>
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container} data-state={state} data-testid="save-toast">
      <div className={styles.pill}>
        <span className={styles.icon} aria-hidden="true">
          {state === 'saving' && <span className={styles.spinner} />}
          {state === 'saved' && (
            <span className={styles.checkmark} role="img" aria-label={t('bookmarklet.toast.saved')}>
              <svg width="10" height="10" viewBox="0 0 14 14" aria-hidden="true">
                <path d="M3 7 L6 10 L11 4" />
              </svg>
            </span>
          )}
          {state === 'error' && (
            <span className={styles.errorIcon} role="img" aria-label={t('bookmarklet.toast.error')}>!</span>
          )}
        </span>
        <span className={styles.text}>
          <span className={styles.brand}>Booklage</span>
          <span className={styles.sep}>·</span>
          <span className={`${styles.label} ${state === 'saved' ? styles.saved : ''} ${state === 'error' ? styles.error : ''}`.trim()}>
            {state === 'saving' && t('bookmarklet.toast.saving')}
            {state === 'saved' && t('bookmarklet.toast.saved')}
            {state === 'error' && t('bookmarklet.toast.error')}
          </span>
        </span>
      </div>
    </div>
  )
}
