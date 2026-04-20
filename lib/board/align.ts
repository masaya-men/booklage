import type { FreePosition } from './types'
import { computeAutoLayout } from './auto-layout'

export type AlignableItem = {
  readonly id: string
  readonly aspectRatio: number
  readonly freePos: FreePosition | null
}

export type AlignOptions = {
  readonly containerWidth: number
  readonly targetRowHeight: number
  readonly gap: number
}

const FRESH_FREE_POS: FreePosition = {
  x: 0,
  y: 0,
  w: 0,
  h: 0,
  rotation: 0,
  zIndex: 0,
  locked: false,
  isUserResized: false,
}

/**
 * Snap every item into a justified masonry grid by reusing computeAutoLayout,
 * then write each position back into the item's `freePos`. Pure — returns a
 * new array; inputs are not mutated. Existing rotation / zIndex / locked /
 * isUserResized on each freePos are preserved; only x / y / w / h change.
 */
export function alignAllToGrid<T extends AlignableItem>(
  items: readonly T[],
  opts: AlignOptions,
): T[] {
  if (items.length === 0) return []

  const layout = computeAutoLayout({
    cards: items.map((it) => ({ id: it.id, aspectRatio: it.aspectRatio })),
    viewportWidth: opts.containerWidth,
    targetRowHeight: opts.targetRowHeight,
    gap: opts.gap,
    direction: '2d',
  })

  return items.map((it) => {
    const p = layout.positions[it.id]
    if (!p) return it
    const base = it.freePos ?? FRESH_FREE_POS
    return {
      ...it,
      freePos: { ...base, x: p.x, y: p.y, w: p.w, h: p.h },
    }
  })
}
