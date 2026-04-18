# 一括インポート単一フォルダ化 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一括インポートを「`インポート YYYY-MM-DD` という単一フォルダへ集約」する仕様に切り替え、インポート後に自動でそのフォルダに遷移するようにする。

**Architecture:** 既存の `buildFolderAssignments`／`FolderAssignment` を廃止し、`formatImportFolderName`＋`findImportFolder` という単純な read-only ヘルパーに置き換える。`executeImport` は引数から割り当て情報を削除し、当日フォルダを内部で find-or-create して `importFolderId` を返す。UI はプレビュー画面のフォルダ割り当て一覧を削除し、1 行の告知テキストに置換。`handleImportComplete` は `folders` 状態を再読込したうえで `setCurrentFolder(importFolderId)` を呼ぶ。

**Tech Stack:** TypeScript (strict), Next.js 14 App Router, idb, vitest + fake-indexeddb, React, GSAP.

**Spec:** `docs/superpowers/specs/2026-04-18-import-simplify-single-folder.md`

---

## ファイル構成

### 変更

- `lib/import/batch-import.ts` — `buildFolderAssignments` 削除、`executeImport` 書き換え、`formatImportFolderName` / `findImportFolder` 追加
- `lib/import/types.ts` — `FolderAssignment` 型を削除
- `components/import/ImportPreview.tsx` — フォルダ割り当て UI を削除、告知テキストを追加、`onExecute` の引数から `assignments` を削除
- `components/import/ImportModal.tsx` — `handleExecute` の引数を追従、`ImportedBookmark`／`FolderAssignment` の import を整理
- `app/(app)/board/board-client.tsx` — `handleImportComplete` に folders 再読込 + `setCurrentFolder` を追加、`savedCount` に加えて `importFolderId` を受け取れるようにする

### 新規

- `tests/lib/import/batch-import.test.ts` — `formatImportFolderName` / `findImportFolder` / `executeImport` の単一フォルダ挙動テスト（fake-indexeddb 使用）

### 変更しないファイル（明示）

- `lib/import/parse-*.ts` — 全パーサーはそのまま。`ImportedBookmark.folder` 出力は残すが、後段で無視される
- `lib/import/deduplicate.ts` — 挙動変更なし
- `lib/storage/indexeddb.ts` — 低レベル CRUD は変更不要

---

## Task 1: `formatImportFolderName` を追加（TDD）

**Files:**
- Test: `tests/lib/import/batch-import.test.ts` (新規作成)
- Modify: `lib/import/batch-import.ts`

- [ ] **Step 1.1: テストファイルを新規作成し `formatImportFolderName` の失敗テストを書く**

`tests/lib/import/batch-import.test.ts` を新規作成:

```ts
import { describe, it, expect } from 'vitest'
import { formatImportFolderName } from '@/lib/import/batch-import'

describe('formatImportFolderName', () => {
  it('returns インポート YYYY-MM-DD in local date', () => {
    const date = new Date(2026, 3, 18, 12, 0, 0) // 2026-04-18 local
    expect(formatImportFolderName(date)).toBe('インポート 2026-04-18')
  })

  it('zero-pads month and day', () => {
    const date = new Date(2026, 0, 5, 12, 0, 0) // 2026-01-05 local
    expect(formatImportFolderName(date)).toBe('インポート 2026-01-05')
  })
})
```

- [ ] **Step 1.2: テストを実行して失敗を確認**

Run: `pnpm vitest run tests/lib/import/batch-import.test.ts`
Expected: FAIL — `formatImportFolderName is not a function` または export が無いエラー。

- [ ] **Step 1.3: `lib/import/batch-import.ts` に実装を追加**

ファイル先頭のインポート行の直下（既存の `import type {...}` 群の後）に追記:

```ts
/**
 * Build the canonical name for an "import bucket" folder based on a local date.
 * Format: `インポート YYYY-MM-DD`. Uses Swedish locale for stable ISO date output.
 */
export function formatImportFolderName(date: Date): string {
  return `インポート ${date.toLocaleDateString('sv-SE')}`
}
```

- [ ] **Step 1.4: テストを実行して成功を確認**

Run: `pnpm vitest run tests/lib/import/batch-import.test.ts`
Expected: PASS — `formatImportFolderName` の 2 テストが緑。

