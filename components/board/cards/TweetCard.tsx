'use client'

import { Tweet } from 'react-tweet'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { BoardItem } from '@/lib/storage/use-board-data'
import { extractTweetId } from '@/lib/utils/url'
import { TextCard } from './TextCard'
import styles from './TweetCard.module.css'

type Props = {
  readonly item: BoardItem
  readonly persistMeasuredAspect?: (cardId: string, aspectRatio: number) => Promise<void>
  readonly cardWidth?: number
}

// Persist when measured article height differs from the height implied by
// the current aspectRatio by more than this many pixels. Avoids write loops
// from sub-pixel fluctuation while still catching real layout changes
// (image/video loading, quoted tweet expansion).
const MEASUREMENT_EPSILON_PX = 4

export function TweetCard({ item, persistMeasuredAspect, cardWidth = 280 }: Props): ReactNode {
  const tweetId = extractTweetId(item.url)
  const hostRef = useRef<HTMLDivElement>(null)
  const [errored] = useState(false)

  // Measure the total rendered height of everything react-tweet emits, including
  // <article> AND its siblings like the "Read N replies" link that react-tweet
  // appends below article. Measuring article alone clipped that footer.
  //
  // Strategy: scan host.children, take the max of (offsetTop + offsetHeight).
  // Observe every descendant for resize (images/videos loading), plus a
  // MutationObserver to re-attach if react-tweet swaps subtrees.
  useEffect(() => {
    const host = hostRef.current
    if (!host || !tweetId || !persistMeasuredAspect) return

    let lastReportedH = 0
    const observedNodes = new Set<Element>()
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
      void persistMeasuredAspect(item.cardId, cardWidth / maxBottom)
    }

    const observeDeep = (root: Element): void => {
      if (observedNodes.has(root)) return
      observedNodes.add(root)
      ro.observe(root)
      // Observe direct children too — text re-wraps and image loads trigger
      // size changes at the leaf level.
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
      let node = walker.nextNode() as Element | null
      while (node) {
        if (!observedNodes.has(node)) {
          observedNodes.add(node)
          ro.observe(node)
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

    return (): void => {
      mo.disconnect()
      ro.disconnect()
      observedNodes.clear()
    }
  }, [tweetId, item.cardId, persistMeasuredAspect, cardWidth])

  if (!tweetId || errored) {
    return (
      <TextCard
        item={{ ...item, title: item.title || 'このツイートは表示できません' }}
        cardWidth={cardWidth}
        persistMeasuredAspect={persistMeasuredAspect}
      />
    )
  }

  return (
    <div ref={hostRef} className={styles.tweetCard} data-theme="light">
      <Tweet id={tweetId} />
    </div>
  )
}
