import type { FreePosition, SnapGuideLine } from './types'
import { SNAP } from './constants'

type FrameRect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

/**
 * Compute smart snap guide lines between a dragged card and other cards.
 * Returns pink-line guide data for rendering. Does NOT mutate position.
 */
export function computeSnapGuides(
  dragged: FreePosition,
  others: ReadonlyArray<FreePosition>,
  tolerancePx: number = SNAP.EDGE_ALIGNMENT_TOLERANCE_PX,
): SnapGuideLine[] {
  const guides: SnapGuideLine[] = []

  const dLeft = dragged.x
  const dRight = dragged.x + dragged.w
  const dTop = dragged.y
  const dBottom = dragged.y + dragged.h
  const dCx = dragged.x + dragged.w / 2
  const dCy = dragged.y + dragged.h / 2

  for (const o of others) {
    const oLeft = o.x
    const oRight = o.x + o.w
    const oTop = o.y
    const oBottom = o.y + o.h
    const oCx = o.x + o.w / 2
    const oCy = o.y + o.h / 2

    // Vertical alignment: left-left, right-right, center-x
    const verticalCandidates: Array<{ x: number; match: boolean }> = [
      { x: oLeft,  match: Math.abs(dLeft - oLeft) <= tolerancePx },
      { x: oRight, match: Math.abs(dRight - oRight) <= tolerancePx },
      { x: oCx,    match: Math.abs(dCx - oCx) <= tolerancePx },
      { x: oLeft,  match: Math.abs(dRight - oLeft) <= tolerancePx },  // dragged-right aligns with other-left
      { x: oRight, match: Math.abs(dLeft - oRight) <= tolerancePx },  // dragged-left aligns with other-right
    ]
    for (const v of verticalCandidates) {
      if (v.match) {
        guides.push({
          kind: 'vertical',
          x: v.x,
          y1: Math.min(dTop, oTop),
          y2: Math.max(dBottom, oBottom),
        })
      }
    }

    // Horizontal alignment: top-top, bottom-bottom, center-y
    const horizontalCandidates: Array<{ y: number; match: boolean }> = [
      { y: oTop,    match: Math.abs(dTop - oTop) <= tolerancePx },
      { y: oBottom, match: Math.abs(dBottom - oBottom) <= tolerancePx },
      { y: oCy,     match: Math.abs(dCy - oCy) <= tolerancePx },
      { y: oTop,    match: Math.abs(dBottom - oTop) <= tolerancePx },
      { y: oBottom, match: Math.abs(dTop - oBottom) <= tolerancePx },
    ]
    for (const h of horizontalCandidates) {
      if (h.match) {
        guides.push({
          kind: 'horizontal',
          y: h.y,
          x1: Math.min(dLeft, oLeft),
          x2: Math.max(dRight, oRight),
        })
      }
    }
  }

  // Equal-spacing detection: if dragged lies between exactly 2 others horizontally at similar y,
  // and gap left-to-dragged ≈ gap dragged-to-right → spacing guide.
  if (others.length >= 2) {
    const samishY = others.filter(o =>
      Math.abs((o.y + o.h / 2) - dCy) <= o.h * 0.3,
    ).sort((a, b) => a.x - b.x)
    if (samishY.length >= 2) {
      const left = samishY.find(o => o.x + o.w <= dLeft + tolerancePx)
      const right = samishY.find(o => o.x >= dRight - tolerancePx)
      if (left && right) {
        const gapL = dLeft - (left.x + left.w)
        const gapR = right.x - dRight
        if (Math.abs(gapL - gapR) <= SNAP.SPACING_EQUAL_TOLERANCE_PX && gapL > 0) {
          guides.push({
            kind: 'spacing',
            label: `${Math.round(gapL)}px`,
            x1: left.x + left.w,
            y1: dCy,
            x2: dLeft,
            y2: dCy,
          })
          guides.push({
            kind: 'spacing',
            label: `${Math.round(gapR)}px`,
            x1: dRight,
            y1: dCy,
            x2: right.x,
            y2: dCy,
          })
        }
      }
    }
  }

  return guides
}

/**
 * Apply snap corrections to a dragged position based on nearby edges.
 */
export function applySnapToPosition(
  dragged: FreePosition,
  others: ReadonlyArray<FreePosition>,
  tolerancePx: number = SNAP.EDGE_ALIGNMENT_TOLERANCE_PX,
): FreePosition {
  let x = dragged.x
  let y = dragged.y

  for (const o of others) {
    // X alignment
    const xCandidates = [
      { target: o.x,             delta: dragged.x - o.x },
      { target: o.x + o.w - dragged.w, delta: dragged.x + dragged.w - (o.x + o.w) },
      { target: o.x + (o.w - dragged.w) / 2, delta: (dragged.x + dragged.w / 2) - (o.x + o.w / 2) },
      { target: o.x + o.w,       delta: dragged.x - (o.x + o.w) },
      { target: o.x - dragged.w, delta: (dragged.x + dragged.w) - o.x },
    ]
    for (const c of xCandidates) {
      if (Math.abs(c.delta) <= tolerancePx) { x = c.target; break }
    }

    // Y alignment
    const yCandidates = [
      { target: o.y,             delta: dragged.y - o.y },
      { target: o.y + o.h - dragged.h, delta: dragged.y + dragged.h - (o.y + o.h) },
      { target: o.y + (o.h - dragged.h) / 2, delta: (dragged.y + dragged.h / 2) - (o.y + o.h / 2) },
      { target: o.y + o.h,       delta: dragged.y - (o.y + o.h) },
      { target: o.y - dragged.h, delta: (dragged.y + dragged.h) - o.y },
    ]
    for (const c of yCandidates) {
      if (Math.abs(c.delta) <= tolerancePx) { y = c.target; break }
    }
  }

  return { ...dragged, x, y }
}

/**
 * Check if any edge of the card extends outside the frame rectangle.
 */
export function isBleedOutsideFrame(card: FreePosition, frame: FrameRect): boolean {
  return (
    card.x < frame.x ||
    card.y < frame.y ||
    card.x + card.w > frame.x + frame.width ||
    card.y + card.h > frame.y + frame.height
  )
}
