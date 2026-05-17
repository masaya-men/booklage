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
import { TextCard, MinimalCard, pickCard } from './cards'
import { TEXT_CARD_MIN_ASPECT } from '@/lib/embed/text-card-measure'
import { cleanTitle } from '@/lib/embed/clean-title'
import { getFaviconUrl, hostnameFromUrl } from '@/lib/embed/favicon'
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
// border-radius pre-rolls inside the text-fade window, fully completing
// BEFORE position/scale motion begins at CLOSE_FRAME_DELAY. Mirrors the
// OPEN strategy where the first paint matches the source card's corner.
// Once motion starts, scale compensation in the position-tween onUpdate
// holds the *visible* radius pinned to cardRadiusValue — no animated
// corner morph during the visible shrink. Removes the perception of
// "角丸が間に合っていない" entirely (it never changes during motion).
const CLOSE_RADIUS_DUR = 0.08
const CLOSE_RADIUS_EASE = 'power2.out'
const CLOSE_REVEAL_LEAD = 0.10  // reveal source card this many seconds BEFORE landing (safety margin)
const CLOSE_FADE_DUR = 0.10     // .media opacity fade at the very end, paired with reveal lead
const CLOSE_TEXT_FADE_DUR = 0.14
const CLOSE_BACKDROP_FADE_DUR = 0.42
const CLOSE_BACKDROP_DELAY = 0.15
const CLOSE_FALLBACK_DUR = 0.3

// =====================================================================
// I-07-#5: Lightbox text mask-reveal-up.
// CSS デザイントークン (--lightbox-text-reveal-*) を root から読み、
// GSAP timeline 用の数値 / string に変換。 デフォルト値は spec 同期。
// =====================================================================
type RevealTokens = {
  readonly duration: number      // seconds
  readonly stagger: number       // seconds
  readonly pause: number         // seconds
  readonly translateY: number    // px
  readonly easing: string        // gsap easing name
}

function readRevealTokens(): RevealTokens {
  if (typeof window === 'undefined') {
    return { duration: 0.5, stagger: 0.15, pause: 0.15, translateY: 18, easing: 'power3.out' }
  }
  const root = getComputedStyle(document.documentElement)
  const parse = (name: string, fallback: number): number => {
    const raw = root.getPropertyValue(name).trim()
    if (!raw) return fallback
    const n = parseFloat(raw)
    return Number.isFinite(n) ? n : fallback
  }
  const easing = root.getPropertyValue('--lightbox-text-reveal-easing').trim() || 'power3.out'
  return {
    duration: parse('--lightbox-text-reveal-duration', 0.5),
    stagger: parse('--lightbox-text-reveal-stagger', 0.15),
    pause: parse('--lightbox-text-reveal-pause', 0.15),
    translateY: parse('--lightbox-text-reveal-translate-y', 18),
    easing,
  }
}

// I-07-#5 revised: テキストパネル全体を 1 ブロックで reveal するため、
// textEl 自身を単一の tween target として返す。 段階 stagger は撤去
// (体感が gata-gata した user feedback により方針転換 2026-05-12)。
function collectStageEls(textEl: HTMLElement): HTMLElement[] {
  return [textEl]
}

// Helper: text panel を初期状態 (不可視) にセット。 destefanis 準拠で
// translateY + opacity のみ、 clip-path mask は撤去。 reduce-motion 時は
// translate も省略、 opacity のみ 0 にする。
function setStageInitialState(els: HTMLElement[], translateY: number, prefersReduce: boolean): void {
  if (els.length === 0) return
  if (prefersReduce) {
    gsap.set(els, { opacity: 0 })
  } else {
    gsap.set(els, {
      opacity: 0,
      y: translateY,
    })
  }
}

// Helper: text panel を reveal する tween を timeline に追加する。
// destefanis 準拠で translateY + opacity のみ、 clip-path mask は撤去。
function appendRevealTimeline(
  tl: gsap.core.Timeline,
  els: HTMLElement[],
  tokens: RevealTokens,
  startAt: number,
  prefersReduce: boolean,
): void {
  if (els.length === 0) return
  const props = prefersReduce
    ? { opacity: 1, duration: tokens.duration, ease: tokens.easing, stagger: tokens.stagger }
    : {
        opacity: 1,
        y: 0,
        duration: tokens.duration,
        ease: tokens.easing,
        stagger: tokens.stagger,
      }
  tl.to(els, props, startAt)
}

function getPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// =====================================================================
// destefanis-style clone host (B-#17). We mount a single, persistent
// `<div id="lightbox-clone-host">` directly under <body> so that every
// Lightbox open/close can drop its clone there. Putting it on the body
// escapes any containing block created by ancestor `.frame` /
// `will-change` / `transform` further up the tree — which was the
// root-cause of the failed cf6b8d1 attempt in session 21.
// =====================================================================
/** Get-or-create the clone host inside the board's cards stage (the
 *  .canvasWrap region marked by data-lightbox-clone-host). Mounting
 *  inside the stage — rather than at body root — lets the canvas's
 *  overflow:hidden naturally clip any clone whose flight path crosses
 *  the dark frame's edge (including the rounded corners), so no manual
 *  clip-path mirroring is needed.
 *
 *  Returns null if the stage isn't mounted yet (defensive — Lightbox
 *  is only ever opened from inside a mounted BoardRoot, but callers
 *  must treat null as "fall back to the no-clone fade path"). */
function ensureCloneHost(): HTMLElement | null {
  const HOST_ID = 'lightbox-clone-host'
  const existing = document.getElementById(HOST_ID)
  if (existing) return existing

  const stage = document.querySelector<HTMLElement>('[data-lightbox-clone-host]')
  if (!stage) return null

  const host = document.createElement('div')
  host.id = HOST_ID
  // Full-size invisible shell inside the stage. zIndex 200 places the
  // clone between the Lightbox's dim backdrop (z 100) and the Lightbox
  // stage / frame chrome (z 300) — so the in-flight morph paints over
  // the dim (clone never darkens with the rest of the board) AND under
  // the eventual text panel + close button (no flicker at handoff).
  host.style.cssText =
    'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:200;'
  stage.appendChild(host)
  return host
}

