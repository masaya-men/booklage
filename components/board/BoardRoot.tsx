'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { computeSkylineLayout, type SkylineCard } from '@/lib/board/skyline-layout'
import { computeFocusScrollY } from '@/lib/board/scroll-to-card'
import {
  DEFAULT_THEME_ID,
  getThemeMeta,
} from '@/lib/board/theme-registry'
import { BOARD_INNER, COLUMN_MASONRY } from '@/lib/board/constants'
import {
  DEFAULT_SIZE_LEVEL,
  type SizeLevel,
  clampSizeLevel,
  sizeLevelToColumnCount,
} from '@/lib/board/size-levels'
import type { BoardFilter, CardPosition, DisplayMode } from '@/lib/board/types'
import { applyFilter } from '@/lib/board/filter'
import { useBoardData } from '@/lib/storage/use-board-data'
import { subscribeBookmarkSaved } from '@/lib/board/channel'
import { detectUrlType, extractTweetId } from '@/lib/utils/url'
import { fetchTweetMeta } from '@/lib/embed/tweet-meta'
import { fetchTikTokMeta } from '@/lib/embed/tiktok-meta'
import { useMoods } from '@/lib/storage/use-moods'
import { initDB } from '@/lib/storage/indexeddb'
import { loadBoardConfig, saveBoardConfig } from '@/lib/storage/board-config'
import { ThemeLayer } from './ThemeLayer'
import { CardsLayer } from './CardsLayer'
import { InteractionLayer } from './InteractionLayer'
import { TopHeader } from './TopHeader'
import { FilterPill } from './FilterPill'
import { SizePicker } from './SizePicker'
import { ResetAllButton } from './ResetAllButton'
import { ScrollMeter } from './ScrollMeter'
import { BoardChrome } from './BoardChrome'
import { BookmarkletInstallModal } from '@/components/bookmarklet/BookmarkletInstallModal'
import { BookmarkletPill } from '@/components/bookmarklet/BookmarkletPill'
import { EmptyStateWelcome } from '@/components/bookmarklet/EmptyStateWelcome'
import { Lightbox } from './Lightbox'
import { PopOutButton } from './PopOutButton'
import { PipPortal } from '@/components/pip/PipPortal'
import { PipCompanion } from '@/components/pip/PipCompanion'
import { usePipWindow } from '@/lib/board/pip-window'
import { ShareComposer } from '@/components/share/ShareComposer'
import { ShareActionSheet } from '@/components/share/ShareActionSheet'
import { encodeShareData } from '@/lib/share/encode'
import { getActiveWatermark } from '@/lib/share/watermark-config'
import type { ShareData } from '@/lib/share/types'
import styles from './BoardRoot.module.css'

// Visible breathing room above the board's first card, in CSS pixels.
// Cards' world coords start at y=0 (masonry cursor); this offset is applied
// in the cards wrapper's transform so the first row never kisses the Toolbar
// pill. Extends the scroll range via contentBounds.height.
const BOARD_TOP_PAD_PX = 80

