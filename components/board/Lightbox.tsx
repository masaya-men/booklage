'use client'

import { useEffect, useRef, type ReactElement, type ReactNode } from 'react'
import { gsap } from 'gsap'
import { Tweet } from 'react-tweet'
import type { BoardItem } from '@/lib/storage/use-board-data'
import { t } from '@/lib/i18n/t'
import {
  detectUrlType,
  extractInstagramShortcode,
  extractTikTokVideoId,
  extractTweetId,
  extractYoutubeId,
  isYoutubeShorts,
} from '@/lib/utils/url'
import { fetchTweetMeta } from '@/lib/embed/tweet-meta'
import styles from './Lightbox.module.css'

type Props = {
  readonly item: BoardItem | null
  readonly onClose: () => void
  /** Optional thumbnail backfill — Lightbox lazy-fetches Twitter syndication
   *  metadata and writes the photo/video poster URL into the bookmark so the
   *  next reload picks ImageCard instead of falling back to TextCard. */
  readonly persistThumbnail?: (bookmarkId: string, thumbnail: string, force?: boolean) => Promise<void>
}

export function Lightbox({ item, onClose, persistThumbnail }: Props): ReactElement | null {
  const backdropRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  const isTweet = item ? detectUrlType(item.url) === 'tweet' : false
  const tweetId = isTweet && item ? extractTweetId(item.url) : null

  // Escape key closes
  useEffect(() => {
    if (!item) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return (): void => window.removeEventListener('keydown', onKey)
  }, [item, onClose])

  // Open animation: spring scale-in from 0.86 + fade
  useEffect(() => {
    if (!item || !frameRef.current) return
    const tween = gsap.fromTo(
      frameRef.current,
      { scale: 0.86, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.42, ease: 'back.out(1.3)' },
    )
    return (): void => { tween.kill() }
  }, [item])

  // Focus close button when lightbox opens
  useEffect(() => {
    if (item) closeButtonRef.current?.focus()
  }, [item])

  // Lazy backfill the bookmark's thumbnail from Twitter syndication when a
  // tweet opens. Runs even when an existing thumbnail is present because the
  // bookmarklet typically captures X's generic placeholder ("SEE WHAT'S
  // HAPPENING") rather than the per-tweet image. force=true allows overwrite;
  // empty string clears for text-only tweets so they fall through to TextCard.
  useEffect(() => {
    if (!item || !tweetId || !persistThumbnail) return
    let cancelled = false
    void fetchTweetMeta(tweetId).then((meta) => {
      if (cancelled || !meta) return
      const url = meta.photoUrl ?? meta.videoPosterUrl ?? ''
      void persistThumbnail(item.bookmarkId, url, true)
    })
    return (): void => { cancelled = true }
  }, [item, tweetId, persistThumbnail])

  if (!item) return null

  const host = (() => {
    try { return new URL(item.url).hostname.replace(/^www\./, '') }
    catch { return '' }
  })()

  // Tweet branch: render react-tweet inside a centered scrollable column.
  // react-tweet handles author + text + media + video playback natively, so
  // we don't need our own parser or text panel for tweets.
  if (tweetId) {
    return (
      <div
        ref={backdropRef}
        className={`${styles.backdrop} ${styles.open}`.trim()}
        role="dialog"
        aria-modal="true"
        onClick={(e) => { if (e.target === backdropRef.current) onClose() }}
        data-testid="lightbox"
      >
        <div ref={frameRef} className={styles.frameTweet}>
          <div className={styles.tweetWrap} data-theme="dark">
            <Tweet id={tweetId} />
          </div>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.sourceLink}
          >
            {t('board.lightbox.openSource')} →
          </a>
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

  // Non-tweet branch: 2-column layout (media | text).
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
          <LightboxMedia item={item} />
        </div>
        <div className={styles.text}>
          <h1 id="lightbox-title" className={styles.title}>{item.title}</h1>
          {item.description && (
            <p className={styles.description}>{item.description}</p>
          )}
          <div className={styles.meta}>
            {host && <span>{host}</span>}
          </div>
          <a href={item.url} target="_blank" rel="noopener noreferrer" className={styles.sourceLink}>
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