/** Build a visual proxy of a board card at a given rect. Strips all
 *  inline style (transform, visibility:hidden the board applies to the
 *  source card while Lightbox is open, etc.), then positions the clone
 *  at the requested rect via position:absolute. The rect's top / left
 *  are expressed in the host's coordinate system (i.e. relative to
 *  .canvasWrap), NOT viewport coordinates — callers convert via
 *  toHostRelativeRect() before invoking. Only used for the open/close
 *  morph — interaction is disabled (pointer-events:none) and the clone
 *  is removed at animation end. */
type CloneRect = { top: number; left: number; width: number; height: number }
function toHostRelativeRect(viewportRect: DOMRect, host: HTMLElement): CloneRect {
  // host is position:absolute filling .canvasWrap, so host's own
  // bounding rect == canvasWrap's. Subtracting host.top / host.left
  // converts a viewport-space rect (from getBoundingClientRect on any
  // element) into the host's local coordinate system, which is what
  // position:absolute children consume.
  const o = host.getBoundingClientRect()
  return {
    top: viewportRect.top - o.top,
    left: viewportRect.left - o.left,
    width: viewportRect.width,
    height: viewportRect.height,
  }
}
function createLightboxClone(sourceCard: HTMLElement, rect: CloneRect): HTMLElement {
  const clone = sourceCard.cloneNode(true) as HTMLElement
  // Wipe ALL inline styles inherited from the source card. This drops:
  //   - transform (gsap.set applied during drag/FLIP)
  //   - visibility:hidden the CardsLayer applies to the source while
  //     Lightbox is open (we want the clone visible)
  //   - any width/height the parent flow had baked in
  clone.style.cssText = ''
  clone.style.position = 'absolute'
  // Snap start rect to integer pixels — getBoundingClientRect() returns
  // sub-pixel floats which GSAP then interpolates between, amplifying
  // browser-side rounding jitter into the morph (session 31 Bug B-b).
  // The clone is a temporary visual proxy so 1px alignment is invisible.
  clone.style.top = `${Math.round(rect.top)}px`
  clone.style.left = `${Math.round(rect.left)}px`
  clone.style.width = `${Math.round(rect.width)}px`
  clone.style.height = `${Math.round(rect.height)}px`
  clone.style.margin = '0'
  clone.style.visibility = 'visible'
  // 7bb0529 で --card-radius / --lightbox-media-radius は 20px に統一されたが、
  // この hardcode が取りこぼされて 24px のまま残っていた → board card (20)、
  // clone (24)、 .media (20) の三者でラジアスがずれ、 user 「角丸ぷくぷく」
  // 報告の主因 (session 32)。 CSS var 参照に切り替えて将来の調整にも追従させる。
  clone.style.borderRadius = 'var(--lightbox-media-radius)'
  clone.style.overflow = 'hidden'
  clone.style.pointerEvents = 'none'
  // GPU compositing hints — force the clone onto its own paint layer so
  // the per-frame width/height reflow doesn't drag the whole canvas
  // through a layout/paint pass. willChange covers Chromium; the
  // translateZ keeps Safari honest. backfaceVisibility avoids a paint
  // flash on browsers that promote the layer mid-tween.
  clone.style.willChange = 'top, left, width, height'
  clone.style.transform = 'translateZ(0)'
  clone.style.backfaceVisibility = 'hidden'
  clone.setAttribute('aria-hidden', 'true')
  // Drop ids / refs that might collide with the source if either side
  // queries them by selector.
  clone.removeAttribute('id')
  clone.removeAttribute('data-bookmark-id')
  // Strip hover-revealed chrome that would otherwise ride along with
  // the morph (delete ×, reset ↺, resize handles). These elements
  // carry their own data-visible attribute that survives cloneNode,
  // so they'd display at the same opacity the source card had at
  // click time — i.e. fully visible on a hovered card.
  const SELECTORS_TO_STRIP = [
    '[data-testid="card-delete-button"]',
    '[data-testid="card-reset-size-button"]',
    '[data-testid^="resize-handle-"]',
  ]
  for (const sel of SELECTORS_TO_STRIP) {
    clone.querySelectorAll(sel).forEach((n) => n.remove())
  }
  return clone
}

