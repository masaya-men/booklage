'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ComponentType, type ReactElement, type ReactNode } from 'react'
import { gsap } from 'gsap'
import type { BoardItem } from '@/lib/storage/use-board-data'
import type { TweetMeta } from '@/lib/embed/types'
import { fetchTweetMeta } from '@/lib/embed/tweet-meta'
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
      // Shadow shrinks back to flush as the lightbox retracts — the
      // elevation bleeds out before the frame disappears, so the cast
      // never lingers as a ghost rectangle on the dark backdrop.
      // power2.in matches the frame's deceleration profile.
      tl.to(el, {
        '--lb-shadow-y-far': 1,
        '--lb-shadow-blur-far': 2,
        '--lb-shadow-a-far': 0.10,
        '--lb-shadow-y-mid': 2,
        '--lb-shadow-blur-mid': 4,
        '--lb-shadow-a-mid': 0.06,
        '--lb-shadow-y-near': 0,
        '--lb-shadow-blur-near': 1,
        '--lb-shadow-a-near': 0.03,
        duration: 0.45,
        ease: 'power2.in',
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

      // Interior control elements that pop in once the frame has
      // mostly landed (close ✕ + any LiquidGlass play overlay). Marked
      // with [data-controlpop] in the JSX. Querying the frame ref
      // catches whatever subtree LightboxMedia/TweetMedia rendered for
      // this item type. Stored before tl.set so we can null-init their
      // scale/opacity in the same pre-paint frame as the frame setup,
      // avoiding any flash of a full-size control before the pop fires.
      const popTargets = el.querySelectorAll<HTMLElement>('[data-controlpop]')
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
        // Shadow starts tight & shallow — the lightbox sits flush with
        // the board, near-zero elevation. The 3-layer cast tweens up to
        // deep ceiling-level lift as the FLIP transform unspools (see
        // Lightbox.module.css for the calc()-based box-shadow on .media
        // that consumes these vars).
        '--lb-shadow-y-far': 1,
        '--lb-shadow-blur-far': 2,
        '--lb-shadow-a-far': 0.20,
        '--lb-shadow-y-mid': 2,
        '--lb-shadow-blur-mid': 4,
        '--lb-shadow-a-mid': 0.12,
        '--lb-shadow-y-near': 0,
        '--lb-shadow-blur-near': 1,
        '--lb-shadow-a-near': 0.05,
        // Light sweep parked offscreen-left, invisible. The sweep is a
        // 115° gradient on .media::before that translates across the
        // surface during the landing window — see CSS for the visual.
        '--lb-sweep-pos': -120,
        '--lb-sweep-opacity': 0,
      })
      if (popTargets.length > 0) {
        gsap.set(popTargets, {
          scale: 0.4,
          opacity: 0,
          transformOrigin: '50% 50%',
        })
      }
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
        // back.out(1.2) — gentle ~2% overshoot past the landing point,
        // then settle. Reads as "this object has weight, compresses on
        // impact, and rebounds slightly" instead of stopping dead. 1.2
        // (vs default 1.7) keeps the elasticity below the threshold
        // where it would feel cartoony/playful — the rebound is sub-
        // perceptual but the eye still registers the physicality.
        duration: 0.75,
        ease: 'back.out(1.2)',
      }, 0)
      // Box-shadow elevation grows on power3.out across the FULL
      // transform duration. Trails the back.out curve so the shadow
      // keeps deepening for ~50ms after the frame appears to land —
      // the "weight settling" beat after the visual arrival.
      tl.to(el, {
        '--lb-shadow-y-far': 16,
        '--lb-shadow-blur-far': 32,
        '--lb-shadow-a-far': 0.40,
        '--lb-shadow-y-mid': 32,
        '--lb-shadow-blur-mid': 64,
        '--lb-shadow-a-mid': 0.30,
        '--lb-shadow-y-near': 6,
        '--lb-shadow-blur-near': 12,
        '--lb-shadow-a-near': 0.18,
        duration: 0.8,
        ease: 'power3.out',
      }, 0)
      // Light sweep — three overlapping tweens form a fade-in / sweep /
      // fade-out window. Begins at 0.4s (after the blur has cleared so
      // the highlight reads sharp, not smeared) and concludes by 1.05s.
      // The peak crossing happens around 0.65s, almost exactly when the
      // frame visually "lands" — the eye reads this as light catching
      // on a glass plate as it rotates to vertical.
      tl.to(el, {
        '--lb-sweep-opacity': 1,
        duration: 0.12,
        ease: 'power1.out',
      }, 0.4)
      tl.to(el, {
        '--lb-sweep-pos': 200,
        duration: 0.5,
        ease: 'power2.inOut',
      }, 0.4)
      tl.to(el, {
        '--lb-sweep-opacity': 0,
        duration: 0.2,
        ease: 'power1.in',
      }, 0.85)
      // Control pop — close ✕ + LiquidGlass play overlay snap in with a
      // crisper overshoot than the frame (back.out(2.4) vs frame's 1.2).
      // The contrast in elasticity makes them feel like distinct objects:
      // the heavy frame settles in slowly while the light controls bounce
      // into place a beat later. Delayed to 0.5s so they arrive after
      // the frame is ~80% landed — never floating in empty space.
      if (popTargets.length > 0) {
        tl.to(popTargets, {
          scale: 1,
          opacity: 1,
          duration: 0.5,
          ease: 'back.out(2.4)',
          stagger: 0.04,
        }, 0.5)
      }
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
        // Clear control pop transforms — if the lightbox unmounts mid-
        // tween (e.g. user opens a different card before this one's
        // open animation completes), GSAP would otherwise leave the
        // controls stuck at scale 0.4 / opacity 0 on next mount.
        if (popTargets.length > 0) {
          gsap.set(popTargets, {
            clearProps: 'scale,opacity,transformOrigin',
          })
        }
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
          data-controlpop="true"
        >
          <span className={styles.closeIcon} aria-hidden="true">✕</span>
        </button>
      </div>
    </div>
    </>
  )
}

