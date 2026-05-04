'use client'

import { useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { gsap } from 'gsap'
import type { BoardItem } from '@/lib/storage/use-board-data'
import type { TweetMeta } from '@/lib/embed/types'
import { fetchTweetMeta } from '@/lib/embed/tweet-meta'
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
  const closeButtonRef = useRef<HTMLButtonElement>(null)

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

  // Focus close button when lightbox opens
  useEffect(() => {
    if (bookmarkId) closeButtonRef.current?.focus()
  }, [bookmarkId])

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
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className={styles.close}
          aria-label={t('board.lightbox.close')}
        >✕</button>
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

/** Inline mp4 player for tweet videos. Adds a frosted-glass center play
 *  button overlay that disappears on first play (native bottom controls
 *  take over from there). If playback fails — CDN takedown, geo-block,
 *  proxy outage — falls back to a poster + "Watch on X" link so the
 *  user is never stuck on a dead element. */
function TweetVideoPlayer({
  item,
  meta,
}: {
  readonly item: BoardItem
  readonly meta: TweetMeta
}): ReactNode {
  const [hasStarted, setHasStarted] = useState<boolean>(false)
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

  const aspect = meta.videoAspectRatio ?? 16 / 9
  const wrapperClass = aspect < 1 ? styles.iframeWrap9x16 : styles.iframeWrap16x9
  const proxiedSrc = `/api/tweet-video?url=${encodeURIComponent(meta.videoUrl ?? '')}`
  const handleOverlayClick = (): void => { void videoRef.current?.play() }

  return (
    <div className={wrapperClass}>
      <video
        ref={videoRef}
        className={styles.tweetVideo}
        src={proxiedSrc}
        poster={meta.videoPosterUrl ?? item.thumbnail}
        controls
        playsInline
        preload="metadata"
        onPlay={(): void => setHasStarted(true)}
        onError={(): void => setVideoFailed(true)}
      />
      {!hasStarted && (
        <button
          type="button"
          className={styles.playOverlay}
          onClick={handleOverlayClick}
          aria-label="Play video"
        >
          <span className={styles.playOverlayCircle} aria-hidden="true">
            <svg viewBox="0 0 24 24" className={styles.playOverlayIcon} aria-hidden="true">
              <path d="M8 5v14l11-7z" />
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
