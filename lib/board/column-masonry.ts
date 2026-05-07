import type { CardPosition } from './types'

export type MasonryCard = {
  readonly id: string
  readonly aspectRatio: number
  /**
   * Legacy: 1 = S, 2 = M, 3 = L. Kept so existing call sites compile.
   * Will be ignored if `targetWidth` is provided.
   */
  readonly columnSpan: number
  /**
   * Continuous target width in pixels. When provided, the algorithm picks
   * the integer span nearest to (targetWidth + gap) / (columnUnit + gap),
   * clamped to [1, columnCount]. Falls back to columnSpan when undefined
   * (legacy callers).
   */
  readonly targetWidth?: number
  /**
   * Absolute rendered height in pixels. When present, overrides the aspectRatio
   * formula. Intended for text-heavy cards (Tweet, Text) where height does not
   * scale proportionally with width — text reflows by line, so width / aspectRatio
   * is wrong after a width change. Image / video cards leave this undefined.
   */
  readonly intrinsicHeight?: number
}

export type MasonryInput = {
  readonly cards: ReadonlyArray<MasonryCard>
  readonly containerWidth: number
  readonly gap: number
  readonly targetColumnUnit: number
}

export type MasonryResult = {
  readonly positions: Readonly<Record<string, CardPosition>>
  readonly totalWidth: number
  readonly totalHeight: number
  readonly columnCount: number
  readonly columnUnit: number
}

export function computeColumnMasonry(input: MasonryInput): MasonryResult {
  const { cards, containerWidth, gap, targetColumnUnit } = input

  const columnCount = Math.max(
    1,
    Math.floor((containerWidth + gap) / (targetColumnUnit + gap)),
  )
  const columnUnit = (containerWidth - (columnCount - 1) * gap) / columnCount

  if (cards.length === 0) {
    return {
      positions: {},
      totalWidth: containerWidth,
      totalHeight: 0,
      columnCount,
      columnUnit,
    }
  }

  const columnBottoms: number[] = Array.from({ length: columnCount }, () => 0)
  const positions: Record<string, CardPosition> = {}

  for (const card of cards) {
    let effectiveSpan: number
    if (typeof card.targetWidth === 'number' && card.targetWidth > 0) {
      const slotW = columnUnit + gap
      effectiveSpan = Math.max(1, Math.round((card.targetWidth + gap) / slotW))
    } else {
      effectiveSpan = card.columnSpan
    }
    const span = Math.max(1, Math.min(effectiveSpan, columnCount))

    let bestStartCol = 0
    let bestTop = Infinity
    for (let startCol = 0; startCol <= columnCount - span; startCol++) {
      let top = 0
      for (let c = startCol; c < startCol + span; c++) {
        if (columnBottoms[c] > top) top = columnBottoms[c]
      }
      if (top < bestTop) {
        bestTop = top
        bestStartCol = startCol
      }
    }

    const width = span * columnUnit + (span - 1) * gap
    const height = card.intrinsicHeight && card.intrinsicHeight > 0
      ? card.intrinsicHeight
      : card.aspectRatio > 0 ? width / card.aspectRatio : width
    const x = bestStartCol * (columnUnit + gap)
    const y = bestTop

    positions[card.id] = { x, y, w: width, h: height }

    for (let c = bestStartCol; c < bestStartCol + span; c++) {
      columnBottoms[c] = y + height + gap
    }
  }

  const maxBottom = columnBottoms.reduce((m, b) => (b > m ? b : m), 0)
  const totalHeight = Math.max(0, maxBottom - gap)

  return {
    positions,
    totalWidth: containerWidth,
    totalHeight,
    columnCount,
    columnUnit,
  }
}
