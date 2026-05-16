'use client'

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useSearchParams } from 'next/navigation'
import { initDB, addBookmark } from '@/lib/storage/indexeddb'
import { detectUrlType } from '@/lib/utils/url'
import { postBookmarkSaved } from '@/lib/board/channel'
import { t } from '@/lib/i18n/t'
import styles from './SaveToast.module.css'

type State = 'saving' | 'saved' | 'recede' | 'error'

const ERROR_CLOSE_MS = 2600
// Bookmarklet popup is purely a bridge to write IDB in the {booklage,
// booklage} partition; visible feedback lives in the host-page toast that
// the bookmarklet IIFE injects. So we close the popup as fast as Chrome
// will allow after the IDB write completes.
const FAST_CLOSE_MS = 80

function StaggeredLabel({ text }: { text: string }): ReactElement {
  const chars = useMemo(() => Array.from(text), [text])
  return (
    <>
      {chars.map((ch, i) => (
        <span key={`${i}-${ch}`} style={{ animationDelay: `${i * 40}ms` }}>
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </>
  )
}

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
    const timers: ReturnType<typeof setTimeout>[] = []

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

        // Always fast-close. The bookmarklet IIFE injects a Shadow-DOM
        // toast into the user's host page (saving → saved → fade out)
        // that owns the visible feedback now. The popup is just a
        // bridge to write IDB in the {booklage, booklage} partition,
        // so it has no UI responsibility — keep it on screen as briefly
        // as Chrome will allow. Same closing path whether PiP is open
        // or not; PiP slide-in animation provides additional feedback
        // when present, parent toast covers the no-PiP case.
        timers.push(setTimeout(() => {
          try { window.close() } catch { /* browser blocked */ }
        }, FAST_CLOSE_MS))
      } catch {
        // Hard error path — keep the original error toast so the user
        // sees the failure even if their host page's toast was ephemeral.
        setState('error')
        timers.push(setTimeout(() => {
          try { window.close() } catch { /* ignore */ }
        }, ERROR_CLOSE_MS))
      }
    })()

    return () => { for (const tm of timers) clearTimeout(tm) }
  }, [url, title, desc, image, site, favicon])

  if (!url) {
    return (
      <div className={styles.stage} data-state="saving" data-testid="save-toast">
        <div className={styles.glow} />
        <div className={styles.center}>
          <div className={styles.indicator}>
            <div className={styles.ring} data-role="ring" />
          </div>
          <div className={styles.brand}>AllMarks</div>
          <div className={styles.label} aria-live="polite">
            <StaggeredLabel text="ブックマークレットから開いてください" />
          </div>
        </div>
      </div>
    )
  }

  const labelText =
    state === 'error' ? t('bookmarklet.toast.error') :
    state === 'saved' || state === 'recede' ? t('bookmarklet.toast.saved') :
    t('bookmarklet.toast.saving')

  const labelClass =
    state === 'saved' || state === 'recede' ? `${styles.label} ${styles.saved}` :
    state === 'error' ? `${styles.label} ${styles.error}` :
    styles.label

  const showImage = (state === 'saved' || state === 'recede') && image !== ''

  return (
    <div className={styles.stage} data-state={state} data-testid="save-toast">
      {showImage && (
        <img
          className={styles.bgThumb}
          src={image}
          alt=""
          aria-hidden="true"
          data-role="bg-thumb"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
      )}
      <div className={styles.glow} />
      <div className={styles.center}>
        <div className={styles.indicator}>
          {state === 'saving' && <div className={styles.ring} data-role="ring" />}
          {(state === 'saved' || state === 'recede') && (
            <svg
              className={styles.checkmark}
              viewBox="0 0 24 24"
              role="img"
              aria-label={t('bookmarklet.toast.saved')}
              data-role="checkmark"
            >
              <path d="M5 12 L10 17 L19 7" />
            </svg>
          )}
          {state === 'error' && (
            <div
              className={styles.errorMark}
              role="img"
              aria-label={t('bookmarklet.toast.error')}
              data-role="error-mark"
            >!</div>
          )}
        </div>
        <div className={styles.brand}>AllMarks</div>
        <div className={labelClass} aria-live="polite">
          <StaggeredLabel text={labelText} />
        </div>
      </div>
    </div>
  )
}
