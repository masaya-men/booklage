'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  initDB,
  addBookmark,
  addFolder,
  getAllFolders,
} from '@/lib/storage/indexeddb'
import type { FolderRecord } from '@/lib/storage/indexeddb'
import { detectUrlType } from '@/lib/utils/url'
import { FOLDER_COLORS } from '@/lib/constants'
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
  const [folders, setFolders] = useState<FolderRecord[]>([])
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [showNewFolder, setShowNewFolder] = useState(false)
  const dbRef = useRef<Awaited<ReturnType<typeof initDB>> | null>(null)

  // ── Init: load DB + folders ──
  useEffect(() => {
    if (!url) return
    let cancelled = false

    async function init(): Promise<void> {
      try {
        const db = await initDB()
        dbRef.current = db
        const allFolders = await getAllFolders(db)

        if (allFolders.length === 0) {
          const created = await addFolder(db, {
            name: 'My Collage',
            color: FOLDER_COLORS[5],
            order: 0,
          })
          if (!cancelled) {
            setFolders([created])
            setSelectedFolder(created.id)
          }
        } else {
          if (!cancelled) {
            setFolders(allFolders)
            setSelectedFolder(allFolders[0].id)
          }
        }
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

  // ── Create new folder ──
  const handleCreateFolder = useCallback(async (): Promise<void> => {
    const name = newFolderName.trim()
    if (!name || !dbRef.current) return

    const colorIndex = folders.length % FOLDER_COLORS.length
    const created = await addFolder(dbRef.current, {
      name,
      color: FOLDER_COLORS[colorIndex],
      order: folders.length,
    })
    const updated = await getAllFolders(dbRef.current)
    setFolders(updated)
    setSelectedFolder(created.id)
    setNewFolderName('')
    setShowNewFolder(false)
  }, [newFolderName, folders.length])

  // ── Save bookmark ──
  const handleSave = useCallback(async (): Promise<void> => {
    if (!dbRef.current || !selectedFolder || !url) return
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
        folderId: selectedFolder,
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
  }, [selectedFolder, url, title, desc, image, favicon, site])

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

      {/* ── Folder Selection ── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>フォルダを選択</div>

        {state === 'loading' ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-4)' }}>
            <div className={styles.spinner} />
          </div>
        ) : (
          <div className={styles.folderList}>
            {folders.map((folder) => (
              <div
                key={folder.id}
                className={
                  selectedFolder === folder.id
                    ? styles.folderItemSelected
                    : styles.folderItem
                }
                onClick={() => setSelectedFolder(folder.id)}
              >
                <div
                  className={styles.folderDot}
                  style={{ background: folder.color }}
                />
                <span className={styles.folderName}>{folder.name}</span>
              </div>
            ))}

            {showNewFolder ? (
              <div className={styles.newFolderRow}>
                <input
                  className={styles.newFolderInput}
                  type="text"
                  placeholder="フォルダ名"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleCreateFolder()
                  }}
                  autoFocus
                />
                <button
                  className={styles.newFolderBtn}
                  onClick={() => void handleCreateFolder()}
                  disabled={!newFolderName.trim()}
                >
                  作成
                </button>
              </div>
            ) : (
              <button
                className={styles.newFolderBtn}
                onClick={() => setShowNewFolder(true)}
              >
                + 新しいフォルダ
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Error ── */}
      {state === 'error' && (
        <div className={styles.error}>{errorMsg}</div>
      )}

      {/* ── Save Button ── */}
      <button
        className={styles.saveBtn}
        onClick={() => void handleSave()}
        disabled={state !== 'ready' || !selectedFolder}
      >
        {state === 'saving' && <div className={styles.spinner} />}
        {state === 'success' && <span className={styles.successIcon}>✓</span>}
        {state === 'saving' ? '保存中...' : state === 'success' ? '保存しました！' : '保存する'}
      </button>
    </div>
  )
}
