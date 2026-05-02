'use client'

import { useEffect, useRef, type ReactElement, type ReactNode } from 'react'
import { gsap } from 'gsap'
import { Tweet } from 'react-tweet'
import type { BoardItem } from '@/lib/storage/use-board-data'
import { t } from '@/lib/i18n/t'
import {
  detectUrlType,
  extractTikTokVideoId,
  extractTweetId,
  extractYoutubeId,
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

  if (urlType === 'tweet') {
    const tweetId = extractTweetId(item.url)
    if (tweetId) {
      return (
        <div data-theme="light" className={styles.tweetWrap}>
          <Tweet id={tweetId} />
        </div>
      )
    }
  }

  if (urlType === 'youtube') {
    const videoId = extractYoutubeId(item.url)
    if (videoId) {
      return <YouTubeEmbed videoId={videoId} title={item.title} />
    }
  }

  if (urlType === 'tiktok') {
    return <TikTokEmbed url={item.url} />
  }

  if (urlType === 'instagram') {
    return <InstagramEmbed url={item.url} />
  }

  // image / website / fallbacks
  if (item.thumbnail) {
    return <img src={item.thumbnail} alt={item.title} />
  }
  return <div className={styles.placeholder}>{item.title}</div>
}

function YouTubeEmbed({ videoId, title }: { readonly videoId: string; readonly title: string }): ReactNode {
  return (
    <div className={styles.iframeWrap16x9}>
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

const TIKTOK_EMBED_SRC = 'https://www.tiktok.com/embed.js'
const INSTAGRAM_EMBED_SRC = 'https://www.instagram.com/embed.js'

/** Re-execute an external embed script by removing & re-appending the <script> tag.
 *  Both TikTok and Instagram process matching blockquote elements at script-load time. */
function reloadEmbedScript(src: string): void {
  const existing = document.querySelector(`script[src="${src}"]`)
  if (existing) existing.remove()
  const script = document.createElement('script')
  script.async = true
  script.src = src
  document.body.appendChild(script)
}

function TikTokEmbed({ url }: { readonly url: string }): ReactNode {
  useEffect(() => {
    reloadEmbedScript(TIKTOK_EMBED_SRC)
  }, [url])

  const videoId = extractTikTokVideoId(url)
  return (
    <blockquote
      className={`tiktok-embed ${styles.tikTokBlockquote}`}
      cite={url}
      {...(videoId ? { 'data-video-id': videoId } : {})}
    >
      <section>
        <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
      </section>
    </blockquote>
  )
}

function InstagramEmbed({ url }: { readonly url: string }): ReactNode {
  useEffect(() => {
    reloadEmbedScript(INSTAGRAM_EMBED_SRC)
  }, [url])

  return (
    <blockquote
      className={`instagram-media ${styles.instagramBlockquote}`}
      data-instgrm-permalink={url}
      data-instgrm-version="14"
    >
      <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
    </blockquote>
  )
}
