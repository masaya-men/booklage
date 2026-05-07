import type { CardPosition } from './types'

/**
 * Bin-packing layout (skyline / Pinterest-style with free widths).
 *
 * Each card is given an explicit pixel width + height. The engine places
 * cards left-to-right, dropping each one into the leftmost position whose
 * vertical level is lowest (= "fills the lowest available shelf"). Cards
 * never overlap; gaps may appear at the right edge of a row when the next
 * card is too wide to fit there. The caller is free to feed any width per
 * card — the engine does not snap to a column grid.
 *
 * Time complexity: O(n × s²) where s = current skyline segment count.
 * In practice s stays bounded by 2× the visible "column" count, so for
 * boards under a few thousand cards this runs in well under a frame.
 */

export type SkylineCard = {
  readonly id: string
  readonly width: number
  readonly height: number
}

export type SkylineInput = {
  readonly cards: ReadonlyArray<SkylineCard>
  readonly containerWidth: number
  readonly gap: number
}

export type SkylineResult = {
  readonly positions: Readonly<Record<string, CardPosition>>
  readonly totalWidth: number
  readonly totalHeight: number
}

type Segment = { readonly x: number; readonly w: number; readonly y: number }

function maxYInRange(skyline: readonly Segment[], a: number, b: number): number {
  let max = 0
  for (const seg of skyline) {
    const segL = seg.x
    const segR = seg.x + seg.w
    if (segR <= a) continue
    if (segL >= b) break
    if (seg.y > max) max = seg.y
  }
  return max
}

function findBestPlacement(
  skyline: readonly Segment[],
  cardW: number,
  containerW: number,
): { readonly x: number; readonly y: number } | null {
  let bestX = -1
  let bestY = Infinity
  for (const seg of skyline) {
    const startX = seg.x
    if (startX + cardW > containerW) continue
    const y = maxYInRange(skyline, startX, startX + cardW)
    if (y < bestY || (y === bestY && (bestX === -1 || startX < bestX))) {
      bestY = y
      bestX = startX
    }
  }
  if (bestX === -1) return null
  return { x: bestX, y: bestY }
}

function updateSkyline(
  skyline: readonly Segment[],
  a: number,
  b: number,
  newY: number,
): Segment[] {
  if (a >= b) return skyline.slice()
  const result: Segment[] = []
  for (const seg of skyline) {
    const segL = seg.x
    const segR = seg.x + seg.w
    if (segR <= a || segL >= b) {
      result.push(seg)
    } else {
      if (segL < a) result.push({ x: segL, w: a - segL, y: seg.y })
      if (segR > b) result.push({ x: b, w: segR - b, y: seg.y })
    }
  }
  let i = 0
  while (i < result.length && result[i].x < a) i++
  result.splice(i, 0, { x: a, w: b - a, y: newY })
  return result
}

export function computeSkylineLayout(input: SkylineInput): SkylineResult {
  const { cards, containerWidth, gap } = input
  if (cards.length === 0 || containerWidth <= 0) {
    return {
      positions: {},
      totalWidth: Math.max(0, containerWidth),
      totalHeight: 0,
    }
  }

  let skyline: Segment[] = [{ x: 0, w: containerWidth, y: 0 }]
  const positions: Record<string, CardPosition> = {}
  let maxBottom = 0

  for (const card of cards) {
    const cardW = Math.max(1, Math.min(card.width, containerWidth))
    const cardH = Math.max(0, card.height)
    const placement = findBestPlacement(skyline, cardW, containerWidth)
    if (!placement) continue
    const { x, y } = placement
    positions[card.id] = { x, y, w: cardW, h: cardH }
    const occupiedRight = Math.min(x + cardW + gap, containerWidth)
    skyline = updateSkyline(skyline, x, occupiedRight, y + cardH + gap)
    const bottom = y + cardH
    if (bottom > maxBottom) maxBottom = bottom
  }

  return {
    positions,
    totalWidth: containerWidth,
    totalHeight: maxBottom,
  }
}
