'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  initDB,
  addBookmark,
  getBookmarksByFolder,
  getCardsByFolder,
  addFolder,
  getAllFolders,
} from '@/lib/storage/indexeddb'
import type { BookmarkRecord, CardRecord } from '@/lib/storage/indexeddb'

/** Database instance type derived from initDB return value */
type BooklageDB = Awaited<ReturnType<typeof initDB>>
import { detectUrlType, extractTweetId } from '@/lib/utils/url'
import { fetchOgp } from '@/lib/scraper/ogp'
import { FLOAT_DELAY_MAX, FLOAT_DURATION, FOLDER_COLORS, Z_INDEX } from '@/lib/constants'
import { Canvas } from '@/components/board/Canvas'
import { BookmarkCard } from '@/components/board/BookmarkCard'
import { TweetCard } from '@/components/board/TweetCard'
import { UrlInput } from '@/components/board/UrlInput'

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
 */
export function BoardClient(): React.ReactElement {
  // ── State ────────────────────────────────────────────────────
  const [db, setDb] = useState<BooklageDB | null>(null)
  const [currentFolder, setCurrentFolder] = useState<string | null>(null)
  const [items, setItems] = useState<CardWithBookmark[]>([])
  const [loading, setLoading] = useState(false)

  const canvasRef = useRef<HTMLDivElement | null>(null)

  // ── DB & folder init ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function init(): Promise<void> {
      const database = await initDB()
      if (cancelled) return
      setDb(database)

      const folders = await getAllFolders(database)
      if (folders.length === 0) {
        const created = await addFolder(database, {
          name: 'My Collage',
          color: FOLDER_COLORS[5], // blue
          order: 0,
        })
        if (!cancelled) setCurrentFolder(created.id)
      } else {
        if (!cancelled) setCurrentFolder(folders[0].id)
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
      <Canvas bgTheme="dark" canvasRef={canvasRef}>
        {items.map(({ card, bookmark }) => {
          const cardStyle: React.CSSProperties = {
            left: card.x,
            top: card.y,
            zIndex: card.zIndex || Z_INDEX.CANVAS_CARD,
            ['--card-rotation' as string]: `${card.rotation}deg`,
            ['--float-delay' as string]: `${(Math.random() * FLOAT_DELAY_MAX).toFixed(2)}s`,
            ['--float-duration' as string]: `${FLOAT_DURATION}s`,
          }

          const tweetId =
            bookmark.type === 'tweet' ? extractTweetId(bookmark.url) : null

          if (tweetId) {
            return (
              <TweetCard
                key={card.id}
                tweetId={tweetId}
                style={cardStyle}
              />
            )
          }

          return (
            <BookmarkCard
              key={card.id}
              bookmark={bookmark}
              style={cardStyle}
            />
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

      <UrlInput onSubmit={handleUrlSubmit} disabled={loading} />
    </>
  )
}
