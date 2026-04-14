# S5: ブックマークレットUI 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ユーザーが任意のWebサイトからワンクリックでBooklageにブックマークを保存できるブックマークレットを実装する

**Architecture:** ブックマークレットJS URIが外部サイト上でOGPメタタグを読み取り、Booklageの `/save` ページを小さなポップアップウィンドウで開く。ポップアップ内でフォルダ選択→IndexedDB保存→自動クローズ。全てクライアントサイドで完結（サーバー不要）。

**Tech Stack:** Next.js App Router, TypeScript, IndexedDB (idb), CSS Modules, 既存のCSS変数

**Spec:** `docs/superpowers/specs/2026-04-14-s5-bookmarklet.md`

---

## ファイル構成

| ファイル | 操作 | 責務 |
|---------|------|------|
| `lib/utils/bookmarklet.ts` | 改修 | OGP抽出+window.openをインラインで埋め込むJS URI生成 |
| `app/(app)/save/page.tsx` | 新規 | /save ルートのServer Component（SavePopupを読み込む） |
| `components/bookmarklet/SavePopup.tsx` | 新規 | ポップアップUI本体（フォルダ選択、プレビュー、保存処理） |
| `components/bookmarklet/SavePopup.module.css` | 新規 | ポップアップのスタイル |
| `components/bookmarklet/BookmarkletBanner.tsx` | 新規 | boardページ内の「ブックマークレットを入手」UI |
| `components/bookmarklet/BookmarkletBanner.module.css` | 新規 | バナーのスタイル |
| `app/(app)/board/board-client.tsx` | 改修 | BookmarkletBannerを配置 |
| `tests/lib/bookmarklet.test.ts` | 改修 | 新しいbookmarklet生成ロジックのテスト更新 |

---

## Task 1: ブックマークレットJS URI生成の改修

`lib/utils/bookmarklet.ts` を改修。外部スクリプト読み込み方式から、OGP抽出+window.openをインラインで埋め込む方式に変更。

**Files:**
- Modify: `lib/utils/bookmarklet.ts`
- Modify: `tests/lib/bookmarklet.test.ts`

- [ ] **Step 1: テストを更新**

```typescript
// tests/lib/bookmarklet.test.ts
import { describe, it, expect } from 'vitest'
import { generateBookmarkletCode } from '@/lib/utils/bookmarklet'

describe('generateBookmarkletCode', () => {
  const appUrl = 'https://booklage.com'

  it('starts with javascript: protocol', () => {
    const code = generateBookmarkletCode(appUrl)
    expect(code.startsWith('javascript:')).toBe(true)
  })

  it('contains the app URL for /save route', () => {
    const code = generateBookmarkletCode(appUrl)
    const decoded = decodeURIComponent(code)
    expect(decoded).toContain('booklage.com/save')
  })

  it('contains OGP extraction logic', () => {
    const code = generateBookmarkletCode(appUrl)
    const decoded = decodeURIComponent(code)
    expect(decoded).toContain('og:title')
    expect(decoded).toContain('og:image')
    expect(decoded).toContain('og:description')
  })

  it('contains window.open call', () => {
    const code = generateBookmarkletCode(appUrl)
    const decoded = decodeURIComponent(code)
    expect(decoded).toContain('window.open')
  })

  it('has no spaces (URL-safe)', () => {
    const code = generateBookmarkletCode(appUrl)
    // After javascript: prefix, should be URI-encoded
    const body = code.slice('javascript:'.length)
    expect(body).not.toContain(' ')
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/lib/bookmarklet.test.ts`
Expected: 一部のテストがFAIL（og:title, window.open のチェックなど）

- [ ] **Step 3: bookmarklet.ts を改修**

```typescript
// lib/utils/bookmarklet.ts

/**
 * Generates a bookmarklet JavaScript URI.
 *
 * When executed on any website, it:
 * 1. Reads OGP meta tags from the current page
 * 2. Falls back to document.title, favicon, hostname
 * 3. Opens Booklage /save in a popup window with OGP data as URL params
 */
export function generateBookmarkletCode(appUrl: string): string {
  // Remove trailing slash from appUrl
  const base = appUrl.replace(/\/$/, '')

  const script = `
    (function(){
      var d=document;
      var m=function(p){
        var el=d.querySelector('meta[property="'+p+'"]');
        return el?el.getAttribute('content')||'':'';
      };
      var mn=function(n){
        var el=d.querySelector('meta[name="'+n+'"]');
        return el?el.getAttribute('content')||'':'';
      };
      var fi=(function(){
        var l=d.querySelector('link[rel="icon"]')||d.querySelector('link[rel="shortcut icon"]');
        return l?l.href:location.origin+'/favicon.ico';
      })();
      var p=new URLSearchParams();
      p.set('url',location.href);
      p.set('title',m('og:title')||d.title);
      p.set('desc',(m('og:description')||mn('description')).slice(0,200));
      p.set('image',m('og:image'));
      p.set('site',m('og:site_name')||location.hostname);
      p.set('favicon',fi);
      window.open(
        '${base}/save?'+p.toString(),
        'booklage-save',
        'width=480,height=600,scrollbars=yes'
      );
    })();
  `.replace(/\s+/g, ' ').trim()

  return `javascript:${encodeURIComponent(script)}`
}
```

