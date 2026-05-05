'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ComponentType, type ReactElement, type ReactNode } from 'react'
import { gsap } from 'gsap'
import type { BoardItem } from '@/lib/storage/use-board-data'
import type { TikTokPlayback, TweetMeta } from '@/lib/embed/types'
import { fetchTweetMeta } from '@/lib/embed/tweet-meta'
import { fetchTikTokPlayback } from '@/lib/embed/tiktok-meta'
import { LiquidGlass } from '@/components/ui/LiquidGlass'
import { t } from '@/lib/i18n/t'
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

type Props = {
  readonly item: BoardItem | null
  /** Clicked card's screen rect at the moment of pointer-up. Used to seed
   *  the FLIP (First-Last-Invert-Play) open animation so the lightbox grows
   *  from where the card actually was, instead of the viewport center. */
  readonly originRect: DOMRect | null
  readonly onClose: () => void
}

export function Lightbox({ item, originRect, onClose }: Props): ReactElement | null {
  const backdropRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  // closeButtonRef intentionally absent — see "No programmatic auto-focus"
  // comment near the keyboard handler below.

  const isTweet = item ? detectUrlType(item.url) === 'tweet' : false
  const tweetId = isTweet && item ? extractTweetId(item.url) : null
  // Stable string ref for effect deps — using item (object) directly causes
  // the open animation to restart whenever an unrelated state update gives
  // BoardRoot's items a new array reference (e.g. thumbnail backfill).
  const bookmarkId = item?.bookmarkId

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
      if (!cancelled) setTweetMeta(meta)
    })
    return (): void => { cancelled = true }
  }, [tweetId])

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

    if (originRect) {
      const targetRect = el.getBoundingClientRect()
      const targetCenterX = targetRect.left + targetRect.width / 2
      const targetCenterY = targetRect.top + targetRect.height / 2
      const originCenterX = originRect.left + originRect.width / 2
      const originCenterY = originRect.top + originRect.height / 2
      const dx = originCenterX - targetCenterX
      const dy = originCenterY - targetCenterY
      const sx = originRect.width / targetRect.width
      const sy = originRect.height / targetRect.height
      const endScaleX = Math.max(0.05, sx)
      const endScaleY = Math.max(0.05, sy)
      const TILT_MAX = 8
      const TILT_DIST = 600
      const distNorm = Math.min(1, Math.hypot(dx, dy) / TILT_DIST)
      const endRotateY = -(Math.sign(dx) || 0) * TILT_MAX * distNorm
      const endRotateX = (Math.sign(dy) || 0) * TILT_MAX * distNorm * 0.7

      const tl = gsap.timeline({
        onComplete: () => onClose(),
      })
      // power3.in accelerates into the source — feels like the lightbox
      // is being "yanked back" into the card, mirroring the spring-out
      // landing of the open animation in reverse.
      tl.to(el, {
        x: dx,
        y: dy,
        scaleX: endScaleX,
        scaleY: endScaleY,
        rotateX: endRotateX,
        rotateY: endRotateY,
        filter: 'blur(4px)',
        opacity: 0,
        duration: 0.5,
        ease: 'power3.in',
        transformOrigin: '50% 50%',
        transformPerspective: 900,
      }, 0)
      if (backdrop) {
        // Backdrop fade trails the frame slightly so the lightbox
        // visibly returns to the card before the dim disappears.
        tl.to(backdrop, {
          opacity: 0,
          duration: 0.4,
          ease: 'power2.in',
        }, 0.1)
      }
    } else {
      gsap.to(el, {
        scale: 0.86,
        opacity: 0,
        duration: 0.3,
        ease: 'power3.in',
        onComplete: () => onClose(),
      })
    }
  }, [onClose, originRect])

  // Escape key closes
  useEffect(() => {
    if (!bookmarkId) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        requestClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return (): void => window.removeEventListener('keydown', onKey)
  }, [bookmarkId, requestClose])

  // Reset closingRef when item changes (= a new lightbox session opens
  // after a previous close completed). bookmarkId is the stable string
  // identity, so this only fires when the user opens a different card.
  useEffect(() => {
    closingRef.current = false
    // Also reset scene state on each new open so we don't carry over
    // a stale sceneActive=true from a previous session that happened
    // to unmount before its completion callback fired.
    sceneActiveRef.current = false
    setSceneActive(false)
    setTargetRectState(null)
  }, [bookmarkId])

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
    if (!bookmarkId || !frameRef.current) return
    const el = frameRef.current
    const backdrop = backdropRef.current

    // R3F scene mode is currently DISABLED at the activation site
    // because the first end-to-end test left the lightbox stuck on
    // an empty backdrop (likely texture-load CORS failure leaving
    // onComplete unfired). The scene module is still lazy-loaded
    // and ready; flip the SCENE_ENABLED flag below to re-enable
    // once we've added a load timeout + texture fallback path.
    const SCENE_ENABLED = false
    if (SCENE_ENABLED && originRect && SceneComp && item?.thumbnail) {
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

    if (originRect) {
      const targetRect = el.getBoundingClientRect()
      const targetCenterX = targetRect.left + targetRect.width / 2
      const targetCenterY = targetRect.top + targetRect.height / 2
      const originCenterX = originRect.left + originRect.width / 2
      const originCenterY = originRect.top + originRect.height / 2
      const dx = originCenterX - targetCenterX
      const dy = originCenterY - targetCenterY
      const sx = originRect.width / targetRect.width
      const sy = originRect.height / targetRect.height
      // Non-uniform scale: start frame matches the card's exact rect so the
      // motion reads as "this card grew into the lightbox" instead of "a
      // smaller box appeared inside the card and grew out". Brief intra-tween
      // content stretch is hidden under the opacity 0→1 fade and motion blur.
      const startScaleX = Math.max(0.05, sx)
      const startScaleY = Math.max(0.05, sy)
      // Direction-aware 3D tilt: the lightbox leans TOWARD the card's
      // origin direction, so a card in the top-left makes the lightbox
      // start tilted up-and-left, and the tilt unwinds as it travels to
      // center. The maximum magnitude is small (≤ 8°) — enough to read
      // as "this object has weight and is swinging into place" without
      // looking gimmicky. Sign matches the FLIP delta direction so the
      // lean visually points at the source card.
      const TILT_MAX = 8
      const TILT_DIST = 600 // px at which tilt saturates
      const distNorm = Math.min(1, Math.hypot(dx, dy) / TILT_DIST)
      const startRotateY = -(dx / Math.max(1, Math.abs(dx) || 1)) * TILT_MAX * distNorm
      const startRotateX = (dy / Math.max(1, Math.abs(dy) || 1)) * TILT_MAX * distNorm * 0.7

      const tl = gsap.timeline()
      tl.set(el, {
        x: dx,
        y: dy,
        scaleX: startScaleX,
        scaleY: startScaleY,
        rotateX: startRotateX,
        rotateY: startRotateY,
        // Motion blur — the lightbox content reads as smeared while
        // travelling, sharpens as it lands. Same trick film cameras use
        // to convey speed; reads as "rich" without any 3D library.
        filter: 'blur(5px)',
        opacity: 0,
        transformOrigin: '50% 50%',
        transformPerspective: 900,
      })
      tl.to(el, {
        opacity: 1,
        duration: 0.35,
        ease: 'power2.out',
      }, 0)
      tl.to(el, {
        filter: 'blur(0px)',
        duration: 0.45,
        ease: 'power3.out',
      }, 0)
      tl.to(el, {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotateX: 0,
        rotateY: 0,
        // power4.out is sharper at the tail than power3 — the lightbox
        // "lands and settles" with a more definitive arrival, matching
        // the snappier feel real physical objects have when they stop.
        duration: 0.7,
        ease: 'power4.out',
      }, 0)
      let backdropTween: gsap.core.Tween | null = null
      if (backdrop) {
        backdropTween = gsap.fromTo(
          backdrop,
          { opacity: 0 },
          { opacity: 1, duration: 0.22, ease: 'power2.out' },
        )
      }
      return (): void => {
        tl.kill()
        backdropTween?.kill()
      }
    }

    const tween = gsap.fromTo(
      el,
      { scale: 0.86, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.42, ease: 'power3.out' },
    )
    return (): void => { tween.kill() }
    // originRect is intentionally read once at mount via the bookmarkId dep —
    // a later rect change should not retrigger the open animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookmarkId])

  // No programmatic auto-focus on open — the bare ✕ button rendered with
  // a default browser focus ring reads as an unwanted "selected" rectangle
  // around the corner. Esc still closes via the window keydown listener
  // above, and Tab from anywhere lands on the close button as the first
  // focusable element inside the lightbox, with the standard focus ring
  // shown only for that genuine keyboard nav (CSS :focus-visible).

  if (!item) return null

  const host = (() => {
    try { return new URL(item.url).hostname.replace(/^www\./, '') }
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
      {sceneActive && SceneComp && originRect && targetRectState && item.thumbnail && (
        <SceneComp
          originRect={originRect}
          targetRect={targetRectState}
          thumbnail={item.thumbnail}
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
      <div ref={frameRef} className={styles.frame}>
        <div className={styles.media}>
          {tweetId
            ? <TweetMedia item={item} meta={tweetMeta} />
            : <LightboxMedia item={item} />}
        </div>
        <div className={styles.text}>
          {tweetId
            ? <TweetText item={item} meta={tweetMeta} />
            : <DefaultText item={item} host={host} />}
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.sourceLink}
          >
            {t('board.lightbox.openSource')} →
          </a>
        </div>
        <button
          type="button"
          onClick={requestClose}
          className={styles.close}
          aria-label={t('board.lightbox.close')}
        >
          <span className={styles.closeIcon} aria-hidden="true">✕</span>
        </button>
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
function cleanInstagramText(item: BoardItem): {
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
  readonly item: BoardItem
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

/** Left-column media for a tweet: inline mp4 video, photo, or large body
 *  text (text-only tweets). Falls back to the bookmark thumbnail before
 *  metadata loads so the slot never appears empty.
 *
 *  Video playback routes through `/api/tweet-video` (a Pages Function) to
 *  side-step the Twitter CDN's cross-origin Referer/Origin block — see
 *  functions/api/tweet-video.ts. The custom big play button overlay
 *  appears only before first play; once the user starts the clip,
 *  native bottom controls take over for pause/seek/volume. */
function TweetMedia({
  item,
  meta,
}: {
  readonly item: BoardItem
  readonly meta: TweetMeta | null
}): ReactNode {
  if (meta?.videoUrl) {
    return <TweetVideoPlayer item={item} meta={meta} />
  }
  const photoUrl = meta?.photoUrl ?? item.thumbnail
  if (photoUrl) {
    return <img src={photoUrl} alt={item.title} />
  }
  if (meta?.text) {
    return <p className={styles.tweetTextOnly}>{meta.text}</p>
  }
  return <div className={styles.placeholder}>{item.title}</div>
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
  readonly item: BoardItem
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
        <img src={meta.videoPosterUrl ?? item.thumbnail} alt={item.title} />
        <span className={styles.tweetWatchOnXBadge}>Watch on X →</span>
      </a>
    )
  }

  // Use the syndication-reported aspect verbatim so the wrapper matches the
  // video's natural proportions — eliminates the letterbox bars caused by
  // forcing every clip into a 16:9 or 9:16 bucket. Caps come from viewport.
  const aspect = meta.videoAspectRatio ?? 16 / 9
  const isVertical = aspect < 1
  const wrapperStyle: CSSProperties = {
    position: 'relative',
    aspectRatio: aspect,
    maxHeight: '88vh',
    maxWidth: isVertical ? '50vw' : 'min(920px, 60vw)',
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
        poster={meta.videoPosterUrl ?? item.thumbnail}
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
          <LiquidGlass shape="circle" size={92} aria-hidden="true">
            <svg viewBox="0 0 24 24" className={styles.playOverlayIcon} aria-hidden="true">
              {/* Path is bbox-centered in viewBox; CSS adds 1.5px optical
                  shift right (centroid lies left of bbox center for a
                  right-pointing triangle). */}
              <path d="M6.5 5v14l11-7z" />
            </svg>
          </LiquidGlass>
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
  readonly item: BoardItem
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

function LightboxMedia({ item }: { readonly item: BoardItem }): ReactNode {
  const urlType = detectUrlType(item.url)

  if (urlType === 'youtube') {
    const videoId = extractYoutubeId(item.url)
    if (videoId) {
      return (
        <YouTubeEmbed
          videoId={videoId}
          title={item.title}
          vertical={isYoutubeShorts(item.url)}
          thumbnail={item.thumbnail}
        />
      )
    }
  }

  if (urlType === 'tiktok') {
    const videoId = extractTikTokVideoId(item.url)
    if (videoId) return <TikTokEmbed videoId={videoId} url={item.url} thumbnail={item.thumbnail} title={item.title} />
  }

  if (urlType === 'instagram') {
    const shortcode = extractInstagramShortcode(item.url)
    if (shortcode) return <InstagramEmbed shortcode={shortcode} thumbnail={item.thumbnail} title={item.title} />
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
        <LiquidGlass shape="circle" size={92} aria-hidden="true">
          <svg viewBox="0 0 24 24" className={styles.playOverlayIcon} aria-hidden="true">
            <path d="M6.5 5v14l11-7z" />
          </svg>
        </LiquidGlass>
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
