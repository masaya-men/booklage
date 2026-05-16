'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { computeSkylineLayout, type SkylineCard } from '@/lib/board/skyline-layout'
import { computeFocusScrollY } from '@/lib/board/scroll-to-card'
import {
  DEFAULT_THEME_ID,
  getThemeMeta,
} from '@/lib/board/theme-registry'
import { BOARD_INNER, BOARD_SLIDERS } from '@/lib/board/constants'
import type { BoardFilter, CardPosition, DisplayMode } from '@/lib/board/types'
import { applyFilter } from '@/lib/board/filter'
import { useBoardData } from '@/lib/storage/use-board-data'
import { RevalidationQueue, defaultFetcher, shouldRevalidate } from '@/lib/board/revalidate'
import { subscribeBookmarkSaved } from '@/lib/board/channel'
import { detectUrlType, extractTweetId } from '@/lib/utils/url'
import { fetchTweetMeta } from '@/lib/embed/tweet-meta'
import { createBackfillQueue } from '@/lib/board/backfill-queue'
import { backfillTweetMeta } from '@/lib/board/tweet-backfill'
import { fetchTikTokMeta } from '@/lib/embed/tiktok-meta'
import { useMoods } from '@/lib/storage/use-moods'
import { initDB } from '@/lib/storage/indexeddb'
import { loadBoardConfig, saveBoardConfig } from '@/lib/storage/board-config'
import { ThemeLayer } from './ThemeLayer'
import {
  BoardBackgroundTypography,
  isBoardBgTypoVariant,
  type BoardBgTypoVariant,
} from './BoardBackgroundTypography'
import { CardsLayer } from './CardsLayer'
import { InteractionLayer } from './InteractionLayer'
import { TopHeader } from './TopHeader'
import { FilterPill } from './FilterPill'
import { SizeSlider } from './SizeSlider'
import { GapSlider } from './GapSlider'
import { WidthGapResetButton } from './WidthGapResetButton'
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
    persistMediaSlots,
    persistVideoFlag,
    persistSoftDelete,
    persistCustomWidth,
    resetCustomWidth,
    resetAllCustomWidths,
    reload,
    persistLinkStatus,
  } = useBoardData()
  const { moods } = useMoods()
  const [activeFilter, setActiveFilter] = useState<BoardFilter>('all')
  // Background-typography animation variant. `'static'` (fixed centred
  // headline) is the only treatment wired up today; the URL query
  // `?bgtypo=...` lets us swap in future variants (dvd-bounce, glitch,
  // marquee, card-wind, multi) without touching this file again.
  const [bgTypoVariant, setBgTypoVariant] = useState<BoardBgTypoVariant>('static')
  useEffect(() => {
    if (typeof window === 'undefined') return
    const raw = new URL(window.location.href).searchParams.get('bgtypo')
    if (raw && isBoardBgTypoVariant(raw)) setBgTypoVariant(raw)
  }, [])
  const [displayMode, setDisplayMode] = useState<DisplayMode>('visual')
  const [viewport, setViewport] = useState({ x: 0, y: 0, w: 1200, h: 800 })
  // Lifted from InteractionLayer so CardsLayer can also observe Space-held
  // state and bail its pointerdown handler — letting the event bubble up to
  // InteractionLayer where pan engagement lives.
  const [spaceHeld, setSpaceHeld] = useState<boolean>(false)
  const [bookmarkletModalOpen, setBookmarkletModalOpen] = useState<boolean>(false)
  const [hoveredBookmarkId, setHoveredBookmarkId] = useState<string | null>(null)
  const [lightboxItemId, setLightboxItemId] = useState<string | null>(null)
  // Identity of the card that originally opened the lightbox. Stays
  // pinned to the first click even when chevron-nav swaps the displayed
  // item — so close always returns the lightbox to where it came from,
  // and the source card is the one held blank on the board (B-#11).
  const [lightboxSourceItemId, setLightboxSourceItemId] = useState<string | null>(null)
  // Captured at click time so Lightbox can grow from the card's exact screen
  // position (FLIP). Cleared on close. Plain DOMRect — fallback origin for
  // the close tween when the source card is no longer in the DOM (e.g.
  // culled off-screen). The Lightbox now prefers a live DOMRect looked up
  // via `data-bookmark-id` on close so pan/scroll during open are honoured.
  const [lightboxOriginRect, setLightboxOriginRect] = useState<DOMRect | null>(null)
  const [newlyAddedIds, setNewlyAddedIds] = useState<ReadonlySet<string>>(new Set())
  const [shareComposerOpen, setShareComposerOpen] = useState<boolean>(false)
  const [actionSheet, setActionSheet] = useState<{ pngDataUrl: string; shareUrl: string } | null>(null)
  // When focusCard is called for a bookmark not in the current filtered view
  // (e.g. user is on `mood:foo` but the PiP-clicked card has different tags),
  // we clear the filter to 'all' and stash the cardId here. The retry useEffect
  // below picks this up after filteredItems re-renders and completes the scroll.
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null)
  const [cardWidthPx, setCardWidthPx] = useState<number>(BOARD_SLIDERS.CARD_WIDTH_DEFAULT_PX)
  const [cardGapPx, setCardGapPx] = useState<number>(BOARD_SLIDERS.CARD_GAP_DEFAULT_PX)
  const clampCardWidth = useCallback((v: number): number => {
    if (!Number.isFinite(v)) return BOARD_SLIDERS.CARD_WIDTH_DEFAULT_PX
    return Math.min(BOARD_SLIDERS.CARD_WIDTH_MAX_PX, Math.max(BOARD_SLIDERS.CARD_WIDTH_MIN_PX, v))
  }, [])
  const clampCardGap = useCallback((v: number): number => {
    if (!Number.isFinite(v)) return BOARD_SLIDERS.CARD_GAP_DEFAULT_PX
    return Math.min(BOARD_SLIDERS.CARD_GAP_MAX_PX, Math.max(BOARD_SLIDERS.CARD_GAP_MIN_PX, v))
  }, [])
  const handleResetWidthGap = useCallback((): void => {
    setCardWidthPx(BOARD_SLIDERS.CARD_WIDTH_DEFAULT_PX)
    setCardGapPx(BOARD_SLIDERS.CARD_GAP_DEFAULT_PX)
  }, [])
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
  // reload where every card briefly snapped to the size slider default
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

  // Card width slider drives every card's default width directly (px-absolute).
  // Cards that the user has freely resized (`customWidths[id]`) keep their own
  // width — the slider intentionally doesn't override per-card customizations.
  const skylineCards = useMemo<SkylineCard[]>(
    () =>
      filteredItems.map((it) => {
        const w = customWidths[it.bookmarkId] ?? cardWidthPx
        const h = it.aspectRatio > 0 ? w / it.aspectRatio : w
        return { id: it.bookmarkId, width: w, height: h }
      }),
    [filteredItems, cardWidthPx, customWidths],
  )

  const layout = useMemo(
    () =>
      computeSkylineLayout({
        cards: skylineCards,
        containerWidth: effectiveLayoutWidth,
        gap: cardGapPx,
      }),
    [skylineCards, effectiveLayoutWidth, cardGapPx],
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


  // Shared revalidation queue. Used by both the viewport IntersectionObserver
  // (safety-net cadence) and the Lightbox intent triggers below — keeping a
  // single queue means bounded concurrency (max 3) is global, not per-source.
  // Lazy-initialised on first render; persistLinkStatus/persistThumbnail are
  // stable useCallback([]) so capture-by-closure is safe.
  const revalidateQueueRef = useRef<RevalidationQueue | null>(null)
  if (revalidateQueueRef.current === null) {
    revalidateQueueRef.current = new RevalidationQueue({
      fetcher: defaultFetcher,
      onResult: async (id, r) => {
        const now = Date.now()
        if (r.kind === 'alive') {
          await persistLinkStatus(id, 'alive', now)
          // Heal stale thumbnails when the source changed its og:image —
          // this is what makes the "Lightbox open → see latest" loop close.
          if (r.data?.image) await persistThumbnail(id, r.data.image, true)
        } else if (r.kind === 'gone') {
          await persistLinkStatus(id, 'gone', now)
        }
        // unknown → no state change (will retry on the next intent or viewport entry)
      },
    })
  }

  // Intent-driven revalidate: called when the user signals they care about a
  // specific card (Lightbox open / nav / jump). shouldRevalidate guards on
  // age so most calls are no-ops — fresh records cost nothing.
  const revalidateOnIntent = useCallback((bookmarkId: string): void => {
    const q = revalidateQueueRef.current
    if (!q) return
    const it = items.find((x) => x.bookmarkId === bookmarkId)
    if (!it) return
    if (shouldRevalidate(it.lastCheckedAt, Date.now())) q.enqueue(bookmarkId, it.url)
  }, [items])

  // Wheel-scroll through Lightbox can fire handleLightboxNav 10× per second.
  // Trailing 300ms debounce so only the card the user actually settled on
  // gets a fetch — paging fast through the deck triggers zero traffic.
  const navDebounceRef = useRef<{ id: string | null; timer: number | null }>({ id: null, timer: null })
  const revalidateOnNav = useCallback((bookmarkId: string): void => {
    navDebounceRef.current.id = bookmarkId
    if (navDebounceRef.current.timer !== null) window.clearTimeout(navDebounceRef.current.timer)
    navDebounceRef.current.timer = window.setTimeout(() => {
      const pendingId = navDebounceRef.current.id
      navDebounceRef.current.id = null
      navDebounceRef.current.timer = null
      if (pendingId) revalidateOnIntent(pendingId)
    }, 300)
  }, [revalidateOnIntent])

  const handleCardClick = useCallback((bookmarkId: string, originRect: DOMRect): void => {
    // Block Lightbox open for gone (dead-link) cards — the content is
    // unreachable so opening the Lightbox would only show a broken embed.
    const clickedItem = items.find((it) => it.bookmarkId === bookmarkId)
    if (clickedItem?.linkStatus === 'gone') return
    setLightboxOriginRect(originRect)
    setLightboxItemId(bookmarkId)
    setLightboxSourceItemId(bookmarkId)
    revalidateOnIntent(bookmarkId)
  }, [items, revalidateOnIntent])

  // Right-click on a card → soft-delete. Pre-launch convenience: no
  // confirmation dialog (the user wanted the fastest possible delete
  // for solo iteration). isDeleted=true keeps the row in IndexedDB so
  // a future "trash" UI can restore it; the masonry filter already
  // hides anything with isDeleted=true so the card disappears from
  // the board the moment persistSoftDelete returns.
  const handleCardDelete = useCallback((bookmarkId: string): void => {
    void persistSoftDelete(bookmarkId, true)
  }, [persistSoftDelete])

  // Card width and gap are board-wide preferences, not per-card data.
  // localStorage is sufficient (recovers on next visit, cross-device sync
  // not in scope). On mount we hydrate from saved values once.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const savedW = window.localStorage.getItem('booklage:card-width-px')
    if (savedW !== null) setCardWidthPx(clampCardWidth(Number(savedW)))
    const savedG = window.localStorage.getItem('booklage:card-gap-px')
    if (savedG !== null) setCardGapPx(clampCardGap(Number(savedG)))
  }, [clampCardWidth, clampCardGap])
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('booklage:card-width-px', String(cardWidthPx))
  }, [cardWidthPx])
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('booklage:card-gap-px', String(cardGapPx))
  }, [cardGapPx])

  // Fired by Lightbox at the moment .media has landed at the source
  // card's rect, ~150ms BEFORE the lightbox actually unmounts. Restoring
  // visibility now means the source card is visible underneath while
  // .media fades out on top — the cross-fade window that masks the
  // visual mismatch between .media's <img> and the source card's <img>
  // (different object-fit, radius). See Lightbox close-tween comment.
  const handleLightboxSourceShouldShow = useCallback((): void => {
    setLightboxSourceItemId(null)
  }, [])

  const handleLightboxClose = useCallback((): void => {
    setLightboxItemId(null)
    // sourceItemId should already be null via the cross-fade callback
    // above, but clear defensively in case the callback path was skipped
    // (fallback close, no source card, etc.).
    setLightboxSourceItemId(null)
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
    const nextId = filteredItems[next]?.bookmarkId ?? null
    setLightboxItemId(nextId)
    if (nextId) revalidateOnNav(nextId)
    // Source id and origin rect are NOT touched here — close always
    // returns to the originally clicked card regardless of how many
    // chevron-navs the user performed in between (B-#11).
  }, [filteredItems, lightboxIndex, revalidateOnNav])

  const handleLightboxJump = useCallback((index: number): void => {
    if (index < 0 || index >= filteredItems.length) return
    const nextId = filteredItems[index]?.bookmarkId ?? null
    setLightboxItemId(nextId)
    if (nextId) revalidateOnIntent(nextId)
    // Source id / origin rect preserved — see handleLightboxNav (B-#11).
  }, [filteredItems, revalidateOnIntent])

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

  // Phase B: rate-limit-driven backfill for every tweet bookmark. Replaces
  // the prior sequential loop (which persisted thumbnail + hasVideo). The
  // new path also persists mediaSlots from the same fetchTweetMeta call
  // (no extra API trips). Uses createBackfillQueue at parallel-3 +
  // 200ms intervals (spec §4-2 B-3) and an AbortController so navigation
  // away during a long sweep cancels in-flight tasks cleanly.
  //
  // processedTweetIdsRef dedupes across items.length re-fires so a freshly
  // arrived bookmark only enqueues if its tweet id has never been touched
  // in this session.
  const processedTweetIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (loading || items.length === 0) return
    const controller = new AbortController()
    const queue = createBackfillQueue({
      maxConcurrent: 3,
      minIntervalMs: 200,
      signal: controller.signal,
    })
    for (const it of items) {
      if (detectUrlType(it.url) !== 'tweet') continue
      const tweetId = extractTweetId(it.url)
      if (!tweetId) continue
      if (processedTweetIdsRef.current.has(tweetId)) continue
      // Spec §B-2 visible filter: items[] is already the post-filter,
      // post-soft-delete set produced by useBoardData. Iterating it
      // satisfies the "visible カード限定" requirement.
      processedTweetIdsRef.current.add(tweetId)
      void queue.add((signal) =>
        backfillTweetMeta(
          { bookmarkId: it.bookmarkId, tweetId },
          signal,
          {
            fetchMeta: fetchTweetMeta,
            persistThumbnail,
            persistVideoFlag,
            persistMediaSlots,
          },
        ),
      ).catch(() => {
        /* per-target failure isolated by the queue; nothing to do here. */
      })
    }
    return (): void => { controller.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, items.length, persistThumbnail, persistVideoFlag, persistMediaSlots])

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

  // Viewport-driven revalidation: when a card enters the viewport, check
  // whether its link is still alive if it hasn't been checked recently
  // (REVALIDATE_AGE_MS). Reuses the shared revalidateQueueRef so global
  // concurrency stays bounded. Lightbox intent triggers are the primary
  // freshness path; this is the safety net for cards never opened.
  useEffect(() => {
    if (!items.length) return
    const queue = revalidateQueueRef.current
    if (!queue) return

    const observer = new IntersectionObserver(
      (entries) => {
        const now = Date.now()
        for (const e of entries) {
          if (!e.isIntersecting) continue
          const id = (e.target as HTMLElement).dataset.bookmarkId
          if (!id) continue
          const item = items.find((it) => it.bookmarkId === id)
          if (!item) continue
          if (shouldRevalidate(item.lastCheckedAt, now)) {
            queue.enqueue(id, item.url)
          }
        }
      },
      { rootMargin: '200px' },
    )

    for (const it of items) {
      const el = document.querySelector(`[data-bookmark-id="${it.bookmarkId}"]`)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [items])

  const sidebarCounts = useMemo(() => {
    const active = items.filter((i) => !i.isDeleted)
    const deleted = items.filter((i) => i.isDeleted)
    return {
      all: active.length,
      inbox: active.filter((i) => i.tags.length === 0).length,
      archive: deleted.length,
      dead: active.filter((i) => i.linkStatus === 'gone').length,
    }
  }, [items])

  const contentWidth = Math.max(viewport.w, contentBounds.width)
  const contentHeight = Math.max(viewport.h, contentBounds.height)

  // Visible card range [N1, N2] for the ScrollMeter counter readout. Naturally
  // 60Hz-throttled: viewport state updates once per scroll event (React
  // batches within a frame), so this useMemo recomputes once per frame.
  // Cards are laid out by skyline (not strictly y-sorted across columns),
  // so we sweep the full filteredItems list and track first/last visible
  // index. The card's screen-space top in canvasWrap coords is
  // `BOARD_TOP_PAD_PX + pos.y - viewport.y` — visible if that intersects
  // [0, viewport.h].
  const visibleRange = useMemo<{ start: number; end: number }>(() => {
    if (filteredItems.length === 0) return { start: 0, end: 0 }
    let firstIdx = -1
    let lastIdx = -1
    for (let i = 0; i < filteredItems.length; i++) {
      const item = filteredItems[i]
      if (!item) continue
      const pos = layout.positions[item.bookmarkId]
      if (!pos) continue
      const cardTop = BOARD_TOP_PAD_PX + pos.y - viewport.y
      const cardBottom = cardTop + pos.h
      if (cardBottom > 0 && cardTop < viewport.h) {
        if (firstIdx === -1) firstIdx = i
        lastIdx = i
      }
    }
    return {
      start: firstIdx >= 0 ? firstIdx + 1 : 0,
      end: lastIdx >= 0 ? lastIdx + 1 : 0,
    }
  }, [filteredItems, layout.positions, viewport.y, viewport.h])

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
          actions={
            <>
              <PopOutButton
                onClick={() => { void pip.open() }}
                disabled={!pip.isSupported}
              />
              <SizeSlider value={cardWidthPx} onChange={(v): void => setCardWidthPx(clampCardWidth(v))} />
              <GapSlider value={cardGapPx} onChange={(v): void => setCardGapPx(clampCardGap(v))} />
              <WidthGapResetButton
                widthPx={cardWidthPx}
                gapPx={cardGapPx}
                onReset={handleResetWidthGap}
              />
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
        <div ref={canvasRef} className={styles.canvasWrap} data-lightbox-clone-host>
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
            {/* Hero background typography — viewport-bound (does NOT live
                inside the pan-transform wrappers above), so the headline
                stays centred on screen while cards travel over it. The
                cards-wrapper that follows in DOM order establishes its
                own stacking context via translate3d, and since the
                typography host carries no explicit z-index, DOM order
                alone keeps the cards above the typography. */}
            <BoardBackgroundTypography
              activeFilter={activeFilter}
              moods={moods}
              variant={bgTypoVariant}
            />
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
                cardGapPx={cardGapPx}
                hoveredBookmarkId={hoveredBookmarkId}
                spaceHeld={spaceHeld}
                onHoverChange={setHoveredBookmarkId}
                onClick={handleCardClick}
                onDrop={handleDropOrder}
                onDelete={handleCardDelete}
                persistMeasuredAspect={persistMeasuredAspect}
                displayMode={displayMode}
                newlyAddedIds={newlyAddedIds}
                defaultCardWidth={cardWidthPx}
                customWidths={customWidths}
                onCardResize={handleCardResize}
                onCardResizeEnd={handleCardResizeEnd}
                onCardResetSize={handleCardResetSize}
                sourceCardId={lightboxSourceItemId}
              />
            </div>
          </InteractionLayer>
          {!loading && items.length === 0 && (
            <EmptyStateWelcome onOpenModal={handleOpenBookmarkletModal} />
          )}
        </div>
        {/* Session 28: ScrollMeter relocated from the TopHeader instrument
            slot to the canvas bottom (mirroring LightboxNavMeter's pixel
            position). Sibling of canvasWrap so it lives inside the same
            rounded-canvas stacking context as the cards behind it, but
            above the bottom edge scrim band. Hidden via the same prop
            mechanism as TopHeader so the meter cleanly swaps with
            LightboxNavMeter when the user opens a card. */}
        <ScrollMeter
          contentHeight={contentBounds.height}
          viewportY={viewport.y}
          viewportHeight={viewport.h}
          onScrollTo={handleScrollMeterJump}
          visibleRangeStart={visibleRange.start}
          visibleRangeEnd={visibleRange.end}
          totalCount={filteredItems.length}
          hidden={!!lightboxItemId}
        />
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
          sourceCardId={lightboxSourceItemId}
          onSourceShouldShow={handleLightboxSourceShouldShow}
          onClose={handleLightboxClose}
          nav={lightboxItem ? {
            currentIndex: lightboxIndex,
            total: filteredItems.length,
            onNav: handleLightboxNav,
            onJump: handleLightboxJump,
          } : undefined}
          persistMediaSlots={persistMediaSlots}
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
            cardWidth: cardWidthPx,
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
