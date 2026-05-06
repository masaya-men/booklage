// lib/share/composer-layout.ts
import { computeColumnMasonry } from '@/lib/board/column-masonry'
import { SIZE_PRESET_SPAN } from '@/lib/board/constants'
import { computeAspectFrameSize } from './aspect-presets'
import { SHARE_LIMITS } from './types'
import type { ShareAspect, ShareCard, ShareSize } from './types'
import { truncate } from './board-to-cards'

export type ComposerItem = {
  readonly bookmarkId: string
  readonly url: string
  readonly title: string
  readonly description?: string
  readonly thumbnail: string
  readonly type: ShareCard['ty']
  readonly sizePreset: ShareSize
  readonly aspectRatio: number
}

export type ComposerLayoutInput = {
  readonly items: ReadonlyArray<ComposerItem>
  readonly order: ReadonlyArray<string>
  readonly sizeOverrides: ReadonlyMap<string, ShareSize>
  readonly aspect: ShareAspect
  readonly viewport: { readonly width: number; readonly height: number }
}

export type ComposerLayoutResult = {
  readonly cards: readonly ShareCard[]
  readonly cardIds: readonly string[]
  readonly frameSize: { readonly width: number; readonly height: number }
  readonly didShrink: boolean
  readonly shrinkScale: number
}

export const COMPOSER_MASONRY = {
  GAP_PX: 16,
  TARGET_COLUMN_UNIT_PX: 140,
} as const

/** Outer padding equals the inner gap so the rhythm inside and outside the
 *  card cluster reads as the same breathing room — matches the board's
 *  side-padding-equals-half-gap convention scaled up to a full gap so the
 *  share frame doesn't feel cramped. */
const OUTER_PADDING = COMPOSER_MASONRY.GAP_PX

/** xfnv1a-style fold: deterministic 0..1 hash of a string. Used to assign
 *  size buckets so the same bookmark always lands in the same bucket across
 *  re-renders and across encode/decode cycles. */
function seededFraction(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  h ^= h >>> 13
  h = Math.imul(h, 2654435761)
  h ^= h >>> 16
  return ((h >>> 0) % 100000) / 100000
}

/** S 20% / M 50% / L 30% — biased toward big so the frame fills with
 *  Pinterest-style mosaic variety even when every source card was M. */
function pickRandomSize(seed: string): ShareSize {
  const f = seededFraction(seed)
  if (f < 0.2) return 'S'
  if (f < 0.7) return 'M'
  return 'L'
}