- [ ] **Step 4: テストが全てパスすることを確認**

Run: `npx vitest run tests/lib/bookmarklet.test.ts`
Expected: ALL PASS

- [ ] **Step 5: コミット**

```bash
git add lib/utils/bookmarklet.ts tests/lib/bookmarklet.test.ts
git commit -m "feat(bookmarklet): rewrite URI generation with inline OGP extraction"
```

---

## Task 2: /save ページルートの作成

Server Componentとして `/save` ルートを作成。Client ComponentのSavePopupを読み込むだけのシンプルなページ。

**Files:**
- Create: `app/(app)/save/page.tsx`

- [ ] **Step 1: ページファイルを作成**

```tsx
// app/(app)/save/page.tsx
import { Suspense } from 'react'
import { SavePopup } from '@/components/bookmarklet/SavePopup'

/**
 * Bookmarklet save popup page.
 * Opened in a small popup window by the bookmarklet.
 * Receives OGP data via URL search params.
 */
export default function SavePage(): React.ReactElement {
  return (
    <Suspense fallback={<div style={{ padding: 24, textAlign: 'center' }}>読み込み中...</div>}>
      <SavePopup />
    </Suspense>
  )
}
```

- [ ] **Step 2: TypeScriptチェック**

Run: `npx tsc --noEmit`
Expected: SavePopupがまだないのでエラー（Task 3で解消）

---

## Task 3: SavePopup コンポーネント（ポップアップUI本体）

ブックマークレットのメイン機能。URLパラメータ受け取り → プレビュー → フォルダ選択 → IndexedDB保存 → 自動クローズ。

**Files:**
- Create: `components/bookmarklet/SavePopup.tsx`
- Create: `components/bookmarklet/SavePopup.module.css`

- [ ] **Step 1: CSSモジュールを作成**

```css
/* components/bookmarklet/SavePopup.module.css */

.container {
  max-width: 480px;
  margin: 0 auto;
  padding: var(--space-5);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  font-family: var(--font-body);
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
}

/* ── Header ── */

.header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--color-glass-border);
  font-family: var(--font-heading);
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
}

/* ── Preview Card ── */

.preview {
  margin-top: var(--space-4);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-card-border);
  background: var(--color-card-bg);
  overflow: hidden;
}

.previewImage {
  width: 100%;
  aspect-ratio: 1.91 / 1;
  object-fit: cover;
  display: block;
  background: var(--color-bg-tertiary);
}

.previewBody {
  padding: var(--space-3);
}

.previewTitle {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  line-height: var(--leading-tight);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.previewMeta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-2);
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
}

.previewFavicon {
  width: 14px;
  height: 14px;
  border-radius: 2px;
}

/* ── Folder Selection ── */

.section {
  margin-top: var(--space-5);
}

.sectionTitle {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text-secondary);
  margin-bottom: var(--space-3);
}

.folderList {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.folderItem {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  cursor: pointer;
  transition: background var(--duration-fast) ease, border-color var(--duration-fast) ease;
}

.folderItem:hover {
  background: var(--color-glass-bg-hover);
}

.folderItemSelected {
  composes: folderItem;
  background: var(--color-glass-bg);
  border-color: var(--color-accent-primary);
}

.folderDot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.folderName {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
}

/* ── New Folder Inline ── */

.newFolderRow {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.newFolderInput {
  flex: 1;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-glass-border);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  font-size: var(--text-sm);
  font-family: var(--font-body);
  outline: none;
}

.newFolderInput:focus {
  border-color: var(--color-accent-primary);
}

.newFolderBtn {
  padding: var(--space-2) var(--space-3);
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  cursor: pointer;
  white-space: nowrap;
}

.newFolderBtn:hover {
  background: var(--color-glass-bg-hover);
  color: var(--color-text-primary);
}

/* ── Save Button ── */

.saveBtn {
  margin-top: auto;
  padding: var(--space-3) var(--space-5);
  border: none;
  border-radius: var(--radius-lg);
  background: var(--color-accent-primary);
  color: #fff;
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  font-family: var(--font-heading);
  cursor: pointer;
  transition: background var(--duration-fast) ease, transform var(--duration-fast) ease;
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
}

.saveBtn:hover:not(:disabled) {
  background: var(--color-accent-primary-hover);
  transform: translateY(-1px);
}

.saveBtn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ── States ── */

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.successIcon {
  font-size: var(--text-xl);
  animation: popIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes popIn {
  0% { transform: scale(0); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

.error {
  margin-top: var(--space-4);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: rgba(255, 107, 107, 0.1);
  border: 1px solid var(--color-accent-danger);
  color: var(--color-accent-danger);
  font-size: var(--text-sm);
  text-align: center;
}

.noParams {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  gap: var(--space-4);
  text-align: center;
  color: var(--color-text-secondary);
}
```

