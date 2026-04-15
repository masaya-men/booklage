'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useInfiniteCanvas } from '@/lib/canvas/use-infinite-canvas'
import {
  initDB,
  addBookmark,
  getBookmarksByFolder,
  getCardsByFolder,
  addFolder,
  getAllFolders,
  updateCard,
  updateBookmarkOgp,
  getPreferences,
  hasSavedPreferences,
  savePreferences,
} from '@/lib/storage/indexeddb'
import type { BookmarkRecord, CardRecord, FolderRecord } from '@/lib/storage/indexeddb'

/** Database instance type derived from initDB return value */
type BooklageDB = Awaited<ReturnType<typeof initDB>>
import { detectUrlType, extractTweetId, extractYoutubeId, extractUrlFromText, isValidUrl } from '@/lib/utils/url'
import { fetchOgp } from '@/lib/scraper/ogp'
import { gsap } from 'gsap'
import { Draggable } from 'gsap/Draggable'

gsap.registerPlugin(Draggable)
import { CARD_WIDTH, FLOAT_DELAY_MAX, FLOAT_DURATION, FOLDER_COLORS, GRID_GAP, VIEW_SWITCH_DURATION, VIEW_SWITCH_STAGGER, VIEW_SWITCH_EASE, Z_INDEX } from '@/lib/constants'
import { Canvas } from '@/components/board/Canvas'
import { BookmarkCard } from '@/components/board/BookmarkCard'
import { VideoEmbed } from '@/components/board/VideoEmbed'
import { TweetCard } from '@/components/board/TweetCard'
import { UrlInput } from '@/components/board/UrlInput'
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
import { useCardTilt } from '@/lib/interactions/use-card-tilt'
import { createRipple } from '@/lib/interactions/ripple'
import { getColorModeForTheme } from '@/lib/theme/theme-utils'
import { useFrameMonitor } from '@/lib/interactions/use-frame-monitor'
import { LiquidGlassProvider } from '@/lib/glass/LiquidGlassProvider'
import { BookmarkletBanner } from '@/components/bookmarklet/BookmarkletBanner'
import { InstallPrompt } from '@/components/pwa/InstallPrompt'
import { useLiquidGlass } from '@/lib/glass/use-liquid-glass'
import { ResizeHandle } from '@/components/board/ResizeHandle'
import { ImportModal } from '@/components/import/ImportModal'
import { BookmarkListPanel } from '@/components/board/BookmarkListPanel'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A card paired with its associated bookmark for rendering */
type CardWithBookmark = {
  card: CardRecord
  bookmark: BookmarkRecord
}

// ---------------------------------------------------------------------------
// Card portal content — rendered inside DOM-managed wrappers via createPortal
// ---------------------------------------------------------------------------

type CardPortalContentProps = {
  card: CardRecord
  bookmark: BookmarkRecord
  cardStyle: CardStyle
  folderColor: string | undefined
  enableTilt: boolean
  isGrid: boolean
  innerStyle: React.CSSProperties
  zoom: number
  onResizeEnd: (cardId: string, width: number, height: number) => void
}