- [ ] **Step 1.5: Commit**

```bash
rtk git add tests/lib/import/batch-import.test.ts lib/import/batch-import.ts
rtk git commit -m "feat(import): add formatImportFolderName helper"
```

---

## Task 2: `findImportFolder` を追加（TDD）

**Files:**
- Modify: `tests/lib/import/batch-import.test.ts`
- Modify: `lib/import/batch-import.ts`

- [ ] **Step 2.1: 失敗テストを追加**

`tests/lib/import/batch-import.test.ts` の先頭 import を拡張し describe ブロックを追加:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { type IDBPDatabase } from 'idb'
import { formatImportFolderName, findImportFolder } from '@/lib/import/batch-import'
import { initDB, addFolder, type FolderRecord } from '@/lib/storage/indexeddb'

// 既存 describe('formatImportFolderName', ...) はそのまま残す

describe('findImportFolder', () => {
  let db: IDBPDatabase<unknown> | null = null

  beforeEach(async () => {
    const databases = await globalThis.indexedDB.databases()
    for (const info of databases) {
      if (info.name) globalThis.indexedDB.deleteDatabase(info.name)
    }
  })

  afterEach(() => {
    if (db) {
      db.close()
      db = null
    }
  })

  it('returns null when no folder matches today', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>
    const result = await findImportFolder(database, new Date(2026, 3, 18, 12, 0, 0))
    expect(result).toBeNull()
  })

  it('returns the folder record when a matching folder exists', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>
    const created: FolderRecord = await addFolder(database, {
      name: 'インポート 2026-04-18',
      color: '#ff6b6b',
      order: 0,
    })
    const result = await findImportFolder(database, new Date(2026, 3, 18, 12, 0, 0))
    expect(result?.id).toBe(created.id)
  })

  it('ignores folders with similar but non-matching names', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>
    await addFolder(database, { name: 'インポート', color: '#ff6b6b', order: 0 })
    await addFolder(database, { name: 'インポート 2026-04-17', color: '#339af0', order: 1 })
    const result = await findImportFolder(database, new Date(2026, 3, 18, 12, 0, 0))
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2.2: テストを実行して失敗を確認**

Run: `pnpm vitest run tests/lib/import/batch-import.test.ts`
Expected: FAIL — `findImportFolder is not a function`。

- [ ] **Step 2.3: `lib/import/batch-import.ts` に実装を追加**

ファイル上部の既存 import 群に `FolderRecord` を追加（`getAllFolders` の行を修正）:

```ts
import {
  addFolder,
  getAllFolders,
  addBookmarkBatch,
  getAllBookmarks,
  updateBookmarkOgp,
  type FolderRecord,
} from '@/lib/storage/indexeddb'
```

続いて `formatImportFolderName` の直下に実装を追加:

```ts
/**
 * Look up the "インポート YYYY-MM-DD" folder for the given local date.
 * Returns null if no folder exists with that exact name yet.
 */
export async function findImportFolder(
  db: IDBPDatabase<unknown>,
  date: Date,
): Promise<FolderRecord | null> {
  const typedDb = db as Parameters<typeof getAllFolders>[0]
  const folders = await getAllFolders(typedDb)
  const target = formatImportFolderName(date)
  return folders.find((f) => f.name === target) ?? null
}
```

- [ ] **Step 2.4: テストを実行して成功を確認**

Run: `pnpm vitest run tests/lib/import/batch-import.test.ts`
Expected: PASS — `findImportFolder` の 3 テストが緑、`formatImportFolderName` も緑。

- [ ] **Step 2.5: Commit**

```bash
rtk git add tests/lib/import/batch-import.test.ts lib/import/batch-import.ts
rtk git commit -m "feat(import): add findImportFolder read-only helper"
```

---

## Task 3: `executeImport` を単一フォルダ版に書き換え（TDD）

**Files:**
- Modify: `tests/lib/import/batch-import.test.ts`
- Modify: `lib/import/batch-import.ts`

- [ ] **Step 3.1: 失敗テストを追加**

`tests/lib/import/batch-import.test.ts` の末尾に describe ブロックを追加:

```ts
import { executeImport } from '@/lib/import/batch-import'
import { getAllBookmarks, getBookmarksByFolder } from '@/lib/storage/indexeddb'
import type { ImportedBookmark } from '@/lib/import/types'

describe('executeImport (single-folder)', () => {
  let db: IDBPDatabase<unknown> | null = null

  beforeEach(async () => {
    const databases = await globalThis.indexedDB.databases()
    for (const info of databases) {
      if (info.name) globalThis.indexedDB.deleteDatabase(info.name)
    }
  })

  afterEach(() => {
    if (db) {
      db.close()
      db = null
    }
  })

  const bookmarks: ImportedBookmark[] = [
    { url: 'https://a.example.com', title: 'A', source: 'browser', folder: 'Work' },
    { url: 'https://b.example.com', title: 'B', source: 'browser', folder: 'Recipe' },
    { url: 'https://c.example.com', title: 'C', source: 'browser' },
  ]

  it('creates インポート YYYY-MM-DD folder on first run and puts all bookmarks there', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>

    const result = await executeImport(database, bookmarks, new Date(2026, 3, 18, 12, 0, 0))

    expect(result.saved).toBe(3)
    expect(result.importFolderId).toBeTruthy()

    const folders = await getAllFolders(database)
    const importFolder = folders.find((f) => f.name === 'インポート 2026-04-18')
    expect(importFolder?.id).toBe(result.importFolderId)

    const inFolder = await getBookmarksByFolder(database, result.importFolderId)
    expect(inFolder).toHaveLength(3)
  })

  it('ignores the parser-provided folder field entirely', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>

    await executeImport(database, bookmarks, new Date(2026, 3, 18, 12, 0, 0))

    const folders = await getAllFolders(database)
    const names = folders.map((f) => f.name)
    expect(names).not.toContain('Work')
    expect(names).not.toContain('Recipe')
  })

  it('reuses the same folder for same-day re-import', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>
    const date = new Date(2026, 3, 18, 12, 0, 0)

    const first = await executeImport(database, bookmarks, date)
    const more: ImportedBookmark[] = [
      { url: 'https://d.example.com', title: 'D', source: 'browser' },
      { url: 'https://e.example.com', title: 'E', source: 'browser' },
    ]
    const second = await executeImport(database, more, date)

    expect(second.importFolderId).toBe(first.importFolderId)

    const inFolder = await getBookmarksByFolder(database, first.importFolderId)
    expect(inFolder).toHaveLength(5)

    const folders = await getAllFolders(database)
    const importFolders = folders.filter((f) => f.name.startsWith('インポート'))
    expect(importFolders).toHaveLength(1)
  })

  it('creates a new folder when importing on a different date', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>

    const r1 = await executeImport(database, bookmarks, new Date(2026, 3, 18, 12, 0, 0))
    const r2 = await executeImport(
      database,
      [{ url: 'https://z.example.com', title: 'Z', source: 'browser' }],
      new Date(2026, 3, 19, 12, 0, 0),
    )

    expect(r2.importFolderId).not.toBe(r1.importFolderId)

    const folders = await getAllFolders(database)
    const importFolders = folders.filter((f) => f.name.startsWith('インポート'))
    expect(importFolders.map((f) => f.name).sort()).toEqual([
      'インポート 2026-04-18',
      'インポート 2026-04-19',
    ])
  })

  it('still skips duplicates within the same import', async () => {
    const database = await initDB()
    db = database as unknown as IDBPDatabase<unknown>
    const withDup: ImportedBookmark[] = [
      ...bookmarks,
      { url: 'https://a.example.com', title: 'Dup A', source: 'browser' },
    ]

    const result = await executeImport(database, withDup, new Date(2026, 3, 18, 12, 0, 0))

    expect(result.saved).toBe(3)
    expect(result.skipped).toBe(1)

    const all = await getAllBookmarks(database)
    expect(all).toHaveLength(3)
  })
})
```

- [ ] **Step 3.2: テストを実行して失敗を確認**

Run: `pnpm vitest run tests/lib/import/batch-import.test.ts`
Expected: FAIL — `executeImport` が古いシグネチャ（`folderAssignments` 必須、`importFolderId` 未返却）のためテストが落ちる。

- [ ] **Step 3.3: `executeImport` を書き換え**

`lib/import/batch-import.ts` 内の既存 `executeImport` 関数（`export async function executeImport(...)` から末尾の `return { saved: ..., skipped: ..., failed: [] }` まで）を、以下のブロックで**完全に置き換える**:

```ts
/**
 * Execute the import: find-or-create today's "インポート" folder,
 * deduplicate, batch save, start OGP queue.
 *
 * All bookmarks go into a single `インポート YYYY-MM-DD` folder regardless of
 * the `folder` field produced by parsers. Same-day re-import appends to the
 * existing folder.
 *
 * @param db - The IndexedDB database instance
 * @param bookmarks - Parsed bookmarks to import
 * @param now - The current date, injectable for deterministic tests
 * @param onProgress - Optional callback for save/OGP progress
 * @param onOgpUpdate - Optional callback fired when a single bookmark's OGP is fetched
 * @returns Summary of saved/skipped counts and the folder ID that received them
 */
export async function executeImport(
  db: IDBPDatabase<unknown>,
  bookmarks: ImportedBookmark[],
  now: Date = new Date(),
  onProgress?: (progress: ImportProgress) => void,
  onOgpUpdate?: (bookmarkId: string, bookmark: BookmarkRecord) => void,
): Promise<{ saved: number; skipped: number; failed: string[]; importFolderId: string }> {
  const typedDb = db as Parameters<typeof getAllFolders>[0]

  // 1. Find or create today's import folder
  const existing = await findImportFolder(db, now)
  let importFolder: FolderRecord
  if (existing) {
    importFolder = existing
  } else {
    const allFolders = await getAllFolders(typedDb)
    const colorIdx = allFolders.length % FOLDER_COLORS.length
    importFolder = await addFolder(typedDb, {
      name: formatImportFolderName(now),
      color: FOLDER_COLORS[colorIdx],
      order: allFolders.length,
    })
  }

  // 2. Deduplicate against existing bookmarks (all folders) and within the batch
  const existingBookmarks = await getAllBookmarks(typedDb)
  const existingUrls = existingBookmarks.map((b) => b.url)
  const { unique, duplicates } = findDuplicates(bookmarks, existingUrls)

  // 3. Prepare bookmark inputs — every item goes to importFolder
  const inputs: BookmarkInput[] = unique.map((bm) => {
    const urlType = detectUrlType(bm.url)
    const needsOgp = urlType !== 'tweet' && urlType !== 'youtube'
    return {
      url: bm.url,
      title: bm.title,
      description: bm.description ?? '',
      thumbnail: '',
      favicon: '',
      siteName: '',
      type: urlType,
      folderId: importFolder.id,
      ogpStatus: (needsOgp ? 'pending' : 'fetched') as OgpStatus,
    }
  })

  // 4. Batch save (no-op when inputs is empty)
  const saved = inputs.length > 0
    ? await addBookmarkBatch(typedDb, inputs, 50, (completed) => {
        onProgress?.({ phase: 'saving', completed, total: inputs.length })
      })
    : []

  // 5. Start background OGP fetch for pending bookmarks
  const pendingOgp = saved.filter((b) => b.ogpStatus === 'pending')
  if (pendingOgp.length > 0) {
    void fetchOgpBatch(typedDb, pendingOgp, onProgress, onOgpUpdate)
  }

  return {
    saved: saved.length,
    skipped: duplicates.length,
    failed: [],
    importFolderId: importFolder.id,
  }
}
```

注意: 既存の `buildFolderAssignments` 関数は Task 4 で削除する。この Task では `executeImport` の書き換えだけを行う。また、上記 `executeImport` のシグネチャから `folderAssignments` 引数が消えるため、呼び出し側（`ImportModal.tsx`）は次の Task 5 で更新する。ここではまだテストが通るだけで OK。

- [ ] **Step 3.4: テストを実行して成功を確認**

Run: `pnpm vitest run tests/lib/import/batch-import.test.ts`
Expected: PASS — 新規 5 テスト + 既存 5 テスト（formatImportFolderName 2 件、findImportFolder 3 件）が全て緑。

- [ ] **Step 3.5: Commit**

```bash
rtk git add tests/lib/import/batch-import.test.ts lib/import/batch-import.ts
rtk git commit -m "feat(import): rewrite executeImport to use single daily folder"
```

---

## Task 4: `buildFolderAssignments` と `FolderAssignment` を削除

**Files:**
- Modify: `lib/import/batch-import.ts`
- Modify: `lib/import/types.ts`

- [ ] **Step 4.1: `lib/import/batch-import.ts` から `buildFolderAssignments` を削除**

`batch-import.ts` 内の以下を**完全に削除**:

1. `export async function buildFolderAssignments(...)` 関数本体全部（`import type { ... FolderAssignment ... } from './types'` の `FolderAssignment` も併せて削除）
2. 先頭の `import type` 行から `FolderAssignment` を取り除く

現在の import 行は次のようになっている:

```ts
import type { ImportedBookmark, FolderAssignment, OgpStatus } from './types'
```

これを次に置き換える（`FolderAssignment` だけを外し、`OgpStatus` は `executeImport` 内で使うので残す）:

```ts
import type { ImportedBookmark, OgpStatus } from './types'
```

- [ ] **Step 4.2: `lib/import/types.ts` から `FolderAssignment` 型を削除**

`lib/import/types.ts` 内の以下のブロック全体を削除:

```ts
/**
 * Folder assignment for import preview
 */
export interface FolderAssignment {
  /** Source folder name (from file) */
  sourceName: string
  /** Target Booklage folder ID (existing or new) */
  targetFolderId: string
  /** Whether this folder needs to be created */
  isNew: boolean
  /** Number of bookmarks in this folder */
  count: number
}
```

- [ ] **Step 4.3: 型チェックを実行**

Run: `pnpm tsc --noEmit`
Expected: `ImportPreview.tsx` と `ImportModal.tsx` で `FolderAssignment` と `buildFolderAssignments` の参照が未解決になり、型エラーになる。これは Task 5/6 で解消するので**この時点では型エラーが残って OK**。

（補足: この中間状態で型エラーが残ることを受け入れるのは、機能ファイル単位のコミット粒度を保ちやすくするため。次の Task 5 で UI 側を同時に直す。）

- [ ] **Step 4.4: Commit（中間状態を記録）**

```bash
rtk git add lib/import/batch-import.ts lib/import/types.ts
rtk git commit -m "refactor(import): remove buildFolderAssignments and FolderAssignment type"
```

---

## Task 5: `ImportPreview` を簡素化（告知テキストへ置換）

**Files:**
- Modify: `components/import/ImportPreview.tsx`

- [ ] **Step 5.1: `ImportPreview.tsx` を書き換え**

ファイル全体を次のように置き換える:

```tsx
'use client'

import { useEffect, useState } from 'react'
import type { IDBPDatabase } from 'idb'
import type { ImportedBookmark, ParseResult } from '@/lib/import/types'
import { findDuplicates } from '@/lib/import/deduplicate'
import { getAllBookmarks, getBookmarksByFolder } from '@/lib/storage/indexeddb'
import { findImportFolder, formatImportFolderName } from '@/lib/import/batch-import'
import styles from './ImportPreview.module.css'

/** Props for ImportPreview */
type ImportPreviewProps = {
  /** Parsed result from the file uploader */
  parseResult: ParseResult
  /** IndexedDB database instance */
  db: IDBPDatabase<unknown>
  /** Called when user confirms import with the unique bookmarks */
  onExecute: (bookmarks: ImportedBookmark[]) => void
  /** Called when user wants to go back to file upload */
  onBack: () => void
}

/**
 * Step 3: Preview parsed bookmarks, show duplicate warnings, and confirm import.
 * All bookmarks will be placed in a single `インポート YYYY-MM-DD` folder.
 */
export function ImportPreview({
  parseResult,
  db,
  onExecute,
  onBack: _onBack,
}: ImportPreviewProps): React.ReactElement {
  const [duplicateCount, setDuplicateCount] = useState(0)
  const [uniqueBookmarks, setUniqueBookmarks] = useState<ImportedBookmark[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [targetFolderName, setTargetFolderName] = useState('')
  const [targetIsNew, setTargetIsNew] = useState(true)
  const [targetExistingCount, setTargetExistingCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function prepare(): Promise<void> {
      try {
        const now = new Date()
        const folderName = formatImportFolderName(now)
        const existing = await findImportFolder(db, now)
        let existingCount = 0
        if (existing) {
          const typedDb = db as Parameters<typeof getBookmarksByFolder>[0]
          const inFolder = await getBookmarksByFolder(typedDb, existing.id)
          existingCount = inFolder.length
        }

        const typedDbAll = db as Parameters<typeof getAllBookmarks>[0]
        const existingBookmarks = await getAllBookmarks(typedDbAll)
        const existingUrls = existingBookmarks.map((b) => b.url)
        const { unique, duplicates } = findDuplicates(parseResult.bookmarks, existingUrls)

        if (!cancelled) {
          setDuplicateCount(duplicates.length)
          setUniqueBookmarks(unique)
          setTargetFolderName(folderName)
          setTargetIsNew(!existing)
          setTargetExistingCount(existingCount)
          setIsLoading(false)
        }
      } catch {
        if (!cancelled) setIsLoading(false)
      }
    }

    void prepare()
    return () => {
      cancelled = true
    }
  }, [db, parseResult.bookmarks])

  const handleExecute = (): void => {
    onExecute(uniqueBookmarks)
  }

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.summary}>
          <span className={styles.summaryIcon}>{'\u{1F50D}'}</span>
          <div className={styles.summaryText}>
            <span className={styles.summaryCount}>{'\u2026'}</span>
            <span className={styles.summaryLabel}>{'解析中...'}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {/* Summary */}
      <div className={styles.summary}>
        <span className={styles.summaryIcon}>{'\u{1F4DA}'}</span>
        <div className={styles.summaryText}>
          <div className={styles.summaryCount}>
            {uniqueBookmarks.length}{'件'}
          </div>
          <div className={styles.summaryLabel}>
            {'インポート可能なブックマーク'}
          </div>
        </div>
      </div>

      {/* Duplicate warning */}
      {duplicateCount > 0 && (
        <div className={styles.duplicateWarning}>
          <span className={styles.duplicateIcon}>{'\u26A0\uFE0F'}</span>
          <span className={styles.duplicateText}>
            {duplicateCount}{'件の重複が見つかりました。自動的にスキップされます。'}
          </span>
        </div>
      )}

      {/* Parse errors */}
      {parseResult.errors.length > 0 && (
        <div className={styles.parseErrors}>
          <span className={styles.parseErrorsTitle}>
            {'解析エラー('}{parseResult.errors.length}{'件)'}
          </span>
          {parseResult.errors.slice(0, 5).map((err, i) => (
            <span key={i} className={styles.parseError}>{err}</span>
          ))}
          {parseResult.errors.length > 5 && (
            <span className={styles.parseError}>
              {'他 '}{parseResult.errors.length - 5}{'件...'}
            </span>
          )}
        </div>
      )}

      {/* Destination announcement */}
      <div className={styles.destination}>
        <span className={styles.destinationIcon}>{'\u{1F4C2}'}</span>
        <span className={styles.destinationText}>
          {targetIsNew
            ? `新しいフォルダ「${targetFolderName}」を作成して追加します`
            : `既存の「${targetFolderName}」に追加します(現在 ${targetExistingCount} 件)`}
        </span>
      </div>

      {/* Action */}
      <div className={styles.actionArea}>
        <button
          className={styles.importButton}
          onClick={handleExecute}
          disabled={uniqueBookmarks.length === 0}
          type="button"
        >
          {uniqueBookmarks.length}{'件をインポート'}
        </button>
      </div>
    </div>
  )
}
```

補足: `styles.destination` / `styles.destinationIcon` / `styles.destinationText` は新規クラス。次のステップで CSS を追加する。既存の `styles.folderSection` / `styles.folderList` / `styles.folderRow` / `styles.folderIcon` / `styles.folderName` / `styles.folderCount` / `styles.badgeNew` / `styles.badgeExisting` は未使用になるので CSS から削除する。

- [ ] **Step 5.2: CSS に `destination` クラスを追加**

`components/import/ImportPreview.module.css` を開き、末尾に次を追加:

```css
.destination {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 14px;
  color: var(--text-primary, #111);
}

.destinationIcon {
  font-size: 18px;
  flex-shrink: 0;
}

.destinationText {
  flex: 1;
  line-height: 1.5;
}
```

同ファイル内の下記クラスを**完全に削除**（セレクタごと）:

```
.folderSection, .folderSectionTitle, .folderList, .folderRow,
.folderIcon, .folderName, .folderCount, .badgeNew, .badgeExisting
```

（ファイル内を検索して該当する `.folder*` と `.badge*` のルールブロックを削除する。新しく作った `.destination*` と名前が被らないよう注意。）

- [ ] **Step 5.3: 型チェックを実行**

Run: `pnpm tsc --noEmit`
Expected: `ImportPreview.tsx` 関連の型エラーは解消。残っているのは `ImportModal.tsx` の `handleExecute` が `assignments` を渡している箇所のエラーのみ（Task 6 で解消）。

- [ ] **Step 5.4: Commit**

```bash
rtk git add components/import/ImportPreview.tsx components/import/ImportPreview.module.css
rtk git commit -m "refactor(import): simplify preview to single-folder announcement"
```

---

## Task 6: `ImportModal` と `board-client` を新シグネチャに追従

**Files:**
- Modify: `components/import/ImportModal.tsx`
- Modify: `app/(app)/board/board-client.tsx`

- [ ] **Step 6.1: `ImportModal.tsx` の imports を整理**

`components/import/ImportModal.tsx` の冒頭 `import type` 行を以下に置き換える:

```ts
import type { ImportSource, ImportedBookmark, ParseResult } from '@/lib/import/types'
```

（`FolderAssignment` の import を削除）

- [ ] **Step 6.2: `handleExecute` のシグネチャを修正**

同ファイル内の `handleExecute` を次のように置き換える:

```tsx
  const handleExecute = useCallback(
    async (bookmarks: ImportedBookmark[]): Promise<void> => {
      if (!db) return
      animateStepTransition('forward', () => {
        setStep('progress')
      })

      try {
        const result = await executeImport(
          db,
          bookmarks,
          new Date(),
          (p) => setProgress(p),
        )
        setSavedCount(result.saved)
        setSkippedCount(result.skipped)
        setIsComplete(true)
        onImportComplete(result.saved, result.importFolderId)
      } catch {
        setIsComplete(true)
      }
    },
    [db, animateStepTransition, onImportComplete],
  )
```

- [ ] **Step 6.3: `ImportModal` の props 型を更新**

同ファイル内の `ImportModalProps` 型定義を次のように更新:

```ts
/** Props for ImportModal */
type ImportModalProps = {
  /** Whether the modal is open */
  isOpen: boolean
  /** Called to close the modal */
  onClose: () => void
  /** IndexedDB database instance */
  db: IDBPDatabase<unknown> | null
  /** Called after import completes successfully, with the saved count and the target folder ID */
  onImportComplete: (savedCount: number, importFolderId: string) => void
}
```

`ImportPreview` 呼び出し部分も引数変更に追従:

```tsx
{step === 'preview' && parseResult && db && (
  <ImportPreview
    parseResult={parseResult}
    db={db}
    onExecute={handleExecute}
    onBack={handleBack}
  />
)}
```

（この部分は既にこの形のはずなので差分ゼロなら OK）

- [ ] **Step 6.4: `board-client.tsx` の `handleImportComplete` を更新**

`app/(app)/board/board-client.tsx` の `handleImportComplete` 関数（現在 line 537-556 付近）を次のように置き換える:

```tsx
  // ── Import complete handler ──────────────────────────────────
  const handleImportComplete = useCallback(
    async (savedCount: number, importFolderId: string): Promise<void> => {
      if (!db) return

      // Reload folders so the new import folder shows up in the sidebar
      const allFolders = await getAllFolders(db)
      setFolders(allFolders)

      // Navigate to the import folder so the user sees what they just imported
      setCurrentFolder(importFolderId)

      // Load items for the import folder
      const [bookmarks, cards] = await Promise.all([
        getBookmarksByFolder(db, importFolderId),
        getCardsByFolder(db, importFolderId),
      ])
      const bookmarkMap = new Map(bookmarks.map((b) => [b.id, b]))
      const paired: CardWithBookmark[] = []
      for (const card of cards) {
        const bookmark = bookmarkMap.get(card.bookmarkId)
        if (bookmark) paired.push({ card, bookmark })
      }
      setItems(paired)
      setShowImportModal(false)
      if (savedCount > 0) setShowListPanel(true)
    },
    [db],
  )
```

変更点:
- 引数に `importFolderId: string` を追加
- `getAllFolders(db)` で folders state を再読込
- `setCurrentFolder(importFolderId)` でインポートフォルダへ自動遷移
- `getBookmarksByFolder` / `getCardsByFolder` を `importFolderId` で呼ぶ（`currentFolder` ではなく）
- 依存配列から `currentFolder` を削除

- [ ] **Step 6.5: 型チェックを実行**

Run: `pnpm tsc --noEmit`
Expected: PASS — 型エラー 0 件。

- [ ] **Step 6.6: 全テストを実行**

Run: `pnpm vitest run`
Expected: PASS — 全テスト（108 + 新規 10 = 118 件前後）が緑。

- [ ] **Step 6.7: Commit**

```bash
rtk git add components/import/ImportModal.tsx app/(app)/board/board-client.tsx
rtk git commit -m "feat(import): navigate to import folder after completion"
```

---

## Task 7: 手動動作確認

**Files:** なし（確認のみ）

- [ ] **Step 7.1: dev サーバーを起動**

Run: `pnpm dev`
Expected: `http://localhost:3000` が起動。

- [ ] **Step 7.2: YouTube Watch Later CSV で確認**

手順:
1. ボード画面を開く
2. 右上「インポート」ボタンをクリック
3. YouTube タイルを選択
4. `C:\Users\masay\Downloads\takeout-20260415T060623Z-3-001\Takeout\YouTube と YouTube Music\再生リスト\Watch later の動画.csv` をドロップ
5. プレビュー画面で「新しいフォルダ『インポート 2026-04-18』を作成して追加します」と表示されることを確認（日付はその日のローカル日付）
6. 「140件をインポート」クリック
7. **完了後、リロードせずに 140 件のカードが画面に表示されること**
8. サイドバーに「インポート 2026-04-18」フォルダが出現していること
9. currentFolder がそのフォルダに切り替わっていること

- [ ] **Step 7.3: Chrome ブックマーク HTML で確認（平坦化の確認）**

手順:
1. 同じ日に、Chrome エクスポートの HTML（複数フォルダ含む）をインポート
2. プレビュー画面で「既存の『インポート 2026-04-18』に追加します(現在 140 件)」と表示されることを確認
3. 実行 → Chrome 側のフォルダ階層が**一切作られず**、既存のインポートフォルダに合流することを確認

- [ ] **Step 7.4: 重複インポートの確認**

手順:
1. 同じ CSV を再度インポート
2. プレビュー画面で「XXX件の重複が見つかりました」と全件が重複判定になることを確認
3. 実行 → 新しいブックマークが追加されない（件数が増えない）

- [ ] **Step 7.5: Commit なし**

このタスクは確認のみ。問題が見つかった場合は該当する Task に戻り修正する。

---

## 完了条件

- [ ] 全 Task のチェックボックスが埋まっている
- [ ] `pnpm vitest run` が全て緑
- [ ] `pnpm tsc --noEmit` が型エラー 0 件
- [ ] Task 7 の手動確認が全項目パス

## Spec カバレッジ確認

| Spec 要求 | カバー Task |
|----------|------------|
| フォルダ名 `インポート YYYY-MM-DD` | Task 1 |
| find-or-create による同日集約 | Task 2, 3 |
| `executeImport` を単一フォルダ化 | Task 3 |
| `buildFolderAssignments` / `FolderAssignment` 廃止 | Task 4 |
| `ImportPreview` の割り当て UI 削除 | Task 5 |
| 告知テキスト（新規 / 既存 N 件） | Task 5 |
| `handleImportComplete` で folders 再読込 + 自動遷移 | Task 6 |
| パーサー群は無変更 | 全タスクで触らない |
| YouTube Watch Later CSV が正しく表示 | Task 7.2 |
| 重複スキップ挙動を保持 | Task 3.1（5 番目のテスト） |
| タイムゾーン: ローカル日付 | Task 1（`toLocaleDateString('sv-SE')`） |
