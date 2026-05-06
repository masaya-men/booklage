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

  // Frame size matches the modal's canvas area (free) or the preset ratio
  // fitted into it. Either way the frame stays within the viewport so the
  // user always sees the entire collage without scrolling.
  const isFree = aspect === 'free'
  const presetSize = computeAspectFrameSize(aspect, viewport.width, viewport.height)
  const frameW = isFree ? viewport.width : presetSize.width
  const frameH = isFree ? viewport.height : presetSize.height
  const innerW = Math.max(60, frameW - 2 * pad)
  const innerH = Math.max(60, frameH - 2 * pad)

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

  // Shrink to fit so the user always sees every card without scrolling.
  // Cards stay left-aligned — no horizontal centering, no vertical centering
  // (centering caused the "cards bunched in the middle" UX bug previously).
  const fitScale =
    masonry.totalHeight > innerH && masonry.totalHeight > 0
      ? innerH / masonry.totalHeight
      : 1
  const didShrink = fitScale < 1

  const cards: ShareCard[] = []
  const cardIds: string[] = []
  for (const it of ordered) {
    const p = masonry.positions[it.bookmarkId]
    if (!p) continue
    const effectiveSize = sizeOverrides.get(it.bookmarkId) ?? it.sizePreset
    const x = p.x * fitScale + pad
    const y = p.y * fitScale + pad
    const w = p.w * fitScale
    const h = p.h * fitScale
    cards.push({
      u: truncate(it.url, SHARE_LIMITS.MAX_URL),
      t: truncate(it.title, SHARE_LIMITS.MAX_TITLE),
      d: it.description ? truncate(it.description, SHARE_LIMITS.MAX_DESCRIPTION) : undefined,
      th: it.thumbnail ? truncate(it.thumbnail, SHARE_LIMITS.MAX_URL) : undefined,
      ty: it.type,
      x: x / frameW,
      y: y / frameH,
      w: w / frameW,
      h: h / frameH,
      s: effectiveSize,
      a: it.aspectRatio > 0 ? it.aspectRatio : 1,
    })
    cardIds.push(it.bookmarkId)
  }

  return {
    cards,
    cardIds,
    frameSize: { width: frameW, height: frameH },
    didShrink,
    shrinkScale: fitScale,
  }
}
