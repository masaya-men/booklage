// lib/share/composer-layout.ts
import { computeColumnMasonry, type MasonryCard, type MasonryResult } from '@/lib/board/column-masonry'
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

export type ShareMode = 'layout' | 'preview'

export type ComposerLayoutInput = {
  readonly items: ReadonlyArray<ComposerItem>
  readonly order: ReadonlyArray<string>
  readonly sizeOverrides: ReadonlyMap<string, ShareSize>
  readonly aspect: ShareAspect
  readonly viewport: { readonly width: number; readonly height: number }
  readonly mode: ShareMode
}

export type ComposerLayoutResult = {
  readonly cards: readonly ShareCard[]
  readonly cardIds: readonly string[]
  readonly frameSize: { readonly width: number; readonly height: number }
  readonly didShrink: boolean
  readonly shrinkScale: number
}

/**
 * Bisect the column unit so the masonry totalHeight fits inside `innerH`.
 * Smaller column unit → more columns → smaller individual cards → shorter
 * total height. Used for preset aspects where the frame ratio is fixed and
 * we need cards to fit into a given height without overflowing.
 */
function findFitMasonry(
  masonryCards: readonly MasonryCard[],
  innerW: number,
  innerH: number,
  gap: number,
  baseUnit: number,
): MasonryResult {
  const initial = computeColumnMasonry({
    cards: masonryCards,
    containerWidth: innerW,
    gap,
    targetColumnUnit: baseUnit,
  })
  if (initial.totalHeight <= innerH) return initial

  let lo = 40
  let hi = baseUnit
  let best = initial
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2
    const test = computeColumnMasonry({
      cards: masonryCards,
      containerWidth: innerW,
      gap,
      targetColumnUnit: mid,
    })
    if (test.totalHeight <= innerH) {
      best = test
      lo = mid
    } else {
      hi = mid
    }
  }
  return best
}

export function composeShareLayout(input: ComposerLayoutInput): ComposerLayoutResult {
  const { items, order, sizeOverrides, aspect, viewport, mode } = input

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

  const isFree = aspect === 'free'
  const presetSize = computeAspectFrameSize(aspect, viewport.width, viewport.height)
  const logicalW = isFree ? viewport.width : presetSize.width
  const innerW = Math.max(60, logicalW - 2 * pad)

  const masonryCards: MasonryCard[] = ordered.map((it) => ({
    id: it.bookmarkId,
    aspectRatio: it.aspectRatio > 0 ? it.aspectRatio : 1,
    columnSpan: SIZE_PRESET_SPAN[sizeOverrides.get(it.bookmarkId) ?? it.sizePreset],
  }))

  let masonry: MasonryResult
  let logicalH: number

  if (isFree) {
    // Free: board-equivalent. Use the standard column unit and let height
    // grow naturally with content. The whole frame will be scaled down to
    // the viewport in the final fitScale step.
    masonry = computeColumnMasonry({
      cards: masonryCards,
      containerWidth: innerW,
      gap,
      targetColumnUnit: COLUMN_MASONRY.TARGET_COLUMN_UNIT_PX,
    })
    logicalH = masonry.totalHeight + 2 * pad
  } else {
    // Preset: keep the preset ratio strictly. Shrink the column unit until
    // all cards fit inside the preset height. This way the frame stays
    // exactly preset-shaped and every card is visible.
    const innerH = Math.max(60, presetSize.height - 2 * pad)
    masonry = findFitMasonry(masonryCards, innerW, innerH, gap, COLUMN_MASONRY.TARGET_COLUMN_UNIT_PX)
    logicalH = presetSize.height
  }

  // Mode branch:
  //   layout  — fit-to-viewport overview: the whole frame scales down so
  //             the user sees the full board at all times (existing behavior).
  //   preview — natural size: free aspect grows taller than the viewport
  //             (caller scrolls); preset aspects fill the viewport with no
  //             chrome subtraction because chrome auto-hides.
  // Uniform scale on both axes cancels out in the 0..1 per-card normalization,
  // so the encoded share data is identical regardless of mode.
  const fitScale = mode === 'preview'
    ? 1
    : Math.min(
        viewport.width / logicalW,
        viewport.height / logicalH,
        1,
      )
  const frameW = logicalW * fitScale
  const frameH = logicalH * fitScale
  const didShrink = fitScale < 1

  const cards: ShareCard[] = []
  const cardIds: string[] = []
  for (const it of ordered) {
    const p = masonry.positions[it.bookmarkId]
    if (!p) continue
    const effectiveSize = sizeOverrides.get(it.bookmarkId) ?? it.sizePreset
    cards.push({
      u: truncate(it.url, SHARE_LIMITS.MAX_URL),
      t: truncate(it.title, SHARE_LIMITS.MAX_TITLE),
      d: it.description ? truncate(it.description, SHARE_LIMITS.MAX_DESCRIPTION) : undefined,
      th: it.thumbnail ? truncate(it.thumbnail, SHARE_LIMITS.MAX_URL) : undefined,
      ty: it.type,
      x: (p.x + pad) / logicalW,
      y: (p.y + pad) / logicalH,
      w: p.w / logicalW,
      h: p.h / logicalH,
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