// session 35: 文字カード専用 hybrid。 外側 clone は本家 destefanis 同様 width/height
// tween のままにし、 文字カードのときだけ内側に scale-host を仕込んで「文字も
// 一緒に拡大」 を実現する。 画像/動画カードでは img が naturally に object-fit:cover
// で fit するため scale-host 不要 (= raster 画像を scale up すると bitmap blur)。
//
// 拡大方式は CSS `zoom`。 当初 `transform: scale` を試したが、 文字が raster scale
// で描画されて 「拡大率に比例して文字がボケる」 と user 報告 (session 35 後半)。
// `zoom` は **拡大後のサイズで browser が再レイアウト + font-size を真の zoom 倍で
// 再描画** = 文字は常にベクター品質で crisp。 非公式プロパティだが Chrome / Safari
// / Firefox (2024+) / Edge 全部対応済。 子要素 absolute 座標も zoom 倍されるので
// 内部 layout は変わらず (= 等比拡大)。
function wrapCloneWithScaleHost(
  clone: HTMLElement,
  sourceW: number,
  sourceH: number,
  initialScale: number,
): HTMLElement | null {
  // text card 検出。 CSS modules でクラス名がハッシュ化されても "textCard" 部分は残る。
  const isTextCard = clone.querySelector('[class*="textCard"]') !== null
  if (!isTextCard) return null
  if (sourceW <= 0 || sourceH <= 0) return null

  // 内側の --card-radius は 0 に上書き。 視覚 radius は外側 clone の overflow:hidden
  // + border-radius (= --lightbox-media-radius) で確定させる (= LargeBoardCardClone
  // と同じ戦略)。
  clone.style.setProperty('--card-radius', '0')

  const scaleHost = document.createElement('div')
  scaleHost.setAttribute('data-clone-scale-host', 'true')
  scaleHost.style.position = 'absolute'
  scaleHost.style.top = '0'
  scaleHost.style.left = '0'
  scaleHost.style.width = `${sourceW}px`
  scaleHost.style.height = `${sourceH}px`
  // zoom = scale ratio (browser side で再レイアウト + 文字 crisp 再描画)。
  scaleHost.style.zoom = `${initialScale}`
  scaleHost.style.pointerEvents = 'none'

  // clone の現在の子をすべて scale-host に移す。 firstChild で順次取り出し。
  while (clone.firstChild) {
    scaleHost.appendChild(clone.firstChild)
  }
  clone.appendChild(scaleHost)

  return scaleHost
}

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
      // === B-#17 destefanis clone-based close ===
      // Build a fresh clone of the source card at the current .media
      // rect, hide .media, animate the clone back to the source rect.
      // border-radius は --lightbox-media-radius (= 現在 20px) で固定。
      // clone / source card / .media の三者で同じ var を参照するため morph
      // 中に角丸の jump / 連続変動は出ない。
      const mediaRect = mediaEl.getBoundingClientRect()

      // Kill any in-flight open tween on the chrome / media so close
      // takes over from the current visual state cleanly.
      gsap.killTweensOf(mediaEl)
      if (textEl) {
        gsap.killTweensOf(textEl)
        const stageEls = collectStageEls(textEl)
        if (stageEls.length > 0) gsap.killTweensOf(stageEls)
      }
      if (closeEl) gsap.killTweensOf(closeEl)

      // Stand up the close clone at .media's current rect, then hide
      // .media so the clone takes over the visual immediately. Both
      // start and end rects are converted to host-relative coords
      // because the host lives inside .canvasWrap (position:absolute)
      // rather than at body root.
      let clone: HTMLElement | null = null
      let scaleHost: HTMLElement | null = null
      const host = liveSourceEl ? ensureCloneHost() : null
      const closeOriginHost = host ? toHostRelativeRect(closeOrigin, host) : null
      const mediaRectHost = host ? toHostRelativeRect(mediaRect, host) : null
      if (liveSourceEl && host && mediaRectHost && closeOriginHost) {
        clone = createLightboxClone(liveSourceEl, mediaRectHost)
        // session 35: close は media 大 → source 小 に縮む。 scale-host は source 寸法
        // 固定 + 初期 scale = media/source (= 大)、 tween 中 scale = currentW/sourceW
        // で 1.0 (= source size 実寸) に着地。
        const initialScale = closeOriginHost.width > 0
          ? mediaRectHost.width / closeOriginHost.width
          : 1
        scaleHost = wrapCloneWithScaleHost(
          clone,
          closeOriginHost.width,
          closeOriginHost.height,
          initialScale,
        )
        host.appendChild(clone)
      }
      mediaEl.style.opacity = '0'
      mediaEl.style.borderRadius = ''

      const tl = gsap.timeline({
        onComplete: () => {
          if (clone && clone.parentNode) clone.remove()
          onClose()
        },
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
      if (clone && closeOriginHost) {
        // session 32: modifier 案 (= 毎フレーム整数 px snap) は user 確認で
        // 「box が px 単位 discrete jump して角丸グニャグニャ感」 と判明し
        // revert。 mid-tween は float のまま smooth に伸ばし、 始終端だけ
        // 整数 snap する session 31 B-b の挙動に戻す。 user は震えの真因は
        // GSAP interpolation ではなく「別の原因」 と仮説、 別途調査要。
        const sourceW = closeOriginHost.width
        const capturedClone = clone
        const capturedScaleHost = scaleHost
        tl.to(clone, {
          top: Math.round(closeOriginHost.top),
          left: Math.round(closeOriginHost.left),
          width: Math.round(closeOriginHost.width),
          height: Math.round(closeOriginHost.height),
          duration: CLOSE_TWEEN_DUR,
          ease: CLOSE_TWEEN_EASE,
          onUpdate: () => {
            // session 35: 文字カードの hybrid scale-host を outer width に追従。
            // zoom = currentOuterW / sourceW → 大 (= media) から 1.0 (= source) へ縮む。
            // zoom で文字 crisp (= transform:scale だと raster blur)。
            if (!capturedScaleHost || sourceW <= 0) return
            const w = gsap.getProperty(capturedClone, 'width') as number
            if (typeof w === 'number' && w > 0) {
              capturedScaleHost.style.zoom = `${w / sourceW}`
            }
          },
        }, CLOSE_FRAME_DELAY)
      }
      if (backdrop) {
        tl.to(backdrop, {
          opacity: 0,
          duration: CLOSE_BACKDROP_FADE_DUR,
          ease: 'power2.in',
        }, CLOSE_BACKDROP_DELAY)
      }

      // Reveal source card a hair before the clone lands. Both are
      // visually identical (clone was made from source), so this lead
      // is just safety margin for React reflow on visibility flip.
      const landingAt = CLOSE_FRAME_DELAY + CLOSE_TWEEN_DUR
      const revealAt = Math.max(0, landingAt - CLOSE_REVEAL_LEAD)
      if (onSourceShouldShow) {
        tl.call(() => { onSourceShouldShow() }, undefined, revealAt)
      }
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
      if (closingRef.current) return
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
      // Skip while a close tween is in progress: the user has committed to
      // dismissing this lightbox, so any wheel they fire in the next ~500ms
      // is residual scroll intent for the board, not nav within the
      // lightbox. Without this guard the wheel handler would invoke
      // nav.onNav() and a flash of next/prev card animation slips in.
      if (closingRef.current) return
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
      // === B-#17 destefanis clone-based open ===
      // Strategy: lift a `cloneNode` proxy of the source card up to body
      // root, animate its width/height/top/left from source rect to the
      // .media's final rect. No transform:scale — width/height change
      // directly, so border-radius never gets GPU-resampled. While the
      // clone is in flight, .media is held opacity:0; the clone vanishes
      // and .media flips to opacity:1 at the same frame (handoff).
      const mediaRect = mediaEl.getBoundingClientRect()
      const sourceCard = sourceCardId
        ? document.querySelector<HTMLElement>(`[data-bookmark-id="${sourceCardId}"]`)
        : null
      // Prefer the source card's *live* rect over the captured originRect.
      // originRect was snapshotted at click time and won't track scroll/
      // pan that happened in the brief window before the lightbox mounted.
      const sourceRect = sourceCard ? sourceCard.getBoundingClientRect() : originRect

      const dx = (mediaRect.left + mediaRect.width / 2) - (sourceRect.left + sourceRect.width / 2)
      const dy = (mediaRect.top + mediaRect.height / 2) - (sourceRect.top + sourceRect.height / 2)
      const distance = Math.hypot(dx, dy)
      const dur = OPEN_BASE_DUR + Math.min(distance / OPEN_DIST_DIVISOR, OPEN_DIST_BONUS_MAX)

      const revealTokens = readRevealTokens()
      const prefersReduce = getPrefersReducedMotion()
      const stageEls = textEl ? collectStageEls(textEl) : []
      if (textEl) gsap.set(textEl, { opacity: 1 })
      setStageInitialState(stageEls, revealTokens.translateY, prefersReduce)
      if (closeEl) gsap.set(closeEl, { opacity: 0 })

      // Frame stays opaque; .media is invisible while the clone covers
      // its real estate. Handoff flips .media back to visible at
      // onComplete.
      gsap.set(el, { opacity: 1 })
      gsap.set(mediaEl, { opacity: 0, clearProps: 'transform' })
      mediaEl.style.borderRadius = ''

      // Convert start (source) and end (media) rects from viewport
      // coords into the host's local coords; the host lives inside
      // .canvasWrap (position:absolute), not at body root, so the
      // clone's top/left and the gsap tween's target values must be
      // expressed relative to the canvasWrap.
      let clone: HTMLElement | null = null
      const host = sourceCard ? ensureCloneHost() : null
      const sourceRectHost = host ? toHostRelativeRect(sourceRect, host) : null
      const mediaRectHost = host ? toHostRelativeRect(mediaRect, host) : null
      let scaleHost: HTMLElement | null = null
      if (sourceCard && host && sourceRectHost) {
        clone = createLightboxClone(sourceCard, sourceRectHost)
        // session 35: 文字カード hybrid。 内側に scale-host を仕込んで、 外側
        // width/height tween と同期で内容も拡大させる。 文字以外 (image/video) は
        // null が返り、 従来通りの挙動 (= img が自然 fit) を維持。
        scaleHost = wrapCloneWithScaleHost(clone, sourceRectHost.width, sourceRectHost.height, 1)
        host.appendChild(clone)
      }

      const tl = gsap.timeline()
      if (clone && mediaRectHost && sourceRectHost) {
        // session 32: modifier revert (= 角丸グニャグニャ報告)、 始終端 snap のみ。
        // close と対称。
        const startW = sourceRectHost.width
        const capturedClone = clone
        const capturedScaleHost = scaleHost
        tl.to(clone, {
          top: Math.round(mediaRectHost.top),
          left: Math.round(mediaRectHost.left),
          width: Math.round(mediaRectHost.width),
          height: Math.round(mediaRectHost.height),
          duration: dur,
          ease: OPEN_EASE,
          onUpdate: () => {
            // session 35: scale-host があるとき (= 文字カード) のみ、 外側 width に
            // 合わせて内側 zoom を更新。 image/video は scale-host=null = skip。
            // zoom で文字 crisp (= transform:scale だと raster blur)。
            if (!capturedScaleHost || startW <= 0) return
            const w = gsap.getProperty(capturedClone, 'width') as number
            if (typeof w === 'number' && w > 0) {
              capturedScaleHost.style.zoom = `${w / startW}`
            }
          },
          onComplete: () => {
            // Instant swap: paint .media at opacity 1 in the same
            // frame the clone is removed. For still images the two
            // are visually identical, so the swap is invisible. For
            // YouTube / video the iframe's letterbox mismatch is
            // briefly visible — addressed separately by a "play
            // button overlay" follow-up (IDEAS.md). A cross-fade
            // tween was tried here but it briefly puts both layers
            // at <100% opacity, letting the backdrop bleed through
            // (= "背景が見える" report). Instant swap avoids that.
            mediaEl.style.opacity = '1'
            const c = clone
            if (c && c.parentNode) c.remove()
          },
        }, 0)
      } else {
        // No source card found (off-screen / unmounted). Fall back to
        // a simple opacity fade on .media at the final rect.
        tl.to(mediaEl, {
          opacity: 1,
          duration: dur,
          ease: OPEN_EASE,
        }, 0)
      }

      const textStartAt = dur * 0.5 + revealTokens.pause
      appendRevealTimeline(tl, stageEls, revealTokens, textStartAt, prefersReduce)
      const chromeAt = dur * OPEN_TEXT_FADE_DELAY_RATIO
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
        // Kill in-flight tweens; if the lightbox is being torn down
        // mid-open, also clean up the clone so it doesn't outlive the
        // animation. .media's opacity is left as-is — the close path
        // (or remount) will set it explicitly.
        tl.kill()
        backdropTween?.kill()
        if (clone && clone.parentNode) clone.remove()
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

    // I-07-#5: 新カードの stage 要素を初期化 (不可視) し、 slide 完了後に
    // reveal timeline を発火させる。 連打 (rapid) で slide が短縮されても
    // pause + reveal は token 値そのまま — 連打中は slide が次々に
    // 立ち上がり、 ここまで来ない (前 useLayoutEffect 発火で kill される)
    // ので reveal は最後の slide 完了時にしか走らない。
    const newTextEl = textRef.current
    const revealTokens = readRevealTokens()
    const prefersReduce = getPrefersReducedMotion()
    const newStageEls = newTextEl ? collectStageEls(newTextEl) : []
    // 進行中 reveal を kill (前カード残骸対策)
    if (newStageEls.length > 0) gsap.killTweensOf(newStageEls)
    setStageInitialState(newStageEls, revealTokens.translateY, prefersReduce)

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
        onComplete: () => {
          // slide 着地後 + pause を待って reveal 発火。
          // gsap.delayedCall は内部でフレームに乗るので、 識別子変化や
          // 次 slide が来た場合は次の useLayoutEffect で kill される。
          const tl = gsap.timeline({ delay: revealTokens.pause })
          appendRevealTimeline(tl, newStageEls, revealTokens, 0, prefersReduce)
        },
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
      {/* Two-layer split (session 25): backdrop is now a pure dim
          layer (z 100) that only carries the semi-transparent black,
          opacity fade-in tween, and outside-click-to-close handler. */}
      <div
        ref={backdropRef}
        className={`${styles.backdrop} ${styles.open}`.trim()}
        onClick={(e) => { if (e.target === backdropRef.current) requestClose() }}
        data-testid="lightbox-backdrop"
        aria-hidden="true"
      />
      {/* Stage owns the perspective / centering / overflow clip and all
          interactive content (frame + nav + close). z 300 keeps it above
          the clone host (z 200) so text panel + close render in front
          of any in-flight morph clone. pointer-events:none lets clicks
          on the empty stage area fall through to the backdrop's close
          handler; .frame re-enables pointer events for its children. */}
      <div
        className={styles.stage}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lightbox-title"
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
      {/* Session 33: Layer 1 (= 全面 close zone)。 frame 自体のどこを
          click しても閉じる。 子の interactive 要素 (.media / source link 等)
          は stopPropagation で「閉じる」 を吸収する z-index レイヤー方式。
          closingRef が requestClose の double-fire を防ぐので、 close 押下
          → close button + frame 両方発火しても安全。 */}
      <div ref={frameRef} className={styles.frame} onClick={requestClose}>
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
        <div
          ref={mediaRef}
          className={styles.media}
          /* Session 33: 媒体 (動画 / 画像 / iframe) の click は .frame の
             close 発火を吸収する。 動画 controls / image zoom 等は内部要素が
             個別に hit を取るので機能維持。 */
          onClick={(e): void => e.stopPropagation()}
        >
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
            ? <TweetText item={view} meta={tweetMeta} hideBody={isTweetTextOnly(tweetMeta, tweetSlots)} />
            : <DefaultText item={view} host={host} />}
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
  hideTitle = false,
}: {
  readonly item: LightboxItem
  readonly host: string
  /** Suppress the `<h1>` title when the title is already shown inside the
   *  large TextCard on the media side (text-only card, session 31). */
  readonly hideTitle?: boolean
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
        <div className={styles.metaCtaGroup}>
          {meta && <div className={styles.meta}><span>{meta}</span></div>}
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.sourceLink}
            onClick={(e): void => e.stopPropagation()}
          >
            {t('board.lightbox.openSource')} →
          </a>
        </div>
      </>
    )
  }

  return (
    <>
      {!hideTitle && <h1 id="lightbox-title" className={styles.title}>{item.title}</h1>}
      {item.description && <p className={styles.description}>{item.description}</p>}
      <div className={styles.metaCtaGroup}>
        <div className={styles.meta}>{host && <span>{host}</span>}</div>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.sourceLink}
          onClick={(e): void => e.stopPropagation()}
        >
          {t('board.lightbox.openSource')} →
        </a>
      </div>
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

  // Text-only tweet を最優先で判定 (= session 32 Fix 2-b)。 X の syndication API
  // は profile pic / embedded card preview を photoUrl に入れて返すことがあるので、
  // photoUrl 真値の有無では判定せず、 hasPhoto / hasVideo フラグで text-only を確定する。
  if (isTweetTextOnly(meta, slots)) {
    const text = meta?.text ?? cleanTweetTitle(item.title)
    const aspect = item.aspectRatio ?? TEXT_CARD_MIN_ASPECT
    const fakeBoardItem: BoardItem = {
      bookmarkId: item.bookmarkId ?? item.url,
      cardId: item.cardId ?? item.url,
      title: text,
      description: item.description ?? undefined,
      thumbnail: undefined,
      url: item.url,
      aspectRatio: aspect,
      gridIndex: 0,
      orderIndex: 0,
      cardWidth: item.cardWidth ?? 280,
      customCardWidth: false,
      isRead: false,
      isDeleted: false,
      tags: [],
      displayMode: null,
    }
    return <LightboxTextDisplay title={text} url={item.url} aspect={aspect} />
  }

  // Legacy fallbacks — slots が空 + hasPhoto/hasVideo は true のケース。
  if (meta?.videoUrl) {
    return <TweetVideoPlayer item={item} meta={meta} />
  }
  if (meta?.photoUrl) {
    return <img src={meta.photoUrl} alt={item.title} />
  }
  // meta 失敗 + thumbnail だけ残ってる稀ケース。
  if (item.thumbnail) {
    return <img src={item.thumbnail} alt={item.title} />
  }
  return <div className={styles.placeholder}>{item.title}</div>
}