/** Card content with 3D tilt, spotlight, liquid glass, and resize handle */
function CardPortalContent({
  card,
  bookmark,
  cardStyle,
  folderColor,
  enableTilt,
  isGrid,
  innerStyle,
  zoom,
  onResizeEnd,
}: CardPortalContentProps): React.ReactElement {
  const { ref: tiltRef } = useCardTilt({ enabled: enableTilt && !isGrid })
  const glass = useLiquidGlass({ id: `card-${card.id}`, strength: 'subtle', borderRadius: 12 })

  const tweetId = bookmark.type === 'tweet' ? extractTweetId(bookmark.url) : null
  const youtubeId = bookmark.type === 'youtube' ? extractYoutubeId(bookmark.url) : null

  /** Render the appropriate card content based on bookmark type */
  function renderCardContent(): React.ReactElement {
    if (tweetId) {
      return <TweetCard tweetId={tweetId} style={innerStyle} />
    }
    if (youtubeId) {
      return <VideoEmbed videoId={youtubeId} title={bookmark.title} style={innerStyle} width={card.width} />
    }
    return <BookmarkCard bookmark={bookmark} style={innerStyle} width={card.width} height={card.height} />
  }

  return (
    <div ref={tiltRef} data-tilt>
      <CardStyleWrapper
        cardStyle={cardStyle}
        title={bookmark.title}
        magnetColor={folderColor}
        liquidGlass={cardStyle === 'glass' ? glass : undefined}
      >
        {renderCardContent()}
      </CardStyleWrapper>
      {!isGrid && (
        <ResizeHandle
          cardId={card.id}
          currentWidth={card.width}
          currentHeight={card.height}
          zoom={zoom}
          onResizeEnd={onResizeEnd}
        />
      )}
    </div>
  )
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
  const [showImportModal, setShowImportModal] = useState(false)
  const [showListPanel, setShowListPanel] = useState(false)

  const worldRef = useRef<HTMLDivElement | null>(null)

  // Ref for items — always points to latest value, used inside GSAP Draggable
  // closures which go stale because Draggable instances aren't recreated on re-render
  const itemsRef = useRef(items)
  itemsRef.current = items
  const canvas = useInfiniteCanvas()

  // Ref for zoom — always points to latest value, used inside GSAP Draggable closures
  const zoomRef = useRef(canvas.state.zoom)
  zoomRef.current = canvas.state.zoom

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

  // ── Auto-reload when bookmarklet saves a new bookmark ────────
  useEffect(() => {
    if (!db || !currentFolder) return

    let channel: BroadcastChannel | null = null
    try {
      channel = new BroadcastChannel('booklage')
      channel.onmessage = async (e: MessageEvent) => {
        if (e.data?.type === 'bookmark-saved') {
          const [bookmarks, cards] = await Promise.all([
            getBookmarksByFolder(db, currentFolder),
            getCardsByFolder(db, currentFolder),
          ])
          const bookmarkMap = new Map(bookmarks.map((b) => [b.id, b]))
          const paired: CardWithBookmark[] = []
          for (const card of cards) {
            const bookmark = bookmarkMap.get(card.bookmarkId)
            if (bookmark) paired.push({ card, bookmark })
          }
          setItems(paired)
        }
      }
    } catch { /* BroadcastChannel not supported */ }

    return () => { channel?.close() }
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
  // DOM position + animation is handled in onDragEnd. This just persists + updates state.
  const handleDragEnd = useCallback(
    async (cardId: string, x: number, y: number): Promise<void> => {
      // Landing ripple at card center
      const el = document.querySelector<HTMLElement>(`[data-card-wrapper="${cardId}"]`)
      if (el && worldRef.current) {
        const cx = x + el.offsetWidth / 2
        const cy = y + el.offsetHeight / 2
        createRipple(cx, cy, worldRef.current)
      }

      resetRepulsion()

      if (!db) return
      await updateCard(db, cardId, { x, y, isManuallyPlaced: true })

      // Update items state so React knows the new position.
      // Delay to avoid iframe reload during landing animation.
      setTimeout(() => {
        setItems((prev) =>
          prev.map((item) =>
            item.card.id === cardId
              ? { ...item, card: { ...item.card, x, y, isManuallyPlaced: true } }
              : item,
          ),
        )
      }, 400)
    },
    [db, resetRepulsion],
  )

  // ── Gather all cards back to visible area ────────────────────
  const handleGatherCards = useCallback(
    async (): Promise<void> => {
      if (!db || !currentFolder || items.length === 0) return

      // Reset canvas view to origin
      canvas.resetView()

      // Arrange cards in a loose grid near center
      const cols = Math.ceil(Math.sqrt(items.length))
      const spacing = 280

      const updates: Promise<void>[] = []
      const newItems = items.map((item, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        const x = 240 + col * spacing
        const y = 100 + row * spacing
        updates.push(updateCard(db, item.card.id, { x, y }))
        return { ...item, card: { ...item.card, x, y } }
      })

      setItems(newItems)
      await Promise.all(updates)
    },
    [db, currentFolder, items, canvas],
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

  // ── Import complete handler ──────────────────────────────────
  const handleImportComplete = useCallback(
    async (savedCount: number): Promise<void> => {
      if (!db || !currentFolder) return
      // Reload items from DB
      const [bookmarks, cards] = await Promise.all([
        getBookmarksByFolder(db, currentFolder),
        getCardsByFolder(db, currentFolder),
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
    [db, currentFolder],
  )

  // ── Navigate to card handler (for list panel) ─────────────────
  const handleNavigateToCard = useCallback(
    (cardId: string, x: number, y: number): void => {
      // Bring card to front
      const card = items.find((i) => i.card.id === cardId)?.card
      if (card && db) {
        const maxZ = Math.max(...items.map((i) => i.card.zIndex || 1), 1)
        void updateCard(db, cardId, { zIndex: maxZ + 1 })
        setItems((prev) =>
          prev.map((item) =>
            item.card.id === cardId
              ? { ...item, card: { ...item.card, zIndex: maxZ + 1 } }
              : item,
          ),
        )
      }

      // Read actual rendered size from DOM (stored dimensions may not match)
      const domEl = document.querySelector<HTMLElement>(`[data-card-wrapper="${cardId}"]`)
      const currentZoom = canvas.state.zoom
      const cardW = domEl ? domEl.offsetWidth / currentZoom : (card?.width ?? 240)
      const cardH = domEl ? domEl.offsetHeight / currentZoom : (card?.height ?? 180)

      // Calculate zoom to fit card comfortably (60% of usable area), capped at 1.5
      const folderNavWidth = 120
      const usableWidth = window.innerWidth - folderNavWidth
      const usableHeight = window.innerHeight
      const padding = 0.6
      const targetZoom = Math.min(
        (usableWidth * padding) / cardW,
        (usableHeight * padding) / cardH,
        1.5,
      )

      // Center on card's actual center point
      const centerX = x + cardW / 2
      const centerY = y + cardH / 2
      const screenCenterX = folderNavWidth + usableWidth / 2
      const screenCenterY = usableHeight / 2
      const targetPanX = -centerX * targetZoom + screenCenterX
      const targetPanY = -centerY * targetZoom + screenCenterY
      const proxy = { panX: canvas.state.panX, panY: canvas.state.panY, zoom: canvas.state.zoom }
      gsap.to(proxy, {
        panX: targetPanX,
        panY: targetPanY,
        zoom: targetZoom,
        duration: 0.9,
        ease: 'power3.inOut',
        onUpdate: () => {
          canvas.setTransform(proxy.panX, proxy.panY, proxy.zoom)
        },
      })
    },
    [canvas, items, db],
  )

  // ── OGP retry handler (for list panel) ──────────────────────────
  const handleRetryOgp = useCallback(
    async (bookmarkId: string): Promise<void> => {
      if (!db) return
      const bookmark = items.find((i) => i.bookmark.id === bookmarkId)?.bookmark
      if (!bookmark) return
      try {
        const ogp = await fetchOgp(bookmark.url)
        await updateBookmarkOgp(db, bookmarkId, {
          title: ogp.title || bookmark.title,
          description: ogp.description,
          thumbnail: ogp.image,
          favicon: ogp.favicon,
          siteName: ogp.siteName,
          ogpStatus: 'fetched',
        })
        // Update local state
        setItems((prev) =>
          prev.map((item) =>
            item.bookmark.id === bookmarkId
              ? {
                  ...item,
                  bookmark: {
                    ...item.bookmark,
                    title: ogp.title || item.bookmark.title,
                    description: ogp.description,
                    thumbnail: ogp.image,
                    favicon: ogp.favicon,
                    siteName: ogp.siteName,
                    ogpStatus: 'fetched' as const,
                  },
                }
              : item,
          ),
        )
      } catch {
        await updateBookmarkOgp(db, bookmarkId, { ogpStatus: 'failed' })
      }
    },
    [db, items],
  )

  // ── GSAP Draggable management via DOM API ────────────────────
  // React's DOM reconciliation breaks GSAP Draggable. Instead, we create
  // wrapper divs outside React's tree via DOM API, attach GSAP Draggable,
  // and render card content via createPortal.
  const isGrid = viewMode === 'grid'
  const cardWrappersRef = useRef<Map<string, { el: HTMLElement; draggable: Draggable | null }>>(new Map())
  const [portalTargets, setPortalTargets] = useState<Map<string, HTMLElement>>(new Map())

  useEffect(() => {
    const world = worldRef.current
    if (!world) return

    const currentIds = new Set(items.map(({ card }) => card.id))

    // Remove wrappers for deleted cards
    cardWrappersRef.current.forEach((entry, id) => {
      if (!currentIds.has(id)) {
        entry.draggable?.kill()
        entry.el.remove()
        cardWrappersRef.current.delete(id)
      }
    })

    // Create/update wrappers for each card
    items.forEach(({ card }) => {
      const existing = cardWrappersRef.current.get(card.id)

      if (existing) {
        // Update position (reset GSAP transform + move via CSS)
        gsap.set(existing.el, { x: 0, y: 0 })
        const gridPos = gridPositions.get(card.id)
        const displayX = isGrid && gridPos ? gridPos.x : card.x
        const displayY = isGrid && gridPos ? gridPos.y : card.y
        existing.el.style.left = `${displayX}px`
        existing.el.style.top = `${displayY}px`
        existing.el.style.cursor = isGrid ? 'default' : 'grab'

        // Enable/disable draggable
        if (isGrid && existing.draggable) {
          existing.draggable.kill()
          existing.draggable = null
        } else if (!isGrid && !existing.draggable) {
          const inst = createDraggableForCard(existing.el, card.id)
          existing.draggable = inst
        }
        return
      }

      // Create new wrapper
      const el = document.createElement('div')
      const gridPos = gridPositions.get(card.id)
      const displayX = isGrid && gridPos ? gridPos.x : card.x
      const displayY = isGrid && gridPos ? gridPos.y : card.y
      el.style.cssText = `position:absolute;left:${displayX}px;top:${displayY}px;cursor:${isGrid ? 'default' : 'grab'};`
      el.setAttribute('data-card-wrapper', card.id)
      world.appendChild(el)

      let inst: Draggable | null = null
      if (!isGrid) {
        const d = createDraggableForCard(el, card.id)
        inst = d
      }

      cardWrappersRef.current.set(card.id, { el, draggable: inst })
    })

    // Update portal targets so React renders content into the wrappers.
    // Only create a new Map if targets actually changed (avoids unnecessary re-render).
    const targets = new Map<string, HTMLElement>()
    cardWrappersRef.current.forEach((entry, id) => targets.set(id, entry.el))
    if (targets.size !== portalTargets.size || [...targets.entries()].some(([k, v]) => portalTargets.get(k) !== v)) {
      setPortalTargets(targets)
    }
  }, [items, isGrid, gridPositions]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup all wrappers on unmount ONLY (not on every re-run)
  useEffect(() => {
    return () => {
      cardWrappersRef.current.forEach((entry) => {
        entry.draggable?.kill()
        entry.el.remove()
      })
      cardWrappersRef.current.clear()
    }
  }, [])

  /** Helper: create GSAP Draggable for a card wrapper.
   * Uses GSAP's built-in onClick for click detection.
   * Disables iframe pointer-events during drag to prevent mouseup capture. */
  function createDraggableForCard(el: HTMLElement, cardId: string): Draggable {
    const instances = Draggable.create(el, {
      type: 'x,y',
      zIndexBoost: false,
      onClick() {
        // GSAP fires onClick only when the user clicks without dragging.
        // Open URL in new tab for non-video cards.
        const bookmark = itemsRef.current.find((item) => item.card.id === cardId)?.bookmark
        if (bookmark && bookmark.type !== 'tweet' && bookmark.type !== 'youtube') {
          window.open(bookmark.url, '_blank', 'noopener')
        }
      },
      onDragStart() {
        // Disable iframe pointer-events so mouseup isn't captured by iframe
        el.querySelectorAll('iframe').forEach((f) => { (f as HTMLElement).style.pointerEvents = 'none' })
        el.style.cursor = 'grabbing'
        const tiltEl = el.querySelector<HTMLElement>('[data-tilt]')
        if (tiltEl) tiltEl.dataset.dragging = 'true'
        el.style.zIndex = String(Z_INDEX.CANVAS_CARD_DRAGGING)
        gsap.to(el, {
          scale: 1.06,
          boxShadow: 'var(--shadow-drag)',
          duration: 0.25,
          ease: 'back.out(1.7)',
        })
      },
      onDrag() {
        const baseX = parseFloat(el.style.left) || 0
        const baseY = parseFloat(el.style.top) || 0
        handleDrag(cardId, baseX + (this.x ?? 0), baseY + (this.y ?? 0))
      },
      onDragEnd() {
        // Re-enable iframe pointer-events
        el.querySelectorAll('iframe').forEach((f) => { (f as HTMLElement).style.pointerEvents = '' })
        el.style.cursor = 'grab'
        const tiltEl = el.querySelector<HTMLElement>('[data-tilt]')
        if (tiltEl) delete tiltEl.dataset.dragging

        // Calculate and set new position immediately
        const baseX = parseFloat(el.style.left) || 0
        const baseY = parseFloat(el.style.top) || 0
        const newX = baseX + (this.endX ?? 0)
        const newY = baseY + (this.endY ?? 0)
        el.style.left = `${newX}px`
        el.style.top = `${newY}px`
        gsap.set(el, { x: 0, y: 0 })

        // Animate only scale/shadow back
        gsap.to(el, {
          scale: 1,
          boxShadow: '',
          duration: 0.35,
          ease: 'back.out(1.4)',
          onComplete() { el.style.zIndex = '' },
        })

        handleDragEnd(cardId, newX, newY)
      },
    })
    return instances[0]
  }

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

  // ── Web Share Target: detect shared URL from OS share menu ──
  const sharedProcessedRef = useRef(false)

  useEffect(() => {
    if (!db || !currentFolder || sharedProcessedRef.current) return

    const params = new URLSearchParams(window.location.search)
    if (params.get('shared') !== 'true') return

    sharedProcessedRef.current = true

    // Try url param first, then extract from text, then from title
    const sharedUrl =
      params.get('url') ||
      extractUrlFromText(params.get('text') ?? '') ||
      extractUrlFromText(params.get('title') ?? '')

    // Clean up URL params regardless of whether we found a URL
    window.history.replaceState({}, '', '/board')

    if (sharedUrl && isValidUrl(sharedUrl)) {
      void handleUrlSubmit(sharedUrl)
    }
  }, [db, currentFolder, handleUrlSubmit])

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
    <LiquidGlassProvider>
      <FolderNav
        folders={folders}
        currentFolderId={currentFolder}
        onSelectFolder={handleSelectFolder}
        onAddFolder={handleAddFolder}
      />

      <Canvas bgTheme={bgTheme} canvas={canvas} worldRef={worldRef}>
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

      {/* Card content rendered via portals into DOM-managed wrappers */}
      {items.map(({ card, bookmark }) => {
        const target = portalTargets.get(card.id)
        if (!target) return null

        const displayRotation = isGrid ? 0 : card.rotation
        const innerStyle: React.CSSProperties = {
          zIndex: card.zIndex || Z_INDEX.CANVAS_CARD,
          ['--card-rotation' as string]: `${displayRotation}deg`,
          ['--float-delay' as string]: getFloatDelay(card.id),
          ['--float-duration' as string]: `${FLOAT_DURATION}s`,
          boxShadow: isGrid ? 'var(--shadow-grid-card)' : 'var(--shadow-collage-card)',
          animationPlayState: isGrid ? 'paused' : 'running',
        }

        const folderColor = folders.find((f) => f.id === bookmark.folderId)?.color

        return createPortal(
          <CardPortalContent
            card={card}
            bookmark={bookmark}
            cardStyle={cardStyle}
            folderColor={folderColor}
            enableTilt={enableTilt}
            isGrid={isGrid}
            innerStyle={innerStyle}
            zoom={canvas.state.zoom}
            onResizeEnd={handleResizeEnd}
          />,
          target,
          card.id,
        )
      })}

      <ViewModeToggle mode={viewMode} onToggle={setViewMode} />
      <ExportButton canvasRef={worldRef} />
      {items.length > 0 && (
        <button
          onClick={handleGatherCards}
          style={{
            position: 'fixed',
            bottom: 20,
            left: 20,
            zIndex: Z_INDEX.TOOLBAR,
            padding: '8px 16px',
            borderRadius: '999px',
            border: '1px solid var(--color-glass-border)',
            background: 'var(--color-glass-bg)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            color: 'var(--color-text-primary)',
            fontFamily: 'var(--font-heading)',
            fontSize: 'var(--text-sm)',
            cursor: 'pointer',
          }}
          type="button"
        >
          📍 カードを集める
        </button>
      )}
      <button
        onClick={() => setShowImportModal(true)}
        style={{
          position: 'fixed',
          bottom: 20,
          left: items.length > 0 ? 180 : 20,
          zIndex: Z_INDEX.TOOLBAR,
          padding: '8px 16px',
          borderRadius: '999px',
          border: '1px solid var(--color-glass-border)',
          background: 'var(--color-glass-bg)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          color: 'var(--color-text-primary)',
          fontFamily: 'var(--font-heading)',
          fontSize: 'var(--text-sm)',
          cursor: 'pointer',
        }}
        type="button"
      >
        📥 インポート
      </button>
      {items.length > 0 && (
        <button
          onClick={() => setShowListPanel(true)}
          style={{
            position: 'fixed',
            bottom: 20,
            left: items.length > 0 ? 320 : 160,
            zIndex: Z_INDEX.TOOLBAR,
            padding: '8px 16px',
            borderRadius: '999px',
            border: '1px solid var(--color-glass-border)',
            background: 'var(--color-glass-bg)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            color: 'var(--color-text-primary)',
            fontFamily: 'var(--font-heading)',
            fontSize: 'var(--text-sm)',
            cursor: 'pointer',
          }}
          type="button"
        >
          📋 リスト
        </button>
      )}
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
      <BookmarkletBanner />
      <InstallPrompt />
      <UrlInput onSubmit={handleUrlSubmit} disabled={loading} />
      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        db={db as import('idb').IDBPDatabase<unknown> | null}
        onImportComplete={handleImportComplete}
      />
      <BookmarkListPanel
        isOpen={showListPanel}
        onClose={() => setShowListPanel(false)}
        items={items}
        folders={folders}
        onNavigateToCard={handleNavigateToCard}
        onRetryOgp={handleRetryOgp}
      />
    </LiquidGlassProvider>
  )
}
