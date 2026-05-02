'use client'

import { useEffect, useRef, type ReactElement, type ReactNode } from 'react'
import { gsap } from 'gsap'
import type { BoardItem } from '@/lib/storage/use-board-data'
import { t } from '@/lib/i18n/t'
import {
  detectUrlType,
  extractInstagramShortcode,
  extractTikTokVideoId,
  extractYoutubeId,
  isYoutubeShorts,
} from '@/lib/utils/url'
import styles from './Lightbox.module.css'

type Props = {
  readonly item: BoardItem | null
  readonly onClose: () => void
}

export function Lightbox({ item, onClose }: Props): ReactElement | null {
  const backdropRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

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

  if (!item) return null

  const host = (() => {
    try { return new URL(item.url).hostname.replace(/^www\./, '') }
    catch { return '' }
  })()

  const isTweet = detectUrlType(item.url) === 'tweet'
  const tweetParsed = isTweet ? parseTweetTitle(item.title) : null

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
          {tweetParsed ? (
            <>
              <p className={styles.tweetText}>{tweetParsed.text}</p>
              <p className={styles.tweetAuthor}>
                {tweetParsed.author} <span className={styles.tweetMeta}>on X</span>
              </p>
            </>
          ) : (
            <>
              <h1 id="lightbox-title" className={styles.title}>{item.title}</h1>
              {item.description && (
                <p className={styles.description}>{item.description}</p>
              )}
              <div className={styles.meta}>
                {host && <span>{host}</span>}
              </div>
            </>
          )}
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

/**
 * Parse the OGP-style title that X (Twitter) returns to extract the author
 * and the tweet body. X uses two formats depending on locale:
 *   "Xユーザーの<author>さん:「<content>」/ X"   (Japanese)
 *   "<author> on X: <content>"                  (English)
 * Returns null if the title doesn't match either pattern (e.g. media tweets,
 * reply threads, or X has changed the format).
 */
function parseTweetTitle(title: string): { author: string; text: string } | null {
  const ja = title.match(/^X(?:ユーザー)?の?(.+?)さん[:：]\s*[「『](.+)[」』]\s*\/\s*X\s*$/u)
  if (ja && ja[1] && ja[2]) return { author: ja[1].trim(), text: ja[2].trim() }
  const en = title.match(/^(.+?)\s+on\s+X[:\s]+(.+?)(?:\s*\/\s*X)?$/i)
  if (en && en[1] && en[2]) return { author: en[1].trim(), text: en[2].trim() }
  return null
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
