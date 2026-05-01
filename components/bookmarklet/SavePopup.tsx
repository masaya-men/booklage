'use client'

// TODO(Task 9): replaced by SaveToast — this file is a stub that keeps the
// /save route compiling between Tasks 2 and 9. Folder/mood selection has been
// removed; bookmarks are saved into the Inbox (tags: []) for now.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { initDB, addBookmark } from '@/lib/storage/indexeddb'
import { detectUrlType } from '@/lib/utils/url'
import styles from './SavePopup.module.css'

type SaveState = 'loading' | 'ready' | 'saving' | 'success' | 'error'

export function SavePopup(): React.ReactElement {
  const params = useSearchParams()
  const url = params.get('url')
  const title = params.get('title') || url || ''
  const desc = params.get('desc') || ''
  const image = params.get('image') || ''
  const site = params.get('site') || ''
  const favicon = params.get('favicon') || ''

  const [state, setState] = useState<SaveState>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const dbRef = useRef<Awaited<ReturnType<typeof initDB>> | null>(null)

  // ── Init: load DB ──
  useEffect(() => {
    if (!url) return
    let cancelled = false

    async function init(): Promise<void> {
      try {
        const db = await initDB()
        dbRef.current = db
        if (!cancelled) setState('ready')
      } catch {
        if (!cancelled) {
          setState('error')
          setErrorMsg('データベースの初期化に失敗しました')
        }
      }
    }

    void init()
    return () => { cancelled = true }
  }, [url])

  // ── Save bookmark ──
  const handleSave = useCallback(async (): Promise<void> => {
    if (!dbRef.current || !url) return
    setState('saving')

    try {
      const urlType = detectUrlType(url)
      await addBookmark(dbRef.current, {
        url,
        title,
        description: desc,
        thumbnail: image,
        favicon,
        siteName: site,
        type: urlType,
        tags: [],
      })

      setState('success')

      // Notify the board page to reload items (no manual refresh needed)
      try {
        const channel = new BroadcastChannel('booklage')
        channel.postMessage({ type: 'bookmark-saved' })
        channel.close()
      } catch { /* BroadcastChannel not supported — fallback to manual refresh */ }

      setTimeout(() => { window.close() }, 1500)
    } catch {
      setState('error')
      setErrorMsg('保存に失敗しました。もう一度お試しください。')
    }
  }, [url, title, desc, image, favicon, site])

  // ── No URL param → show instructions ──
  if (!url) {
    return (
      <div className={styles.noParams}>
        <div style={{ fontSize: 'var(--text-2xl)' }}>📌</div>
        <p>このページはブックマークレットから開いてください</p>
        <p style={{ fontSize: 'var(--text-xs)' }}>
          保存したいサイトでブックマークレットをクリックすると、<br />
          このウィンドウが自動的に開きます
        </p>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <span>📌</span>
        <span>Booklage に保存</span>
      </div>

      {/* ── Preview Card ── */}
      <div className={styles.preview}>
        {image && (
          <img
            className={styles.previewImage}
            src={image}
            alt={title}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        )}
        <div className={styles.previewBody}>
          <div className={styles.previewTitle}>{title}</div>
          <div className={styles.previewMeta}>
            {favicon && (
              <img
                className={styles.previewFavicon}
                src={favicon}
                alt=""
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            )}
            <span>{site || new URL(url).hostname}</span>
          </div>
        </div>
      </div>

      {/* ── Error ── */}
      {state === 'error' && (
        <div className={styles.error}>{errorMsg}</div>
      )}

      {/* ── Save Button ── */}
      <button
        className={styles.saveBtn}
        onClick={() => void handleSave()}
        disabled={state !== 'ready'}
      >
        {state === 'saving' && <div className={styles.spinner} />}
        {state === 'success' && <span className={styles.successIcon}>✓</span>}
        {state === 'saving' ? '保存中...' : state === 'success' ? '保存しました！' : '保存する'}
      </button>
    </div>
  )
}