- [ ] **Step 2: SavePopup コンポーネントを作成**

```tsx
// components/bookmarklet/SavePopup.tsx
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
      setTimeout(() => { window.close() }, 2000)
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
```

- [ ] **Step 3: TypeScriptチェック**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add app/(app)/save/page.tsx components/bookmarklet/SavePopup.tsx components/bookmarklet/SavePopup.module.css
git commit -m "feat(bookmarklet): add /save popup page with folder selection and IndexedDB save"
```

---

## Task 4: ブックマークレット取得バナー

boardページ内にブックマークレットをブックマークバーにドラッグして登録できるUIを追加。

**Files:**
- Create: `components/bookmarklet/BookmarkletBanner.tsx`
- Create: `components/bookmarklet/BookmarkletBanner.module.css`
- Modify: `app/(app)/board/board-client.tsx`

- [ ] **Step 1: CSSモジュールを作成**

```css
/* components/bookmarklet/BookmarkletBanner.module.css */

.banner {
  position: fixed;
  bottom: 60px;
  left: var(--space-4);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  z-index: 60;
}

.dragLink {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-lg);
  background: var(--color-accent-primary);
  color: #fff;
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  font-family: var(--font-heading);
  text-decoration: none;
  cursor: grab;
  user-select: none;
  transition: background var(--duration-fast) ease, transform var(--duration-fast) ease;
  box-shadow: 0 4px 12px rgba(124, 92, 252, 0.3);
}

.dragLink:hover {
  background: var(--color-accent-primary-hover);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(124, 92, 252, 0.4);
}

.dragLink:active {
  cursor: grabbing;
}

.hint {
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
  padding-left: var(--space-2);
}
```

- [ ] **Step 2: BookmarkletBanner コンポーネントを作成**

```tsx
// components/bookmarklet/BookmarkletBanner.tsx
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
```

- [ ] **Step 3: board-client.tsx に BookmarkletBanner を追加**

`app/(app)/board/board-client.tsx` の import に追加:

```typescript
import { BookmarkletBanner } from '@/components/bookmarklet/BookmarkletBanner'
```

JSX の `<UrlInput>` の直前に配置:

```tsx
      <BookmarkletBanner />
      <UrlInput onSubmit={handleUrlSubmit} disabled={loading} />
```

- [ ] **Step 4: TypeScriptチェック + ビルド**

Run: `npx tsc --noEmit && npx next build`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add components/bookmarklet/BookmarkletBanner.tsx components/bookmarklet/BookmarkletBanner.module.css "app/(app)/board/board-client.tsx"
git commit -m "feat(bookmarklet): add install banner to board page"
```

---

## Task 5: ブラウザテスト（Playwright）

実際にブラウザでブックマークレットの /save ページを開き、フォルダ選択→保存の動作を確認する。

**Files:** なし（Playwrightテストスクリプトは /tmp に作成）

- [ ] **Step 1: /save ページの動作確認**

dev server が起動している状態で、Playwright で `/save?url=https://example.com&title=Example&image=&site=example.com&favicon=` を開く。

確認項目:
- プレビューカードが表示される（タイトル「Example」、サイト名「example.com」）
- フォルダ一覧が表示される
- フォルダを選択できる
- 「保存する」ボタンをクリック → 「保存しました！」に変わる
- 新しいフォルダを作成できる

- [ ] **Step 2: パラメータなしの /save ページ**

`/save` をパラメータなしで開き、「このページはブックマークレットから開いてください」メッセージが表示されることを確認。

- [ ] **Step 3: board ページのバナー確認**

`/board` を開き、BookmarkletBanner が表示されていることを確認。リンクの `href` が `javascript:` で始まることを確認。

- [ ] **Step 4: 全体コミット + TODO.md更新**

```bash
git add docs/TODO.md
git commit -m "docs: mark S5 bookmarklet as complete in TODO"
```

---

## 実装順序まとめ

```
Task 1 (bookmarklet.ts改修) — 依存なし
    ↓
Task 2 (/save ルート) — Task 3に必要
    ↓
Task 3 (SavePopup) — メイン機能
    ↓
Task 4 (BookmarkletBanner) — board連携
    ↓
Task 5 (ブラウザテスト) — 全体確認
```