/** X の OGP `og:title` は "Xユーザーの 〜 さん:「本文」 / X" のような
 *  boilerplate 付き format。 syndication API が meta.text を返さなかった時の
 *  fallback で item.title を素のまま表示すると boilerplate が出てしまうので、
 *  「」 内の本文だけ抜き出す。 match しない (= 旧 format 等) はそのまま返す。 */
function cleanTweetTitle(rawTitle: string): string {
  const m = rawTitle.match(/「([\s\S]+)」/)
  if (m) return m[1].trim()
  return rawTitle
}

/** Tweet が 「文字だけ」 か。 photoUrl / videoUrl 単独では信頼できない —
 *  X の syndication API は profile pic / embedded card preview を photoUrl に
 *  入れて返すことがあり、 「写真ツイートではない」 のに URL だけ存在するケースが
 *  ある。 hasPhoto / hasVideo は X の正規 boolean フラグなのでこちらを真の指標と
 *  する。 slots (v13 media slots) が空 AND hasPhoto/hasVideo が false なら
 *  text-only と確定。 TweetMedia と TweetText の両方で同じ判定を共有する。 */
function isTweetTextOnly(meta: TweetMeta | null, slots: readonly MediaSlot[]): boolean {
  if (slots.length > 0) return false
  if (meta?.hasVideo) return false
  if (meta?.hasPhoto) return false
  return true
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
        />
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
  // One explicit dimension is REQUIRED for the FLIP open animation to
  // capture a non-zero .media rect at useLayoutEffect time. Without one,
  // the wrapper falls back to <video>'s intrinsic 300×150 and in a flex
  // container with min-width:0 ancestors can collapse to 0×0 before
  // metadata loads — making startScale = originRect.width / 0 = Infinity.
  // (Session 17 bug: the OLD render path showed <img src=poster> first
  // and swapped to <TweetVideoPlayer> after meta arrived, so .media had
  // a real img-intrinsic rect at open time. The mediaSlots refactor
  // renders TweetVideoPlayer immediately when slot[0] is video, exposing
  // this latent layout dependency.)
  //
  // To preserve aspect ratio for both horizontal AND vertical videos:
  // - Horizontal (aspect ≥ 1): set explicit WIDTH bounded by horizontal
  //   envelope and by maxHeight × aspect (so tall horizontals don't
  //   exceed the vertical envelope). Browser derives height via
  //   aspectRatio.
  // - Vertical (aspect < 1): set explicit HEIGHT bounded by maxHeight
  //   and by 50vw / aspect (so vertical videos don't get cut off on
  //   narrow viewports). Browser derives width via aspectRatio.
  // This keeps the wrapper at the video's natural aspect — no side
  // black bars on vertical videos (regression reported by user).
  const wrapperStyle: CSSProperties = isVertical
    ? {
        position: 'relative',
        aspectRatio: aspect,
        // Height-led: cap at the shared media envelope or what fits in 50vw width.
        height: `min(var(--lightbox-media-max-h), calc(50vw / ${aspect}))`,
        maxHeight: 'var(--lightbox-media-max-h)',
        maxWidth: '50vw',
        background: 'black',
        borderRadius: 'var(--lightbox-media-radius)',
        overflow: 'hidden',
      }
    : {
        position: 'relative',
        aspectRatio: aspect,
        // Width-led: cap at horizontal envelope or what fits in maxHeight × aspect.
        width: `min(920px, 60vw, calc(var(--lightbox-media-max-h) * ${aspect}))`,
        maxHeight: 'var(--lightbox-media-max-h)',
        maxWidth: 'min(920px, 60vw)',
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
  hideBody = false,
}: {
  readonly item: LightboxItem
  readonly meta: TweetMeta | null
  /** Suppress the tweet body paragraph when text-only tweets render their
   *  text inside the left-side large TextCard (session 32 Fix 2). */
  readonly hideBody?: boolean
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
      {!hideBody && <p className={styles.tweetBody}>{text}</p>}
      <div className={styles.metaCtaGroup}>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.sourceLink}
          onClick={(e): void => e.stopPropagation()}
        >
          {t('board.lightbox.openSource')} →
        </a>
      </div>
    </>
  )
}

