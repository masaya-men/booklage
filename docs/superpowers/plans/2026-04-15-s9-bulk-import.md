# S9 一括インポート Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ユーザーが各プラットフォーム（ブラウザ/YouTube/TikTok/Reddit/Twitter/Instagram）のブックマークをファイルアップロードまたはURLペーストで一括インポートし、プレビュー・フォルダ割当後にキャンバスに追加できる。

**Architecture:** 7種のファイルパーサーが共通の `ImportedBookmark[]` を返し、`batch-import.ts` がIndexedDBへのバッチ保存 + バックグラウンドOGP取得を管理する。UIは3ステップモーダル（ソース選択→ファイル入力→プレビュー&実行）。ブックマークリストパネルで全カードのナビゲーション + エラーカードの再取得を行う。

**Tech Stack:** TypeScript strict, Vanilla CSS modules, GSAP animations, IndexedDB via `idb`, Zod validation

**Design spec:** `docs/superpowers/specs/2026-04-15-s9-bulk-import.md`

---

## File Structure

### New files

```
lib/import/
  types.ts                    — ImportedBookmark型、ImportSource型、パーサー共通インターフェース
  normalize-url.ts            — URL正規化（重複排除用）
  parse-browser-bookmarks.ts  — Netscape Bookmark Format HTMLパーサー
  parse-youtube-takeout.ts    — Google Takeout CSV パーサー
  parse-tiktok-data.ts        — TikTok user_data.json パーサー
  parse-reddit-export.ts      — Reddit saved_posts.csv パーサー
  parse-twitter-export.ts     — Twitter/X拡張出力 CSV/JSON パーサー
  parse-instagram-export.ts   — Instagram拡張出力 CSV/JSON パーサー
  parse-url-list.ts           — 改行区切りURLテキストパーサー
  deduplicate.ts              — 既存ブックマークとの重複検出
  batch-import.ts             — バッチ保存 + OGPキュー管理

components/import/
  ImportModal.tsx             — 3ステップモーダル全体管理
  ImportModal.module.css
  SourceSelector.tsx          — ステップ1: ソース選択タイル
  SourceSelector.module.css
  FileUploader.tsx            — ステップ2: ドラッグ&ドロップ + ガイド
  FileUploader.module.css
  ImportPreview.tsx           — ステップ3: プレビュー + フォルダ割り当て
  ImportPreview.module.css
  ImportProgress.tsx          — インポート中プログレス表示
  ImportProgress.module.css

components/board/
  BookmarkListPanel.tsx       — サイドパネル: ブックマーク一覧 + カードナビゲーション
  BookmarkListPanel.module.css

tests/lib/import/
  normalize-url.test.ts
  parse-browser-bookmarks.test.ts
  parse-youtube-takeout.test.ts
  parse-tiktok-data.test.ts
  parse-reddit-export.test.ts
  parse-twitter-export.test.ts
  parse-instagram-export.test.ts
  parse-url-list.test.ts
  deduplicate.test.ts
```

### Modified files

```
lib/constants.ts              — DB_VERSION 3→4, Z_INDEX.IMPORT_MODAL, Z_INDEX.LIST_PANEL追加
lib/storage/indexeddb.ts      — v4 migration (ogpStatus), updateBookmarkOgp(), getAllBookmarks(), getBookmarksByUrls()
app/(app)/board/board-client.tsx — ImportModal + BookmarkListPanel 統合、ツールバーにボタン追加
```

---

## Task 1: Types + URL Normalization

**Files:**
- Create: `lib/import/types.ts`
- Create: `lib/import/normalize-url.ts`
- Create: `tests/lib/import/normalize-url.test.ts`

- [ ] **Step 1: Write `lib/import/types.ts`**

```typescript
import type { UrlType } from '@/lib/utils/url'

/** Supported import sources */
export type ImportSource = 'browser' | 'youtube' | 'tiktok' | 'reddit' | 'twitter' | 'instagram' | 'url-list'

/** A single bookmark parsed from an import file */
export interface ImportedBookmark {
  /** The URL of the bookmarked page */
  url: string
  /** Page title (from file metadata or empty) */
  title: string
  /** Optional description */
  description?: string
  /** Folder name from the source (e.g. Chrome folder, playlist name) */
  folder?: string
  /** When the bookmark was originally saved (ISO 8601) */
  addedAt?: string
  /** Which platform this was imported from */
  source: ImportSource
}

/** Result of parsing an import file */
export interface ParseResult {
  /** Successfully parsed bookmarks */
  bookmarks: ImportedBookmark[]
  /** Errors encountered during parsing (non-fatal) */
  errors: string[]
}

/** OGP fetch status — re-exported from indexeddb.ts where it's defined alongside BookmarkRecord */
export type { OgpStatus } from '@/lib/storage/indexeddb'

/** Folder assignment for import preview */
export interface FolderAssignment {
  /** Source folder name (from file) */
  sourceName: string
  /** Target AllMarks folder ID (existing or new) */
  targetFolderId: string
  /** Whether this folder needs to be created */
  isNew: boolean
  /** Number of bookmarks in this folder */
  count: number
}
```

- [ ] **Step 2: Write the failing test for `normalize-url.ts`**

```typescript
// tests/lib/import/normalize-url.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeUrl } from '@/lib/import/normalize-url'

describe('normalizeUrl', () => {
  it('removes trailing slash', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com')
  })

  it('removes www prefix', () => {
    expect(normalizeUrl('https://www.example.com')).toBe('https://example.com')
  })

  it('normalizes http to https', () => {
    expect(normalizeUrl('http://example.com')).toBe('https://example.com')
  })

  it('lowercases hostname', () => {
    expect(normalizeUrl('https://Example.COM/Path')).toBe('https://example.com/Path')
  })

  it('combines all normalizations', () => {
    expect(normalizeUrl('http://www.Example.com/')).toBe('https://example.com')
  })

  it('preserves path and query', () => {
    expect(normalizeUrl('https://example.com/page?q=1')).toBe('https://example.com/page?q=1')
  })

  it('returns original string for invalid URLs', () => {
    expect(normalizeUrl('not-a-url')).toBe('not-a-url')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/lib/import/normalize-url.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement `normalize-url.ts`**

```typescript
// lib/import/normalize-url.ts

/**
 * Normalizes a URL for deduplication:
 * - http → https
 * - remove www.
 * - remove trailing slash
 * - lowercase hostname
 * @param raw - The URL to normalize
 * @returns Normalized URL string
 */
