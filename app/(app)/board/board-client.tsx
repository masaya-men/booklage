'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useInfiniteCanvas } from '@/lib/canvas/use-infinite-canvas'
import {
  initDB,
  addBookmark,
  getBookmarksByFolder,
  getCardsByFolder,
  addFolder,
  getAllFolders,
  updateCard,
  getPreferences,
  hasSavedPreferences,
  savePreferences,
} from '@/lib/storage/indexeddb'
import type { BookmarkRecord, CardRecord, FolderRecord } from '@/lib/storage/indexeddb'

/** Database instance type derived from initDB return value */
type BooklageDB = Awaited<ReturnType<typeof initDB>>
import { detectUrlType, extractTweetId } from '@/lib/utils/url'
import { fetchOgp } from '@/lib/scraper/ogp'
import { gsap } from 'gsap'
import { CARD_WIDTH, FLOAT_DELAY_MAX, FLOAT_DURATION, FOLDER_COLORS, GRID_GAP, VIEW_SWITCH_DURATION, VIEW_SWITCH_STAGGER, VIEW_SWITCH_EASE, Z_INDEX } from '@/lib/constants'
import { Canvas } from '@/components/board/Canvas'
import { BookmarkCard } from '@/components/board/BookmarkCard'
import { TweetCard } from '@/components/board/TweetCard'
import { UrlInput } from '@/components/board/UrlInput'
import { DraggableCard } from '@/components/board/DraggableCard'
import { FolderNav } from '@/components/board/FolderNav'
import { ExportButton } from '@/components/board/ExportButton'
import { SettingsPanel } from '@/components/board/SettingsPanel'
import { RandomPick } from '@/components/board/RandomPick'
import { ColorSuggest } from '@/components/board/ColorSuggest'
import { ViewModeToggle, type ViewMode } from '@/components/board/ViewModeToggle'
import { CardStyleWrapper, type CardStyle } from '@/components/board/card-styles/CardStyleWrapper'
import {
  calculateMasonryPositions,
  calculateResponsiveColumns,
  estimateCardHeight,
} from '@/lib/canvas/auto-layout'
import { useCardRepulsion } from '@/lib/interactions/use-card-repulsion'
import { getColorModeForTheme } from '@/lib/theme/theme-utils'
import { useFrameMonitor } from '@/lib/interactions/use-frame-monitor'

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
  const [viewMode, setViewMode] = useState<ViewMode>('collage')
  const [cardStyle, setCardStyle] = useState<CardStyle>('glass')
  const [uiTheme, setUiTheme] = useState<'auto' | 'dark' | 'light'>('auto')
  const [defaultCardSize, setDefaultCardSize] = useState('random')
  const [defaultAspectRatio, setDefaultAspectRatio] = useState('random')

  const worldRef = useRef<HTMLDivElement | null>(null)
  const canvas = useInfiniteCanvas()

  // ── Stable float delay per card (avoids re-randomizing on re-render) ──
  const floatDelays = useRef(new Map<string, string>())
  const getFloatDelay = useCallback((cardId: string): string => {
    let delay = floatDelays.current.get(cardId)
    if (!delay) {
      delay = `${(Math.random() * FLOAT_DELAY_MAX).toFixed(2)}s`
      floatDelays.current.set(cardId, delay)
    }
    return delay
  }, [])

  // ── Compute grid positions ─────────────────────────────────
  const gridPositions = useMemo(() => {
    if (viewMode !== 'grid' || items.length === 0) return new Map<string, { x: number; y: number }>()

    const columns = calculateResponsiveColumns(
      typeof window !== 'undefined' ? window.innerWidth : 1200,
    )
    const cardDimensions = items.map(({ card, bookmark }) => ({
      id: card.id,
      width: CARD_WIDTH,
      height: estimateCardHeight(bookmark.type, bookmark.thumbnail.length > 0),
    }))
    const positions = calculateMasonryPositions(cardDimensions, columns, CARD_WIDTH, GRID_GAP)
    return new Map(positions.map((p) => [p.id, { x: p.x, y: p.y }]))
  }, [viewMode, items])

  // ── Animate view mode switch ────────────────────────────────
  const prevViewModeRef = useRef<ViewMode>(viewMode)
  const isFirstRenderRef = useRef(true)

  useEffect(() => {
    // Skip animation on first render
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false
      prevViewModeRef.current = viewMode
      return
    }

    // Skip if mode hasn't actually changed
    if (prevViewModeRef.current === viewMode) return
    prevViewModeRef.current = viewMode

    // Animate all card wrappers
    const wrappers = document.querySelectorAll<HTMLElement>('[data-card-wrapper]')
    if (wrappers.length === 0) return

    // Capture current rendered positions before React updates
    const currentPositions = new Map<string, { left: number; top: number }>()
    wrappers.forEach((el) => {
      const id = el.getAttribute('data-card-wrapper') ?? ''
      currentPositions.set(id, {
        left: parseFloat(el.style.left) || 0,
        top: parseFloat(el.style.top) || 0,
      })
    })

    // After a microtask (React has re-rendered), animate from old to new
    requestAnimationFrame(() => {
      const updatedWrappers = document.querySelectorAll<HTMLElement>('[data-card-wrapper]')
      const tl = gsap.timeline()

      updatedWrappers.forEach((el, index) => {
        const id = el.getAttribute('data-card-wrapper') ?? ''
        const prev = currentPositions.get(id)
        if (!prev) return

        const newLeft = parseFloat(el.style.left) || 0
        const newTop = parseFloat(el.style.top) || 0

        if (prev.left === newLeft && prev.top === newTop) return

        // Reset any GSAP Draggable transforms
        gsap.set(el, { x: 0, y: 0 })

        // Set element to old position and animate to new
        gsap.set(el, { left: prev.left, top: prev.top })
        tl.to(
          el,
          {
            left: newLeft,
            top: newTop,
            duration: VIEW_SWITCH_DURATION,
            ease: VIEW_SWITCH_EASE,
          },
          index * VIEW_SWITCH_STAGGER,
        )
      })
    })
  }, [viewMode, items]) // eslint-disable-line react-hooks/exhaustive-deps -- gridPositions is derived from viewMode+items; including it causes double-fire

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

      // Load preferences: saved → use them, first visit → detect OS preference
      const hasSaved = await hasSavedPreferences(database)
      if (hasSaved) {
        const prefs = await getPreferences(database)
        if (!cancelled) {
          setBgTheme(prefs.bgTheme)
          setCardStyle(prefs.cardStyle)
          setUiTheme(prefs.uiTheme)
          setDefaultCardSize(prefs.defaultCardSize)
          setDefaultAspectRatio(prefs.defaultAspectRatio)
        }
      } else {
        // First visit: pick initial theme based on OS preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        const initialBg = prefersDark ? 'dark' : 'minimal-white'
        if (!cancelled) {
          setBgTheme(initialBg)
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

  // ── Performance tier ─────────────────────────────────────────
  const perfTier = useFrameMonitor(items.length)
  const enableTilt = perfTier === 'full' || perfTier === 'reduced-spotlight'

  // ── Theme auto-mapping effects ────────────────────────────────
  // bgTheme → data-theme (dark/light color mode)
  useEffect(() => {
    const colorMode = getColorModeForTheme(bgTheme)
    document.documentElement.setAttribute('data-theme', colorMode)
  }, [bgTheme])

  // uiTheme → data-ui-theme
  useEffect(() => {
    document.documentElement.setAttribute('data-ui-theme', uiTheme)
  }, [uiTheme])

  // cardStyle → data-card-style
  useEffect(() => {
    document.documentElement.setAttribute('data-card-style', cardStyle)
  }, [cardStyle])

  // ── Card repulsion ───────────────────────────────────────────
  const { applyRepulsion, resetRepulsion } = useCardRepulsion()

  const handleDrag = useCallback(
    (cardId: string, x: number, y: number): void => {
      const positions = items.map(({ card }) => ({ id: card.id, x: card.x, y: card.y }))
      applyRepulsion(cardId, x, y, positions)
    },
    [items, applyRepulsion],
  )

  // ── Drag end handler (persists position to IndexedDB) ────────
  const handleDragEnd = useCallback(
    async (cardId: string, x: number, y: number): Promise<void> => {
      resetRepulsion()
      if (!db) return
      await updateCard(db, cardId, { x, y, isManuallyPlaced: true })
    },
    [db, resetRepulsion],
  )

  // ── Resize end handler (persists dimensions to IndexedDB) ────
  const handleResizeEnd = useCallback(
    async (cardId: string, width: number, height: number): Promise<void> => {
      if (!db || !currentFolder) return
      await updateCard(db, cardId, { width, height })

      // Reload items to reflect new dimensions
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
    },
    [db, currentFolder],
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

  // ── Settings change handlers (persist to IndexedDB) ──────────
  const handleBgThemeChange = useCallback(
    async (theme: string): Promise<void> => {
      setBgTheme(theme)
      if (db) await savePreferences(db, { bgTheme: theme })
    },
    [db],
  )

  const handleCardStyleChange = useCallback(
    async (style: CardStyle): Promise<void> => {
      setCardStyle(style)
      if (db) await savePreferences(db, { cardStyle: style })
    },
    [db],
  )

  const handleUiThemeChange = useCallback(
    async (theme: 'auto' | 'dark' | 'light'): Promise<void> => {
      setUiTheme(theme)
      if (db) await savePreferences(db, { uiTheme: theme })
    },
    [db],
  )

  const handleDefaultCardSizeChange = useCallback(
    async (size: string): Promise<void> => {
      setDefaultCardSize(size)
      if (db) await savePreferences(db, { defaultCardSize: size as 'random' | 'S' | 'M' | 'L' | 'XL' })
    },
    [db],
  )

  const handleDefaultAspectRatioChange = useCallback(
    async (ratio: string): Promise<void> => {
      setDefaultAspectRatio(ratio)
      if (db) await savePreferences(db, { defaultAspectRatio: ratio as 'random' | 'auto' | '1:1' | '16:9' | '3:4' })
    },
    [db],
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

  // ── Temporary: test data shortcut (Ctrl+Shift+T) ────────────
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent): Promise<void> => {
      if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        if (!db || !currentFolder) return
        const testUrls = [
          'https://github.com',
          'https://www.youtube.com',
          'https://twitter.com',
          'https://www.figma.com',
          'https://vercel.com',
          'https://nextjs.org',
          'https://react.dev',
          'https://developer.mozilla.org',
        ]
        for (const url of testUrls) {
          await handleUrlSubmit(url)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [db, currentFolder, handleUrlSubmit])

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
          const isGrid = viewMode === 'grid'
          const gridPos = gridPositions.get(card.id)
          const displayX = isGrid && gridPos ? gridPos.x : card.x
          const displayY = isGrid && gridPos ? gridPos.y : card.y
          const displayRotation = isGrid ? 0 : card.rotation

          const innerStyle: React.CSSProperties = {
            zIndex: card.zIndex || Z_INDEX.CANVAS_CARD,
            ['--card-rotation' as string]: `${displayRotation}deg`,
            ['--float-delay' as string]: getFloatDelay(card.id),
            ['--float-duration' as string]: `${FLOAT_DURATION}s`,
            boxShadow: isGrid
              ? 'var(--shadow-grid-card)'
              : 'var(--shadow-collage-card)',
            animationPlayState: isGrid ? 'paused' : 'running',
          }

          const tweetId =
            bookmark.type === 'tweet' ? extractTweetId(bookmark.url) : null

          const folderColor = folders.find((f) => f.id === bookmark.folderId)?.color

          if (tweetId) {
            return (
              <DraggableCard
                key={card.id}
                cardId={card.id}
                initialX={displayX}
                initialY={displayY}
                zoom={canvas.state.zoom}
                onDrag={handleDrag}
                onDragEnd={handleDragEnd}
                draggable={!isGrid}
                enableTilt={enableTilt}
                cardWidth={card.width}
                cardHeight={card.height}
                onResizeEnd={handleResizeEnd}
              >
                <CardStyleWrapper
                  cardStyle={cardStyle}
                  title={bookmark.title}
                  magnetColor={folderColor}
                >
                  <TweetCard
                    tweetId={tweetId}
                    style={innerStyle}
                  />
                </CardStyleWrapper>
              </DraggableCard>
            )
          }

          return (
            <DraggableCard
              key={card.id}
              cardId={card.id}
              initialX={displayX}
              initialY={displayY}
              zoom={canvas.state.zoom}
              onDrag={handleDrag}
              onDragEnd={handleDragEnd}
              draggable={!isGrid}
              enableTilt={enableTilt}
              cardWidth={card.width}
              cardHeight={card.height}
              onResizeEnd={handleResizeEnd}
            >
              <CardStyleWrapper
                cardStyle={cardStyle}
                title={bookmark.title}
                magnetColor={folderColor}
              >
                <BookmarkCard
                  bookmark={bookmark}
                  style={innerStyle}
                  width={card.width}
                  height={card.height}
                />
              </CardStyleWrapper>
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

      <ViewModeToggle mode={viewMode} onToggle={setViewMode} />
      <ExportButton canvasRef={worldRef} />
      <RandomPick cardIds={items.map(({ card }) => card.id)} />
      <ColorSuggest cardColors={new Map(items.map(({ card }, i) => [card.id, FOLDER_COLORS[i % FOLDER_COLORS.length]]))} />
      <SettingsPanel
        bgTheme={bgTheme}
        onChangeBgTheme={handleBgThemeChange}
        cardStyle={cardStyle}
        onChangeCardStyle={handleCardStyleChange}
        uiTheme={uiTheme}
        onChangeUiTheme={handleUiThemeChange}
        defaultCardSize={defaultCardSize}
        onChangeDefaultCardSize={handleDefaultCardSizeChange}
        defaultAspectRatio={defaultAspectRatio}
        onChangeDefaultAspectRatio={handleDefaultAspectRatioChange}
      />
      <UrlInput onSubmit={handleUrlSubmit} disabled={loading} />
    </>
  )
}