function LightboxMedia({ item }: { readonly item: LightboxItem }): ReactNode {
  const urlType = detectUrlType(item.url)

  // Embed components were typed against BoardItem's `string | undefined`
  // thumbnail. LightboxItem normalizes to `string | null`, so we coerce
  // here at the call sites rather than weakening the embeds' prop types.
  const thumb = item.thumbnail ?? undefined
  // Board card's persisted aspect. Embeds render their pre-play poster at
  // this aspect so the lightbox grows the *same shape* the user clicked on,
  // hiding the clone→media swap (B-#17-#2). Undefined for share view.
  const aspectRatio = item.aspectRatio

  if (urlType === 'youtube') {
    const videoId = extractYoutubeId(item.url)
    if (videoId) {
      return (
        <YouTubeEmbed
          videoId={videoId}
          title={item.title}
          vertical={isYoutubeShorts(item.url)}
          thumbnail={thumb}
          aspectRatio={aspectRatio}
        />
      )
    }
  }

  if (urlType === 'tiktok') {
    const videoId = extractTikTokVideoId(item.url)
    if (videoId) return <TikTokEmbed videoId={videoId} url={item.url} thumbnail={thumb} title={item.title} aspectRatio={aspectRatio} />
  }

  if (urlType === 'instagram') {
    const shortcode = extractInstagramShortcode(item.url)
    if (shortcode) return <InstagramEmbed shortcode={shortcode} thumbnail={thumb} title={item.title} aspectRatio={aspectRatio} />
  }

  // 一般 webpage (= youtube / tiktok / instagram / tweet を除く)。
  // session 34: board と mirror 化。 thumbnail があれば Lightbox でも image
  // 表示 (= LightboxImageWithFallback)、 image load 失敗 / 256px 未満なら
  // TextCard に fallback。 thumbnail 自体無いなら最初から TextCard。
  // (session 32 の「全部 TextCard」 判断を覆して board ImageCard / TextCard と
  // 同じ routing に揃える。)
  const textAspect = aspectRatio ?? TEXT_CARD_MIN_ASPECT
  // session 35: cardWidth は toBoardShapeForFallback の `item.cardWidth ?? 280` を
  // 使う (= source board card の実 width)。 以前ここに `cardWidth: 280` 上書きが
  // あり、 source typography (source 実 width で選択) と .media typography (280 で
  // 選択) が tier 不一致になって swap で font ジャンプしていた。 上書き削除で
  // source の実 width を素通し → animation clone と .media が同じ typography で
  // 揃う = jump 消失。
  const fakeBoardItem: BoardItem = {
    ...toBoardShapeForFallback(item, textAspect),
    title: cleanTitle(item.title, item.url),
  }
  if (item.thumbnail) {
    return (
      <LightboxImageWithFallback
        item={item}
        aspectRatio={aspectRatio}
        fakeBoardItem={fakeBoardItem}
        textAspect={textAspect}
      />
    )
  }
  return <LargeTextCardScaler fakeItem={fakeBoardItem} aspect={textAspect} />
}