export function BoardRoot() {
  const {
    items,
    loading,
    persistOrderBatch,
    persistMeasuredAspect,
    persistThumbnail,
    persistVideoFlag,
    persistSoftDelete,
    persistCustomWidth,
    resetCustomWidth,
    resetAllCustomWidths,
    reload,
  } = useBoardData()
  const { moods } = useMoods()
  const [activeFilter, setActiveFilter] = useState<BoardFilter>('all')
  const [displayMode, setDisplayMode] = useState<DisplayMode>('visual')
  const [viewport, setViewport] = useState({ x: 0, y: 0, w: 1200, h: 800 })
  // Lifted from InteractionLayer so CardsLayer can also observe Space-held
  // state and bail its pointerdown handler — letting the event bubble up to
  // InteractionLayer where pan engagement lives.
  const [spaceHeld, setSpaceHeld] = useState<boolean>(false)
  const [bookmarkletModalOpen, setBookmarkletModalOpen] = useState<boolean>(false)
  const [hoveredBookmarkId, setHoveredBookmarkId] = useState<string | null>(null)
  const [lightboxItemId, setLightboxItemId] = useState<string | null>(null)
  // Captured at click time so Lightbox can grow from the card's exact screen
  // position (FLIP). Cleared on close. Plain DOMRect — never reactive past
  // open, so a stale rect after pan/scroll is fine: it only seeds the open
  // animation, the close animation does not use it.
  const [lightboxOriginRect, setLightboxOriginRect] = useState<DOMRect | null>(null)
  const [newlyAddedIds, setNewlyAddedIds] = useState<ReadonlySet<string>>(new Set())
  const [shareComposerOpen, setShareComposerOpen] = useState<boolean>(false)
  const [actionSheet, setActionSheet] = useState<{ pngDataUrl: string; shareUrl: string } | null>(null)
  // When focusCard is called for a bookmark not in the current filtered view
  // (e.g. user is on `mood:foo` but the PiP-clicked card has different tags),
  // we clear the filter to 'all' and stash the cardId here. The retry useEffect
  // below picks this up after filteredItems re-renders and completes the scroll.
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null)
  const [sizeLevel, setSizeLevel] = useState<SizeLevel>(DEFAULT_SIZE_LEVEL)
  const pip = usePipWindow()
  const handleCardClickFromPip = useCallback((cardId: string) => {
    if (typeof window !== 'undefined') {
      // PiP click is a valid user gesture; Chrome lets us pull the opener tab
      // to the foreground. focusCard handles the case where the card is
      // filtered out of the current view by clearing the filter first.
      window.focus()
      window.dispatchEvent(new CustomEvent('booklage:focus-card', { detail: { cardId } }))
    }
  }, [])
  // Per-card persisted overrides — derived directly from items so the
  // very first render after the IDB load already knows the right widths.
  // The previous useEffect-based hydration created a one-frame flash on
  // reload where every card briefly snapped to the SizePicker default
  // before the effect populated the override map; useMemo eliminates
  // that flash since it runs in the same render as items.
  const persistentCustomWidths = useMemo<Readonly<Record<string, number>>>(() => {
    const map: Record<string, number> = {}
    for (const it of items) {
      if (it.customCardWidth) map[it.bookmarkId] = it.cardWidth
    }
    return map
  }, [items])

  // Live resize override during an in-flight drag. Holds at most ONE
  // entry (only the actively-dragged card needs it), so it doesn't
  // need a Map. Cleared on pointerup; the optimistic items update
  // inside `persistCustomWidth` carries the new width into
  // persistentCustomWidths in the same React batch.
  const [liveResize, setLiveResize] = useState<{ id: string; width: number } | null>(null)

  // What the layout actually reads — persisted overrides, with the
  // live in-flight width layered on top for the dragging card.
  const customWidths = useMemo<Readonly<Record<string, number>>>(() => {
    if (!liveResize) return persistentCustomWidths
    return { ...persistentCustomWidths, [liveResize.id]: liveResize.width }
  }, [persistentCustomWidths, liveResize])

  const handleCardResize = useCallback((bookmarkId: string, nextWidth: number): void => {
    setLiveResize((prev) => {
      if (prev?.id === bookmarkId && prev.width === nextWidth) return prev
      return { id: bookmarkId, width: nextWidth }
    })
  }, [])

  const handleCardResizeEnd = useCallback(
    (bookmarkId: string, finalWidth: number): void => {
      // Clearing liveResize and queueing the optimistic items update
      // in the same task lets React batch them — no flicker between
      // the live drag and the persisted state taking over.
      setLiveResize(null)
      void persistCustomWidth(bookmarkId, finalWidth)
    },
    [persistCustomWidth],
  )

  const handleCardResetSize = useCallback(
    (bookmarkId: string): void => {
      setLiveResize((prev) => (prev?.id === bookmarkId ? null : prev))
      void resetCustomWidth(bookmarkId)
    },
    [resetCustomWidth],
  )

  const handleResetAllCustomWidths = useCallback((): void => {
    setLiveResize(null)
    void resetAllCustomWidths()
  }, [resetAllCustomWidths])

  const customWidthCount = useMemo(
    () => Object.keys(persistentCustomWidths).length,
    [persistentCustomWidths],
  )
  // Ref points at the inner dark canvas — viewport.w/h reflect the canvas's
  // inner dimensions (window minus the outer-frame margin), so masonry layout
  // and culling all work in canvas-local coordinates.
  const canvasRef = useRef<HTMLDivElement>(null)

  // destefanis 流: ページ自体スクロールしない (overflow:hidden)。
  // pan は内部 InteractionLayer のみで担う。board ページから抜けたら復元。
  useEffect(() => {
    if (typeof document === 'undefined') return
    const html = document.documentElement
    const body = document.body
    const prevHtmlOverflow = html.style.overflow
    const prevBodyOverflow = body.style.overflow
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    return (): void => {
      html.style.overflow = prevHtmlOverflow
      body.style.overflow = prevBodyOverflow
    }
  }, [])

  // Window-level Space-key tracking for hold-to-pan. Lifted here from
  // InteractionLayer so both InteractionLayer (engagement) and CardsLayer
  // (early-bail in card pointerdown) can read the same state.
  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if (target.isContentEditable) return true
      return false
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.code !== 'Space') return
      if (isEditableTarget(e.target)) return
      // Prevent default page scroll while Space is held for pan-mode.
      e.preventDefault()
      setSpaceHeld(true)
    }
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.code !== 'Space') return
      setSpaceHeld(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return (): void => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  // Cursor hint while Space is held. Owned here (not InteractionLayer) so the
  // hint matches the lifted state. Always restores on unmount.
  // Also disables native text/element selection on the body so that Space+drag
  // pan never triggers the browser's blue selection rectangle when the drag
  // starts on a card. Uses setProperty/removeProperty to keep types clean and
  // to cover the -webkit- prefixed variant for Safari/older Chrome.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const body = document.body
    if (spaceHeld) {
      body.style.cursor = 'grab'
      body.style.setProperty('user-select', 'none')
      body.style.setProperty('-webkit-user-select', 'none')
    } else {
      body.style.cursor = ''
      body.style.removeProperty('user-select')
      body.style.removeProperty('-webkit-user-select')
    }
    return (): void => {
      body.style.cursor = ''
      body.style.removeProperty('user-select')
      body.style.removeProperty('-webkit-user-select')
    }
  }, [spaceHeld])

  // Hydrate activeFilter and displayMode from persisted BoardConfig.
  useEffect(() => {
    let cancelled = false
    void (async (): Promise<void> => {
      const db = await initDB()
      if (cancelled) return
      const cfg = await loadBoardConfig(db)
      if (cancelled) return
      setActiveFilter(cfg.activeFilter)
      setDisplayMode(cfg.displayMode)
    })()
    return (): void => { cancelled = true }
  }, [])

  useEffect(() => {
    const update = (): void => {
      const el = canvasRef.current
      if (!el) return
      setViewport((v) => ({ ...v, w: el.clientWidth, h: el.clientHeight }))
    }
    update()
    window.addEventListener('resize', update)
    return (): void => window.removeEventListener('resize', update)
  }, [])

  const filteredItems = useMemo(() => applyFilter(items, activeFilter), [items, activeFilter])

  const themeMeta = getThemeMeta(DEFAULT_THEME_ID)

  // Cards span the full width of the inner dark canvas with a destefanis-
  // style half-gap on each side (SIDE_PADDING_PX = COLUMN_MASONRY.GAP_PX / 2).
  // No sidebar reservation, no max-width cap — the canvas is the whole stage.
  const effectiveLayoutWidth = Math.max(0, viewport.w - 2 * BOARD_INNER.SIDE_PADDING_PX)

  // SizePicker level → column count → default per-card width that evenly
  // distributes the layout area across N columns with the standard gap.
  // This default applies to every card on the board until per-card custom
  // widths land in the next session.
  const desiredColumnCount = sizeLevelToColumnCount(sizeLevel)
  const defaultCardWidth =
    desiredColumnCount > 0 && effectiveLayoutWidth > 0
      ? Math.max(
          1,
          (effectiveLayoutWidth - (desiredColumnCount - 1) * COLUMN_MASONRY.GAP_PX) /
            desiredColumnCount,
        )
      : 1

  const skylineCards = useMemo<SkylineCard[]>(
    () =>
      filteredItems.map((it) => {
        const w = customWidths[it.bookmarkId] ?? defaultCardWidth
        const h = it.aspectRatio > 0 ? w / it.aspectRatio : w
        return { id: it.bookmarkId, width: w, height: h }
      }),
    [filteredItems, defaultCardWidth, customWidths],
  )

  const layout = useMemo(
    () =>
      computeSkylineLayout({
        cards: skylineCards,
        containerWidth: effectiveLayoutWidth,
        gap: COLUMN_MASONRY.GAP_PX,
      }),
    [skylineCards, effectiveLayoutWidth],
  )

  const horizontalOffset = BOARD_INNER.SIDE_PADDING_PX

  // Actual content bounds — tracks the furthest right/bottom any card reaches,
  // using masonry positions (freePos not used in masonry mode) plus overrides
  // that Task 12 will populate during drag-to-reorder.
  // BOARD_TOP_PAD_PX gives the board breathing room at the top so the first
  // row does not collide with the toolbar pill; added to the total so scroll
  // range still reaches cards after the shift in the cards wrapper transform.
  // SCROLL_OVERFLOW_MARGIN adds room below the last card so a user can scroll
  // further down.
  const contentBounds = useMemo(() => {
    let maxRight = 0
    let maxBottom = 0
    for (const it of filteredItems) {
      const p = layout.positions[it.bookmarkId]
      if (!p) continue
      const right = p.x + p.w
      const bottom = p.y + p.h
      if (right > maxRight) maxRight = right
      if (bottom > maxBottom) maxBottom = bottom
    }
    const SCROLL_OVERFLOW_MARGIN = 600
    return {
      width: Math.max(layout.totalWidth, maxRight + SCROLL_OVERFLOW_MARGIN),
      height: Math.max(
        layout.totalHeight + BOARD_TOP_PAD_PX,
        maxBottom + BOARD_TOP_PAD_PX + SCROLL_OVERFLOW_MARGIN,
      ),
    }
  }, [filteredItems, layout.positions, layout.totalWidth, layout.totalHeight])

  const handleScroll = useCallback(
    (dx: number, dy: number): void => {
      setViewport((v) => {
        const maxX = Math.max(0, contentBounds.width - v.w)
        const maxY = Math.max(0, contentBounds.height - v.h)
        return {
          ...v,
          x: Math.min(Math.max(v.x + dx, 0), maxX),
          y: Math.min(Math.max(v.y + dy, 0), maxY),
        }
      })
    },
    [contentBounds.width, contentBounds.height],
  )

  // ScrollMeter click/drag → animated scroll-to-y. requestAnimationFrame loop
  // with ease-in-out cubic — soft start AND soft end so long jumps feel
  // cinematic instead of slingshot. Duration scales with distance so tiny
  // corrections stay snappy while big jumps get the full luxurious arc.
  // While the user is actively dragging the meter (multiple onScrollTo
  // calls per frame) we cancel any in-flight tween and snap so the meter
  // tracks the pointer.
  const scrollAnimRef = useRef<number | null>(null)
  const lastJumpAtRef = useRef<number>(0)
  const handleScrollMeterJump = useCallback((targetY: number): void => {
    const now = performance.now()
    const isDragLike = now - lastJumpAtRef.current < 80
    lastJumpAtRef.current = now
    if (scrollAnimRef.current !== null) {
      cancelAnimationFrame(scrollAnimRef.current)
      scrollAnimRef.current = null
    }
    if (isDragLike) {
      setViewport((v) => ({ ...v, y: Math.max(0, Math.min(targetY, contentBounds.height - v.h)) }))
      return
    }
    const startY = viewport.y
    const start = performance.now()
    const distance = Math.abs(targetY - startY)
    // 750ms base + ~70ms per 1000px, capped at 1600ms. The Expo easing's
    // soft tails need real time to register — anything under ~700ms feels
    // abrupt no matter how extreme the curve is. With 750ms minimum, even
    // tiny corrections get the slow-inhale-slow-settle "rich" feel; long
    // jumps can stretch past a second of cinematic arc.
    const duration = Math.min(3000, 1800 + distance * 0.07)
    // Power-30 exponential easing — slot-machine pre-alignment feel.
    // First ~30% and last ~30% of the duration are visibly motionless
    // (sub-pixel motion over hundreds of ms); the middle ~40% covers
    // ~95% of the distance. Symmetric, so both the inhale into motion
    // and the settle to rest read as "almost stopping, almost there".
    const easeInOutSlotExpo = (p: number): number => {
      if (p <= 0) return 0
      if (p >= 1) return 1
      return p < 0.5
        ? Math.pow(2, 30 * p - 15) / 2
        : (2 - Math.pow(2, -30 * p + 15)) / 2
    }
    const tick = (t: number): void => {
      const p = Math.min(1, (t - start) / duration)
      const eased = easeInOutSlotExpo(p)
      setViewport((v) => ({
        ...v,
        y: Math.max(0, Math.min(startY + (targetY - startY) * eased, contentBounds.height - v.h)),
      }))
      if (p < 1) {
        scrollAnimRef.current = requestAnimationFrame(tick)
      } else {
        scrollAnimRef.current = null
      }
    }
    scrollAnimRef.current = requestAnimationFrame(tick)
  }, [viewport.y, contentBounds.height])

  // Inner scroll-and-glow primitive driven by the layout's stored position
  // for the card, NOT a DOM measurement. CardsLayer culls off-screen cards
  // out of the DOM (perf optimisation), so a DOM lookup at click time will
  // miss any card more than a viewport-buffer away from the current scroll.
  // The layout always knows where the card belongs, regardless of culling.
  const doFocus = useCallback((cardId: string, pos: CardPosition): void => {
    const cardYInCanvas = pos.y + BOARD_TOP_PAD_PX
    const targetY = computeFocusScrollY({
      cardY: cardYInCanvas,
      cardH: pos.h,
      viewportH: viewport.h,
      contentH: contentBounds.height,
    })
    handleScrollMeterJump(targetY)
    // Glow lands after the scroll completes — by then the card is inside
    // the viewport-cull window so it's in the DOM. Match the scroll's
    // distance-scaled duration (see handleScrollMeterJump) and retry a few
    // frames in case React hasn't yet painted the newly-visible card.
    const distance = Math.abs(targetY - viewport.y)
    const scrollDuration = Math.min(3000, 1800 + distance * 0.07)
    // Glow fires AFTER the scroll fully settles — never during. Three
    // opacity blinks at 1800ms each (5400ms total) — opacity instead of
    // box-shadow because the latter is invisible on white cards. Tempo
    // is constant regardless of distance.
    window.setTimeout(() => {
      let attempts = 0
      const tryGlow = (): void => {
        const canvas = canvasRef.current
        if (!canvas) return
        const node = canvas.querySelector<HTMLElement>(`[data-card-id="${cardId}"]`)
        if (node) {
          node.setAttribute('data-glowing', 'true')
          window.setTimeout(() => node.removeAttribute('data-glowing'), 5400)
          return
        }
        if (attempts++ < 6) requestAnimationFrame(tryGlow)
      }
      requestAnimationFrame(tryGlow)
    }, scrollDuration + 60)
  }, [viewport.h, viewport.y, contentBounds.height, handleScrollMeterJump])

  // Focus a card by ID — used by ?focus=<cardId> URL param and PiP card click.
  // If the card isn't in the current filter's layout (e.g. user is on a mood
  // filter that excludes the bookmark), clear the filter to 'all' and stash
  // the cardId; the retry useEffect below completes the scroll once
  // layout.positions catches up with the new filteredItems.
  const focusCard = useCallback((cardId: string): void => {
    const pos = layout.positions[cardId]
    if (!pos) {
      setActiveFilter('all')
      setPendingFocusId(cardId)
      return
    }
    doFocus(cardId, pos)
  }, [layout.positions, doFocus])

  // Retry path — fires after a filter clear when pendingFocusId is set,
  // once layout.positions has the card. layout.positions is in deps so we
  // re-evaluate when filteredItems re-renders.
  useEffect(() => {
    if (!pendingFocusId) return
    const pos = layout.positions[pendingFocusId]
    if (!pos) return
    doFocus(pendingFocusId, pos)
    setPendingFocusId(null)
  }, [pendingFocusId, layout.positions, doFocus])

  // ?focus=<cardId> URL param + booklage:focus-card CustomEvent listener.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    const focusId = url.searchParams.get('focus')
    if (focusId) {
      requestAnimationFrame(() => focusCard(focusId))
      url.searchParams.delete('focus')
      window.history.replaceState({}, '', url.toString())
    }
    const evHandler = (e: Event): void => {
      const detail = (e as CustomEvent<{ cardId: string }>).detail
      if (detail?.cardId) focusCard(detail.cardId)
    }
    window.addEventListener('booklage:focus-card', evHandler)
    return () => window.removeEventListener('booklage:focus-card', evHandler)
  }, [focusCard])


  const handleCardClick = useCallback((bookmarkId: string, originRect: DOMRect): void => {
    setLightboxOriginRect(originRect)
    setLightboxItemId(bookmarkId)
  }, [])

  // Right-click on a card → soft-delete. Pre-launch convenience: no
  // confirmation dialog (the user wanted the fastest possible delete
  // for solo iteration). isDeleted=true keeps the row in IndexedDB so
  // a future "trash" UI can restore it; the masonry filter already
  // hides anything with isDeleted=true so the card disappears from
  // the board the moment persistSoftDelete returns.
  const handleCardDelete = useCallback((bookmarkId: string): void => {
    void persistSoftDelete(bookmarkId, true)
  }, [persistSoftDelete])

  // Size level is a single board-wide preference, not per-card data.
  // localStorage is sufficient (recovers on next visit, cross-device sync
  // not in scope). On mount we hydrate from the saved value once.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = window.localStorage.getItem('booklage:size-level')
    if (saved !== null) setSizeLevel(clampSizeLevel(Number(saved)))
  }, [])
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('booklage:size-level', String(sizeLevel))
  }, [sizeLevel])

  const handleLightboxClose = useCallback((): void => {
    setLightboxItemId(null)
    setLightboxOriginRect(null)
  }, [])

  // Nav scope = filteredItems (what's currently visible on canvas).
  // Items found only in `items` (e.g. archived, filtered-out) are not
  // nav-reachable from the lightbox — that matches the user's mental
  // model: "I'm browsing what I see".
  const lightboxIndex = useMemo(
    () => filteredItems.findIndex((it) => it.bookmarkId === lightboxItemId),
    [filteredItems, lightboxItemId],
  )
  const lightboxItem = lightboxIndex >= 0 ? filteredItems[lightboxIndex] : null

  const handleLightboxNav = useCallback((dir: -1 | 1): void => {
    if (filteredItems.length === 0 || lightboxIndex < 0) return
    const next = ((lightboxIndex + dir) % filteredItems.length + filteredItems.length) % filteredItems.length
    setLightboxItemId(filteredItems[next]?.bookmarkId ?? null)
    setLightboxOriginRect(null)
  }, [filteredItems, lightboxIndex])

  const handleLightboxJump = useCallback((index: number): void => {
    if (index < 0 || index >= filteredItems.length) return
    setLightboxItemId(filteredItems[index]?.bookmarkId ?? null)
    setLightboxOriginRect(null)
  }, [filteredItems])

  const handleDropOrder = useCallback(
    (orderedBookmarkIds: readonly string[]): void => {
      void persistOrderBatch(orderedBookmarkIds)
    },
    [persistOrderBatch],
  )

  const handleDisplayModeChange = useCallback((m: DisplayMode): void => {
    setDisplayMode(m)
    void (async (): Promise<void> => {
      const db = await initDB()
      const cfg = await loadBoardConfig(db)
      await saveBoardConfig(db, { ...cfg, displayMode: m })
    })()
  }, [])

  const handleFilterChange = useCallback((f: BoardFilter): void => {
    setActiveFilter(f)
    void (async (): Promise<void> => {
      const db = await initDB()
      const cfg = await loadBoardConfig(db)
      await saveBoardConfig(db, { ...cfg, activeFilter: f })
    })()
  }, [])

  const handleOpenBookmarkletModal = useCallback((): void => {
    setBookmarkletModalOpen(true)
  }, [])
  const handleCloseBookmarkletModal = useCallback((): void => {
    setBookmarkletModalOpen(false)
  }, [])

  const handleShareConfirm = useCallback(
    async (data: ShareData, frameEl: HTMLElement | null): Promise<void> => {
      if (!frameEl) return
      const fragment = await encodeShareData(data)
      const baseUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}/share`
          : 'https://booklage.pages.dev/share'
      const shareUrl = `${baseUrl}#d=${fragment}`
      // Dynamic import keeps dom-to-image-more out of SSR module graph
      // (it reads `Node` at module evaluation time, crashing in node.js).
      const { exportFrameAsPng } = await import('@/lib/share/png-export')
      const pngDataUrl = await exportFrameAsPng(frameEl, getActiveWatermark())
      setShareComposerOpen(false)
      setActionSheet({ pngDataUrl, shareUrl })
    },
    [],
  )

  // Tweet thumbnail backfill via Cloudflare Pages Function proxy (the
  // syndication CDN itself is CORS-locked to platform.twitter.com, so we
  // can't call it from the browser directly — see functions/api/tweet-meta.ts).
  //
  // For every tweet bookmark we hit /api/tweet-meta?id=<id> once, then write
  // the resulting photoUrl / videoPosterUrl into bookmark.thumbnail with
  // force=true. The bookmarklet captures X's generic "SEE WHAT'S HAPPENING"
  // placeholder for every tweet because X is a SPA, so unconditional
  // overwrite is correct: the syndication response is the only source of
  // truth for per-tweet media.
  //
  // processedTweetIdsRef dedupes across re-renders — the effect re-runs
  // whenever items.length changes (e.g. a new bookmark arrives), and we
  // don't want to re-fetch tweets we've already filled.
  //
  // photoUrl AND videoPosterUrl missing → empty string forced into thumbnail,
  // which flips pickCard to TextCard for genuine text-only tweets.
  const processedTweetIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (loading || items.length === 0) return
    let cancelled = false
    const sleep = (ms: number): Promise<void> =>
      new Promise((resolve) => setTimeout(resolve, ms))
    void (async (): Promise<void> => {
      for (const it of items) {
        if (cancelled) return
        if (detectUrlType(it.url) !== 'tweet') continue
        const tweetId = extractTweetId(it.url)
        if (!tweetId) continue
        if (processedTweetIdsRef.current.has(tweetId)) continue
        processedTweetIdsRef.current.add(tweetId)
        try {
          const meta = await fetchTweetMeta(tweetId)
          if (cancelled) return
          if (!meta) continue
          const url = meta.photoUrl ?? meta.videoPosterUrl ?? ''
          await persistThumbnail(it.bookmarkId, url, true)
          // Mark the bookmark as a video source if syndication confirms
          // it. This drives the small play-overlay badge on the board
          // grid so video tweets stop looking like still photos. Photos
          // and text-only tweets never set the flag, so they stay
          // overlay-free.
          if (meta.hasVideo) {
            await persistVideoFlag(it.bookmarkId, true)
          }
        } catch {
          /* swallow per-tweet failures so the loop keeps draining the queue */
        }
        if (cancelled) return
        await sleep(200)
      }
    })()
    return (): void => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, items.length, persistThumbnail, persistVideoFlag])

  // TikTok thumbnail backfill via the public oEmbed endpoint
  // (https://www.tiktok.com/oembed?url=...). The bookmarklet's og:image
  // capture often gets the generic TikTok-logo card instead of a real
  // video first-frame because tiktok.com is a SPA, identical to the X
  // tweet problem. oEmbed returns a `thumbnail_url` that points at the
  // video's actual cover image (CDN), so we overwrite bookmark.thumbnail
  // with force=true on every TikTok item the first time we see it.
  // processedTikTokIdsRef dedupes the same way as the tweet pipeline so
  // we don't re-fetch when items.length re-fires the effect.
  const processedTikTokIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (loading || items.length === 0) return
    let cancelled = false
    const sleep = (ms: number): Promise<void> =>
      new Promise((resolve) => setTimeout(resolve, ms))
    void (async (): Promise<void> => {
      for (const it of items) {
        if (cancelled) return
        if (detectUrlType(it.url) !== 'tiktok') continue
        if (processedTikTokIdsRef.current.has(it.bookmarkId)) continue
        processedTikTokIdsRef.current.add(it.bookmarkId)
        try {
          const meta = await fetchTikTokMeta(it.url)
          if (cancelled) return
          if (!meta?.thumbnailUrl) continue
          await persistThumbnail(it.bookmarkId, meta.thumbnailUrl, true)
        } catch {
          /* swallow per-item failures; the next item still tries */
        }
        if (cancelled) return
        await sleep(200)
      }
    })()
    return (): void => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, items.length, persistThumbnail])

  // BroadcastChannel: reload board and trigger entrance animation when a new
  // bookmark is saved via the bookmarklet popup (/save route).
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    const unsub = subscribeBookmarkSaved(async ({ bookmarkId }) => {
      await reload()
      setNewlyAddedIds((prev) => {
        const next = new Set(prev)
        next.add(bookmarkId)
        return next
      })
      // Clear the "new" flag after entrance animation completes
      const id = setTimeout(() => {
        setNewlyAddedIds((prev) => {
          const next = new Set(prev)
          next.delete(bookmarkId)
          return next
        })
      }, 800)
      timers.push(id)
    })
    return (): void => {
      unsub()
      for (const t of timers) clearTimeout(t)
    }
  }, [reload])

  const sidebarCounts = useMemo(() => {
    const active = items.filter((i) => !i.isDeleted)
    const deleted = items.filter((i) => i.isDeleted)
    return {
      all: active.length,
      inbox: active.filter((i) => i.tags.length === 0).length,
      archive: deleted.length,
    }
  }, [items])

  const contentWidth = Math.max(viewport.w, contentBounds.width)
  const contentHeight = Math.max(viewport.h, contentBounds.height)

  return (
    <div className={styles.outerFrame}>
      {/* Outer-frame chrome — wordmark (top-left) + link strip (bottom).
          Sits in the white margin around the dark canvas, gives users a way
          back to the marketing site without intruding on the board. */}
      <BoardChrome />
      {/* Provisional onboarding affordance for early testers — drag the
          pill into the browser bookmark bar to install Booklage. Revisit
          once the marketing site handles install on its own. */}
      <BookmarkletPill />
      {/* Inner dark canvas — destefanis-style stage. The whole pan/cards/
          live inside, so cursor pan never escapes the rounded frame.
          Phase 1A: canvas is now a grid (auto / 1fr) — TopHeader at top,
          canvasWrap holds the existing absolute-layered scroll/cards stage. */}
      <div className={styles.canvas}>
        <TopHeader
          hidden={!!lightboxItemId}
          nav={
            <FilterPill
              value={activeFilter}
              onChange={handleFilterChange}
              moods={moods}
              counts={sidebarCounts}
            />
          }
          instrument={
            <ScrollMeter
              contentHeight={contentBounds.height}
              viewportY={viewport.y}
              viewportHeight={viewport.h}
              onScrollTo={handleScrollMeterJump}
            />
          }
          actions={
            <>
              <PopOutButton
                onClick={() => { void pip.open() }}
                disabled={!pip.isSupported}
              />
              <SizePicker value={sizeLevel} onChange={setSizeLevel} />
              <ResetAllButton
                count={customWidthCount}
                onClick={handleResetAllCustomWidths}
              />
              <button
                type="button"
                className={styles.sharePill}
                onClick={(): void => setShareComposerOpen(true)}
                data-testid="share-pill"
              >
                Share ↗
              </button>
            </>
          }
        />
        <div ref={canvasRef} className={styles.canvasWrap}>
          <InteractionLayer
            direction={themeMeta.direction}
            onScroll={handleScroll}
            spaceHeld={spaceHeld}
          >
            {/* Background — full canvas coverage, follows scroll. */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                transform: `translate3d(${-viewport.x}px, ${-viewport.y}px, 0)`,
                willChange: 'transform',
                pointerEvents: 'none',
              }}
            >
              <ThemeLayer
                themeId={DEFAULT_THEME_ID}
                totalWidth={contentWidth}
                totalHeight={contentHeight}
              />
            </div>
            {/* Cards — full-canvas-width with destefanis half-gap padding.
                Vertical transform adds BOARD_TOP_PAD_PX so the first row gets
                breathing room below the canvas top edge / toolbar pill. */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                transform: `translate3d(${horizontalOffset - viewport.x}px, ${BOARD_TOP_PAD_PX - viewport.y}px, 0)`,
                willChange: 'transform',
                pointerEvents: 'none',
              }}
            >
              <CardsLayer
                items={filteredItems}
                viewport={viewport}
                viewportWidth={effectiveLayoutWidth}
                hoveredBookmarkId={hoveredBookmarkId}
                spaceHeld={spaceHeld}
                onHoverChange={setHoveredBookmarkId}
                onClick={handleCardClick}
                onDrop={handleDropOrder}
                onDelete={handleCardDelete}
                persistMeasuredAspect={persistMeasuredAspect}
                displayMode={displayMode}
                newlyAddedIds={newlyAddedIds}
                defaultCardWidth={defaultCardWidth}
                customWidths={customWidths}
                onCardResize={handleCardResize}
                onCardResizeEnd={handleCardResizeEnd}
                onCardResetSize={handleCardResetSize}
              />
            </div>
          </InteractionLayer>
          {/* Soft fade at canvas top/bottom edges — scroll affordance.
              Hidden while the Lightbox is open so the backdrop reads as a
              uniform dim across the full canvas; otherwise the top fade
              (where TopHeader used to be) leaves a darker band that breaks
              the "lightbox centered in a calm field" feel. */}
          {!lightboxItemId && (
            <>
              <div className={styles.fadeTop} aria-hidden="true" />
              <div className={styles.fadeBottom} aria-hidden="true" />
            </>
          )}
          {!loading && items.length === 0 && (
            <EmptyStateWelcome onOpenModal={handleOpenBookmarkletModal} />
          )}
        </div>
        {/* Lightbox is a sibling of TopHeader + canvasWrap, NOT a child of
            canvasWrap. This way its backdrop (position: absolute; inset: 0)
            fills the FULL canvas — including the TopHeader band — so the
            lightbox visually centers within the entire dark canvas instead
            of the area below the TopHeader. The canvas's own overflow:hidden
            + border-radius still clip the backdrop to the rounded stage.
            TopHeader is faded out while the lightbox is open (see
            `hidden={!!lightboxItemId}` above) so the close button at the
            backdrop's top-right corner doesn't collide with header chrome. */}
        <Lightbox
          item={lightboxItem}
          originRect={lightboxOriginRect}
          onClose={handleLightboxClose}
          nav={lightboxItem ? {
            currentIndex: lightboxIndex,
            total: filteredItems.length,
            onNav: handleLightboxNav,
            onJump: handleLightboxJump,
          } : undefined}
        />
      </div>
      {/* Modals stay viewport-level so they cover everything including
          the outer margin (different visual treatment from Lightbox). */}
      <BookmarkletInstallModal
        isOpen={bookmarkletModalOpen}
        onClose={handleCloseBookmarkletModal}
        appUrl={typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL ?? 'https://booklage.pages.dev')}
      />
      {shareComposerOpen && (
        <ShareComposer
          open={shareComposerOpen}
          onClose={(): void => setShareComposerOpen(false)}
          items={filteredItems.map((it) => ({
            bookmarkId: it.bookmarkId,
            url: it.url,
            title: it.title,
            description: it.description ?? '',
            thumbnail: it.thumbnail ?? '',
            type: detectUrlType(it.url),
            cardWidth: defaultCardWidth,
            aspectRatio: it.aspectRatio,
          }))}
          positions={layout.positions}
          viewport={viewport}
          onConfirm={handleShareConfirm}
        />
      )}
      {actionSheet && (
        <ShareActionSheet
          pngDataUrl={actionSheet.pngDataUrl}
          shareUrl={actionSheet.shareUrl}
          onClose={(): void => setActionSheet(null)}
        />
      )}
      <PipPortal pipWindow={pip.window}>
        <PipCompanion
          onClose={() => pip.close()}
          onCardClick={handleCardClickFromPip}
        />
      </PipPortal>
    </div>
  )
}
