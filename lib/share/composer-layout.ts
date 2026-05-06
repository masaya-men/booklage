// lib/share/composer-layout.ts
import { computeColumnMasonry } from '@/lib/board/column-masonry'
import { COLUMN_MASONRY, BOARD_INNER, SIZE_PRESET_SPAN } from '@/lib/board/constants'
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

export function composeShareLayout(input: ComposerLayoutInput): ComposerLayoutResult {
  const { items, order, sizeOverrides, aspect, viewport } = input
  const frameSize = computeAspectFrameSize(aspect, viewport.width, viewport.height)

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

  const gap = COLUMN_MASONRY.GAP_PX
  const pad = BOARD_INNER.SIDE_PADDING_PX
  const innerW = Math.max(60, frameSize.width - 2 * pad)
  const innerH = Math.max(60, frameSize.height - 2 * pad)

  const masonryCards = ordered.map((it) => ({
    id: it.bookmarkId,
    aspectRatio: it.aspectRatio > 0 ? it.aspectRatio : 1,
    columnSpan: SIZE_PRESET_SPAN[sizeOverrides.get(it.bookmarkId) ?? it.sizePreset],
  }))
  const masonry = computeColumnMasonry({
    cards: masonryCards,
    containerWidth: innerW,
    gap,
    targetColumnUnit: COLUMN_MASONRY.TARGET_COLUMN_UNIT_PX,
  })

  const px: Record<string, { x: number; y: number; w: number; h: number }> = {}
  for (const id of Object.keys(masonry.positions)) {
    const p = masonry.positions[id]
    px[id] = { x: p.x, y: p.y, w: p.w, h: p.h }
  }

  let usedMaxX = 0
  for (const id of Object.keys(px)) {
    const right = px[id].x + px[id].w
    if (right > usedMaxX) usedMaxX = right
  }
  const scaleByHeight = masonry.totalHeight > 0 ? innerH / masonry.totalHeight : 1
  const scaleByWidth = usedMaxX > 0 ? innerW / usedMaxX : 1
  // Shrink-only — never upscale, board-equivalent behavior.
  const fitScale = Math.min(1, scaleByHeight, scaleByWidth)
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

  const scaledTotalHeight = masonry.totalHeight * fitScale
  const verticalOffset = pad + Math.max(0, (innerH - scaledTotalHeight) / 2)
  const postFitUsedWidth = usedMaxX * fitScale
  const horizontalOffset = pad + Math.max(0, (innerW - postFitUsedWidth) / 2)
  for (const id of Object.keys(px)) {
    px[id].x += horizontalOffset
    px[id].y += verticalOffset
  }

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
      a: it.aspectRatio > 0 ? it.aspectRatio : 1,
    })
    cardIds.push(it.bookmarkId)
  }

  return { cards, cardIds, frameSize, didShrink, shrinkScale }
}