/** 右パネルで h1 を抑制すべきか — Lightbox で左に大 TextDisplay を描画する
 *  item では h1 と左カードの title が重複するので suppress。 session 32 user 決定:
 *  一般 webpage は OG image 有無に関わらず全部大 TextDisplay → 常に true。
 *  専用 embed (YouTube/TikTok/Instagram) と tweet は別経路なので false。 */
function shouldRenderLargeTextCard(item: LightboxItem): boolean {
  const urlType = detectUrlType(item.url)
  if (urlType === 'youtube' || urlType === 'tiktok' || urlType === 'instagram') return false
  if (urlType === 'tweet') return false
  return true
}

/** Lightbox 用に LightboxItem を BoardItem 互換形に詰め直す。 pickCard 判定と
 *  大 TextCard 描画の両方で同じ fake item を使う。 cardWidth は board 側で
 *  rendering されていたものをそのまま保ち、 Lightbox 側で transform:scale して
 *  拡大表示することで「写真のように board card を拡大」 (session 32) を実現。 */
function toBoardShapeForFallback(item: LightboxItem, aspectRatio: number): BoardItem {
  return {
    bookmarkId: item.bookmarkId ?? item.url,
    cardId: item.cardId ?? item.url,
    title: item.title,
    description: item.description ?? undefined,
    thumbnail: item.thumbnail ?? undefined,
    url: item.url,
    aspectRatio,
    gridIndex: 0,
    orderIndex: 0,
    cardWidth: item.cardWidth ?? 280,
    customCardWidth: false,
    isRead: false,
    isDeleted: false,
    tags: [],
    displayMode: null,
  }
}

