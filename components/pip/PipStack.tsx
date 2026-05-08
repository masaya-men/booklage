'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react'
import { PipCard } from './PipCard'
import { LightboxNavMeter } from '@/components/board/LightboxNavMeter'
import styles from './PipStack.module.css'

export interface PipStackCard {
  readonly id: string
  readonly title: string
  readonly thumbnail: string
  readonly favicon: string
  /** Width / height ratio of the card. Defaults to 1 (square) when omitted. */
  readonly aspectRatio?: number
}

export interface PipStackProps {
  readonly cards: ReadonlyArray<PipStackCard>
  readonly onCardClick: (cardId: string) => void
  /** Inline style applied to the .stage root. Used by the /pip-tune playground
   *  to override CSS custom properties live; production PiP omits it. */
  readonly stageStyle?: CSSProperties
}

export function PipStack({ cards, onCardClick, stageStyle }: PipStackProps): ReactElement {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [activeIdx, setActiveIdx] = useState<number>(0)

  // Flag that's true while scrollLeft is being driven programmatically by
  // any of our animations (wheel flip, click-to-centre, meter jump, new-
  // bookmark auto-scroll). The native `scroll` event fires on every step
  // of those animations; we use this flag to skip recomputeActive while it
  // runs so React doesn't re-render through every intermediate card.
  const animatingRef = useRef<boolean>(false)
  const animRafRef = useRef<number>(0)

  /** Centre slot `idx` inside the scrollport with a custom rAF + ease-out
   *  quart slide. We don't use the browser's native smooth-scroll because
   *  its duration and curve are not under our control, and on Windows
   *  Chrome it sometimes fights with scroll-snap-type. The single ease /
   *  duration here (matching the wheel flip) keeps every navigation —
   *  click, meter scrub, auto-scroll on new bookmark — visually unified. */
  const scrollToIdx = useCallback((idx: number, behavior: 'auto' | 'smooth' = 'smooth'): void => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const slot = scroller.querySelector(`[data-slot-idx="${idx}"]`) as HTMLElement | null
    if (!slot) return
    const target = slot.offsetLeft + slot.offsetWidth / 2 - scroller.clientWidth / 2
    if (typeof scroller.scrollTo !== 'function') {
      // jsdom test environment.
      scroller.scrollLeft = target
      return
    }
    if (behavior === 'auto') {
      scroller.scrollLeft = target
      return
    }
    // Cancel any in-flight animation first.
    if (animRafRef.current !== 0) {
      cancelAnimationFrame(animRafRef.current)
      animRafRef.current = 0
    }
    const start = scroller.scrollLeft
    const delta = target - start
    if (delta === 0) return
    const DUR = 700
    const t0 = performance.now()
    animatingRef.current = true
    const prevSnap = scroller.style.scrollSnapType
    scroller.style.scrollSnapType = 'none'
    const step = (): void => {
      const elapsed = performance.now() - t0
      const p = Math.min(elapsed / DUR, 1)
      const eased = 1 - Math.pow(1 - p, 4)
      scroller.scrollLeft = start + delta * eased
      if (p < 1) {
        animRafRef.current = requestAnimationFrame(step)
      } else {
        animRafRef.current = 0
        scroller.style.scrollSnapType = prevSnap
        animatingRef.current = false
      }
    }
    animRafRef.current = requestAnimationFrame(step)
  }, [])

  /** Pick the slot whose centre is closest to the scrollport centre. */
  const recomputeActive = useCallback((): void => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const viewportCenter = scroller.scrollLeft + scroller.clientWidth / 2
    const slots = scroller.querySelectorAll<HTMLElement>('[data-slot-idx]')
    let bestIdx = 0
    let bestDist = Infinity
    slots.forEach((el) => {
      const idx = Number(el.getAttribute('data-slot-idx'))
      const c = el.offsetLeft + el.offsetWidth / 2
      const d = Math.abs(c - viewportCenter)
      if (d < bestDist) {
        bestDist = d
        bestIdx = idx
      }
    })
    setActiveIdx(bestIdx)
  }, [])

  // Centre the newest card whenever the deck length grows. PipCompanion
  // appends new bookmarks chronologically (1, 2, 3, ...), so the newest
  // is always the last item — jumping to length-1 lands the user on every
  // just-saved bookmark.
  const prevLenRef = useRef<number>(0)
  useLayoutEffect(() => {
    const len = cards.length
    const prev = prevLenRef.current
    prevLenRef.current = len
    if (len === 0) return
    if (len > prev) {
      // Both the first card and every subsequent append slide in from
      // the right with the same ease — at mount scrollLeft is 0, the
      // padding-inline 50% leaves the card sitting in the right half of
      // the scrollport, and animating to its centre produces the same
      // "card glides in from the right" feel as later additions.
      scrollToIdx(len - 1, 'smooth')
      setActiveIdx(len - 1)
    }
  }, [cards.length, scrollToIdx])

  const handleScroll = useCallback((): void => {
    // Suppress active-index recomputation while a programmatic animation
    // is driving scrollLeft — otherwise activeIdx (and the CSS .active
    // class with it) ticks through every intermediate card 60×/sec and
    // produces visible flicker through the carousel during the slide.
    if (animatingRef.current) return
    recomputeActive()
  }, [recomputeActive])

  // Recompute active on resize too — the scroller width changes affect which
  // slot is "centred" without scroll movement.
  useEffect(() => {
    const onResize = (): void => recomputeActive()
    window.addEventListener('resize', onResize)
    return (): void => window.removeEventListener('resize', onResize)
  }, [recomputeActive])

  // Mouse-wheel = one notch advances exactly one card with a Lightbox-
  // style smooth slide. We never let scroll halt mid-card: a wheel event
  // crosses an accumulator threshold, picks a direction, and animates
  // scrollLeft to the next slot's exact centre over WHEEL_DURATION_MS
  // using ease-out cubic. While the slide runs, further wheel events are
  // queued (advance by ±1 again on completion) so a steady scroll feels
  // continuous without flickering between cards.
  const activeIdxRef = useRef<number>(activeIdx)
  useEffect(() => { activeIdxRef.current = activeIdx }, [activeIdx])
  const cardsLenRef = useRef<number>(cards.length)
  useEffect(() => { cardsLenRef.current = cards.length }, [cards.length])

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return

    const WHEEL_THRESHOLD = 24      // |Σ deltaY| needed to flip a card
    // Stack-up cap: pinned to ±2 so a fast multi-tick scroll still feels
    // alive (next-flip starts as soon as current one ends), without piling
    // up dozens of pending flips that take ages to drain.
    const QUEUE_CAP = 2

    let accumDeltaY = 0
    let queuedDelta = 0

    const flipOnce = (dir: number): void => {
      const cur = activeIdxRef.current
      const next = Math.max(0, Math.min(cardsLenRef.current - 1, cur + dir))
      if (next === cur) {
        queuedDelta = 0
        accumDeltaY = 0
        return
      }
      activeIdxRef.current = next
      setActiveIdx(next)
      // scrollToIdx handles its own animatingRef + scroll-snap suppression
      // and runs the same ease/duration the click + meter-jump paths use,
      // so every navigation feels visually unified — a clean drum-reel
      // glide that comes to rest at the new card's exact centre.
      scrollToIdx(next, 'smooth')
    }

    const drainQueueWhenIdle = (): void => {
      if (animatingRef.current) {
        // Still sliding — re-check on the next frame.
        rafId = requestAnimationFrame(drainQueueWhenIdle)
        return
      }
      rafId = 0
      if (queuedDelta === 0) return
      const d = queuedDelta > 0 ? 1 : -1
      queuedDelta -= d
      flipOnce(d)
      // After flipOnce kicks off a new animation, wait for it to end
      // before draining further.
      rafId = requestAnimationFrame(drainQueueWhenIdle)
    }

    let rafId = 0

    const onWheel = (e: WheelEvent): void => {
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return
      e.preventDefault()

      accumDeltaY += e.deltaY
      if (Math.abs(accumDeltaY) < WHEEL_THRESHOLD) return
      const dir = accumDeltaY > 0 ? 1 : -1
      accumDeltaY = 0

      if (animatingRef.current) {
        // Stack the request and let the rAF watcher fire it the moment
        // the current slide completes. Cap so trackpad inertia doesn't
        // flood the queue.
        queuedDelta = Math.max(-QUEUE_CAP, Math.min(QUEUE_CAP, queuedDelta + dir))
        if (rafId === 0) rafId = requestAnimationFrame(drainQueueWhenIdle)
        return
      }
      flipOnce(dir)
    }

    scroller.addEventListener('wheel', onWheel, { passive: false })
    return (): void => {
      scroller.removeEventListener('wheel', onWheel)
      if (rafId !== 0) cancelAnimationFrame(rafId)
    }
  }, [scrollToIdx])

  const handleSlotClick = useCallback((idx: number, cardId: string) => () => {
    if (idx === activeIdx) {
      onCardClick(cardId)
    } else {
      scrollToIdx(idx, 'smooth')
    }
  }, [activeIdx, onCardClick, scrollToIdx])

  const handleJump = useCallback((idx: number) => {
    scrollToIdx(idx, 'smooth')
    setActiveIdx(idx)
  }, [scrollToIdx])

  const activeCard = cards[activeIdx]

  return (
    <div
      className={styles.stage}
      data-testid="pip-stack"
      data-active-idx={activeIdx}
      style={stageStyle}
    >
      <div
        className={styles.scroller}
        ref={scrollerRef}
        onScroll={handleScroll}
      >
        {cards.map((card, idx) => (
          <div
            key={card.id}
            data-slot-idx={idx}
            className={`${styles.slot} ${idx === activeIdx ? styles.active : ''}`.trim()}
            onClick={handleSlotClick(idx, card.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSlotClick(idx, card.id)() }}
          >
            <PipCard {...card} />
          </div>
        ))}
      </div>
      {cards.length > 0 && (
        <div className={styles.meter}>
          <LightboxNavMeter
            current={activeIdx}
            total={cards.length}
            cardKey={activeCard?.id ?? ''}
            onJump={handleJump}
            alwaysShow
          />
        </div>
      )}
    </div>
  )
}
