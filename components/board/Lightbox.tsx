'use client'

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import { gsap } from 'gsap'
import type { BoardItem } from '@/lib/storage/use-board-data'
import type { TweetMeta } from '@/lib/embed/types'
import { fetchTweetMeta } from '@/lib/embed/tweet-meta'
import { LiquidGlass } from '@/components/ui/LiquidGlass'
import { t } from '@/lib/i18n/t'
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

  // Escape key closes
  useEffect(() => {
    if (!bookmarkId) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return (): void => window.removeEventListener('keydown', onKey)
  }, [bookmarkId, onClose])

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

    if (originRect) {
      const targetRect = el.getBoundingClientRect()
      const targetCenterX = targetRect.left + targetRect.width / 2
      const targetCenterY = targetRect.top + targetRect.height / 2
      const originCenterX = originRect.left + originRect.width / 2
      const originCenterY = originRect.top + originRect.height / 2
      const dx = originCenterX - targetCenterX
      const dy = originCenterY - targetCenterY
      // Uniform scale = card / target along smaller axis, so the card never
      // visually overflows its source bounds at frame 0. Aspect mismatch is
      // absorbed by the surrounding fade rather than a stretch.
      const sx = originRect.width / targetRect.width
      const sy = originRect.height / targetRect.height
      const startScale = Math.max(0.05, Math.min(sx, sy))

      const tl = gsap.timeline()
      tl.set(el, { x: dx, y: dy, scale: startScale, opacity: 0, transformOrigin: '50% 50%' })
      tl.to(el, {
        opacity: 1,
        duration: 0.22,
        ease: 'power2.out',
      }, 0)
      tl.to(el, {
        x: 0,
        y: 0,
        scale: 1,
        duration: 0.55,
        ease: 'power3.out',
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
    <div
      ref={backdropRef}
      className={`${styles.backdrop} ${styles.open}`.trim()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lightbox-title"
      onClick={(e) => { if (e.target === backdropRef.current) onClose() }}
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
          onClick={onClose}
          className={styles.close}
          aria-label={t('board.lightbox.close')}
        >
          <span className={styles.closeIcon} aria-hidden="true">✕</span>
        </button>
      </div>
    </div>
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
  // `isReady` tracks "is the browser's native loading spinner gone?". The
  // value is driven by a per-frame poll of the video element's internal
  // state (see useEffect below) — NOT by media events, which fire out of
  // sync with the spinner UI on Twitter's proxied CDN. The play overlay
  // becomes visible only when the spinner is genuinely gone, so it can
  // never sit on top of a spinner getting refracted through the lens.
  const [isReady, setIsReady] = useState<boolean>(false)
  const [videoFailed, setVideoFailed] = useState<boolean>(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Per-frame spinner-state poll. The single source of truth for "is the
  // browser drawing its native loading spinner right now?" is the
  // combination of networkState and readyState. We use the strictest
  // possible "definitely no spinner" criteria:
  //   networkState !== NETWORK_LOADING (= browser is idle, not fetching)
  //   readyState   === HAVE_ENOUGH_DATA (4) (= can play through to end
  //                  without rebuffering — Chrome guarantees the spinner
  //                  is gone at this readyState)
  // Combined with `preload="auto"` on the video element below, the browser
  // pre-loads enough to reach readyState 4 before we ever reveal the play
  // overlay, so the user never sees the button stacked on top of a
  // spinning loader.
  // rAF cadence keeps the check cost negligible (~µs per repaint) and
  // pauses automatically when the tab is backgrounded.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    let raf = 0
    let last: boolean | null = null
    const tick = (): void => {
      const ready = v.networkState !== 2 && v.readyState >= 4
      if (ready !== last) {
        last = ready
        setIsReady(ready)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return (): void => { cancelAnimationFrame(raf) }
  }, [])

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
  const handleOverlayClick = (): void => { void videoRef.current?.play() }

  return (
    <div style={wrapperStyle}>
      <video
        ref={videoRef}
        className={styles.tweetVideo}
        src={proxiedSrc}
        poster={meta.videoPosterUrl ?? item.thumbnail}
        controls
        playsInline
        // Aggressive preload pairs with the readyState >= 4 polling above
        // so the play overlay only appears once the video can play through
        // without buffering — guaranteeing no native spinner under our
        // LiquidGlass button. Bandwidth cost is acceptable: opening a
        // lightbox on a video bookmark is an intentional click, not a
        // passive page load, and the user almost always plays.
        preload="auto"
        // isReady is driven by the rAF poll above — events here only need
        // to track playback start/stop, which the React UI conditionally
        // unmounts the overlay from when isPlaying flips true.
        onPlay={(): void => setIsPlaying(true)}
        onPause={(): void => setIsPlaying(false)}
        onEnded={(): void => setIsPlaying(false)}
        onError={(): void => setVideoFailed(true)}
      />
      {/* Play overlay is always mounted while the video is paused so the
          appearance / disappearance can be a CSS transition (opacity +
          back-easing scale). `data-ready` toggles the visible state — false
          while the browser is still buffering (so its native centre spinner
          isn't covered), true once `canplay` fires. */}
      {!isPlaying && (
        <button
          type="button"
          className={styles.playOverlay}
          data-ready={isReady}
          onClick={handleOverlayClick}
          aria-label="Play video"
          aria-hidden={!isReady}
          tabIndex={isReady ? 0 : -1}
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
        />
      )
    }
  }

  if (urlType === 'tiktok') {
    const videoId = extractTikTokVideoId(item.url)
    if (videoId) return <TikTokEmbed videoId={videoId} />
  }

  if (urlType === 'instagram') {
    const shortcode = extractInstagramShortcode(item.url)
    if (shortcode) return <InstagramEmbed shortcode={shortcode} />
  }

  // image / website / fallbacks
  if (item.thumbnail) {
    return <img src={item.thumbnail} alt={item.title} />
  }
  return <div className={styles.placeholder}>{item.title}</div>
}

function YouTubeEmbed({
  videoId,
  title,
  vertical,
}: {
  readonly videoId: string
  readonly title: string
  readonly vertical: boolean
}): ReactNode {
  return (
    <div className={vertical ? styles.iframeWrap9x16 : styles.iframeWrap16x9}>
      <iframe
        src={`https://www.youtube.com/embed/${videoId}`}
        title={title}
        className={styles.iframe}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  )
}

/** TikTok official iframe embed — no script.js needed, works inside any CSP. */
function TikTokEmbed({ videoId }: { readonly videoId: string }): ReactNode {
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

/** Instagram official `/embed` iframe — public posts work without script.js. */
function InstagramEmbed({ shortcode }: { readonly shortcode: string }): ReactNode {
  return (
    <div className={styles.iframeWrap9x16}>
      <iframe
        src={`https://www.instagram.com/p/${shortcode}/embed`}
        title="Instagram post"
        className={styles.iframe}
        allow="encrypted-media"
        allowFullScreen
      />
    </div>
  )
}