/** Lightbox 専用テキストカード (session 32 user 提案 = 「カード自体に表示されている
 *  文字の見た目もテキストカードのようにしたらどうですか」)。
 *  board の TextCard を scale-up する複雑な方式 (= clone / ResizeObserver) は
 *  全部レイアウト崩れを起こした。 代わりに Lightbox サイズに合わせた専用カードを
 *  CSS だけで描画する。 構造: favicon + ドメイン (上、 控えめ) + 大タイトル (中央)。
 *  X ツイートのタイトルは cleanTitle 経由で OGP boilerplate を除く。 */
function LightboxTextDisplay({
  title,
  url,
  aspect,
}: {
  readonly title: string
  readonly url: string
  readonly aspect: number
}): ReactElement {
  const hostname = hostnameFromUrl(url) ?? ''
  const favicon = hostname ? getFaviconUrl(hostname) : null
  return (
    <div
      className={styles.imageBox}
      style={{ ['--item-aspect' as string]: aspect } as React.CSSProperties}
    >
      <div className={styles.lightboxTextCard}>
        {favicon && (
          <div className={styles.lightboxTextMeta}>
            <img
              src={favicon}
              alt=""
              className={styles.lightboxTextFavicon}
              draggable={false}
            />
            <span className={styles.lightboxTextDomain}>{hostname}</span>
          </div>
        )}
        <div className={styles.lightboxTextTitle}>{title}</div>
      </div>
    </div>
  )
}

/** user 提案 (session 32) の clone 案: board の source card を cloneNode で
 *  そのままコピーし、 `.imageBox` の中に置いて transform:scale で拡大表示する。
 *  「写真のように board card を拡大」 を pixel identical で実現。 source card が
 *  DOM にない (= share view 等) 場合は LargeTextCardScaler に fallback。
 *  inner の `--card-radius` を 0 上書きして、 scale で TextCard root の radius
 *  が拡大される問題 (= user 「丸さすら違う」 報告) を回避 — 視覚 radius は
 *  outer .imageBox の var(--lightbox-media-radius) と overflow:hidden で確定する。 */
