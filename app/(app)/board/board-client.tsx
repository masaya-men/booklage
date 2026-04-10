'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useInfiniteCanvas } from '@/lib/canvas/use-infinite-canvas'
import {
  initDB,
  addBookmark,
  getBookmarksByFolder,
  getCardsByFolder,
  addFolder,
  getAllFolders,
  updateCard,
} from '@/lib/storage/indexeddb'
import type { BookmarkRecord, CardRecord, FolderRecord } from '@/lib/storage/indexeddb'

/** Database instance type derived from initDB return value */
type BooklageDB = Awaited<ReturnType<typeof initDB>>
import { detectUrlType, extractTweetId } from '@/lib/utils/url'
import { fetchOgp } from '@/lib/scraper/ogp'
import { FLOAT_DELAY_MAX, FLOAT_DURATION, FOLDER_COLORS, Z_INDEX } from '@/lib/constants'
import { Canvas } from '@/components/board/Canvas'
import { BookmarkCard } from '@/components/board/BookmarkCard'
import { TweetCard } from '@/components/board/TweetCard'
import { UrlInput } from '@/components/board/UrlInput'
import { DraggableCard } from '@/components/board/DraggableCard'
import { FolderNav } from '@/components/board/FolderNav'
import { ExportButton } from '@/components/board/ExportButton'
import { ThemeSelector } from '@/components/board/ThemeSelector'
import { RandomPick } from '@/components/board/RandomPick'
import { ColorSuggest } from '@/components/board/ColorSuggest'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A card paired with its associated bookmark for rendering */
type CardWithBookmark = {
  card: CardRecord
  bookmark: BookmarkRecord
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Main board orchestrator.
 *
 * - Initialises IndexedDB on mount.
 * - Creates a default "My Collage" folder when none exist.
 * - Loads bookmark + card pairs for the current folder.
 * - Handles URL submission: detects type, fetches OGP metadata, saves to DB.
 * - Renders cards inside a Canvas with the UrlInput overlay.
 * - Cards are draggable via GSAP Draggable, with position persistence.
 * - FolderNav allows switching between and creating folders.
 */
export function BoardClient(): React.ReactElement {
  // ── State ────────────────────────────────────────────────────
  const [db, setDb] = useState<BooklageDB | null>(null)
  const [folders, setFolders] = useState<FolderRecord[]>([])
  const [currentFolder, setCurrentFolder] = useState<string | null>(null)
  const [items, setItems] = useState<CardWithBookmark[]>([])
  const [loading, setLoading] = useState(false)
  const [bgTheme, setBgTheme] = useState('dark')

  const worldRef = useRef<HTMLDivElement | null>(null)
  const canvas = useInfiniteCanvas()

  // ── DB & folder init ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function init(): Promise<void> {
      const database = await initDB()
      if (cancelled) return
      setDb(database)

      const allFolders = await getAllFolders(database)
      if (allFolders.length === 0) {
        const created = await addFolder(database, {
          name: 'My Collage',
          color: FOLDER_COLORS[5], // blue
          order: 0,
        })
        if (!cancelled) {
          setFolders([created])
          setCurrentFolder(created.id)
        }
      } else {
        if (!cancelled) {
          setFolders(allFolders)
          setCurrentFolder(allFolders[0].id)
        }
      }
    }

    void init()
    return () => { cancelled = true }
  }, [])

  // ── Load items when folder changes ───────────────────────────
  useEffect(() => {
    if (!db || !currentFolder) return
    let cancelled = false

    async function loadItems(): Promise<void> {
      if (!db || !currentFolder) return
      const [bookmarks, cards] = await Promise.all([
        getBookmarksByFolder(db, currentFolder),
        getCardsByFolder(db, currentFolder),
      ])

      // Pair cards with their bookmarks
      const bookmarkMap = new Map(bookmarks.map((b) => [b.id, b]))
      const paired: CardWithBookmark[] = []
      for (const card of cards) {
        const bookmark = bookmarkMap.get(card.bookmarkId)
        if (bookmark) {
          paired.push({ card, bookmark })
        }
      }

      if (!cancelled) setItems(paired)
    }

    void loadItems()
    return () => { cancelled = true }
  }, [db, currentFolder])

  // ── Drag end handler (persists position to IndexedDB) ────────
  const handleDragEnd = useCallback(
    async (cardId: string, x: number, y: number): Promise<void> => {
      if (!db) return
      await updateCard(db, cardId, { x, y })
    },
    [db],
  )

  // ── Folder selection handler ─────────────────────────────────
  const handleSelectFolder = useCallback(
    (folder: FolderRecord): void => {
      setCurrentFolder(folder.id)
    },
    [],
  )

  // ── Add folder handler ───────────────────────────────────────
  const handleAddFolder = useCallback(
    async (name: string): Promise<void> => {
      if (!db) return
      const colorIndex = folders.length % FOLDER_COLORS.length
      const color = FOLDER_COLORS[colorIndex]
      const order = folders.length

      const created = await addFolder(db, { name, color, order })

      // Reload all folders and switch to the new one
      const allFolders = await getAllFolders(db)
      setFolders(allFolders)
      setCurrentFolder(created.id)
    },
    [db, folders.length],
  )

  // ── URL submit handler ───────────────────────────────────────
  const handleUrlSubmit = useCallback(
    async (url: string): Promise<void> => {
      if (!db || !currentFolder) return
      setLoading(true)

      try {
        const urlType = detectUrlType(url)

        // For tweets, use special metadata; for others, fetch OGP
        let title: string
        let description: string
        let thumbnail: string
        let favicon: string
        let siteName: string

        if (urlType === 'tweet') {
          const tweetId = extractTweetId(url)
          title = tweetId ? `Tweet ${tweetId}` : 'Tweet'
          description = ''
          thumbnail = ''
          favicon = 'https://abs.twimg.com/favicons/twitter.3.ico'
          siteName = 'X (Twitter)'
        } else {
          try {
            const ogp = await fetchOgp(url)
            title = ogp.title
            description = ogp.description
            thumbnail = ogp.image
            favicon = ogp.favicon
            siteName = ogp.siteName
          } catch {
            // OGP fetch failed — save with minimal metadata
            title = url
            description = ''
            thumbnail = ''
            favicon = ''
            siteName = ''
          }
        }

        await addBookmark(db, {
          url,
          title,
          description,
          thumbnail,
          favicon,
          siteName,
          type: urlType,
          folderId: currentFolder,
        })

        // Reload items from DB to include the new card
        const [bookmarks, cards] = await Promise.all([
          getBookmarksByFolder(db, currentFolder),
          getCardsByFolder(db, currentFolder),
        ])
        const bookmarkMap = new Map(bookmarks.map((b) => [b.id, b]))
        const paired: CardWithBookmark[] = []
        for (const card of cards) {
          const bookmark = bookmarkMap.get(card.bookmarkId)
          if (bookmark) {
            paired.push({ card, bookmark })
          }
        }
        setItems(paired)
      } finally {
        setLoading(false)
      }
    },
    [db, currentFolder],
  )

  // ── Render ───────────────────────────────────────────────────
  return (
    <>
      <FolderNav
        folders={folders}
        currentFolderId={currentFolder}
        onSelectFolder={handleSelectFolder}
        onAddFolder={handleAddFolder}
      />

      <Canvas bgTheme={bgTheme} canvas={canvas} worldRef={worldRef}>
        {items.map(({ card, bookmark }) => {
          const innerStyle: React.CSSProperties = {
            zIndex: card.zIndex || Z_INDEX.CANVAS_CARD,
            ['--card-rotation' as string]: `${card.rotation}deg`,
            ['--float-delay' as string]: `${(Math.random() * FLOAT_DELAY_MAX).toFixed(2)}s`,
            ['--float-duration' as string]: `${FLOAT_DURATION}s`,
          }

          const tweetId =
            bookmark.type === 'tweet' ? extractTweetId(bookmark.url) : null

          if (tweetId) {
            return (
              <DraggableCard
                key={card.id}
                cardId={card.id}
                initialX={card.x}
                initialY={card.y}
                zoom={canvas.state.zoom}
                onDragEnd={handleDragEnd}
              >
                <TweetCard
                  tweetId={tweetId}
                  style={innerStyle}
                />
              </DraggableCard>
            )
          }

          return (
            <DraggableCard
              key={card.id}
              cardId={card.id}
              initialX={card.x}
              initialY={card.y}
              zoom={canvas.state.zoom}
              onDragEnd={handleDragEnd}
            >
              <BookmarkCard
                bookmark={bookmark}
                style={innerStyle}
              />
            </DraggableCard>
          )
        })}

        {items.length === 0 && !loading && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--color-text-tertiary)',
              fontFamily: 'var(--font-heading)',
              fontSize: 'var(--text-xl)',
              pointerEvents: 'none',
            }}
          >
            URLを入力してブックマークを追加しよう
          </div>
        )}
      </Canvas>

      <ExportButton canvasRef={worldRef} />
      <RandomPick cardIds={items.map(({ card }) => card.id)} />
      <ColorSuggest cardColors={new Map(items.map(({ card }, i) => [card.id, FOLDER_COLORS[i % FOLDER_COLORS.length]]))} />
      <ThemeSelector currentTheme={bgTheme} onSelectTheme={setBgTheme} />
      <UrlInput onSubmit={handleUrlSubmit} disabled={loading} />
    </>
  )
}
