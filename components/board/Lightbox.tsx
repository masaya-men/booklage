'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ComponentType, type ReactElement, type ReactNode } from 'react'
import { gsap } from 'gsap'
import type { BoardItem } from '@/lib/storage/use-board-data'
import type { TikTokPlayback, TweetMeta, MediaSlot } from '@/lib/embed/types'
import { fetchTweetMeta } from '@/lib/embed/tweet-meta'
import { fetchTikTokPlayback } from '@/lib/embed/tiktok-meta'
import { t } from '@/lib/i18n/t'
import { normalizeItem, type LightboxItem } from '@/lib/share/lightbox-item'
import type { ShareCard } from '@/lib/share/types'
import { LightboxNavChevron } from './LightboxNavChevron'
import { LightboxNavMeter } from './LightboxNavMeter'
import { useSmoothWheelScroll } from '@/lib/scroll/use-smooth-wheel-scroll'
import type { LightboxFlipSceneProps } from './LightboxFlipScene'
import {
  detectUrlType,
  extractInstagramShortcode,
  extractTikTokVideoId,
  extractTweetId,
  extractYoutubeId,
  isYoutubeShorts,
} from '@/lib/utils/url'
import styles from './Lightbox.module.css'

// =====================================================================
// Open / close animation tunables — tweak freely. Seconds unless noted.
//
// Goal: pure rect-to-rect spring morph (no tilt, no motion blur). The
// frame stays fully opaque the whole way; the text panel fades in after
// the frame settles (open) and out before the frame shrinks back (close).
// On close the frame lands at the source card's live rect with the source
// card's visibility restored at the same frame as unmount → "card placed
// physically back" feel, no empty-slot flash. (B-#11 polish 2026-05-11)
//
// AllMarks character knobs (deliberately distinct from the destefanis
// reference): slight back.out spring overshoot on open + heavier 8px
// backdrop blur (vs reference 6px). Soften OPEN_EASE → 'power3.out' if
// you want flat decel; sharpen CLOSE_EASE → 'power3.out' for snappier.
// =====================================================================
const OPEN_BASE_DUR = 0.5
const OPEN_DIST_DIVISOR = 2000  // px of travel that buys 1s of bonus
const OPEN_DIST_BONUS_MAX = 0.2 // …capped at this many extra seconds
// Flat decel, no spring overshoot. The earlier `back.out(0.7)` baseline
// read as a side-effect rather than character; AllMarks wants a clean
// arrival. Soften toward `power2.out` for a slower settle, sharpen
// toward `power4.out` for a more decisive arrival.
const OPEN_EASE = 'power3.out'
const OPEN_TEXT_FADE_DUR = 0.28
const OPEN_TEXT_FADE_DELAY_RATIO = 0.55 // text reveal starts at 55% of frame morph
const OPEN_BACKDROP_FADE_DUR = 0.42
const OPEN_FALLBACK_DUR = 0.42

// Close — single diagonal tween from natural rect → source card's rect.
// To make the landing swap pixel-perfect (no blink), we briefly switch
// .media's <img> styling to match the source card thumb (object-fit:
// cover + per-card border-radius) so at the moment .media lands at
// source rect, it looks identical to the source card. A short 60ms
// opacity fade right at landing covers any residual sub-pixel rounding
// difference. User-described feel: 「斜めにまっすぐ帰っていく」.
const CLOSE_FRAME_DELAY = 0.1   // wait this long after text starts fading before moving
const CLOSE_TWEEN_DUR = 0.45    // diagonal travel duration
const CLOSE_TWEEN_EASE = 'power2.out' // gentle decel into source rect
const CLOSE_REVEAL_LEAD = 0.10  // reveal source card this many seconds BEFORE landing (safety margin)
const CLOSE_FADE_DUR = 0.10     // .media opacity fade at the very end, paired with reveal lead
const CLOSE_TEXT_FADE_DUR = 0.14
const CLOSE_BACKDROP_FADE_DUR = 0.42
const CLOSE_BACKDROP_DELAY = 0.15
const CLOSE_FALLBACK_DUR = 0.3

/** Optional nav controls — when provided, chevron + dots + arrow-key
 *  nav become available. Caller (BoardRoot or SharedView) owns the
 *  index state and loop logic; Lightbox just forwards user gestures. */
type LightboxNav = {
  readonly currentIndex: number
  readonly total: number
  readonly onNav: (dir: -1 | 1) => void
  readonly onJump: (index: number) => void
}

type Props = {
  /** Either a BoardItem (my own board) or a ShareCard (received share view).
   *  Internal `view = normalizeItem(item)` collapses both into LightboxItem
   *  so all sub-components see one shape. */
  readonly item: BoardItem | ShareCard | null
  /** Clicked card's screen rect at the moment of pointer-up. Used to seed
   *  the FLIP (First-Last-Invert-Play) open animation so the lightbox grows
   *  from where the card actually was, instead of the viewport center.
   *  Stays pinned to the originally-clicked card across chevron-nav (B-#11)
   *  so close always tweens back to the source card — never to whichever
   *  card the user happened to be viewing when they hit close. */
  readonly originRect: DOMRect | null
  /** Bookmark id of the originally clicked card. Used by the close tween
   *  to look up the card's *current* DOM rect via [data-bookmark-id], so
   *  the close animation tracks pan/scroll that happened during the open
   *  session. originRect (above) is the click-time fallback for when the
   *  source card has been culled from the DOM (off-screen). (B-#11) */
  readonly sourceCardId?: string | null
  readonly onClose: () => void
  /** Fired partway through the close tween — right when .media reaches
   *  the source card's rect — to ask the parent to make the source card
   *  visible again BEFORE the lightbox unmounts. The parent should clear
   *  whatever flag was holding source visibility:hidden. The window
   *  between this call and the trailing onClose is the cross-fade
   *  window: source card is visible underneath while .media fades out
   *  on top, so the unavoidable visual mismatch between .media's <img>
   *  and the source card's <img> is masked by a continuous fade rather
   *  than a 1-frame swap (= the "明滅" the user reported). Optional
   *  for back-compat with callers that don't track a source card. */
  readonly onSourceShouldShow?: () => void
  readonly nav?: LightboxNav
  /** v13: called with (bookmarkId, mediaSlots[]) whenever a tweet meta fetch
   *  reveals slot data, so the board can render the correct hover swap
   *  next time the user is on the board. Pass through from
   *  useBoardData().persistMediaSlots. Fire-and-forget. */
  readonly persistMediaSlots?: (bookmarkId: string, mediaSlots: readonly MediaSlot[]) => Promise<void>
}

