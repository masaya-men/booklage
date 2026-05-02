'use client'

import { Tweet } from 'react-tweet'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { BoardItem } from '@/lib/storage/use-board-data'
import type { DisplayMode } from '@/lib/board/types'
import { extractTweetId } from '@/lib/utils/url'
import { TextCard } from './TextCard'
import styles from './TweetCard.module.css'

type Props = {
  readonly item: BoardItem
  readonly persistMeasuredAspect?: (cardId: string, aspectRatio: number) => Promise<void>
  readonly reportIntrinsicHeight?: (cardId: string, heightPx: number) => void
  readonly cardWidth?: number
  readonly cardHeight?: number
  readonly displayMode: DisplayMode
}

// Persist when measured article height differs from the height implied by
// the current aspectRatio by more than this many pixels. Avoids write loops
// from sub-pixel fluctuation while still catching real layout changes
// (image/video loading, quoted tweet expansion).
const MEASUREMENT_EPSILON_PX = 4

export function TweetCard({ item, persistMeasuredAspect, reportIntrinsicHeight, cardWidth = 280, displayMode }: Props): ReactNode {
  const tweetId = extractTweetId(item.url)
  const hostRef = useRef<HTMLDivElement>(null)
  const [errored] = useState(false)

  // Measure the total rendered height of everything react-tweet emits, including
  // <article> AND its siblings like the "Read N replies" link that react-tweet
  // appends below article. Measuring article alone clipped that footer.
  //
  // Strategy: scan host.children, take the max of (offsetTop + offsetHeight).
  // Observe every descendant for resize (images/videos loading), watch for
  // MutationObserver subtree changes (late-appended elements, swaps), listen
  // for media `load` / `loadedmetadata` events (video thumbnails in
  // react-tweet settle their dimensions only after metadata loads), and a
  // handful of timer-based safety retries to catch anything that still slipped.
  useEffect(() => {
    const host = hostRef.current
    if (!host || !tweetId) return
    if (!persistMeasuredAspect && !reportIntrinsicHeight) return

    let lastReportedH = 0
    const observedNodes = new Set<Element>()
    const mediaListeners: Array<() => void> = []
    const timers: number[] = []
    const ro = new ResizeObserver(() => report())

    const report = (): void => {
      const children = host.children
      if (children.length === 0) return
      let maxBottom = 0
      for (let i = 0; i < children.length; i++) {
        const el = children[i] as HTMLElement
        const bottom = el.offsetTop + el.offsetHeight
        if (bottom > maxBottom) maxBottom = bottom
      }
      if (maxBottom < 60) return // still loading skeleton
      if (Math.abs(maxBottom - lastReportedH) < MEASUREMENT_EPSILON_PX) return
      lastReportedH = maxBottom
      reportIntrinsicHeight?.(item.bookmarkId, maxBottom)
      void persistMeasuredAspect?.(item.cardId, cardWidth / maxBottom)
    }

    const attachMediaListener = (el: Element): void => {
      if (el instanceof HTMLImageElement) {
        if (el.complete) return // already loaded
        const handler = (): void => report()
        el.addEventListener('load', handler)
        el.addEventListener('error', handler)
        mediaListeners.push(() => {
          el.removeEventListener('load', handler)
          el.removeEventListener('error', handler)
        })
      } else if (el instanceof HTMLVideoElement) {
        const handler = (): void => report()
        el.addEventListener('loadedmetadata', handler)
        el.addEventListener('loadeddata', handler)
        mediaListeners.push(() => {
          el.removeEventListener('loadedmetadata', handler)
          el.removeEventListener('loadeddata', handler)
        })
      }
    }

    const observeDeep = (root: Element): void => {
      if (observedNodes.has(root)) return
      observedNodes.add(root)
      ro.observe(root)
      attachMediaListener(root)
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
      let node = walker.nextNode() as Element | null
      while (node) {
        if (!observedNodes.has(node)) {
          observedNodes.add(node)
          ro.observe(node)
          attachMediaListener(node)
        }
        node = walker.nextNode() as Element | null
      }
    }

    // Catch new DOM (article mount, "Read N replies" link append, image inserts)
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const n of m.addedNodes) {
          if (n.nodeType === Node.ELEMENT_NODE) observeDeep(n as Element)
        }
      }
      report()
    })
    mo.observe(host, { childList: true, subtree: true })

    // Seed observations for anything already rendered
    for (let i = 0; i < host.children.length; i++) {
      observeDeep(host.children[i])
    }
    report()

    // Safety-net timer re-measurements. react-tweet's video placeholders
    // sometimes take up to ~2s to settle their final dimensions even after
    // the article has mounted (because poster images and metadata load
    // asynchronously from Twitter's CDN). ResizeObserver SHOULD fire for
    // those but doesn't always in production; these retries ensure we
    // always converge on the correct height.
    for (const delay of [300, 800, 1800, 3500]) {
      timers.push(window.setTimeout(report, delay))
    }

    return (): void => {
      mo.disconnect()
      ro.disconnect()
      for (const remove of mediaListeners) remove()
      for (const t of timers) clearTimeout(t)
      observedNodes.clear()
    }
  }, [tweetId, item.cardId, item.bookmarkId, persistMeasuredAspect, reportIntrinsicHeight, cardWidth])

  if (!tweetId || errored) {
    return (
      <TextCard
        item={{ ...item, title: item.title || 'このツイートは表示できません' }}
        cardWidth={cardWidth}
        persistMeasuredAspect={persistMeasuredAspect}
        reportIntrinsicHeight={reportIntrinsicHeight}
        displayMode={displayMode}
      />
    )
  }

  return (
    <div ref={hostRef} className={styles.tweetCard} data-theme="dark">
      <Tweet id={tweetId} />
    </div>
  )
}
