// lib/share/relay-layout.ts
import { computeColumnMasonry } from '@/lib/board/column-masonry'
import { COLUMN_MASONRY, BOARD_INNER, SIZE_PRESET_SPAN } from '@/lib/board/constants'
import type { ShareCard } from './types'

export type RelayInput = {
  readonly cards: ReadonlyArray<ShareCard>
  readonly viewport: { readonly width: number; readonly height: number }
}

export type RelayResult = {
  readonly cards: readonly ShareCard[]
  readonly frameSize: { readonly width: number; readonly height: number }
}

/**
 * Re-run the board's column masonry on the receiver side using each card's
 * stored aspectRatio (a) + size preset (s), so the shared collage fills the
 * receiver's viewport width exactly the way the board itself does.
 *
 * If any card lacks `a` (older URLs predating the field), we keep the
 * encoded x/y/w/h positions and just hand them to the receiver viewport
 * unchanged — backward compatibility for already-shared links.
 */
export function relayShareLayout(input: RelayInput): RelayResult {
  const { cards, viewport } = input

  if (cards.length === 0) {
    return { cards, frameSize: { width: viewport.width, height: viewport.height } }
  }

  const allHaveA = cards.every((c) => typeof c.a === 'number' && c.a > 0)
  if (!allHaveA) {
    return { cards, frameSize: { width: viewport.width, height: viewport.height } }
  }

  const gap = COLUMN_MASONRY.GAP_PX
  const pad = BOARD_INNER.SIDE_PADDING_PX
  const innerW = Math.max(60, viewport.width - 2 * pad)

  const masonryCards = cards.map((c, i) => ({
    id: String(i),
    aspectRatio: (c.a ?? 1) > 0 ? (c.a ?? 1) : 1,
    columnSpan: SIZE_PRESET_SPAN[c.s],
  }))

  const masonry = computeColumnMasonry({
    cards: masonryCards,
    containerWidth: innerW,
    gap,
    targetColumnUnit: COLUMN_MASONRY.TARGET_COLUMN_UNIT_PX,
  })

  const frameW = viewport.width
  const frameH = masonry.totalHeight + 2 * pad

  const out: ShareCard[] = cards.map((c, i) => {
    const p = masonry.positions[String(i)]
    if (!p) return c
    return {
      ...c,
      x: (p.x + pad) / frameW,
      y: (p.y + pad) / frameH,
      w: p.w / frameW,
      h: p.h / frameH,
    }
  })

  return {
    cards: out,
    frameSize: { width: frameW, height: frameH },
  }
}