export function Lightbox({ item, originRect, sourceCardId, onClose, onSourceShouldShow, nav, persistMediaSlots }: Props): ReactElement | null {
  const backdropRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  // Open/close FLIP morphs *only* the media element (not the entire .frame),
  // so the visible motion reads as "the source card image grows / shrinks
  // back" rather than "a whole 2-column lightbox container scales". The
  // .frame container has no visible chrome (no background/border) so an
  // untransformed .frame is invisible — only its children show.
  const mediaRef = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  // Tracks the identity from the previous render. Hoisted to the top of
  // the component (out of the nav-transition effect below) so the open
  // animation effect can also read it, and skip its fallback entry
  // animation when this is a chevron-nav (in which case the slide
  // effect handles the entry). Without that skip, the fallback's
  // `gsap.fromTo(el, { scale: 0.86, opacity: 0 }, { scale: 1, opacity: 1 })`
  // applies its FROM (scale=0.86) inline before the slide effect kills
  // the tween mid-frame — and the slide effect's fromTo never sets
  // `scale`, so the 0.86 stays in the matrix forever. Verified leak
  // (Playwright measured chev/click ratio = 0.86 exact) — 2026-05-11.
  const prevIdentityRef = useRef<string | null>(null)
  const prevNavIndexRef = useRef<number | null>(null)
  useSmoothWheelScroll(textRef, { disabled: !item })
  // closeButtonRef intentionally absent — see "No programmatic auto-focus"
  // comment near the keyboard handler below.

  // Normalize once to a slim shape. Lets Lightbox accept either a
  // BoardItem (my own board) or a ShareCard (received share view) and
  // exposes a single field set (url/title/description/thumbnail/kind)
  // to all internal sub-components.
  const view: LightboxItem | null = item ? normalizeItem(item) : null
  const isTweet = view ? detectUrlType(view.url) === 'tweet' : false
  const tweetId = isTweet && view ? extractTweetId(view.url) : null
  // Stable string ref for effect deps — using item (object) directly causes
  // the open animation to restart whenever an unrelated state update gives
  // BoardRoot's items a new array reference (e.g. thumbnail backfill).
  // identity is `${kind}:${url}` so the same hook fires for both BoardItem
  // (board side) and ShareCard (receive side) at distinct cards.
  const identity = view ? `${view.kind}:${view.url}` : null

  // Lazy-load tweet metadata when a tweet lightbox opens. Same /api/tweet-meta
  // endpoint that BoardRoot's bulk backfill hits, so the response is typically
  // already in the browser HTTP cache (s-maxage=3600 at the edge) and resolves
  // in milliseconds. We render an item-level placeholder until it lands.
  const [tweetMeta, setTweetMeta] = useState<TweetMeta | null>(null)
  useEffect(() => {
    if (!tweetId) {
      setTweetMeta(null)
      return
    }
    let cancelled = false
    void fetchTweetMeta(tweetId).then((meta) => {
      if (cancelled) return
      setTweetMeta(meta)
      // Phase C backfill: write mediaSlots[] to IDB so the board card
      // can render the correct hover swap + dot indicator next mount.
      // Fire-and-forget: no await, errors ignored. The persist helper
      // is idempotent so repeat fetches don't churn IDB.
      if (meta?.mediaSlots && meta.mediaSlots.length > 0 && view?.bookmarkId && persistMediaSlots) {
        void persistMediaSlots(view.bookmarkId, meta.mediaSlots)
      }
    })
    return (): void => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tweetId])

  // I-07 + mix-tweet: unified slot array driving both .media render and the
  // dot indicator. Resolution order: TweetMeta.mediaSlots (fresh from
  // syndication) → BoardItem.mediaSlots (IDB-persisted) → BoardItem.photos
  // (legacy v12 fallback, widened to photo slots) → empty (single-image /
  // text-only paths handle this).
  const tweetSlots: readonly MediaSlot[] = (() => {
    if (tweetMeta?.mediaSlots && tweetMeta.mediaSlots.length > 0) return tweetMeta.mediaSlots
    if (view?.mediaSlots && view.mediaSlots.length > 0) return view.mediaSlots
    const legacy = view?.photos ?? []
    return legacy.map((url): MediaSlot => ({ type: 'photo', url }))
  })()

  // Current slot index — drives both the .media render and the dots.
  // Renamed from tweetImageIdx (Phase 1) because the carousel may now point
  // at a video slot, not just a photo.
  const [tweetSlotIdx, setTweetSlotIdx] = useState<number>(0)
  useEffect(() => {
    setTweetSlotIdx(0)
  }, [view?.bookmarkId])

  // Mix-tweet defensive pause-sweep: after every slot change, scan .media for
  // any <video> still present and pause it. For video→photo transitions
  // React has already unmounted the <video> by the time this effect runs
  // (so the sweep is a no-op — the browser also tears down the stream on
  // unmount), but for the rare same-slot re-render path (e.g. tweetMeta
  // arrives late and triggers a parent re-render while the user is on a
  // video slot) this prevents a momentary double-play.
  //
  // Known limitation (spec §10 open problem): `key={slot-${slotIdx}}` on
  // <TweetVideoPlayer> forces remount on slot change, so currentTime is
  // reset when navigating away and back. Solving "戻ったら続きから" needs a
  // keep-mounted-hidden strategy or a restorable currentTime ref — out of
  // scope for this Task; tracked in plan §Open Items.
  useEffect(() => {
    const media = mediaRef.current
    if (!media) return
    const videos = media.querySelectorAll('video')
    videos.forEach((v) => {
      if (!v.paused) v.pause()
    })
  }, [tweetSlotIdx])

  // Lazy-load the R3F flip scene module on idle. This keeps the
  // ~250 KB three.js + @react-three/fiber payload OUT of the initial
  // bundle — first paint is unaffected — and prefetches it during the
  // browser's quiet time so by the time the user clicks any card the
  // scene is already cached and instantaneous to mount.
  const [SceneComp, setSceneComp] = useState<ComponentType<LightboxFlipSceneProps> | null>(null)
  useEffect(() => {
    let cancelled = false
    const load = (): void => {
      void import('./LightboxFlipScene').then((m) => {
        if (!cancelled) setSceneComp(() => m.default)
      }).catch(() => {
        // Module load failure → silently fall back to CSS FLIP forever.
        // No telemetry here; if it can't load the user just gets the
        // (already-rich) CSS animation instead.
      })
    }
    // requestIdleCallback fires when the main thread is quiet; lets
    // initial paint finish before we start the network fetch. Falls
    // back to setTimeout for Safari (no rIC support yet).
    const w = window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }
    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(load, { timeout: 2000 })
    } else {
      setTimeout(load, 800)
    }
    return (): void => { cancelled = true }
  }, [])

  // Scene-mode coordination: when the scene is rendering, the actual
  // .frame is held at opacity 0 and close requests are ignored. The
  // ref mirror exists so requestClose's useCallback closure can read
  // the current value without becoming a re-render dep.
  const [sceneActive, setSceneActive] = useState<boolean>(false)
  const sceneActiveRef = useRef<boolean>(false)
  const [targetRectState, setTargetRectState] = useState<DOMRect | null>(null)

  // Reverse FLIP close — mirror the open animation: shrink + translate +
  // tilt + blur back to the source card's rect, fade out, then call the
  // real onClose (which unmounts the lightbox in BoardRoot). Without this
  // the lightbox just blinked away on close, which felt cheap next to
  // the rich open animation. closingRef guards against double-fire from
  // (Esc + backdrop + ✕) chains.
  const closingRef = useRef<boolean>(false)
  const requestClose = useCallback((): void => {
    // Block close while the R3F open scene is mid-tween — the .frame is
    // hidden during that ~700 ms window and would animate invisibly,
    // leaving the user staring at a paused scene with nothing happening.
    if (closingRef.current || sceneActiveRef.current) return
    closingRef.current = true
    const el = frameRef.current
    const backdrop = backdropRef.current
    if (!el) {
      onClose()
      return
    }
    // Kill any in-flight open tween so we animate from current state.
    gsap.killTweensOf(el)
    if (backdrop) gsap.killTweensOf(backdrop)

    // Prefer the source card's *current* DOM rect so the close FLIP tracks
    // any pan/scroll that happened while the lightbox was open. Falls back
    // to the click-time originRect when the source card has been culled
    // (off-screen) — and finally to the scale-only fade below. (B-#11)
    const liveSourceEl = sourceCardId
      ? document.querySelector<HTMLElement>(`[data-bookmark-id="${sourceCardId}"]`)
      : null
    const liveSourceRect = liveSourceEl?.getBoundingClientRect() ?? null
    const closeOrigin = liveSourceRect ?? originRect

    const mediaEl = mediaRef.current
    const textEl = textRef.current
    const closeEl = closeBtnRef.current

    if (closeOrigin && mediaEl) {
      // Mirror the open: only .media morphs back to the source card's
      // current rect. Chrome (text + close button) fades out first; the
      // .frame container itself stays at scale 1 + opacity 1 (it has no
      // visible chrome, so it contributes nothing to what the user sees).
      const mediaRect = mediaEl.getBoundingClientRect()
      // Round dx/dy to integer pixels so .media's transformed end position
      // snaps to the same pixel grid the (un-transformed) source card
      // renders on. Without this, fractional translate values land 0.3-0.5px
      // off the source card's actual pixel position → that's the last
      // remaining "意識して凝視すると一瞬だけ明滅" the user reported.
      // Scale stays fractional (rounding 0.2 → 0 would collapse .media).
      const dx = Math.round((closeOrigin.left + closeOrigin.width / 2) - (mediaRect.left + mediaRect.width / 2))
      const dy = Math.round((closeOrigin.top + closeOrigin.height / 2) - (mediaRect.top + mediaRect.height / 2))
      const endScaleX = Math.max(0.05, closeOrigin.width / mediaRect.width)
      const endScaleY = Math.max(0.05, closeOrigin.height / mediaRect.height)

      // Kill any in-flight open tween on the chrome / media so close
      // takes over from the current visual state cleanly.
      gsap.killTweensOf(mediaEl)
      if (textEl) gsap.killTweensOf(textEl)
      if (closeEl) gsap.killTweensOf(closeEl)

      const tl = gsap.timeline({
        onComplete: () => onClose(),
      })
      if (textEl) {
        tl.to(textEl, {
          opacity: 0,
          duration: CLOSE_TEXT_FADE_DUR,
          ease: 'power2.in',
        }, 0)
      }
      if (closeEl) {
        tl.to(closeEl, {
          opacity: 0,
          duration: CLOSE_TEXT_FADE_DUR,
          ease: 'power2.in',
        }, 0)
      }
      // Pre-tween: align .media's <img> object-fit to the source card thumb
      // (cover, not contain) so at small sizes the image fills its container
      // the same way the card thumbnail does — no letterboxing mismatch.
      const mediaImg = mediaEl.querySelector<HTMLImageElement>(':scope > img')
      if (mediaImg) mediaImg.style.objectFit = 'cover'

      // Compute the source card's natural border-radius using the same
      // formula CardsLayer applies inline. Read the lightbox's natural
      // radius from CSS so this auto-tracks any future spec change.
      const cardRadiusValue = Math.min(24, Math.min(closeOrigin.width, closeOrigin.height) * 0.075)
      const computedLightboxRadius = parseFloat(getComputedStyle(mediaEl).borderRadius) || 6

      // Single diagonal tween — .media travels straight from its natural
      // rect to the source rect with gentle power2.out decel. The onUpdate
      // callback compensates .media's border-radius for the current scale
      // every frame so the *visible* corner roundness smoothly transitions
      // from `--lightbox-media-radius` (start) to the source card's
      // `--card-radius` (end). Without this compensation, the visible
      // radius at landing would be lightboxR × endScale (e.g. 6 × 0.2 =
      // 1.2px) — far smaller than the source card's actual ~12.8px → the
      // 「びゅんっと変わる」 jump at swap. With it, both ends match exactly
      // and the in-between radius interpolates smoothly.
      tl.to(mediaEl, {
        x: dx,
        y: dy,
        scaleX: endScaleX,
        scaleY: endScaleY,
        duration: CLOSE_TWEEN_DUR,
        ease: CLOSE_TWEEN_EASE,
        transformOrigin: '50% 50%',
        onUpdate: function (this: gsap.core.Tween): void {
          // `ratio` = eased progress 0→1 (matches the actual scale curve)
          const r = this.ratio
          const visibleR = computedLightboxRadius + (cardRadiusValue - computedLightboxRadius) * r
          const curScaleX = 1 + (endScaleX - 1) * r
          const curScaleY = 1 + (endScaleY - 1) * r
          // Specify horizontal / vertical radii separately so non-uniform
          // scale (portrait card vs landscape lightbox, etc.) doesn't
          // squish the corners into ovals.
          const safeX = Math.max(0.01, curScaleX)
          const safeY = Math.max(0.01, curScaleY)
          mediaEl.style.borderRadius = `${visibleR / safeX}px / ${visibleR / safeY}px`
        },
      }, CLOSE_FRAME_DELAY)
      if (backdrop) {
        tl.to(backdrop, {
          opacity: 0,
          duration: CLOSE_BACKDROP_FADE_DUR,
          ease: 'power2.in',
        }, CLOSE_BACKDROP_DELAY)
      }

      // Reveal source card slightly BEFORE .media lands, paired with a
      // brief .media opacity fade. Because the <img> styling is now
      // matched (cover + card-radius), source card and .media at landing
      // are visually identical — the lead time + fade are a safety net
      // against sub-pixel rounding between scaled .media's rect and the
      // source card's rect. With matched styling, any residual offset
      // dissolves through this short overlap rather than appearing as
      // a 1-frame snap.
      const landingAt = CLOSE_FRAME_DELAY + CLOSE_TWEEN_DUR
      const revealAt = Math.max(0, landingAt - CLOSE_REVEAL_LEAD)
      if (onSourceShouldShow) {
        tl.call(() => { onSourceShouldShow() }, undefined, revealAt)
      }
      tl.to(mediaEl, {
        opacity: 0,
        duration: CLOSE_FADE_DUR,
        ease: 'power2.in',
      }, revealAt)
    } else {
      gsap.to(el, {
        scale: 0.96,
        opacity: 0,
        duration: CLOSE_FALLBACK_DUR,
        ease: 'power2.in',
        onComplete: () => onClose(),
      })
    }
  }, [onClose, originRect, sourceCardId])

  // Escape key closes
  useEffect(() => {
    if (!identity) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        requestClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return (): void => window.removeEventListener('keydown', onKey)
  }, [identity, requestClose])

  // Arrow nav. Skip when an INPUT/TEXTAREA/SELECT has focus to avoid
  // hijacking text editing within an embed. Esc handler intentionally
  // does NOT skip on input focus — close should always work.
  useEffect(() => {
    if (!identity) return
    const onKey = (e: KeyboardEvent): void => {
      const ae = document.activeElement
      const tag = ae?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        // Mix-tweet: nav cycles through slots (video or photo). Falls back
        // to no-op when the current tweet has zero or one slot.
        if (tweetSlots.length <= 1) return
        e.preventDefault()
        e.stopPropagation()
        if (e.key === 'ArrowDown') {
          setTweetSlotIdx((idx) => Math.min(tweetSlots.length - 1, idx + 1))
        } else {
          setTweetSlotIdx((idx) => Math.max(0, idx - 1))
        }
        return
      }

      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if (!nav) return
      e.stopPropagation()
      nav.onNav(e.key === 'ArrowLeft' ? -1 : 1)
    }
    window.addEventListener('keydown', onKey)
    return (): void => window.removeEventListener('keydown', onKey)
  }, [identity, nav, tweetSlots])

  // Mouse wheel nav. Both vertical (deltaY) and horizontal (deltaX) are
  // accepted — trackpad two-finger swipe and traditional wheel both work.
  // 280ms debounce prevents a single inertial flick from skipping multiple
  // cards. Threshold (>= 18) suppresses accidental tiny scrolls.
  const wheelLockUntilRef = useRef<number>(0)
  useEffect(() => {
    if (!identity || !nav) return
    const onWheel = (e: WheelEvent): void => {
      const dx = e.deltaX
      const dy = e.deltaY
      const dominant = Math.abs(dx) > Math.abs(dy) ? dx : dy
      if (Math.abs(dominant) < 18) return
      const now = performance.now()
      if (now < wheelLockUntilRef.current) return
      wheelLockUntilRef.current = now + 280
      e.preventDefault()
      nav.onNav(dominant > 0 ? 1 : -1)
    }
    // passive:false because we preventDefault to suppress backdrop scroll
    window.addEventListener('wheel', onWheel, { passive: false })
    return (): void => window.removeEventListener('wheel', onWheel)
  }, [identity, nav])

  // Reset closingRef when item changes (= a new lightbox session opens
  // after a previous close completed). identity is the stable string
  // ref, so this only fires when the user opens a different card.
  useEffect(() => {
    closingRef.current = false
    // Also reset scene state on each new open so we don't carry over
    // a stale sceneActive=true from a previous session that happened
    // to unmount before its completion callback fired.
    sceneActiveRef.current = false
    setSceneActive(false)
    setTargetRectState(null)
  }, [identity])

  // Fired by the R3F scene when the open tween reaches progress=1.
  // We unmount the scene (setSceneActive false) and reveal the actual
  // .frame with a brief opacity fade so the swap is imperceptible.
  // The frame's transforms have never been touched by the scene path,
  // so it lands at the natural centred position with no jump.
  const handleSceneComplete = useCallback((): void => {
    sceneActiveRef.current = false
    setSceneActive(false)
    if (frameRef.current) {
      gsap.fromTo(
        frameRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.18, ease: 'power2.out' },
      )
    }
  }, [])

  // Open animation: FLIP from the clicked card's screen position when an
  // originRect is supplied, otherwise a scale-in fallback. Uses two
  // parallel tweens so the opacity reveal lands quickly (~0.22s) while
  // the transform (scale + position) keeps unfurling for the full
  // duration on a smoother power3.out curve. Running both at offset 0
  // of a timeline guarantees they share the exact same start frame, so
  // there is no perceptible flicker from one beating the other to the
  // first paint. .frame's CSS opacity:0 + will-change keeps the GPU
  // layer warm before the tween fires.
  useLayoutEffect(() => {
    if (!identity || !frameRef.current) return
    const el = frameRef.current
    const backdrop = backdropRef.current

    // Chevron-nav case: the lightbox is already open and the slide effect
    // below (the second useLayoutEffect, declared lower in this file) is
    // about to fire on the same identity change. If we ALSO run the
    // entry/fallback animation here, the two tweens race on the same DOM
    // node — and the fallback's `{ scale: 0.86, opacity: 0 }` FROM gets
    // written inline before the slide effect kills the to-tween, leaving
    // `scale=0.86` permanently in the transform matrix because the slide
    // tween never sets `scale`. (Symptom: every card after the first
    // chevron-nav rendered at 86% size, forever. Measured with Playwright
    // 2026-05-11: chev/click rect ratio = 0.860 exact.)
    // The first mount of any identity has prevIdentityRef.current === null
    // (set by the close cleanup below, or initial useRef default), so this
    // skip never blocks the genuine open animation.
    if (prevIdentityRef.current !== null && prevIdentityRef.current !== identity) {
      return
    }

    // R3F scene mode is currently DISABLED at the activation site
    // because the first end-to-end test left the lightbox stuck on
    // an empty backdrop (likely texture-load CORS failure leaving
    // onComplete unfired). The scene module is still lazy-loaded
    // and ready; flip the SCENE_ENABLED flag below to re-enable
    // once we've added a load timeout + texture fallback path.
    const SCENE_ENABLED = false
    if (SCENE_ENABLED && originRect && SceneComp && view?.thumbnail) {
      const targetRect = el.getBoundingClientRect()
      setTargetRectState(targetRect)
      sceneActiveRef.current = true
      setSceneActive(true)
      gsap.set(el, { opacity: 0 })
      let backdropTween: gsap.core.Tween | null = null
      if (backdrop) {
        backdropTween = gsap.fromTo(
          backdrop,
          { opacity: 0 },
          { opacity: 1, duration: 0.22, ease: 'power2.out' },
        )
      }
      return (): void => { backdropTween?.kill() }
    }

    const mediaEl = mediaRef.current
    const textEl = textRef.current
    const closeEl = closeBtnRef.current

    if (originRect && mediaEl) {
      // FLIP target is the *media* element's natural rect (not the whole
      // .frame). Visually only .media morphs, so the user reads the open
      // as "the source card grows into the media slot" — closer to the
      // destefanis "image clone morphs" feel. .frame is untransformed
      // and only acts as a layout host (no visible chrome).
      const mediaRect = mediaEl.getBoundingClientRect()
      // Round dx/dy to integer pixels so .media's transformed *start*
      // position snaps to the source card's actual pixel grid. Symmetric
      // to the close-tween rounding — keeps the "card grows from where
      // it was" moment pixel-aligned with the source card the user
      // remembers clicking. Scale stays fractional.
      const dx = Math.round((originRect.left + originRect.width / 2) - (mediaRect.left + mediaRect.width / 2))
      const dy = Math.round((originRect.top + originRect.height / 2) - (mediaRect.top + mediaRect.height / 2))
      const startScaleX = Math.max(0.05, originRect.width / mediaRect.width)
      const startScaleY = Math.max(0.05, originRect.height / mediaRect.height)
      const distance = Math.hypot(dx, dy)
      const dur = OPEN_BASE_DUR + Math.min(distance / OPEN_DIST_DIVISOR, OPEN_DIST_BONUS_MAX)

      // Compute radius compensation values — visible corner roundness
      // smoothly interpolates from the source card's natural --card-radius
      // (at t=0) to --lightbox-media-radius (at t=1). DOM border-radius is
      // visibleR / current_scale at every frame so the *visible* radius
      // (DOM × scale) hits the right value at both ends regardless of
      // how aggressive the FLIP scale is.
      const openCardRadius = Math.min(24, Math.min(originRect.width, originRect.height) * 0.075)
      const openLightboxRadius = parseFloat(getComputedStyle(mediaEl).borderRadius) || 6

      // Initial state set synchronously *outside* the timeline so the
      // browser paints the source-rect frame at t=0 before the tween
      // runs — avoids the GSAP gotcha where set + to at the same
      // timeline offset can leave the to-tween's from-state captured
      // pre-set (resulting in no visible morph). useLayoutEffect runs
      // before paint, so this is flicker-free.
      gsap.set(el, { opacity: 1 })
      gsap.set(mediaEl, {
        x: dx,
        y: dy,
        scaleX: startScaleX,
        scaleY: startScaleY,
        transformOrigin: '50% 50%',
      })
      // Border-radius set via direct DOM (slash syntax for non-uniform
      // X/Y radii isn't supported cleanly by gsap.set). At t=0 the
      // visible radius equals openCardRadius — same as the source card —
      // so there's no jarring "lightbox starts with the wrong radius"
      // first frame.
      {
        const safeStartX = Math.max(0.01, startScaleX)
        const safeStartY = Math.max(0.01, startScaleY)
        mediaEl.style.borderRadius = `${openCardRadius / safeStartX}px / ${openCardRadius / safeStartY}px`
      }
      if (textEl) gsap.set(textEl, { opacity: 0 })
      if (closeEl) gsap.set(closeEl, { opacity: 0 })

      const tl = gsap.timeline()
      tl.to(mediaEl, {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        duration: dur,
        ease: OPEN_EASE,
        onUpdate: function (this: gsap.core.Tween): void {
          const r = this.ratio
          const visibleR = openCardRadius + (openLightboxRadius - openCardRadius) * r
          const curScaleX = startScaleX + (1 - startScaleX) * r
          const curScaleY = startScaleY + (1 - startScaleY) * r
          const safeX = Math.max(0.01, curScaleX)
          const safeY = Math.max(0.01, curScaleY)
          mediaEl.style.borderRadius = `${visibleR / safeX}px / ${visibleR / safeY}px`
        },
      }, 0)
      // Chrome (text panel + close button) appears only after the media
      // is most of the way home — "card lands, then chrome arrives" as
      // two distinct beats.
      const chromeAt = dur * OPEN_TEXT_FADE_DELAY_RATIO
      if (textEl) {
        tl.to(textEl, {
          opacity: 1,
          duration: OPEN_TEXT_FADE_DUR,
          ease: 'power2.out',
        }, chromeAt)
      }
      if (closeEl) {
        tl.to(closeEl, {
          opacity: 1,
          duration: OPEN_TEXT_FADE_DUR,
          ease: 'power2.out',
        }, chromeAt)
      }
      let backdropTween: gsap.core.Tween | null = null
      if (backdrop) {
        backdropTween = gsap.fromTo(
          backdrop,
          { opacity: 0 },
          { opacity: 1, duration: OPEN_BACKDROP_FADE_DUR, ease: 'power2.out' },
        )
      }
      return (): void => {
        // Just kill tweens — do NOT snap .media / chrome back to a
        // settled state here. This cleanup also fires on close (when
        // identity flips to null right before unmount), and any
        // gsap.set here paints one frame of "reset to natural size"
        // between the close tween's landing and the actual unmount —
        // visible as a flash. Chevron-during-open is rare enough that
        // letting the slide effect deal with the small mid-tween
        // .media is acceptable.
        tl.kill()
        backdropTween?.kill()
      }
    }

    // No-originRect fallback — gentle scale-in on .frame itself, kept
    // opaque to match the main path's "no opacity drama" character.
    const tween = gsap.fromTo(
      el,
      { scale: 0.96, opacity: 0 },
      { scale: 1, opacity: 1, duration: OPEN_FALLBACK_DUR, ease: 'power2.out' },
    )
    return (): void => { tween.kill() }
    // originRect is intentionally read once at mount via the identity dep —
    // a later rect change should not retrigger the open animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity])

  // 3D physical slide on nav transition. Distinct from the FLIP open
  // animation: this only fires when identity changes WHILE the lightbox
  // is already open (not on first mount). Direction inferred from the
  // nav.currentIndex delta. Wrap-around (last → 0 or 0 → last) is
  // detected via abs(delta) > total/2 and treated as the "natural"
  // forward/back direction so the slide reads as continuous.
  //
  // The departing card is preserved as a DOM clone overlaid on the
  // backdrop, so the user sees BOTH the old card receding into the depth
  // and the new card emerging from the depth simultaneously — without
  // this clone trick, React's unmount would erase the old DOM the moment
  // identity changes, and only the entering animation would be visible.
  // prevIdentityRef + prevNavIndexRef were moved to the top of the component
  // (alongside backdropRef/frameRef) so the open useLayoutEffect can read
  // them too. Kept this comment as a breadcrumb in case anyone greps for
  // "prevIdentityRef" from the original location.
  // Tracks every in-flight snapshot clone so a new identity change can
  // wipe them all out before starting a fresh tween. Without this, fast
  // drag-scrub piles up dozens of snapshots all sliding the same way —
  // they'd pool on one side instead of staying centered.
  const activeSnapshotsRef = useRef<Set<HTMLElement>>(new Set())
  const lastTransitionAtRef = useRef<number>(0)
  useLayoutEffect(() => {
    if (!identity) {
      prevIdentityRef.current = null
      prevNavIndexRef.current = null
      return
    }
    const prevIdentity = prevIdentityRef.current
    const prevNavIndex = prevNavIndexRef.current
    prevIdentityRef.current = identity
    prevNavIndexRef.current = nav?.currentIndex ?? null

    // First mount of this identity — let the FLIP open effect handle it.
    if (prevIdentity === null) return
    // Same identity (nav did not change anything) — no-op.
    if (prevIdentity === identity) return
    // Nav prop missing — can't infer direction.
    if (!nav || prevNavIndex === null) return

    const el = frameRef.current
    const backdrop = backdropRef.current
    if (!el || !backdrop) return

    // Detect rapid-fire transitions (drag-scrub). When changes arrive
    // faster than ~120ms apart we shorten the tween dramatically so each
    // card has time to read as a flip rather than getting buried under
    // the next snapshot. Slow nav (chevron / arrow / wheel) keeps the
    // dramatic 0.7s travel.
    const now = performance.now()
    const sinceLast = now - lastTransitionAtRef.current
    const isRapid = sinceLast < 120
    lastTransitionAtRef.current = now

    // Wipe any still-animating snapshot clones before we add the next
    // one. Otherwise their long 0.7s tweens linger and accumulate on the
    // edge of the screen during a fast drag.
    for (const oldSnap of activeSnapshotsRef.current) {
      gsap.killTweensOf(oldSnap)
      oldSnap.remove()
    }
    activeSnapshotsRef.current.clear()

    const delta = nav.currentIndex - prevNavIndex
    let dir: 1 | -1
    if (Math.abs(delta) > nav.total / 2) {
      // Wrap-around: large negative delta means we wrapped forward (e.g.
      // last → 0), so visually it's still "forward" (entering from right).
      dir = delta > 0 ? -1 : 1
    } else {
      dir = delta > 0 ? 1 : -1
    }

    // --- Clone the OLD frame so it can recede while React mounts the new one. ---
    // We snapshot what the user is currently seeing, kill its iframes /
    // videos so playback doesn't ghost, then animate it backward + sideways.
    // The clone lives directly on the backdrop in the same screen rect as
    // the real frame so the visual transition is seamless.
    const snapshot = el.cloneNode(true) as HTMLElement
    snapshot.removeAttribute('id')
    snapshot.style.position = 'absolute'
    const rect = el.getBoundingClientRect()
    const backdropRect = backdrop.getBoundingClientRect()
    snapshot.style.left = `${rect.left - backdropRect.left}px`
    snapshot.style.top = `${rect.top - backdropRect.top}px`
    snapshot.style.width = `${rect.width}px`
    snapshot.style.height = `${rect.height}px`
    snapshot.style.margin = '0'
    snapshot.style.pointerEvents = 'none'
    snapshot.style.zIndex = '1'
    snapshot.style.willChange = 'transform, opacity'
    // Stop any iframe / video so the clone doesn't double-play audio.
    snapshot.querySelectorAll('iframe').forEach((f) => { (f as HTMLIFrameElement).src = 'about:blank' })
    snapshot.querySelectorAll('video').forEach((v) => {
      try { (v as HTMLVideoElement).pause() } catch { /* noop */ }
    })
    backdrop.appendChild(snapshot)

    // --- 3D slide constants ---
    // Distance is sized to viewport so cards travel from one edge to the
    // other rather than nudging a few inches — reads as a real
    // page-flip rather than a polite shuffle. 60% of the viewport width
    // gives plenty of travel without making the entering card feel
    // launched from outer space.
    //
    // In rapid mode (drag-scrub) we keep the directional travel + 3D feel
    // — cards still enter from one side and exit toward the other — but
    // shorten the duration so each transition resolves quickly. The
    // snapshot-cleanup pass above guarantees only one in-flight pair at a
    // time, so the dramatic travel won't pile up at the edge.
    // power4.out is front-loaded (high velocity at t=0 → low at t=1), so
    // even 16-30 ms of tween time covers a strongly visible chunk of the
    // travel — the user sees cards genuinely shooting off-side.
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
    const ENTER_DIST = isRapid ? Math.round(vw * 0.45) : Math.round(vw * 0.6)
    const ENTER_DEPTH = isRapid ? -200 : -380
    const LEAVE_DIST = isRapid ? Math.round(vw * 0.45) : Math.round(vw * 0.6)
    const LEAVE_DEPTH = isRapid ? -150 : -280
    const ROTATE_Y = isRapid ? 10 : 14
    const DUR = isRapid ? 0.22 : 0.7

    activeSnapshotsRef.current.add(snapshot)
    // Departing animation on the cloned snapshot.
    gsap.fromTo(
      snapshot,
      { x: 0, z: 0, rotateY: 0, opacity: 1, transformOrigin: '50% 50%' },
      {
        x: -dir * LEAVE_DIST,
        z: LEAVE_DEPTH,
        rotateY: -dir * ROTATE_Y,
        opacity: 0,
        duration: DUR,
        ease: 'power4.out',
        onComplete: () => {
          activeSnapshotsRef.current.delete(snapshot)
          snapshot.remove()
        },
      },
    )

    // Entering animation on the real (newly mounted) frame.
    gsap.killTweensOf(el)
    gsap.fromTo(
      el,
      {
        x: dir * ENTER_DIST,
        z: ENTER_DEPTH,
        rotateY: dir * ROTATE_Y,
        opacity: 0,
        transformOrigin: '50% 50%',
      },
      {
        x: 0,
        z: 0,
        rotateY: 0,
        opacity: 1,
        duration: DUR,
        ease: 'power4.out',
      },
    )
  }, [identity, nav])

  // No programmatic auto-focus on open — the bare ✕ button rendered with
  // a default browser focus ring reads as an unwanted "selected" rectangle
  // around the corner. Esc still closes via the window keydown listener
  // above, and Tab from anywhere lands on the close button as the first
  // focusable element inside the lightbox, with the standard focus ring
  // shown only for that genuine keyboard nav (CSS :focus-visible).

  if (!view) return null

  const host = (() => {
    try { return new URL(view.url).hostname.replace(/^www\./, '') }
    catch { return '' }
  })()

  // Unified 2-column layout for every item type (tweet, video, image, site).
  // Tweets diverge only in what fills the .media (left) and .text (right)
  // cells — see TweetMedia and TweetText. This replaces the prior react-tweet
  // single-column branch, which couldn't play tweet videos inline.
  return (
    <>
      {/* R3F open scene — only rendered while sceneActive. The Canvas
          is a fixed-position viewport-level overlay that does its own
          tween in WebGL, then signals onComplete which fades in the
          actual lightbox content below. */}
      {sceneActive && SceneComp && originRect && targetRectState && view.thumbnail && (
        <SceneComp
          originRect={originRect}
          targetRect={targetRectState}
          thumbnail={view.thumbnail}
          onComplete={handleSceneComplete}
        />
      )}
      <div
        ref={backdropRef}
        className={`${styles.backdrop} ${styles.open}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lightbox-title"
        onClick={(e) => { if (e.target === backdropRef.current) requestClose() }}
        data-testid="lightbox"
      >
      {nav && nav.total > 1 && (
        <>
          <LightboxNavChevron dir="prev" onClick={() => nav.onNav(-1)} />
          <LightboxNavChevron dir="next" onClick={() => nav.onNav(1)} />
          <LightboxNavMeter
            current={nav.currentIndex}
            total={nav.total}
            cardKey={identity ?? ''}
            onJump={nav.onJump}
          />
        </>
      )}
      <div ref={frameRef} className={styles.frame}>
        {/* Close button is now a child of .frame, anchored to its top-right
            corner (offset slightly above and outside via CSS). This makes
            the ✕ visually "attached" to the lightbox unit — the user reads
            it as "this ✕ closes this modal", which is the Linear / Stripe /
            Pinterest pattern. Frame's max-width + max-height are bounded
            (min(94vw, 1240px) horizontally, envelope variable vertically),
            so the ✕ never escapes the canvas regardless of viewport size
            or post content. The earlier "sibling of .frame in backdrop"
            placement (session 9) was reverted because it left the ✕
            floating in an empty corner on wide screens, with no visual
            relationship to the lightbox content (user 2026-05-11). */}
        <button
          ref={closeBtnRef}
          type="button"
          onClick={requestClose}
          className={styles.close}
          aria-label={t('board.lightbox.close')}
        >
          <span className={styles.closeIcon} aria-hidden="true">✕</span>
        </button>
        <div ref={mediaRef} className={styles.media}>
          {tweetId
            ? <TweetMedia
                item={view}
                meta={tweetMeta}
                slots={tweetSlots}
                slotIdx={tweetSlotIdx}
              />
            : <LightboxMedia item={view} />}
          {/* I-07-#4 follow-up: multi-image dots live INSIDE .media as
              an absolutely-positioned child, centered horizontally on
              the media column (= the image itself), placed in the
              chrome-clearance zone just below the media envelope.
              `.media` keeps overflow:visible so the dots aren't clipped
              by it — descendant img/iframe/video each carry their own
              border-radius so removing .media's overflow clip is
              visually identical (per the .media comment block). */}
          {tweetId && tweetSlots.length > 1 && (
            <LightboxImageDots
              slots={tweetSlots}
              currentIdx={tweetSlotIdx}
              onJump={setTweetSlotIdx}
            />
          )}
        </div>
        <div ref={textRef} className={styles.text}>
          {tweetId
            ? <TweetText item={view} meta={tweetMeta} />
            : <DefaultText item={view} host={host} />}
          <a
            href={view.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.sourceLink}
          >
            {t('board.lightbox.openSource')} →
          </a>
        </div>
      </div>
    </div>
    </>
  )
}

/** Extract a byline + caption + date/likes/comments meta from the
 *  Instagram OGP payload that bookmarklets typically capture. The raw
 *  title looks like:
 *    "sumy - Instagram: \"<caption>\""
 *  and the raw description looks like:
 *    "April 29, 2026、410 likes, 0 comments - iamsumy: \"<caption>\""
 *  Both end up duplicated in the panel verbatim, including the giant
 *  caption block in quotes — visually it reads as a wall of repeated
 *  text. This parser strips the boilerplate ("Instagram:", the date /
 *  stats line, the surrounding quotes) so the caption renders once,
 *  with date + stats demoted to a small meta footer. Falls back to
 *  the raw strings on parse failure so we never show NOTHING. */
function cleanInstagramText(item: LightboxItem): {
  byline: string | null
  caption: string
  meta: string | null
} {
  const rawTitle = item.title ?? ''
  const rawDesc = item.description ?? ''

  // Regexes use [\s\S] in place of `.` so they match across newlines
  // without needing the `s` (dotAll) flag, which requires ES2018+ — the
  // tsconfig here doesn't quite reach that bar.
  let byline: string | null = null
  let titleCaption: string | null = null
  const titleM = rawTitle.match(
    /^([\s\S]+?)\s+[-–—]\s+Instagram\s*:\s*["“”']([\s\S]*)["“”']\s*$/i,
  )
  if (titleM) {
    byline = titleM[1].trim()
    titleCaption = titleM[2].trim()
  }

  let descCaption: string | null = null
  let meta: string | null = null
  const descM = rawDesc.match(
    /^([\s\S]+?)[、,]\s*([\d,]+\s+likes?(?:[\s\S]*?comments?)?)\s+-\s+(\S+?)\s*:\s*["“”']([\s\S]*)["“”']\s*$/i,
  )
  if (descM) {
    const date = descM[1].trim()
    const stats = descM[2].trim()
    const handle = descM[3].trim()
    descCaption = descM[4].trim()
    meta = `${date} · ${stats}`
    if (!byline) byline = handle
  }

  // Pick the longer of the two caption candidates — the OGP description
  // usually truncates earlier than the title since description has a
  // smaller crawler budget.
  const caption =
    (titleCaption?.length ?? 0) >= (descCaption?.length ?? 0)
      ? titleCaption ?? descCaption ?? rawTitle
      : descCaption ?? titleCaption ?? rawTitle

  return { byline, caption, meta }
}

function DefaultText({
  item,
  host,
}: {
  readonly item: LightboxItem
  readonly host: string
}): ReactElement {
  const isInstagram = detectUrlType(item.url) === 'instagram'

  if (isInstagram) {
    const { byline, caption, meta } = cleanInstagramText(item)
    return (
      <>
        <h1 id="lightbox-title" className={styles.bylineHeading}>
          {byline ? `${byline} on Instagram` : 'Instagram'}
        </h1>
        <p className={styles.captionBody}>{caption}</p>
        {meta && <div className={styles.meta}><span>{meta}</span></div>}
      </>
    )
  }

  return (
    <>
      <h1 id="lightbox-title" className={styles.title}>{item.title}</h1>
      {item.description && <p className={styles.description}>{item.description}</p>}
      <div className={styles.meta}>{host && <span>{host}</span>}</div>
    </>
  )
}

/** Left-column media for a tweet, driven by the unified mediaSlots[] array.
 *  Each slot renders either an inline `<TweetVideoPlayer>` (type='video') or a
 *  plain `<img>` (type='photo'). When the user swaps slot index, the parent
 *  Lightbox's effect (see "auto-pause on slot change") forces any playing
 *  video to pause before unmount.
 *
 *  Falls back to legacy code paths for non-slot inputs:
 *    - meta.videoUrl exists but slots is empty → single-video tweet (rare:
 *      mediaSlots resolution failed but meta still has a videoUrl)
 *    - photos only via meta.photoUrl → single-image tweet
 *    - meta.text → text-only tweet
 *
 *  Note: dots are rendered at the .frame level (sibling of .media), NOT
 *  inside this component — see I-07-#4 fix.
 */
function TweetMedia({
  item,
  meta,
  slots,
  slotIdx,
}: {
  readonly item: LightboxItem
  readonly meta: TweetMeta | null
  readonly slots: readonly MediaSlot[]
  readonly slotIdx: number
}): ReactNode {
  // Slot-driven path (v13): a non-empty slots array fully determines media.
  if (slots.length > 0) {
    const slot = slots[Math.min(slotIdx, slots.length - 1)]
    if (slot.type === 'video' && slot.videoUrl) {
      // Construct a synthetic meta that points TweetVideoPlayer at this slot's
      // mp4 + poster + aspect, irrespective of which slot meta.videoUrl points
      // to. (For pure-video tweets these match anyway.)
      const slotMeta: TweetMeta = {
        ...(meta ?? {
          id: '',
          text: '',
          hasPhoto: false,
          hasVideo: true,
          hasPoll: false,
          hasQuotedTweet: false,
          authorName: '',
          authorHandle: '',
        }),
        videoUrl: slot.videoUrl,
        videoPosterUrl: slot.url,
        videoAspectRatio: slot.aspect,
      }
      return <TweetVideoPlayer key={`slot-${slotIdx}`} item={item} meta={slotMeta} />
    }
    if (slot.type === 'photo') {
      return <img src={slot.url} alt={item.title} />
    }
  }

  // Legacy fallbacks — slots was empty (e.g. text-only tweet, or meta failed
  // to resolve and the bookmark also has no photos[]).
  if (meta?.videoUrl) {
    return <TweetVideoPlayer item={item} meta={meta} />
  }
  if (meta?.photoUrl ?? item.thumbnail) {
    return <img src={meta?.photoUrl ?? item.thumbnail!} alt={item.title} />
  }
  if (meta?.text) {
    return <p className={styles.tweetTextOnly}>{meta.text}</p>
  }
  return <div className={styles.placeholder}>{item.title}</div>
}

/** Dot indicator for Lightbox carousel. Larger and more clickable than the
 *  board-side card dots — these are the primary nav mechanism (along with
 *  keyboard ↑↓). Video slots render as a ▶ triangle to communicate
 *  "this slot contains a video" without us needing a separate badge.
 *  I-07 Phase 1 + mix-tweet (v13). */
function LightboxImageDots({
  slots,
  currentIdx,
  onJump,
}: {
  readonly slots: readonly MediaSlot[]
  readonly currentIdx: number
  readonly onJump: (idx: number) => void
}): ReactNode {
  return (
    <div className={styles.lightboxImageDots} role="tablist" aria-label="メディア切替">
      {slots.map((slot, i) => (
        <button
          key={i}
          type="button"
          role="tab"
          aria-selected={i === currentIdx}
          aria-label={slot.type === 'video'
            ? `動画 ${i + 1} / ${slots.length}`
            : `画像 ${i + 1} / ${slots.length}`}
          data-active={i === currentIdx ? 'true' : 'false'}
          data-slot-type={slot.type}
          className={styles.lightboxImageDot}
          onClick={(): void => onJump(i)}
        >
          {slot.type === 'video' && (
            <span className={styles.lightboxImageDotVideoIcon} aria-hidden="true" />
          )}
        </button>
      ))}
    </div>
  )
}

/** Inline mp4 player for tweet videos. Frames the clip at its actual
 *  aspect ratio (no 16:9 / 9:16 letterboxing) and shows a liquid-glass
 *  center play button whenever the video is paused — initial state and
 *  every subsequent pause. Once the user is playing, the overlay fades
 *  out and the native bottom controls handle pause/seek/volume. The
 *  overlay leaves the bottom 56px clear so the seek bar is reachable
 *  even from the paused state. If playback fails — CDN takedown,
 *  geo-block, proxy outage — falls back to a poster + "Watch on X"
 *  link so the user is never stuck on a dead element. */
function TweetVideoPlayer({
  item,
  meta,
}: {
  readonly item: LightboxItem
  readonly meta: TweetMeta
}): ReactNode {
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  // `hasInteracted` is the actual fix for the "native spinner under play
  // button" problem. While false, the <video> below renders WITHOUT the
  // `controls` attribute, so Chromium draws no native chrome at all —
  // including its loading panel. No spinner can possibly stack under our
  // LiquidGlass play overlay because there's nothing native to stack.
  // Once the user clicks play, we flip this to true so the native bottom
  // bar (seek/volume/fullscreen) is available for the rest of the
  // session, even after the user pauses. Modern Chromium's loading
  // panel lives in a closed shadow DOM that CSS pseudo-elements cannot
  // reach, so this controls-toggle is the only reliable way to suppress
  // it. v34→v41 of the prior approaches all failed at this same point.
  const [hasInteracted, setHasInteracted] = useState<boolean>(false)
  const [videoFailed, setVideoFailed] = useState<boolean>(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  if (videoFailed) {
    return (
      <a
        className={styles.tweetWatchOnX}
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        <img src={meta.videoPosterUrl ?? item.thumbnail ?? undefined} alt={item.title} />
        <span className={styles.tweetWatchOnXBadge}>Watch on X →</span>
      </a>
    )
  }

  // Use the syndication-reported aspect verbatim so the wrapper matches the
  // video's natural proportions — eliminates the letterbox bars caused by
  // forcing every clip into a 16:9 or 9:16 bucket. Caps come from viewport.
  const aspect = meta.videoAspectRatio ?? 16 / 9
  const isVertical = aspect < 1
  // Explicit width matching maxWidth is REQUIRED for the FLIP open animation
  // to capture a non-zero .media rect at useLayoutEffect time. Without an
  // explicit width, the wrapper falls back to <video>'s intrinsic 300×150,
  // but in a flex container with min-width:0 ancestors the wrapper can
  // collapse to 0×0 before <video> metadata loads — making startScale =
  // originRect.width / 0 = Infinity and breaking the FLIP morph.
  // (Session 17 bug: previously the OLD render path showed <img src=poster>
  // first and swapped to <TweetVideoPlayer> after meta arrived, so .media
  // always had a real img-intrinsic rect at open time. The mediaSlots
  // refactor renders TweetVideoPlayer immediately when slot[0] is video,
  // exposing this latent layout dependency.)
  const wrapperWidth = isVertical ? '50vw' : 'min(920px, 60vw)'
  const wrapperStyle: CSSProperties = {
    position: 'relative',
    aspectRatio: aspect,
    // Shared envelope variable from Lightbox.module.css — keeps tweet
    // videos inside the same close-button + nav-meter clearances as the
    // CSS-driven iframeWrap and .media cases.
    maxHeight: 'var(--lightbox-media-max-h)',
    width: wrapperWidth,
    maxWidth: wrapperWidth,
    background: 'black',
    borderRadius: 'var(--lightbox-media-radius)',
    overflow: 'hidden',
  }
  const proxiedSrc = `/api/tweet-video?url=${encodeURIComponent(meta.videoUrl ?? '')}`
  const handleOverlayClick = (): void => {
    setHasInteracted(true)
    void videoRef.current?.play()
  }

  return (
    <div style={wrapperStyle}>
      <video
        ref={videoRef}
        className={styles.tweetVideo}
        src={proxiedSrc}
        poster={meta.videoPosterUrl ?? item.thumbnail ?? undefined}
        // controls is gated on first interaction (see hasInteracted comment
        // above). Before first click: no native chrome at all → no native
        // loading spinner can appear under our LiquidGlass disc. After
        // first click: native bottom bar (seek/volume/fullscreen) is
        // available for the rest of the session.
        controls={hasInteracted}
        playsInline
        // Preload metadata only — the user must explicitly click play, so
        // there's no benefit to pre-fetching the entire stream up front.
        // Keeps bandwidth lean and avoids the CDN warming up a stream the
        // user might never watch (e.g. they open the lightbox just to read
        // the tweet text on the right).
        preload="metadata"
        onPlay={(): void => setIsPlaying(true)}
        onPause={(): void => setIsPlaying(false)}
        onEnded={(): void => setIsPlaying(false)}
        onError={(): void => setVideoFailed(true)}
      />
      {/* Single play button while paused — no separate loading state. The
          button is always clickable; if the network is slow, the click
          fires play() and the browser begins fetching at that moment. The
          native bottom controls bar (which appears after the first click)
          shows progress for any subsequent buffering, so the user always
          knows what's happening once they've engaged with the player. */}
      {!isPlaying && (
        <button
          type="button"
          className={styles.playOverlay}
          onClick={handleOverlayClick}
          aria-label="Play video"
        >
          <span className={styles.playDisc} aria-hidden="true">
            <svg viewBox="0 0 24 24" className={styles.playOverlayIcon} aria-hidden="true">
              {/* Path is bbox-centered in viewBox; CSS adds 1.5px optical
                  shift right (centroid lies left of bbox center for a
                  right-pointing triangle). */}
              <path d="M6.5 5v14l11-7z" />
            </svg>
          </span>
        </button>
      )}
    </div>
  )
}

/** Right-column text panel for a tweet: avatar + author name + handle, then
 *  the full tweet body. Renders item-level fallbacks (title) until syndication
 *  metadata arrives, so the panel never flashes empty. */
function TweetText({
  item,
  meta,
}: {
  readonly item: LightboxItem
  readonly meta: TweetMeta | null
}): ReactNode {
  const authorName = meta?.authorName ?? ''
  const authorHandle = meta?.authorHandle ?? ''
  const text = meta?.text ?? item.title
  return (
    <>
      {(authorName || authorHandle || meta?.authorAvatar) && (
        <div className={styles.tweetAuthor}>
          {meta?.authorAvatar && (
            <img
              src={meta.authorAvatar}
              alt={authorName || authorHandle}
              className={styles.tweetAvatar}
            />
          )}
          <div className={styles.tweetAuthorMeta}>
            {authorName && <div className={styles.tweetAuthorName}>{authorName}</div>}
            {authorHandle && <div className={styles.tweetAuthorHandle}>@{authorHandle}</div>}
          </div>
        </div>
      )}
      <p className={styles.tweetBody}>{text}</p>
    </>
  )
}

function LightboxMedia({ item }: { readonly item: LightboxItem }): ReactNode {
  const urlType = detectUrlType(item.url)

  // Embed components were typed against BoardItem's `string | undefined`
  // thumbnail. LightboxItem normalizes to `string | null`, so we coerce
  // here at the call sites rather than weakening the embeds' prop types.
  const thumb = item.thumbnail ?? undefined

  if (urlType === 'youtube') {
    const videoId = extractYoutubeId(item.url)
    if (videoId) {
      return (
        <YouTubeEmbed
          videoId={videoId}
          title={item.title}
          vertical={isYoutubeShorts(item.url)}
          thumbnail={thumb}
        />
      )
    }
  }

  if (urlType === 'tiktok') {
    const videoId = extractTikTokVideoId(item.url)
    if (videoId) return <TikTokEmbed videoId={videoId} url={item.url} thumbnail={thumb} title={item.title} />
  }

  if (urlType === 'instagram') {
    const shortcode = extractInstagramShortcode(item.url)
    if (shortcode) return <InstagramEmbed shortcode={shortcode} thumbnail={thumb} title={item.title} />
  }

  // image / website / fallbacks
  if (item.thumbnail) {
    return <img src={item.thumbnail} alt={item.title} />
  }
  return <div className={styles.placeholder}>{item.title}</div>
}

/** Shared poster + LiquidGlass play button overlay used by every embed
 *  type (YouTube / TikTok / Instagram) until the user clicks play. The
 *  poster image guarantees visual continuity from the source card during
 *  the FLIP open animation — instead of a black iframe loading frame,
 *  the lightbox grows showing the same artwork the user clicked on. */
function EmbedPoster({
  thumbnail,
  alt,
  onClick,
}: {
  readonly thumbnail: string
  readonly alt: string
  readonly onClick: () => void
}): ReactNode {
  return (
    <>
      <img src={thumbnail} alt={alt} className={styles.embedPoster} />
      <button
        type="button"
        className={styles.playOverlay}
        onClick={onClick}
        aria-label="Play"
      >
        <span className={styles.playDisc} aria-hidden="true">
          <svg viewBox="0 0 24 24" className={styles.playOverlayIcon} aria-hidden="true">
            <path d="M6.5 5v14l11-7z" />
          </svg>
        </span>
      </button>
    </>
  )
}

function YouTubeEmbed({
  videoId,
  title,
  vertical,
  thumbnail,
}: {
  readonly videoId: string
  readonly title: string
  readonly vertical: boolean
  readonly thumbnail: string | undefined
}): ReactNode {
  const [hasInteracted, setHasInteracted] = useState<boolean>(false)
  // YouTube CDN poster — used only as fallback when the bookmarklet
  // didn't capture an og:image. maxresdefault works for ~95% of videos;
  // hqdefault is the universal fallback if max isn't available, but we
  // only reach this code path when item.thumbnail is missing entirely.
  const poster = thumbnail || `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`
  return (
    <div className={vertical ? styles.iframeWrap9x16 : styles.iframeWrap16x9}>
      {hasInteracted ? (
        <iframe
          // autoplay=1 starts playback immediately on the first iframe
          // mount, which is allowed because the click on our overlay
          // satisfies Chromium's user-gesture requirement for autoplay.
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
          title={title}
          className={styles.iframe}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      ) : (
        <EmbedPoster
          thumbnail={poster}
          alt={title}
          onClick={(): void => setHasInteracted(true)}
        />
      )}
    </div>
  )
}

/** TikTok video — 3-tier fallback playback strategy.
 *
 *  Tier 1 (best UX, when it works): server-side scrape of
 *  `tiktok.com/@user/video/<id>` HTML for the
 *  `__UNIVERSAL_DATA_FOR_REHYDRATION__` JSON, which contains a signed
 *  `playAddr` mp4 URL. We feed that URL through our `/api/tiktok-video`
 *  proxy (TikTok CDN gates on Referer) and render a clean `<video>` with
 *  native controls — visually matching how Twitter/X videos play.
 *
 *  Tier 2 (graceful fallback): TikTok's official embed iframe
 *  `tiktok.com/embed/v2/<id>`. Plays the video reliably but ships with
 *  cluttered chrome (related-videos sidebar, "今すぐ見る" CTA, scrollbar)
 *  which we can't hide because the iframe is cross-origin. Used when the
 *  scrape returns no playAddr — typically because TikTok's WAF challenged
 *  our server-side fetch or the rehydration JSON shape changed.
 *
 *  Tier 3 (extremely rare): the right-hand text panel always shows a
 *  `sourceLink` to TikTok, so even if Tier 2's iframe fails to load the
 *  user has a manual escape hatch. Not auto-rendered as a separate
 *  state because the iframe is reliable enough to make Tier 3
 *  unnecessary in practice.
 *
 *  Timing: the scrape kicks off in a useEffect on mount, in parallel with
 *  the FLIP open animation, so by the time the user clicks play the
 *  result is usually already in. If it isn't, we give it 1.5s after the
 *  click then commit to Tier 2 — never leave the user staring at a
 *  paused poster. */
function TikTokEmbed({
  videoId,
  url,
  thumbnail,
  title,
}: {
  readonly videoId: string
  readonly url: string
  readonly thumbnail: string | undefined
  readonly title: string
}): ReactNode {
  const [hasInteracted, setHasInteracted] = useState<boolean>(false)
  // undefined = scrape in flight, null = scrape failed, value = success
  const [playback, setPlayback] = useState<TikTokPlayback | null | undefined>(undefined)
  // Once decided, this state is sticky — we don't switch tiers mid-stream
  // even if a slow scrape result lands after we already committed to Tier 2.
  const [tier, setTier] = useState<'poster' | 'video' | 'iframe'>('poster')

  // Kick off the scrape on mount, in parallel with the FLIP open animation.
  // Most of the time (~2-5s typical) it lands before the user clicks play.
  useEffect(() => {
    let cancelled = false
    fetchTikTokPlayback(url).then((p) => {
      if (cancelled) return
      setPlayback(p)
    })
    return (): void => { cancelled = true }
  }, [url])

  // Once the user clicks play, decide which tier to render. If the scrape
  // is already done, decide immediately. Otherwise wait up to 1.5s for it
  // to land before falling back to the iframe.
  useEffect(() => {
    if (!hasInteracted || tier !== 'poster') return
    if (playback !== undefined) {
      setTier(playback ? 'video' : 'iframe')
      return
    }
    const timer = setTimeout(() => setTier('iframe'), 1500)
    return (): void => clearTimeout(timer)
  }, [hasInteracted, playback, tier])

  // No thumbnail captured by the bookmarklet → can't show our poster +
  // LiquidGlass overlay (would just hover over a black square). Skip the
  // poster step and mount the iframe straight away.
  if (!thumbnail) {
    return (
      <div className={styles.iframeWrap9x16}>
        <iframe
          src={`https://www.tiktok.com/embed/v2/${videoId}`}
          title="TikTok video"
          className={styles.iframe}
          allow="encrypted-media"
          allowFullScreen
        />
      </div>
    )
  }

  if (tier === 'poster') {
    return (
      <div className={styles.iframeWrap9x16}>
        <EmbedPoster
          thumbnail={thumbnail}
          alt={title}
          onClick={(): void => setHasInteracted(true)}
        />
      </div>
    )
  }

  if (tier === 'video' && playback) {
    // Build the proxy URL with the captured TikTok session cookies. The
    // CDN binds the signed playAddr to the session that issued it, so
    // without `c` (the cookie string from the scrape) the upstream
    // returns 403 even with the right Referer.
    const proxyUrl = playback.cookieString
      ? `/api/tiktok-video?url=${encodeURIComponent(playback.playAddr)}&c=${encodeURIComponent(playback.cookieString)}`
      : `/api/tiktok-video?url=${encodeURIComponent(playback.playAddr)}`
    return (
      <div className={styles.iframeWrap9x16}>
        <video
          className={styles.inlineVideo}
          src={proxyUrl}
          poster={playback.cover || thumbnail}
          controls
          autoPlay
          playsInline
        />
      </div>
    )
  }

  // tier === 'iframe' (or 'video' but playback unexpectedly null)
  return (
    <div className={styles.iframeWrap9x16}>
      <iframe
        src={`https://www.tiktok.com/embed/v2/${videoId}`}
        title="TikTok video"
        className={styles.iframe}
        allow="encrypted-media"
        allowFullScreen
      />
    </div>
  )
}

/** Instagram post — replaces the original `/embed` iframe with a poster +
 *  external link. Background: Instagram's embed iframe is non-interactive
 *  for video playback (Meta routes any "play" tap straight to instagram.com),
 *  so the prior two-tap "click our overlay → reveals iframe → click again →
 *  goes to Instagram" path was just a confusing detour to the same
 *  destination. There is no public API to fetch the actual mp4 (Twitter has
 *  syndication; Instagram only exposes login-required private endpoints
 *  whose use violates Meta's ToS). The honest UX is therefore: show the
 *  poster image we already have, and a single clear "Instagramで開く ↗"
 *  overlay that opens the post in a new tab. No wasted iframe load. */
function InstagramEmbed({
  shortcode,
  thumbnail,
  title,
}: {
  readonly shortcode: string
  readonly thumbnail: string | undefined
  readonly title: string
}): ReactNode {
  const postUrl = `https://www.instagram.com/p/${shortcode}/`
  return (
    <div className={styles.iframeWrap9x16}>
      {thumbnail && <img src={thumbnail} alt={title} className={styles.embedPoster} />}
      <a
        className={styles.embedOpenLink}
        href={postUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Instagram で開く"
      >
        <span className={styles.embedOpenBadge}>
          {/* external-link icon — the upper-right arrow makes it obvious
              this leaves the app, distinguishing it from a regular play
              button which would imply inline playback. */}
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14 3h7v7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M21 3l-9 9" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Instagramで開く
        </span>
      </a>
    </div>
  )
}