export function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw)
    url.protocol = 'https:'
    url.hostname = url.hostname.replace(/^www\./, '')
    let result = url.toString()
    if (result.endsWith('/') && url.pathname === '/') {
      result = result.slice(0, -1)
    }
    return result
  } catch {
    return raw
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/lib/import/normalize-url.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/import/types.ts lib/import/normalize-url.ts tests/lib/import/normalize-url.test.ts
git commit -m "feat(s9): add import types and URL normalization"
```

---

## Task 2: DB Schema v4 Migration

**Files:**
- Modify: `lib/constants.ts` — DB_VERSION 3→4
- Modify: `lib/storage/indexeddb.ts` — v4 migration + new functions

- [ ] **Step 1: Update `lib/constants.ts`**

Change `DB_VERSION` from `3` to `4`. Add `IMPORT_MODAL` and `LIST_PANEL` to `Z_INDEX`:

```typescript
export const Z_INDEX = {
  CANVAS_CARD: 1,
  CANVAS_CARD_DRAGGING: 50,
  FOLDER_NAV: 60,
  TOOLBAR: 70,
  INSTALL_PROMPT: 75,
  LIST_PANEL: 78,
  DROPDOWN: 80,
  MODAL_BACKDROP: 90,
  MODAL: 100,
  IMPORT_MODAL: 100,
  TOAST: 110,
  BOOKMARKLET_POPUP: 120,
  PIP_DROPZONE: 130,
} as const

export const DB_VERSION = 4
```

- [ ] **Step 2: Add `ogpStatus` to `BookmarkRecord` and write v4 migration in `indexeddb.ts`**

Add to `BookmarkRecord` interface:
```typescript
/** OGP fetch status: pending (not yet fetched), fetched (done), failed (needs retry) */
ogpStatus: OgpStatus
```

Define `OgpStatus` type and export it. Update `BookmarkInput` to exclude ogpStatus from required fields and re-add as optional:
```typescript
export type OgpStatus = 'pending' | 'fetched' | 'failed'
export type BookmarkInput = Omit<BookmarkRecord, 'id' | 'savedAt' | 'ogpStatus'> & { ogpStatus?: OgpStatus }
```

Add v4 migration block after v3 migration:
```typescript
// ── v3 → v4: add ogpStatus to bookmarks ──
if (oldVersion < 4) {
  const bookmarkStore = transaction.objectStore('bookmarks')
  bookmarkStore.createIndex('by-ogp-status', 'ogpStatus')
  void bookmarkStore.openCursor().then(function addOgpStatus(
    cursor: Awaited<ReturnType<typeof bookmarkStore.openCursor>>,
  ): Promise<void> | undefined {
    if (!cursor) return
    const bookmark = {
      ...cursor.value,
      ogpStatus: (cursor.value as BookmarkRecord & { ogpStatus?: string }).ogpStatus ?? 'fetched',
    }
    void cursor.update(bookmark)
    return cursor.continue().then(addOgpStatus)
  })
}
```

Update `addBookmark()` to set `ogpStatus`:
```typescript
const bookmark: BookmarkRecord = {
  // ... existing fields ...
  ogpStatus: input.ogpStatus ?? 'fetched',
}
```

- [ ] **Step 3: Add `updateBookmarkOgp()` function**

```typescript
/**
 * Update a bookmark's OGP data after background fetch.
 * @param db - The database instance
 * @param bookmarkId - The bookmark to update
 * @param ogpData - The OGP data to merge
 */
export async function updateBookmarkOgp(
  db: IDBPDatabase<AllMarksDB>,
  bookmarkId: string,
  ogpData: { title?: string; description?: string; thumbnail?: string; favicon?: string; siteName?: string; ogpStatus: OgpStatus },
): Promise<void> {
  const existing = await db.get('bookmarks', bookmarkId)
  if (!existing) return
  const updated: BookmarkRecord = { ...existing, ...ogpData }
  await db.put('bookmarks', updated)
}
```

- [ ] **Step 4: Add `getAllBookmarks()` and `getBookmarksByUrls()` functions**

```typescript
/**
 * Get all bookmarks across all folders.
 */
export async function getAllBookmarks(
  db: IDBPDatabase<AllMarksDB>,
): Promise<BookmarkRecord[]> {
  return db.getAll('bookmarks')
}

/**
 * Get bookmarks matching any of the given normalized URLs.
 * Used for deduplication during import.
 */
export async function getBookmarksByUrls(
  db: IDBPDatabase<AllMarksDB>,
  urls: Set<string>,
): Promise<BookmarkRecord[]> {
  const all = await db.getAll('bookmarks')
  return all.filter((b) => urls.has(b.url))
}
```

- [ ] **Step 5: Add `addBookmarkBatch()` function for efficient bulk insert**

```typescript
/**
 * Add multiple bookmarks in batches, each with an associated card.
 * @param db - The database instance
 * @param inputs - Array of bookmark inputs
 * @param batchSize - Number of bookmarks per transaction (default 50)
 * @param onProgress - Called after each batch with cumulative count
 * @returns Array of created BookmarkRecords
 */
export async function addBookmarkBatch(
  db: IDBPDatabase<AllMarksDB>,
  inputs: BookmarkInput[],
  batchSize: number = 50,
  onProgress?: (completed: number) => void,
): Promise<BookmarkRecord[]> {
  const results: BookmarkRecord[] = []

  for (let i = 0; i < inputs.length; i += batchSize) {
    const batch = inputs.slice(i, i + batchSize)
    const tx = db.transaction(['bookmarks', 'cards'], 'readwrite')
    const bookmarkStore = tx.objectStore('bookmarks')
    const cardStore = tx.objectStore('cards')

    // Get existing card count for gridIndex
    const existingCards = await cardStore.index('by-folder').getAll(batch[0].folderId)
    let gridIndex = existingCards.length

    for (const input of batch) {
      const bookmark: BookmarkRecord = {
        id: uuid(),
        url: input.url,
        title: input.title,
        description: input.description,
        thumbnail: input.thumbnail,
        favicon: input.favicon,
        siteName: input.siteName,
        type: input.type,
        savedAt: new Date().toISOString(),
        folderId: input.folderId,
        ogpStatus: input.ogpStatus ?? 'fetched',
      }
      await bookmarkStore.put(bookmark)

      const pos = randomPosition()
      const dimensions = generateCardDimensions('random', 'random')
      const card: CardRecord = {
        id: uuid(),
        bookmarkId: bookmark.id,
        folderId: bookmark.folderId,
        x: pos.x,
        y: pos.y,
        rotation: randomRotation(),
        scale: 1,
        zIndex: 1,
        gridIndex: gridIndex++,
        isManuallyPlaced: false,
        width: dimensions.width,
        height: dimensions.height,
      }
      await cardStore.put(card)
      results.push(bookmark)
    }

    await tx.done
    onProgress?.(results.length)
  }

  return results
}
```

Note: `uuid()`, `randomPosition()`, `randomRotation()` are already defined as private helpers in `indexeddb.ts`.

- [ ] **Step 6: Run existing tests to verify no regression**

Run: `npx vitest run tests/lib/indexeddb.test.ts`
Expected: PASS (existing tests still work with v4 migration)

- [ ] **Step 7: Commit**

```bash
git add lib/constants.ts lib/storage/indexeddb.ts
git commit -m "feat(s9): DB v4 migration — add ogpStatus, batch import, bookmark query functions"
```

---

## Task 3: Browser Bookmark HTML Parser

**Files:**
- Create: `lib/import/parse-browser-bookmarks.ts`
- Create: `tests/lib/import/parse-browser-bookmarks.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/import/parse-browser-bookmarks.test.ts
import { describe, it, expect } from 'vitest'
import { parseBrowserBookmarks } from '@/lib/import/parse-browser-bookmarks'

const SIMPLE_HTML = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1700000000">Work</H3>
    <DL><p>
        <DT><A HREF="https://github.com" ADD_DATE="1700000001">GitHub</A>
        <DT><A HREF="https://figma.com" ADD_DATE="1700000002">Figma</A>
    </DL><p>
    <DT><H3 ADD_DATE="1700000000">Personal</H3>
    <DL><p>
        <DT><A HREF="https://youtube.com" ADD_DATE="1700000003">YouTube</A>
    </DL><p>
    <DT><A HREF="https://example.com" ADD_DATE="1700000004">No Folder</A>
</DL><p>`

describe('parseBrowserBookmarks', () => {
  it('parses bookmarks with folder structure', () => {
    const result = parseBrowserBookmarks(SIMPLE_HTML)
    expect(result.errors).toHaveLength(0)
    expect(result.bookmarks).toHaveLength(4)

    expect(result.bookmarks[0]).toMatchObject({
      url: 'https://github.com',
      title: 'GitHub',
      folder: 'Work',
      source: 'browser',
    })
    expect(result.bookmarks[2]).toMatchObject({
      url: 'https://youtube.com',
      title: 'YouTube',
      folder: 'Personal',
      source: 'browser',
    })
  })

  it('handles bookmarks without a folder', () => {
    const result = parseBrowserBookmarks(SIMPLE_HTML)
    const noFolder = result.bookmarks.find((b) => b.url === 'https://example.com')
    expect(noFolder?.folder).toBeUndefined()
  })

  it('converts ADD_DATE unix timestamp to ISO', () => {
    const result = parseBrowserBookmarks(SIMPLE_HTML)
    expect(result.bookmarks[0].addedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('returns empty array for invalid HTML', () => {
    const result = parseBrowserBookmarks('<html><body>Not bookmarks</body></html>')
    expect(result.bookmarks).toHaveLength(0)
  })

  it('handles nested folders (uses deepest folder name)', () => {
    const nested = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
  <DT><H3>Parent</H3>
  <DL><p>
    <DT><H3>Child</H3>
    <DL><p>
      <DT><A HREF="https://deep.com">Deep</A>
    </DL><p>
  </DL><p>
</DL><p>`
    const result = parseBrowserBookmarks(nested)
    expect(result.bookmarks[0].folder).toBe('Child')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/import/parse-browser-bookmarks.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement the parser**

```typescript
// lib/import/parse-browser-bookmarks.ts
import type { ImportedBookmark, ParseResult } from './types'

/**
 * Parse Netscape Bookmark Format HTML (exported from Chrome/Firefox/Safari).
 * Traverses DL/DT structure to extract URLs with folder hierarchy.
 */
export function parseBrowserBookmarks(html: string): ParseResult {
  const bookmarks: ImportedBookmark[] = []
  const errors: string[] = []

  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const topDl = doc.querySelector('dl')
    if (!topDl) return { bookmarks, errors }

    function traverse(dl: Element, currentFolder?: string): void {
      const children = dl.children
      for (let i = 0; i < children.length; i++) {
        const dt = children[i]
        if (dt.tagName !== 'DT') continue

        const heading = dt.querySelector(':scope > h3')
        if (heading) {
          // This DT contains a folder
          const folderName = heading.textContent?.trim() ?? ''
          const subDl = dt.querySelector(':scope > dl')
          if (subDl) {
            traverse(subDl, folderName)
          }
          continue
        }

        const anchor = dt.querySelector(':scope > a')
        if (anchor) {
          const url = anchor.getAttribute('href')
          if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) continue

          const addDate = anchor.getAttribute('add_date')
          let addedAt: string | undefined
          if (addDate) {
            const ts = parseInt(addDate, 10)
            if (!isNaN(ts)) {
              addedAt = new Date(ts * 1000).toISOString()
            }
          }

          bookmarks.push({
            url,
            title: anchor.textContent?.trim() ?? url,
            folder: currentFolder,
            addedAt,
            source: 'browser',
          })
        }
      }
    }

    traverse(topDl)
  } catch (e) {
    errors.push(`Failed to parse browser bookmarks: ${e instanceof Error ? e.message : String(e)}`)
  }

  return { bookmarks, errors }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/import/parse-browser-bookmarks.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/import/parse-browser-bookmarks.ts tests/lib/import/parse-browser-bookmarks.test.ts
git commit -m "feat(s9): browser bookmark HTML parser with folder extraction"
```

---

## Task 4: YouTube Takeout CSV Parser

**Files:**
- Create: `lib/import/parse-youtube-takeout.ts`
- Create: `tests/lib/import/parse-youtube-takeout.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/import/parse-youtube-takeout.test.ts
import { describe, it, expect } from 'vitest'
import { parseYoutubeTakeout } from '@/lib/import/parse-youtube-takeout'

// Google Takeout format: playlist info header rows, then video entries
const LIKED_CSV = `Liked videos
Last Updated,Video Id,Time Added
""
""
""

dQw4w9WgXcQ,2024-01-15T10:30:00Z
abc123def45,2024-02-20T08:00:00Z`

const PLAYLIST_CSV = `My Cool Playlist
Last Updated,Video Id,Time Added
""
""
""

xyzABC12345,2024-03-01T12:00:00Z`

describe('parseYoutubeTakeout', () => {
  it('parses liked videos CSV', () => {
    const result = parseYoutubeTakeout(LIKED_CSV, 'Liked videos.csv')
    expect(result.errors).toHaveLength(0)
    expect(result.bookmarks).toHaveLength(2)

    expect(result.bookmarks[0]).toMatchObject({
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'YouTube dQw4w9WgXcQ',
      folder: 'YouTube 高評価',
      source: 'youtube',
    })
  })

  it('uses playlist name as folder name', () => {
    const result = parseYoutubeTakeout(PLAYLIST_CSV, 'My Cool Playlist.csv')
    expect(result.bookmarks[0].folder).toBe('YouTube My Cool Playlist')
  })

  it('extracts addedAt timestamp', () => {
    const result = parseYoutubeTakeout(LIKED_CSV, 'Liked videos.csv')
    expect(result.bookmarks[0].addedAt).toBe('2024-01-15T10:30:00Z')
  })

  it('skips empty lines and header rows', () => {
    const result = parseYoutubeTakeout(LIKED_CSV, 'Liked videos.csv')
    expect(result.bookmarks).toHaveLength(2)
  })

  it('returns empty for invalid content', () => {
    const result = parseYoutubeTakeout('random text', 'file.csv')
    expect(result.bookmarks).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/import/parse-youtube-takeout.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement the parser**

```typescript
// lib/import/parse-youtube-takeout.ts
import type { ImportedBookmark, ParseResult } from './types'

/**
 * Parse Google Takeout YouTube playlist CSV.
 * Format: first line is playlist name, then header row, then empty rows, then video entries.
 * Each video entry: "videoId,timestamp"
 */
export function parseYoutubeTakeout(csv: string, fileName: string): ParseResult {
  const bookmarks: ImportedBookmark[] = []
  const errors: string[] = []

  try {
    const lines = csv.split('\n').map((l) => l.trim())
    if (lines.length < 2) return { bookmarks, errors }

    // First line is playlist name
    const playlistName = lines[0]
    // Derive folder name
    const isLiked = fileName.toLowerCase().includes('liked')
    const folderName = isLiked ? 'YouTube 高評価' : `YouTube ${playlistName}`

    // Find video entries: lines with exactly one comma, where first part looks like a video ID
    const videoIdRegex = /^[a-zA-Z0-9_-]{11}$/

    for (const line of lines) {
      if (!line || line.startsWith('"') || line.includes('Last Updated')) continue

      const commaIdx = line.indexOf(',')
      if (commaIdx === -1) continue

      const videoId = line.slice(0, commaIdx).trim()
      const timestamp = line.slice(commaIdx + 1).trim()

      if (!videoIdRegex.test(videoId)) continue

      bookmarks.push({
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: `YouTube ${videoId}`,
        folder: folderName,
        addedAt: timestamp || undefined,
        source: 'youtube',
      })
    }
  } catch (e) {
    errors.push(`Failed to parse YouTube Takeout: ${e instanceof Error ? e.message : String(e)}`)
  }

  return { bookmarks, errors }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/import/parse-youtube-takeout.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/import/parse-youtube-takeout.ts tests/lib/import/parse-youtube-takeout.test.ts
git commit -m "feat(s9): YouTube Google Takeout CSV parser"
```

---

## Task 5: TikTok JSON Parser

**Files:**
- Create: `lib/import/parse-tiktok-data.ts`
- Create: `tests/lib/import/parse-tiktok-data.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/import/parse-tiktok-data.test.ts
import { describe, it, expect } from 'vitest'
import { parseTiktokData } from '@/lib/import/parse-tiktok-data'

const TIKTOK_JSON = JSON.stringify({
  Activity: {
    'Favorite Videos': {
      FavoriteVideoList: [
        { Date: '2024-01-15 10:30:00', Link: 'https://www.tiktok.com/@user1/video/111' },
        { Date: '2024-02-20 08:00:00', Link: 'https://www.tiktok.com/@user2/video/222' },
      ],
    },
    'Like List': {
      ItemFavoriteList: [
        { Date: '2024-03-01 12:00:00', Link: 'https://www.tiktok.com/@user3/video/333' },
      ],
    },
  },
})

describe('parseTiktokData', () => {
  it('parses favorite videos', () => {
    const result = parseTiktokData(TIKTOK_JSON)
    const favorites = result.bookmarks.filter((b) => b.folder === 'TikTok お気に入り')
    expect(favorites).toHaveLength(2)
    expect(favorites[0].url).toBe('https://www.tiktok.com/@user1/video/111')
    expect(favorites[0].source).toBe('tiktok')
  })

  it('parses liked videos', () => {
    const result = parseTiktokData(TIKTOK_JSON)
    const likes = result.bookmarks.filter((b) => b.folder === 'TikTok いいね')
    expect(likes).toHaveLength(1)
  })

  it('converts date to ISO format', () => {
    const result = parseTiktokData(TIKTOK_JSON)
    expect(result.bookmarks[0].addedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('handles missing sections gracefully', () => {
    const partial = JSON.stringify({ Activity: {} })
    const result = parseTiktokData(partial)
    expect(result.bookmarks).toHaveLength(0)
    expect(result.errors).toHaveLength(0)
  })

  it('reports error for invalid JSON', () => {
    const result = parseTiktokData('not json')
    expect(result.errors.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/import/parse-tiktok-data.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement the parser**

```typescript
// lib/import/parse-tiktok-data.ts
import type { ImportedBookmark, ParseResult } from './types'

interface TiktokVideoEntry {
  Date?: string
  Link?: string
}

interface TiktokData {
  Activity?: {
    'Favorite Videos'?: { FavoriteVideoList?: TiktokVideoEntry[] }
    'Like List'?: { ItemFavoriteList?: TiktokVideoEntry[] }
  }
}

function parseTiktokDate(dateStr: string): string {
  // TikTok format: "2024-01-15 10:30:00"
  return new Date(dateStr.replace(' ', 'T') + 'Z').toISOString()
}

/**
 * Parse TikTok data download JSON (user_data.json).
 * Extracts Favorite Videos and Like List.
 */
export function parseTiktokData(jsonStr: string): ParseResult {
  const bookmarks: ImportedBookmark[] = []
  const errors: string[] = []

  let data: TiktokData
  try {
    data = JSON.parse(jsonStr) as TiktokData
  } catch (e) {
    return { bookmarks, errors: [`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`] }
  }

  const activity = data.Activity
  if (!activity) return { bookmarks, errors }

  // Favorite Videos
  const favorites = activity['Favorite Videos']?.FavoriteVideoList ?? []
  for (const entry of favorites) {
    if (!entry.Link) continue
    bookmarks.push({
      url: entry.Link,
      title: `TikTok ${entry.Link.split('/').pop() ?? ''}`,
      folder: 'TikTok お気に入り',
      addedAt: entry.Date ? parseTiktokDate(entry.Date) : undefined,
      source: 'tiktok',
    })
  }

  // Like List
  const likes = activity['Like List']?.ItemFavoriteList ?? []
  for (const entry of likes) {
    if (!entry.Link) continue
    bookmarks.push({
      url: entry.Link,
      title: `TikTok ${entry.Link.split('/').pop() ?? ''}`,
      folder: 'TikTok いいね',
      addedAt: entry.Date ? parseTiktokDate(entry.Date) : undefined,
      source: 'tiktok',
    })
  }

  return { bookmarks, errors }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/import/parse-tiktok-data.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/import/parse-tiktok-data.ts tests/lib/import/parse-tiktok-data.test.ts
git commit -m "feat(s9): TikTok data download JSON parser"
```

---

## Task 6: Reddit CSV Parser

**Files:**
- Create: `lib/import/parse-reddit-export.ts`
- Create: `tests/lib/import/parse-reddit-export.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/import/parse-reddit-export.test.ts
import { describe, it, expect } from 'vitest'
import { parseRedditExport } from '@/lib/import/parse-reddit-export'

const REDDIT_CSV = `id,permalink,date,ip,subreddit,title,body,url
abc123,/r/webdev/comments/abc123/great_css_tips/,2024-01-15 10:30:00 UTC,,webdev,Great CSS Tips,,https://example.com/css-tips
def456,/r/javascript/comments/def456/react_19_features/,2024-02-20 08:00:00 UTC,,javascript,React 19 Features,,`

describe('parseRedditExport', () => {
  it('parses saved posts CSV', () => {
    const result = parseRedditExport(REDDIT_CSV)
    expect(result.errors).toHaveLength(0)
    expect(result.bookmarks).toHaveLength(2)
  })

  it('uses external URL when available', () => {
    const result = parseRedditExport(REDDIT_CSV)
    expect(result.bookmarks[0].url).toBe('https://example.com/css-tips')
  })

  it('falls back to reddit permalink when no external URL', () => {
    const result = parseRedditExport(REDDIT_CSV)
    expect(result.bookmarks[1].url).toBe('https://www.reddit.com/r/javascript/comments/def456/react_19_features/')
  })

  it('extracts title', () => {
    const result = parseRedditExport(REDDIT_CSV)
    expect(result.bookmarks[0].title).toBe('Great CSS Tips')
  })

  it('sets folder to Reddit保存', () => {
    const result = parseRedditExport(REDDIT_CSV)
    expect(result.bookmarks[0].folder).toBe('Reddit保存')
  })

  it('handles empty input', () => {
    const result = parseRedditExport('')
    expect(result.bookmarks).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/import/parse-reddit-export.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement the parser**

```typescript
// lib/import/parse-reddit-export.ts
import type { ImportedBookmark, ParseResult } from './types'

/**
 * Parse a single CSV line respecting quoted fields.
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

/**
 * Parse Reddit GDPR export saved_posts.csv.
 */
export function parseRedditExport(csv: string): ParseResult {
  const bookmarks: ImportedBookmark[] = []
  const errors: string[] = []

  try {
    const lines = csv.split('\n').filter((l) => l.trim())
    if (lines.length < 2) return { bookmarks, errors }

    const headers = parseCSVLine(lines[0])
    const permalinkIdx = headers.indexOf('permalink')
    const dateIdx = headers.indexOf('date')
    const titleIdx = headers.indexOf('title')
    const urlIdx = headers.indexOf('url')

    if (permalinkIdx === -1) return { bookmarks, errors: ['Missing permalink column'] }

    for (let i = 1; i < lines.length; i++) {
      const fields = parseCSVLine(lines[i])
      const permalink = fields[permalinkIdx]?.trim()
      if (!permalink) continue

      const externalUrl = urlIdx >= 0 ? fields[urlIdx]?.trim() : ''
      const url = externalUrl || `https://www.reddit.com${permalink}`

      const title = titleIdx >= 0 ? fields[titleIdx]?.trim() ?? url : url
      const dateStr = dateIdx >= 0 ? fields[dateIdx]?.trim() : ''
      let addedAt: string | undefined
      if (dateStr) {
        try {
          addedAt = new Date(dateStr).toISOString()
        } catch { /* skip invalid date */ }
      }

      bookmarks.push({
        url,
        title,
        folder: 'Reddit保存',
        addedAt,
        source: 'reddit',
      })
    }
  } catch (e) {
    errors.push(`Failed to parse Reddit export: ${e instanceof Error ? e.message : String(e)}`)
  }

  return { bookmarks, errors }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/import/parse-reddit-export.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/import/parse-reddit-export.ts tests/lib/import/parse-reddit-export.test.ts
git commit -m "feat(s9): Reddit GDPR CSV parser"
```

---

## Task 7: Twitter/X Export Parser

**Files:**
- Create: `lib/import/parse-twitter-export.ts`
- Create: `tests/lib/import/parse-twitter-export.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/import/parse-twitter-export.test.ts
import { describe, it, expect } from 'vitest'
import { parseTwitterExport } from '@/lib/import/parse-twitter-export'

// CSV format (common from Chrome extensions)
const TWITTER_CSV = `"url","text","created_at","author"
"https://x.com/user1/status/111","Hello world","2024-01-15T10:30:00Z","user1"
"https://x.com/user2/status/222","Good morning","2024-02-20T08:00:00Z","user2"`

// JSON format (from other Chrome extensions)
const TWITTER_JSON = JSON.stringify([
  { url: 'https://twitter.com/user3/status/333', text: 'Tweet text', created_at: '2024-03-01' },
  { url: 'https://x.com/user4/status/444', text: 'Another tweet' },
])

// Minimal CSV (just URLs, one per line)
const MINIMAL_CSV = `https://x.com/user5/status/555
https://x.com/user6/status/666`

describe('parseTwitterExport', () => {
  it('parses CSV with headers', () => {
    const result = parseTwitterExport(TWITTER_CSV)
    expect(result.bookmarks).toHaveLength(2)
    expect(result.bookmarks[0].url).toBe('https://x.com/user1/status/111')
    expect(result.bookmarks[0].source).toBe('twitter')
    expect(result.bookmarks[0].folder).toBe('Xブックマーク')
  })

  it('parses JSON array', () => {
    const result = parseTwitterExport(TWITTER_JSON)
    expect(result.bookmarks).toHaveLength(2)
    expect(result.bookmarks[0].url).toBe('https://twitter.com/user3/status/333')
  })

  it('parses minimal URL-per-line format', () => {
    const result = parseTwitterExport(MINIMAL_CSV)
    expect(result.bookmarks).toHaveLength(2)
  })

  it('extracts title from text field', () => {
    const result = parseTwitterExport(TWITTER_CSV)
    expect(result.bookmarks[0].title).toBe('Hello world')
  })

  it('returns empty for non-matching content', () => {
    const result = parseTwitterExport('random nonsense')
    expect(result.bookmarks).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/import/parse-twitter-export.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement the parser**

```typescript
// lib/import/parse-twitter-export.ts
import type { ImportedBookmark, ParseResult } from './types'

const TWITTER_URL_REGEX = /https?:\/\/(?:twitter\.com|x\.com)\/\w+\/status\/\d+/

interface TwitterJsonEntry {
  url?: string
  tweet_url?: string
  link?: string
  text?: string
  content?: string
  created_at?: string
  date?: string
  author?: string
  username?: string
}

/**
 * Parse Twitter/X bookmark exports from various Chrome extensions.
 * Supports: CSV with headers, JSON array, plain URL list.
 */
export function parseTwitterExport(content: string): ParseResult {
  const bookmarks: ImportedBookmark[] = []
  const errors: string[] = []
  const trimmed = content.trim()

  // Try JSON first
  if (trimmed.startsWith('[')) {
    try {
      const entries = JSON.parse(trimmed) as TwitterJsonEntry[]
      for (const entry of entries) {
        const url = entry.url ?? entry.tweet_url ?? entry.link
        if (!url) continue
        bookmarks.push({
          url,
          title: entry.text ?? entry.content ?? url.split('/').pop() ?? url,
          folder: 'Xブックマーク',
          addedAt: entry.created_at ?? entry.date ?? undefined,
          source: 'twitter',
        })
      }
      return { bookmarks, errors }
    } catch { /* not valid JSON, try CSV */ }
  }

  // Try CSV / URL-per-line
  const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean)

  // Check if first line is a header (contains "url" or "URL")
  const firstLine = lines[0]?.toLowerCase() ?? ''
  const hasHeader = firstLine.includes('url') || firstLine.includes('link')
  const startIdx = hasHeader ? 1 : 0

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i]
    // Extract Twitter/X URL from the line
    const match = line.match(TWITTER_URL_REGEX)
    if (!match) continue

    const url = match[0]
    // Try to extract text from CSV fields
    const parts = line.split(',').map((p) => p.replace(/^"|"$/g, '').trim())
    const textPart = parts.find((p) => p && !TWITTER_URL_REGEX.test(p) && !p.match(/^\d{4}-/))

    bookmarks.push({
      url,
      title: textPart ?? `Tweet ${url.split('/').pop() ?? ''}`,
      folder: 'Xブックマーク',
      source: 'twitter',
    })
  }

  return { bookmarks, errors }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/import/parse-twitter-export.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/import/parse-twitter-export.ts tests/lib/import/parse-twitter-export.test.ts
git commit -m "feat(s9): Twitter/X export parser (CSV, JSON, URL list)"
```

---

## Task 8: Instagram Export Parser

**Files:**
- Create: `lib/import/parse-instagram-export.ts`
- Create: `tests/lib/import/parse-instagram-export.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/import/parse-instagram-export.test.ts
import { describe, it, expect } from 'vitest'
import { parseInstagramExport } from '@/lib/import/parse-instagram-export'

const INSTAGRAM_JSON = JSON.stringify([
  { url: 'https://www.instagram.com/p/abc123/', title: 'Cool photo', date: '2024-01-15' },
  { url: 'https://www.instagram.com/reel/def456/', title: 'Fun reel' },
])

const INSTAGRAM_CSV = `"url","caption","date"
"https://www.instagram.com/p/ghi789/","Nice post","2024-03-01"
"https://www.instagram.com/p/jkl012/","Another one","2024-03-02"`

const URL_LIST = `https://www.instagram.com/p/mno345/
https://www.instagram.com/reel/pqr678/`

describe('parseInstagramExport', () => {
  it('parses JSON array', () => {
    const result = parseInstagramExport(INSTAGRAM_JSON)
    expect(result.bookmarks).toHaveLength(2)
    expect(result.bookmarks[0].url).toBe('https://www.instagram.com/p/abc123/')
    expect(result.bookmarks[0].folder).toBe('Instagram保存')
    expect(result.bookmarks[0].source).toBe('instagram')
  })

  it('parses CSV', () => {
    const result = parseInstagramExport(INSTAGRAM_CSV)
    expect(result.bookmarks).toHaveLength(2)
  })

  it('parses URL-per-line', () => {
    const result = parseInstagramExport(URL_LIST)
    expect(result.bookmarks).toHaveLength(2)
  })

  it('handles empty input', () => {
    const result = parseInstagramExport('')
    expect(result.bookmarks).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/import/parse-instagram-export.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement the parser**

```typescript
// lib/import/parse-instagram-export.ts
import type { ImportedBookmark, ParseResult } from './types'

const INSTAGRAM_URL_REGEX = /https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv)\/[\w-]+\/?/

interface InstagramJsonEntry {
  url?: string
  link?: string
  title?: string
  caption?: string
  date?: string
  timestamp?: string
}

/**
 * Parse Instagram saved posts export from Chrome extensions.
 * Supports: JSON array, CSV with headers, plain URL list.
 */
export function parseInstagramExport(content: string): ParseResult {
  const bookmarks: ImportedBookmark[] = []
  const errors: string[] = []
  const trimmed = content.trim()
  if (!trimmed) return { bookmarks, errors }

  // Try JSON first
  if (trimmed.startsWith('[')) {
    try {
      const entries = JSON.parse(trimmed) as InstagramJsonEntry[]
      for (const entry of entries) {
        const url = entry.url ?? entry.link
        if (!url) continue
        bookmarks.push({
          url,
          title: entry.title ?? entry.caption ?? url.split('/').filter(Boolean).pop() ?? url,
          folder: 'Instagram保存',
          addedAt: entry.date ?? entry.timestamp ?? undefined,
          source: 'instagram',
        })
      }
      return { bookmarks, errors }
    } catch { /* not valid JSON */ }
  }

  // Try CSV / URL-per-line
  const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean)
  const firstLine = lines[0]?.toLowerCase() ?? ''
  const hasHeader = firstLine.includes('url') || firstLine.includes('link')
  const startIdx = hasHeader ? 1 : 0

  for (let i = startIdx; i < lines.length; i++) {
    const match = lines[i].match(INSTAGRAM_URL_REGEX)
    if (!match) continue
    bookmarks.push({
      url: match[0],
      title: match[0].split('/').filter(Boolean).pop() ?? match[0],
      folder: 'Instagram保存',
      source: 'instagram',
    })
  }

  return { bookmarks, errors }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/import/parse-instagram-export.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/import/parse-instagram-export.ts tests/lib/import/parse-instagram-export.test.ts
git commit -m "feat(s9): Instagram export parser (CSV, JSON, URL list)"
```

---

## Task 9: URL List Parser

**Files:**
- Create: `lib/import/parse-url-list.ts`
- Create: `tests/lib/import/parse-url-list.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/import/parse-url-list.test.ts
import { describe, it, expect } from 'vitest'
import { parseUrlList } from '@/lib/import/parse-url-list'

describe('parseUrlList', () => {
  it('parses newline-separated URLs', () => {
    const input = `https://example.com
https://github.com
https://youtube.com/watch?v=abc`
    const result = parseUrlList(input)
    expect(result.bookmarks).toHaveLength(3)
    expect(result.bookmarks[0].url).toBe('https://example.com')
    expect(result.bookmarks[0].source).toBe('url-list')
  })

  it('skips empty lines', () => {
    const input = `https://a.com

https://b.com
  
https://c.com`
    const result = parseUrlList(input)
    expect(result.bookmarks).toHaveLength(3)
  })

  it('skips invalid URLs', () => {
    const input = `https://valid.com
not a url
ftp://invalid.com
https://also-valid.com`
    const result = parseUrlList(input)
    expect(result.bookmarks).toHaveLength(2)
  })

  it('uses URL hostname as title', () => {
    const result = parseUrlList('https://www.example.com/page')
    expect(result.bookmarks[0].title).toBe('www.example.com')
  })

  it('handles empty input', () => {
    const result = parseUrlList('')
    expect(result.bookmarks).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/import/parse-url-list.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement the parser**

```typescript
// lib/import/parse-url-list.ts
import type { ImportedBookmark, ParseResult } from './types'
import { isValidUrl } from '@/lib/utils/url'

/**
 * Parse a newline-separated list of URLs.
 */
export function parseUrlList(text: string): ParseResult {
  const bookmarks: ImportedBookmark[] = []
  const errors: string[] = []

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  for (const line of lines) {
    if (!isValidUrl(line)) continue
    let hostname = ''
    try {
      hostname = new URL(line).hostname
    } catch { /* use line as title */ }

    bookmarks.push({
      url: line,
      title: hostname || line,
      source: 'url-list',
    })
  }

  return { bookmarks, errors }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/import/parse-url-list.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/import/parse-url-list.ts tests/lib/import/parse-url-list.test.ts
git commit -m "feat(s9): URL list parser"
```

---

## Task 10: Deduplication Logic

**Files:**
- Create: `lib/import/deduplicate.ts`
- Create: `tests/lib/import/deduplicate.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/import/deduplicate.test.ts
import { describe, it, expect } from 'vitest'
import { findDuplicates } from '@/lib/import/deduplicate'
import type { ImportedBookmark } from '@/lib/import/types'

describe('findDuplicates', () => {
  const incoming: ImportedBookmark[] = [
    { url: 'https://example.com', title: 'Example', source: 'browser' },
    { url: 'https://github.com', title: 'GitHub', source: 'browser' },
    { url: 'http://www.example.com/', title: 'Example Dupe', source: 'browser' },
    { url: 'https://unique.com', title: 'Unique', source: 'browser' },
  ]

  const existingUrls = ['https://example.com', 'https://other.com']

  it('identifies duplicates against existing URLs', () => {
    const result = findDuplicates(incoming, existingUrls)
    expect(result.unique).toHaveLength(2) // github.com and unique.com
    expect(result.duplicates).toHaveLength(2) // example.com and www.example.com/
  })

  it('normalizes URLs for comparison', () => {
    const result = findDuplicates(incoming, existingUrls)
    // http://www.example.com/ normalizes to https://example.com → duplicate
    const dupUrls = result.duplicates.map((b) => b.url)
    expect(dupUrls).toContain('http://www.example.com/')
  })

  it('deduplicates within incoming list', () => {
    const result = findDuplicates(incoming, [])
    // example.com and www.example.com/ are duplicates of each other
    expect(result.unique).toHaveLength(3) // first example.com kept, dupe removed
    expect(result.duplicates).toHaveLength(1)
  })

  it('handles empty inputs', () => {
    expect(findDuplicates([], []).unique).toHaveLength(0)
    expect(findDuplicates(incoming, []).unique.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/import/deduplicate.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement deduplication**

```typescript
// lib/import/deduplicate.ts
import type { ImportedBookmark } from './types'
import { normalizeUrl } from './normalize-url'

export interface DeduplicateResult {
  /** Bookmarks that are not duplicates */
  unique: ImportedBookmark[]
  /** Bookmarks that are duplicates (of existing or within the list) */
  duplicates: ImportedBookmark[]
}

/**
 * Find duplicates within the incoming list and against existing bookmark URLs.
 * @param incoming - Bookmarks to check
 * @param existingUrls - URLs already in IndexedDB
 */
export function findDuplicates(
  incoming: ImportedBookmark[],
  existingUrls: string[],
): DeduplicateResult {
  const existingNormalized = new Set(existingUrls.map(normalizeUrl))
  const seenNormalized = new Set<string>()
  const unique: ImportedBookmark[] = []
  const duplicates: ImportedBookmark[] = []

  for (const bookmark of incoming) {
    const normalized = normalizeUrl(bookmark.url)

    if (existingNormalized.has(normalized) || seenNormalized.has(normalized)) {
      duplicates.push(bookmark)
    } else {
      seenNormalized.add(normalized)
      unique.push(bookmark)
    }
  }

  return { unique, duplicates }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/import/deduplicate.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/import/deduplicate.ts tests/lib/import/deduplicate.test.ts
git commit -m "feat(s9): URL deduplication with normalization"
```

---

## Task 11: Batch Import Engine

**Files:**
- Create: `lib/import/batch-import.ts`

This module orchestrates the full import flow: parse → dedupe → create folders → batch save → OGP queue.

- [ ] **Step 1: Implement `batch-import.ts`**

```typescript
// lib/import/batch-import.ts
import type { ImportedBookmark, FolderAssignment, OgpStatus } from './types'
import type { BookmarkInput } from '@/lib/storage/indexeddb'
import { detectUrlType } from '@/lib/utils/url'
import { fetchOgp } from '@/lib/scraper/ogp'
import {
  addFolder,
  getAllFolders,
  addBookmarkBatch,
  getAllBookmarks,
  updateBookmarkOgp,
} from '@/lib/storage/indexeddb'
import type { BookmarkRecord, FolderRecord } from '@/lib/storage/indexeddb'
import { findDuplicates } from './deduplicate'
import { FOLDER_COLORS } from '@/lib/constants'
import type { IDBPDatabase } from 'idb'

/** Progress callback for import operations */
export interface ImportProgress {
  phase: 'saving' | 'ogp'
  completed: number
  total: number
}

/**
 * Build folder assignments from parsed bookmarks.
 * Maps source folder names to existing or new AllMarks folders.
 */
export async function buildFolderAssignments(
  db: IDBPDatabase<unknown>,
  bookmarks: ImportedBookmark[],
): Promise<FolderAssignment[]> {
  const existingFolders = await getAllFolders(db as Parameters<typeof getAllFolders>[0])
  const folderMap = new Map<string, FolderAssignment>()
  const noFolderKey = '__no_folder__'

  for (const bm of bookmarks) {
    const key = bm.folder ?? noFolderKey
    if (folderMap.has(key)) {
      folderMap.get(key)!.count++
      continue
    }

    // Check if a folder with this name already exists
    const existing = bm.folder
      ? existingFolders.find((f) => f.name === bm.folder)
      : existingFolders[0] // default folder

    folderMap.set(key, {
      sourceName: bm.folder ?? 'インポート',
      targetFolderId: existing?.id ?? '',
      isNew: !existing && !!bm.folder,
      count: 1,
    })
  }

  return Array.from(folderMap.values())
}

/**
 * Execute the import: create folders, deduplicate, batch save, start OGP queue.
 */
export async function executeImport(
  db: IDBPDatabase<unknown>,
  bookmarks: ImportedBookmark[],
  folderAssignments: FolderAssignment[],
  onProgress?: (progress: ImportProgress) => void,
  onOgpUpdate?: (bookmarkId: string, bookmark: BookmarkRecord) => void,
): Promise<{ saved: number; skipped: number; failed: string[] }> {
  const typedDb = db as Parameters<typeof getAllFolders>[0]

  // 1. Create new folders
  const existingFolders = await getAllFolders(typedDb)
  const folderIdMap = new Map<string, string>()

  for (const assignment of folderAssignments) {
    if (assignment.isNew && !assignment.targetFolderId) {
      const colorIdx = existingFolders.length % FOLDER_COLORS.length
      const newFolder = await addFolder(typedDb, {
        name: assignment.sourceName,
        color: FOLDER_COLORS[colorIdx],
        order: existingFolders.length,
      })
      assignment.targetFolderId = newFolder.id
      existingFolders.push(newFolder)
    }
    folderIdMap.set(assignment.sourceName, assignment.targetFolderId)
  }

  // 2. Deduplicate
  const existingBookmarks = await getAllBookmarks(typedDb)
  const existingUrls = existingBookmarks.map((b) => b.url)
  const { unique, duplicates } = findDuplicates(bookmarks, existingUrls)

  // 3. Prepare bookmark inputs
  const inputs: BookmarkInput[] = unique.map((bm) => {
    const urlType = detectUrlType(bm.url)
    const folderId = folderIdMap.get(bm.folder ?? 'インポート') ?? folderAssignments[0]?.targetFolderId ?? ''
    const needsOgp = urlType !== 'tweet' && urlType !== 'youtube'

    return {
      url: bm.url,
      title: bm.title,
      description: bm.description ?? '',
      thumbnail: '',
      favicon: '',
      siteName: '',
      type: urlType,
      folderId,
      ogpStatus: (needsOgp ? 'pending' : 'fetched') as OgpStatus,
    }
  })

  // 4. Batch save
  const saved = await addBookmarkBatch(typedDb, inputs, 50, (completed) => {
    onProgress?.({ phase: 'saving', completed, total: inputs.length })
  })

  // 5. Start background OGP fetch for pending bookmarks
  const pendingOgp = saved.filter((b) => b.ogpStatus === 'pending')
  if (pendingOgp.length > 0) {
    void fetchOgpBatch(typedDb, pendingOgp, onProgress, onOgpUpdate)
  }

  return {
    saved: saved.length,
    skipped: duplicates.length,
    failed: [],
  }
}

/**
 * Fetch OGP data in batches of 5, with retry on failure.
 */
async function fetchOgpBatch(
  db: Parameters<typeof updateBookmarkOgp>[0],
  bookmarks: BookmarkRecord[],
  onProgress?: (progress: ImportProgress) => void,
  onUpdate?: (bookmarkId: string, bookmark: BookmarkRecord) => void,
): Promise<void> {
  const CONCURRENCY = 5
  let completed = 0
  const total = bookmarks.length

  async function fetchOne(bookmark: BookmarkRecord): Promise<void> {
    let retries = 1
    while (retries >= 0) {
      try {
        const ogp = await fetchOgp(bookmark.url)
        const updates = {
          title: ogp.title || bookmark.title,
          description: ogp.description,
          thumbnail: ogp.image,
          favicon: ogp.favicon,
          siteName: ogp.siteName,
          ogpStatus: 'fetched' as OgpStatus,
        }
        await updateBookmarkOgp(db, bookmark.id, updates)
        const updated = { ...bookmark, ...updates }
        onUpdate?.(bookmark.id, updated)
        break
      } catch {
        if (retries > 0) {
          retries--
          await new Promise((r) => setTimeout(r, 3000))
        } else {
          await updateBookmarkOgp(db, bookmark.id, { ogpStatus: 'failed' })
          onUpdate?.(bookmark.id, { ...bookmark, ogpStatus: 'failed' })
        }
      }
    }
    completed++
    onProgress?.({ phase: 'ogp', completed, total })
  }

  // Process in chunks of CONCURRENCY
  for (let i = 0; i < bookmarks.length; i += CONCURRENCY) {
    const chunk = bookmarks.slice(i, i + CONCURRENCY)
    await Promise.all(chunk.map(fetchOne))
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/import/batch-import.ts
git commit -m "feat(s9): batch import engine — folder creation, dedupe, OGP queue"
```

---

## Task 12: ImportModal + SourceSelector (Step 1 UI)

**Files:**
- Create: `components/import/ImportModal.tsx` + `ImportModal.module.css`
- Create: `components/import/SourceSelector.tsx` + `SourceSelector.module.css`

This is a UI task. Implement the modal shell with step management, and the source selection tiles (step 1). Use the existing AllMarks design system: liquid glass, GSAP animations, CSS modules.

Read the design spec at `docs/superpowers/specs/2026-04-15-s9-bulk-import.md` for the full UI specification. Read existing UI patterns in `components/board/SettingsPanel.tsx` and `components/bookmarklet/SavePopup.tsx` for glass effect and animation patterns.

- [ ] **Step 1: Create `ImportModal.module.css`** — modal backdrop, glass container, step transition animations, custom scrollbar styles
- [ ] **Step 2: Create `ImportModal.tsx`** — modal state management (step 1/2/3/progress), GSAP open/close animation, step navigation, backdrop click to close
- [ ] **Step 3: Create `SourceSelector.module.css`** — source tile grid, hover effects, icon styles
- [ ] **Step 4: Create `SourceSelector.tsx`** — 7 source tiles (browser/youtube/tiktok/reddit/twitter/instagram/url-list), click handler calls `onSelectSource(source: ImportSource)`, each tile shows platform name + file format hint
- [ ] **Step 5: Verify modal opens/closes** — temporarily wire into board-client.tsx with a test button, check GSAP animations work
- [ ] **Step 6: Commit**

```bash
git add components/import/
git commit -m "feat(s9): import modal shell + source selector tiles"
```

---

## Task 13: FileUploader (Step 2 UI)

**Files:**
- Create: `components/import/FileUploader.tsx` + `FileUploader.module.css`

- [ ] **Step 1: Create `FileUploader.module.css`** — drop zone styles (normal/dragover/accepted), guide accordion, textarea styles for URL paste
- [ ] **Step 2: Create `FileUploader.tsx`** — drag & drop zone (`onDragOver`, `onDrop`, `onChange` for file input), per-platform export guide (collapsible), URL paste textarea for `url-list` source, calls appropriate parser on file/text input, calls `onParsed(result: ParseResult)` when done
- [ ] **Step 3: Implement platform-specific accept types** — browser=`.html,.htm`, youtube=`.csv`, tiktok=`.json`, reddit=`.csv`, twitter=`.csv,.json,.txt`, instagram=`.csv,.json,.txt`
- [ ] **Step 4: Verify file upload works** — test with a real Chrome bookmark export HTML
- [ ] **Step 5: Commit**

```bash
git add components/import/FileUploader.tsx components/import/FileUploader.module.css
git commit -m "feat(s9): file uploader with drag & drop and platform guides"
```

---

## Task 14: ImportPreview (Step 3 UI)

**Files:**
- Create: `components/import/ImportPreview.tsx` + `ImportPreview.module.css`

- [ ] **Step 1: Create `ImportPreview.module.css`** — folder tree styles, bookmark list, duplicate warning, action buttons
- [ ] **Step 2: Create `ImportPreview.tsx`** — displays parsed bookmark count, folder tree with auto-created folder assignments, folder reassignment dropdown, duplicate count warning, select all/deselect all, "○○件をインポート" button
- [ ] **Step 3: Wire up folder assignments** — call `buildFolderAssignments()` on mount, allow user to change target folder per group
- [ ] **Step 4: Verify preview renders** — test with parsed browser bookmarks data
- [ ] **Step 5: Commit**

```bash
git add components/import/ImportPreview.tsx components/import/ImportPreview.module.css
git commit -m "feat(s9): import preview with folder assignments and duplicate detection"
```

---

## Task 15: ImportProgress UI

**Files:**
- Create: `components/import/ImportProgress.tsx` + `ImportProgress.module.css`

- [ ] **Step 1: Create `ImportProgress.module.css`** — progress bar gradient + shimmer animation, counter flip style, completion celebration
- [ ] **Step 2: Create `ImportProgress.tsx`** — progress bar with percentage, "161 / 247 件完了" counter, phase indicator (saving → OGP取得中), completion state with party animation, error report if any failures
- [ ] **Step 3: Commit**

```bash
git add components/import/ImportProgress.tsx components/import/ImportProgress.module.css
git commit -m "feat(s9): import progress with animated progress bar and completion celebration"
```

---

## Task 16: BookmarkListPanel

**Files:**
- Create: `components/board/BookmarkListPanel.tsx` + `BookmarkListPanel.module.css`

- [ ] **Step 1: Create `BookmarkListPanel.module.css`** — side panel drawer animation (slide from right), item list, red dot for failed items, custom scrollbar
- [ ] **Step 2: Create `BookmarkListPanel.tsx`** — drawer panel showing all bookmarks grouped by folder, each item shows: small thumbnail + title + URL + source icon, failed OGP items have red pulsing dot + "再取得" button, click on item calls `onNavigateToCard(cardId: string)` which triggers canvas pan/zoom animation
- [ ] **Step 3: Commit**

```bash
git add components/board/BookmarkListPanel.tsx components/board/BookmarkListPanel.module.css
git commit -m "feat(s9): bookmark list panel with card navigation and OGP retry"
```

---

## Task 17: Board Integration

**Files:**
- Modify: `app/(app)/board/board-client.tsx`

- [ ] **Step 1: Add imports** — ImportModal, BookmarkListPanel, executeImport, and related types
- [ ] **Step 2: Add state** — `showImportModal`, `showListPanel`, import progress state
- [ ] **Step 3: Add toolbar buttons** — "インポート" button (opens modal), "リスト" button (opens list panel)
- [ ] **Step 4: Wire ImportModal** — on import complete, reload items from DB, trigger card drop animation (GSAP stagger), show toast notification, open list panel
- [ ] **Step 5: Wire BookmarkListPanel** — `onNavigateToCard` triggers canvas `panTo(x, y)` with GSAP animation, "再取得" button calls `fetchOgp()` + `updateBookmarkOgp()` and updates item state
- [ ] **Step 6: Wire OGP background updates** — when `onOgpUpdate` fires, update the corresponding card's bookmark data in `items` state so UI re-renders with new thumbnail
- [ ] **Step 7: Run dev server and test full flow** — import a real Chrome bookmark HTML, verify cards appear on canvas
- [ ] **Step 8: Commit**

```bash
git add app/(app)/board/board-client.tsx
git commit -m "feat(s9): integrate import modal and bookmark list panel into board"
```

---

## Task 18: Animation Polish

**Files:**
- Modify: `components/import/ImportModal.tsx`
- Modify: `components/import/ImportModal.module.css`
- Modify: `app/(app)/board/board-client.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Modal open/close GSAP animation** — scale(0.9→1) + opacity(0→1) + backdrop-blur(0→12px), ease: `power3.out`
- [ ] **Step 2: Step transition GSAP timeline** — current step slides left + fades out, new step slides in from right + fades in
- [ ] **Step 3: Source tile hover** — scale(1.05), border glow, subtle tilt via CSS transform
- [ ] **Step 4: Drop zone drag-over** — border pulse animation, background color shift
- [ ] **Step 5: Card drop animation** — new cards enter from top of viewport, GSAP stagger 0.05s, each: y(-200) → y(target) + bounce + rotation
- [ ] **Step 6: Completion celebration** — CSS keyframes for sparkle particles, triggered after last card lands
- [ ] **Step 7: Toast notification** — slide in from top-right, 5s auto-dismiss with progress bar
- [ ] **Step 8: Liquid glass on modal** — apply `useLiquidGlass` hook to modal container, follow existing pattern from `SettingsPanel.tsx`
- [ ] **Step 9: Custom scrollbar for modal** — CSS `::-webkit-scrollbar` styles matching AllMarks theme
- [ ] **Step 10: Verify all animations on dev server**
- [ ] **Step 11: Commit**

```bash
git add components/import/ app/(app)/board/board-client.tsx app/globals.css
git commit -m "feat(s9): animation polish — liquid glass modal, card drop, celebration particles"
```

---

## Task 19: Run All Tests + Final Commit

- [ ] **Step 1: Run all unit tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: Run build**

Run: `npx next build`
Expected: No TypeScript errors, build succeeds

- [ ] **Step 3: Manual test on dev server** — import from each source type (browser HTML at minimum), verify cards appear, verify list panel, verify OGP fetch, verify error handling

- [ ] **Step 4: Update `docs/TODO.md`** — mark S9 as complete, update current state section

- [ ] **Step 5: Final commit**

```bash
git add docs/TODO.md
git commit -m "docs: mark S9 bulk import as complete"
```