export function composeShareLayout(input: ComposerLayoutInput): ComposerLayoutResult {
  const { items, order, sizeOverrides, aspect, viewport } = input
  let frameSize = computeAspectFrameSize(aspect, viewport.width, viewport.height)

  // Build ordered items: order first (filtering missing), then any items missing from order at the tail
  const orderSet = new Set(order)
  const itemMap = new Map(items.map((it) => [it.bookmarkId, it] as const))
  const ordered: ComposerItem[] = []
  for (const id of order) {
    const it = itemMap.get(id)
    if (it) ordered.push(it)
  }
  for (const it of items) {
    if (!orderSet.has(it.bookmarkId)) ordered.push(it)
  }

  // Resolve effective sizes: explicit user override wins, otherwise the
  // seeded-random bucket. The board's own sizePreset is intentionally
  // ignored — share is a fresh composition, not a transcription.
  const effectiveSize = (it: ComposerItem): ShareSize =>
    sizeOverrides.get(it.bookmarkId) ?? pickRandomSize(it.bookmarkId)

  const masonryCards = ordered.map((it) => ({
    id: it.bookmarkId,
    aspectRatio: it.aspectRatio > 0 ? it.aspectRatio : 1,
    columnSpan: SIZE_PRESET_SPAN[effectiveSize(it)],
  }))

  // 'free' preset: derive frame aspect from the card-set average so it
  // visibly differs from the fixed presets and tracks the bookmark mix.
  if (aspect === 'free' && masonryCards.length > 0) {
    const avgAR = masonryCards.reduce(
      (s, c) => s + Math.max(0.4, c.aspectRatio),
      0,
    ) / masonryCards.length
    const clampedAR = Math.max(0.7, Math.min(1.9, avgAR))
    const baseWidth = 1080
    frameSize = { width: baseWidth, height: Math.round(baseWidth / clampedAR) }
  }

  const innerW = Math.max(60, frameSize.width - 2 * OUTER_PADDING)
  const innerH = Math.max(60, frameSize.height - 2 * OUTER_PADDING)
  const gap = COMPOSER_MASONRY.GAP_PX

  // Bisect over column counts 2..6 and pick the one whose pre-clamp fitScale
  // is largest (= layout closest to filling the inner area without aggressive
  // shrink). This avoids the previous bug where a single fixed column unit
  // would leave the rightmost column empty for span-2-only layouts.
  let best: {
    masonry: ReturnType<typeof computeColumnMasonry>
    score: number
  } | null = null
  for (let cc = 2; cc <= 6; cc++) {
    const unit = (innerW - (cc - 1) * gap) / cc
    if (unit < 60) continue
    const m = computeColumnMasonry({
      cards: masonryCards,
      containerWidth: innerW,
      gap,
      targetColumnUnit: unit,
    })
    let usedMaxX = 0
    for (const id of Object.keys(m.positions)) {
      const r = m.positions[id].x + m.positions[id].w
      if (r > usedMaxX) usedMaxX = r
    }
    const scaleByH = m.totalHeight > 0 ? innerH / m.totalHeight : 1
    const scaleByW = usedMaxX > 0 ? innerW / usedMaxX : 1
    // Cap upscale at 1.5 in scoring so a single big card doesn't dominate.
    const score = Math.min(Math.min(scaleByH, scaleByW), 1.5)
    if (best === null || score > best.score) {
      best = { masonry: m, score }
    }
  }

  const masonry = best?.masonry ?? computeColumnMasonry({
    cards: masonryCards,
    containerWidth: innerW,
    gap,
    targetColumnUnit: COMPOSER_MASONRY.TARGET_COLUMN_UNIT_PX,
  })

  // Pixel-space positions (will scale + center, then normalize)
  const px: Record<string, { x: number; y: number; w: number; h: number }> = {}
  for (const id of Object.keys(masonry.positions)) {
    const p = masonry.positions[id]
    px[id] = { x: p.x, y: p.y, w: p.w, h: p.h }
  }

  // Auto-fit to the inner area. MAX_UPSCALE caps the rare 1-card-balloon case.
  const MAX_UPSCALE = 2.5
  let usedMaxX = 0
  for (const id of Object.keys(px)) {
    const right = px[id].x + px[id].w
    if (right > usedMaxX) usedMaxX = right
  }
  const scaleByHeight = masonry.totalHeight > 0 ? innerH / masonry.totalHeight : 1
  const scaleByWidth = usedMaxX > 0 ? innerW / usedMaxX : 1
  const fitScale = Math.min(MAX_UPSCALE, scaleByHeight, scaleByWidth)
  const didShrink = fitScale < 1
  const shrinkScale = fitScale
  if (fitScale !== 1) {
    for (const id of Object.keys(px)) {
      px[id].x *= fitScale
      px[id].y *= fitScale
      px[id].w *= fitScale
      px[id].h *= fitScale
    }
  }

  // Center within the inner area, then offset by OUTER_PADDING so the cluster
  // sits with a `gap` of breathing room on all four sides — same rhythm
  // inside and outside the card cluster.
  const scaledTotalHeight = masonry.totalHeight * fitScale
  const verticalOffset = OUTER_PADDING + Math.max(0, (innerH - scaledTotalHeight) / 2)
  const postFitUsedWidth = usedMaxX * fitScale
  const horizontalOffset = OUTER_PADDING + Math.max(0, (innerW - postFitUsedWidth) / 2)
  for (const id of Object.keys(px)) {
    px[id].x += horizontalOffset
    px[id].y += verticalOffset
  }

  // Build ShareCard[] and cardIds[] in `ordered` sequence with normalized coords
  const cards: ShareCard[] = []
  const cardIds: string[] = []
  for (const it of ordered) {
    const p = px[it.bookmarkId]
    const size = effectiveSize(it)
    cards.push({
      u: truncate(it.url, SHARE_LIMITS.MAX_URL),
      t: truncate(it.title, SHARE_LIMITS.MAX_TITLE),
      d: it.description ? truncate(it.description, SHARE_LIMITS.MAX_DESCRIPTION) : undefined,
      th: it.thumbnail ? truncate(it.thumbnail, SHARE_LIMITS.MAX_URL) : undefined,
      ty: it.type,
      x: p.x / frameSize.width,
      y: p.y / frameSize.height,
      w: p.w / frameSize.width,
      h: p.h / frameSize.height,
      s: size,
    })
    cardIds.push(it.bookmarkId)
  }

  return { cards, cardIds, frameSize, didShrink, shrinkScale }
}
