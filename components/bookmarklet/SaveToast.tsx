'use client'

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useSearchParams } from 'next/navigation'
import { initDB, addBookmark } from '@/lib/storage/indexeddb'
import { detectUrlType } from '@/lib/utils/url'
import { postBookmarkSaved } from '@/lib/board/channel'
import { queryPipPresence } from '@/lib/board/pip-presence'
import { t } from '@/lib/i18n/t'
import styles from './SaveToast.module.css'

type State = 'saving' | 'saved' | 'recede' | 'error'

const SAVING_HOLD_MS = 600
const SAVED_VISIBLE_MS = 1250
const RECEDE_DURATION_MS = 250
const ERROR_CLOSE_MS = 2600
// When PiP is active in another booklage client, the new card slides into
// PiP — that's the user's feedback. We close the popup as fast as possible
// after the IDB write to minimise the visual flash of popup-behind-PiP.
const PIP_FAST_CLOSE_MS = 80

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
        // Probe PiP presence in parallel with the IDB write so the close
        // decision is ready by the time save completes. 80ms is generous
        // for in-realm BroadcastChannel round-trip (<1ms typical).
        const pipPresencePromise = queryPipPresence(80)

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

        const isPipActive = await pipPresencePromise

        if (isPipActive) {
          // PiP is showing the user's collage in real-time; the new card
          // sliding in IS the save feedback. Close the popup ASAP so it
          // barely shows behind PiP. No toast animation needed.
          timers.push(setTimeout(() => {
            try { window.close() } catch { /* browser blocked */ }
          }, PIP_FAST_CLOSE_MS))
          return
        }

        // Fallback: PiP not open. Show the full save-toast animation so the
        // user gets visible confirmation that the save succeeded.
        timers.push(setTimeout(() => setState('saved'), SAVING_HOLD_MS))
        timers.push(setTimeout(() => setState('recede'), SAVING_HOLD_MS + SAVED_VISIBLE_MS))
        timers.push(setTimeout(() => {
          try { window.close() } catch { /* browser blocked */ }
        }, SAVING_HOLD_MS + SAVED_VISIBLE_MS + RECEDE_DURATION_MS))
      } catch {
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
          <div className={styles.brand}>Booklage</div>
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
        <div className={styles.brand}>Booklage</div>
        <div className={labelClass} aria-live="polite">
          <StaggeredLabel text={labelText} />
        </div>
      </div>
    </div>
  )
}
