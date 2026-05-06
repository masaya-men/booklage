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
  /** bookmarkIds aligned 1-to-1 with `cards`. Required by ShareFrame
   *  edit-mode to map cards back to source bookmarks for drag/delete. */
  readonly cardIds: readonly string[]
  readonly frameSize: { readonly width: number; readonly height: number }
  readonly didShrink: boolean
  readonly shrinkScale: number
}

/**
 * Masonry tuning for the share frame. Smaller than `COLUMN_MASONRY` (board)
 * because the frame is narrow (~1080px) — we want more columns and tighter
 * gaps so the composition reads as a coherent collage rather than a sparse
 * board excerpt.
 */
export const COMPOSER_MASONRY = {
  GAP_PX: 8,
  TARGET_COLUMN_UNIT_PX: 140,
} as const

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

  // Run column-masonry sized to the frame width
  const masonryCards = ordered.map((it) => ({
    id: it.bookmarkId,
    aspectRatio: it.aspectRatio > 0 ? it.aspectRatio : 1,
    columnSpan: SIZE_PRESET_SPAN[sizeOverrides.get(it.bookmarkId) ?? it.sizePreset],
  }))

  // For the 'free' preset, derive frame aspect from the card-set average so
  // it visibly differs from the fixed presets (1:1 / 9:16 / 16:9). A bag of
  // tall reels gets a tall frame, horizontal thumbs get a wide frame, mixed
  // sets land somewhere in between. Clamped so a single extreme card doesn't
  // produce an absurd frame.
  if (aspect === 'free' && masonryCards.length > 0) {
    const avgAR = masonryCards.reduce(
      (s, c) => s + Math.max(0.4, c.aspectRatio),
      0,
    ) / masonryCards.length
    const clampedAR = Math.max(0.7, Math.min(1.9, avgAR))
    const baseWidth = 1080
    frameSize = { width: baseWidth, height: Math.round(baseWidth / clampedAR) }
  }

  // Dynamic column unit: pick a unit so the cards' total area roughly equals
  // frame_area × TARGET_FILL. This makes the initial composition fill the
  // frame instead of leaving big top/bottom gutters. The user still controls
  // density via S/M/L toggles afterward.
  //
  // Derivation: each card's rendered area ≈ (span × unit)² / aspectRatio.
  // Sum over cards and solve for unit so Σ ≈ frame_area × TARGET_FILL.
  const TARGET_FILL = 0.95
  const totalSpanArea = masonryCards.reduce(
    (acc, c) => acc + (c.columnSpan * c.columnSpan) / Math.max(0.5, c.aspectRatio),
    0,
  )
  const dynamicUnit = totalSpanArea > 0
    ? Math.sqrt((frameSize.width * frameSize.height * TARGET_FILL) / totalSpanArea)
    : COMPOSER_MASONRY.TARGET_COLUMN_UNIT_PX
  // Clamp so 1-2 card layouts don't balloon and 50+ card layouts stay legible.
  const clampedUnit = Math.max(80, Math.min(420, dynamicUnit))

  const masonry = computeColumnMasonry({
    cards: masonryCards,
    containerWidth: frameSize.width,
    gap: COMPOSER_MASONRY.GAP_PX,
    targetColumnUnit: clampedUnit,
  })

  // Pixel-space positions (will scale + center, then normalize)
  const px: Record<string, { x: number; y: number; w: number; h: number }> = {}
  for (const id of Object.keys(masonry.positions)) {
    const p = masonry.positions[id]
    px[id] = { x: p.x, y: p.y, w: p.w, h: p.h }
  }

  // Auto-fit: scale either DOWN (when masonry overflows) or UP (when it
  // underfills) so cards use the full canvas. Mirrors the prior shrink-only
  // path but adds upscaling — without this, few-card layouts hugged the
  // middle band of the frame and left huge top/bottom gutters, which read
  // as broken on the recipient side.
  //
  // We scale by the more-constraining axis: fit within frame width AND
  // frame height. MAX_UPSCALE caps growth at 2.5× so 1-2 card layouts
  // don't balloon. Beyond cap, we accept some gutter and center.
  const MAX_UPSCALE = 2.5
  let usedMaxX = 0
  for (const id of Object.keys(px)) {
    const right = px[id].x + px[id].w
    if (right > usedMaxX) usedMaxX = right
  }
  const scaleByHeight = masonry.totalHeight > 0
    ? frameSize.height / masonry.totalHeight
    : 1
  const scaleByWidth = usedMaxX > 0
    ? frameSize.width / usedMaxX
    : 1
  const fitScale = Math.min(MAX_UPSCALE, scaleByHeight, scaleByWidth)
  // didShrink remains true only for the actual shrink case so existing
  // callers/tests that read this flag keep their semantics.
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

  // Vertical centering: if scaled total height < frame height (only
  // happens when MAX_UPSCALE clamped us short), push down by half the slack.
  const scaledTotalHeight = masonry.totalHeight * fitScale
  const verticalOffset = Math.max(0, (frameSize.height - scaledTotalHeight) / 2)
  if (verticalOffset > 0) {
    for (const id of Object.keys(px)) {
      px[id].y += verticalOffset
    }
  }

  // Horizontal centering: column-masonry packs from x=0 leftward. After
  // auto-fit, the packed area may still be narrower than the frame
  // (e.g. when MAX_UPSCALE clamped width-fit). Push right by half the
  // slack so the composition reads as intentional rather than left-pinned.
  let usedWidth = 0
  for (const id of Object.keys(px)) {
    const right = px[id].x + px[id].w
    if (right > usedWidth) usedWidth = right
  }
  const horizontalOffset = Math.max(0, (frameSize.width - usedWidth) / 2)
  if (horizontalOffset > 0) {
    for (const id of Object.keys(px)) {
      px[id].x += horizontalOffset
    }
  }

  // Build ShareCard[] and cardIds[] in `ordered` sequence with normalized coords
  const cards: ShareCard[] = []
  const cardIds: string[] = []
  for (const it of ordered) {
    const p = px[it.bookmarkId]
    const effectiveSize = sizeOverrides.get(it.bookmarkId) ?? it.sizePreset
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
      s: effectiveSize,
    })
    cardIds.push(it.bookmarkId)
  }

  return { cards, cardIds, frameSize, didShrink, shrinkScale }
}