function DefaultText({
  item,
  host,
}: {
  readonly item: BoardItem
  readonly host: string
}): ReactElement {
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
          data-controlpop="true"
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
    if (videoId) return <TikTokEmbed videoId={videoId} thumbnail={item.thumbnail} title={item.title} />
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
        data-controlpop="true"
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

/** TikTok official iframe embed — no script.js needed, works inside any CSP.
 *  TikTok blocks autoplay, so even after our overlay click the user will
 *  see TikTok's own play button inside the iframe and tap once more. The
 *  benefit of the deferred-mount is purely visual continuity during FLIP. */
function TikTokEmbed({
  videoId,
  thumbnail,
  title,
}: {
  readonly videoId: string
  readonly thumbnail: string | undefined
  readonly title: string
}): ReactNode {
  const [hasInteracted, setHasInteracted] = useState<boolean>(false)
  return (
    <div className={styles.iframeWrap9x16}>
      {hasInteracted ? (
        <iframe
          src={`https://www.tiktok.com/embed/v2/${videoId}`}
          title="TikTok video"
          className={styles.iframe}
          allow="encrypted-media"
          allowFullScreen
        />
      ) : thumbnail ? (
        <EmbedPoster
          thumbnail={thumbnail}
          alt={title}
          onClick={(): void => setHasInteracted(true)}
        />
      ) : (
        // No thumbnail captured — skip the poster step and mount iframe
        // immediately. Loses the FLIP-time visual continuity but better
        // than showing an empty button hovering over a black square.
        <iframe
          src={`https://www.tiktok.com/embed/v2/${videoId}`}
          title="TikTok video"
          className={styles.iframe}
          allow="encrypted-media"
          allowFullScreen
        />
      )}
    </div>
  )
}

/** Instagram official `/embed` iframe — public posts work without script.js.
 *  Instagram also blocks autoplay; same two-tap pattern as TikTok. */
function InstagramEmbed({
  shortcode,
  thumbnail,
  title,
}: {
  readonly shortcode: string
  readonly thumbnail: string | undefined
  readonly title: string
}): ReactNode {
  const [hasInteracted, setHasInteracted] = useState<boolean>(false)
  return (
    <div className={styles.iframeWrap9x16}>
      {hasInteracted ? (
        <iframe
          src={`https://www.instagram.com/p/${shortcode}/embed`}
          title="Instagram post"
          className={styles.iframe}
          allow="encrypted-media"
          allowFullScreen
        />
      ) : thumbnail ? (
        <EmbedPoster
          thumbnail={thumbnail}
          alt={title}
          onClick={(): void => setHasInteracted(true)}
        />
      ) : (
        <iframe
          src={`https://www.instagram.com/p/${shortcode}/embed`}
          title="Instagram post"
          className={styles.iframe}
          allow="encrypted-media"
          allowFullScreen
        />
      )}
    </div>
  )
}