function LargeBoardCardClone({
  item,
  fakeItem,
  aspect,
}: {
  readonly item: LightboxItem
  readonly fakeItem: BoardItem
  readonly aspect: number
}): ReactElement {
  const boxRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [useFallback, setUseFallback] = useState<boolean>(false)

  useLayoutEffect(() => {
    if (useFallback) return
    const box = boxRef.current
    const inner = innerRef.current
    if (!box || !inner) return

    const bookmarkId = item.bookmarkId
    if (!bookmarkId) { setUseFallback(true); return }
    const source = document.querySelector<HTMLElement>(`[data-bookmark-id="${bookmarkId}"]`)
    if (!source) { setUseFallback(true); return }

    const sourceRect = source.getBoundingClientRect()
    const boardW = sourceRect.width
    const boardH = sourceRect.height
    if (boardW <= 0 || boardH <= 0) { setUseFallback(true); return }

    const clone = source.cloneNode(true) as HTMLElement
    clone.style.cssText = ''
    clone.style.position = 'absolute'
    clone.style.top = '0'
    clone.style.left = '0'
    clone.style.width = `${boardW}px`
    clone.style.height = `${boardH}px`
    clone.style.margin = '0'
    clone.style.visibility = 'visible'
    clone.style.transformOrigin = 'top left'
    clone.style.pointerEvents = 'none'
    clone.style.setProperty('--card-radius', '0')
    inner.appendChild(clone)

    // hover-revealed chrome を strip (= open animation clone と同じ)。
    const SELECTORS_TO_STRIP = [
      '[data-testid="card-delete-button"]',
      '[data-testid="card-reset-size-button"]',
      '[data-testid^="resize-handle-"]',
    ]
    for (const sel of SELECTORS_TO_STRIP) {
      clone.querySelectorAll(sel).forEach((n) => n.remove())
    }

    const update = (): void => {
      const w = box.offsetWidth
      if (w <= 0) return
      const scale = w / boardW
      clone.style.transform = `scale(${scale})`
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(box)

    return (): void => {
      observer.disconnect()
      clone.remove()
    }
  }, [item.bookmarkId, useFallback])

  if (useFallback) {
    return <LargeTextCardScaler fakeItem={fakeItem} aspect={aspect} />
  }

  return (
    <div
      ref={boxRef}
      className={styles.imageBox}
      style={{ ['--item-aspect' as string]: aspect } as React.CSSProperties}
    >
      <div ref={innerRef} style={{ position: 'relative', width: '100%', height: '100%' }} />
    </div>
  )
}

/** share view 等で source card DOM が無いとき用の fallback。 board と同じ
 *  cardWidth で TextCard を再描画 + ResizeObserver で wrapper scale。 */
function LargeTextCardScaler({
  fakeItem,
  aspect,
}: {
  readonly fakeItem: BoardItem
  readonly aspect: number
}): ReactElement {
  const boxRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const boardW = fakeItem.cardWidth
  const boardH = boardW / aspect

  useLayoutEffect(() => {
    const box = boxRef.current
    const inner = innerRef.current
    if (!box || !inner) return
    const update = (): void => {
      const w = box.offsetWidth
      if (w <= 0) return
      const scale = w / boardW
      // session 35: transform:scale → zoom。 transform:scale は raster blur (= 文字
      // 「画質荒い」 user 報告)、 zoom は browser が再レイアウト + 文字 crisp 再描画。
      inner.style.zoom = `${scale}`
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(box)
    return (): void => observer.disconnect()
  }, [boardW])

  return (
    <div
      ref={boxRef}
      className={styles.imageBox}
      style={{ ['--item-aspect' as string]: aspect } as React.CSSProperties}
    >
      <div
        ref={innerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${boardW}px`,
          height: `${boardH}px`,
          // session 34: inner TextCard の var(--card-radius) (= board 24px) が
          // 拡大されると外側 .imageBox の 20px clip より大きくなり 「20 より丸い」
          // 視覚になる。 0 上書きで inner を矩形化し、 .imageBox の overflow:hidden +
          // 20px radius が最終形を決める (= LargeBoardCardClone と同じ手)。
          ['--card-radius' as string]: '0',
        } as React.CSSProperties}
      >
        <TextCard
          item={fakeItem}
          cardWidth={boardW}
          cardHeight={boardH}
          displayMode="visual"
          omitMeta
        />
      </div>
    </div>
  )
}

/** ImageCard 経路で thumbnail を <img> 描画するが、 load 失敗時 OR load 成功
 *  しても image が小さすぎる (= favicon / icon サイズ) 場合は大 TextCard へ
 *  fallback する。 board の ImageCard が MinimalCard に落ちる挙動と等価 +
 *  Lightbox 拡大時に荒い favicon が巨大表示される問題への対策。 */
function LightboxImageWithFallback({
  item,
  aspectRatio,
  fakeBoardItem,
  textAspect,
}: {
  readonly item: LightboxItem
  readonly aspectRatio: number | undefined
  readonly fakeBoardItem: BoardItem
  readonly textAspect: number
}): ReactElement {
  const [shouldFallback, setShouldFallback] = useState<boolean>(false)
  const handleError = useCallback((): void => { setShouldFallback(true) }, [])
  // 256px 未満の image は favicon / icon サイズと判定して TextCard fallback。
  // Lightbox の .media は 600px 強の幅で描画するため、 256px 未満を拡大すると
  // 露骨に荒くなる (user 報告の「巨大な荒い favicon」 の根本原因)。
  const handleLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>): void => {
      const img = e.currentTarget
      if (img.naturalWidth > 0 && img.naturalHeight > 0
        && img.naturalWidth < 256 && img.naturalHeight < 256) {
        setShouldFallback(true)
      }
    },
    [],
  )

  if (shouldFallback) {
    return <LargeTextCardScaler fakeItem={fakeBoardItem} aspect={textAspect} />
  }
  if (aspectRatio) {
    return (
      <div
        className={styles.imageBox}
        style={{ ['--item-aspect' as string]: aspectRatio } as React.CSSProperties}
      >
        <img src={item.thumbnail!} alt={item.title} onError={handleError} onLoad={handleLoad} />
      </div>
    )
  }
  return <img src={item.thumbnail!} alt={item.title} onError={handleError} onLoad={handleLoad} />
}

/** Pre-play poster wrap used by every embed type (YouTube / TikTok /
 *  Instagram). Renders the saved thumbnail at the *board card's persisted
 *  aspect* (via `--item-aspect` CSS var) so the lightbox open animation
 *  ends on a shape identical to the source card — the clone→media swap
 *  becomes visually invisible. Overlay (Play button or external link) is
 *  passed as children so each embed can express its specific affordance.
 *  Falls back to `fallbackAspect` when the item has no persisted aspect
 *  (share-view cards). B-#17-#2. */
function EmbedPosterBox({
  aspectRatio,
  fallbackAspect,
  thumbnail,
  alt,
  children,
}: {
  readonly aspectRatio: number | undefined
  readonly fallbackAspect: number
  readonly thumbnail: string | undefined
  readonly alt: string
  readonly children?: ReactNode
}): ReactNode {
  const aspect = aspectRatio && aspectRatio > 0 ? aspectRatio : fallbackAspect
  return (
    <div
      className={styles.embedPosterBox}
      style={{ '--item-aspect': aspect } as CSSProperties}
    >
      {thumbnail && <img src={thumbnail} alt={alt} className={styles.embedPoster} />}
      {children}
    </div>
  )
}

/** LiquidGlass-styled center play button — the sole pre-play affordance
 *  shared by YouTube and TikTok. Click delegates to the parent embed's
 *  `setHasInteracted(true)` to mount the actual player. */
function EmbedPlayButton({ onClick }: { readonly onClick: () => void }): ReactNode {
  return (
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
  )
}

function YouTubeEmbed({
  videoId,
  title,
  vertical,
  thumbnail,
  aspectRatio,
}: {
  readonly videoId: string
  readonly title: string
  readonly vertical: boolean
  readonly thumbnail: string | undefined
  readonly aspectRatio: number | undefined
}): ReactNode {
  const [hasInteracted, setHasInteracted] = useState<boolean>(false)
  // YouTube CDN poster — used only as fallback when the bookmarklet
  // didn't capture an og:image. maxresdefault works for ~95% of videos;
  // hqdefault is the universal fallback if max isn't available, but we
  // only reach this code path when item.thumbnail is missing entirely.
  const poster = thumbnail || `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`

  // Pre-play: render the poster at the *board card's* aspect so the open
  // animation's clone→media swap is invisible. The iframe wrap (16:9 /
  // 9:16) only mounts after the user clicks play — at that moment the
  // aspect snaps to YouTube's native player shape, which is acceptable
  // because it follows a deliberate user gesture (B-#17-#2).
  if (!hasInteracted) {
    return (
      <EmbedPosterBox
        aspectRatio={aspectRatio}
        fallbackAspect={vertical ? 9 / 16 : 16 / 9}
        thumbnail={poster}
        alt={title}
      >
        <EmbedPlayButton onClick={(): void => setHasInteracted(true)} />
      </EmbedPosterBox>
    )
  }

  return (
    <div className={vertical ? styles.iframeWrap9x16 : styles.iframeWrap16x9}>
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
  aspectRatio,
}: {
  readonly videoId: string
  readonly url: string
  readonly thumbnail: string | undefined
  readonly title: string
  readonly aspectRatio: number | undefined
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
      <EmbedPosterBox
        aspectRatio={aspectRatio}
        fallbackAspect={9 / 16}
        thumbnail={thumbnail}
        alt={title}
      >
        <EmbedPlayButton onClick={(): void => setHasInteracted(true)} />
      </EmbedPosterBox>
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
  aspectRatio,
}: {
  readonly shortcode: string
  readonly thumbnail: string | undefined
  readonly title: string
  readonly aspectRatio: number | undefined
}): ReactNode {
  const postUrl = `https://www.instagram.com/p/${shortcode}/`
  return (
    <EmbedPosterBox
      aspectRatio={aspectRatio}
      fallbackAspect={1}
      thumbnail={thumbnail}
      alt={title}
    >
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
    </EmbedPosterBox>
  )
}
