import { describe, it, expect } from 'vitest'
import { computeSnapGuides, applySnapToPosition, isBleedOutsideFrame } from './free-layout'
import type { FreePosition } from './types'

const card = (x: number, y: number, w = 100, h = 80, rot = 0): FreePosition => ({
  x, y, w, h, rotation: rot, zIndex: 0, locked: false, isUserResized: false,
})

describe('computeSnapGuides', () => {
  it('detects left-edge alignment between dragged and neighbor', () => {
    const dragged = card(10, 50)
    const others = [card(10, 200)]
    const guides = computeSnapGuides(dragged, others, 5)
    const vertical = guides.filter(g => g.kind === 'vertical')
    expect(vertical.length).toBeGreaterThan(0)
    const first = vertical[0]
    if (first.kind !== 'vertical') throw new Error('unreachable')
    expect(first.x).toBe(10)
  })

  it('detects vertical center alignment', () => {
    const dragged = card(0, 0, 100, 80)   // center = 50
    const others = [card(80, 200, 60, 80)] // center = 110 (mid-y of other = 240)
    const guides = computeSnapGuides(card(80, 0, 60, 80), [dragged], 5) // new dragged center = 110, other center = 50
    // Use exact alignment
    const dragged2 = card(100, 50, 100, 80) // center-x = 150
    const others2 = [card(100, 200, 100, 80)] // center-x = 150 → alignment
    const guides2 = computeSnapGuides(dragged2, others2, 5)
    const vertical = guides2.filter(g => g.kind === 'vertical')
    expect(vertical.length).toBeGreaterThan(0)
  })

  it('detects equal spacing across 3 cards', () => {
    const left = card(0, 100, 100, 80)
    const right = card(300, 100, 100, 80)
    const dragged = card(150, 100, 100, 80)
    const guides = computeSnapGuides(dragged, [left, right], 5)
    const spacing = guides.filter(g => g.kind === 'spacing')
    expect(spacing.length).toBeGreaterThan(0)
  })

  it('returns empty array when no alignment nearby', () => {
    const dragged = card(1000, 1000)
    const others = [card(0, 0)]
    expect(computeSnapGuides(dragged, others, 5)).toEqual([])
  })
})

describe('applySnapToPosition', () => {
  it('snaps dragged x to aligned edge', () => {
    const dragged = card(7, 100, 100, 80)  // left edge 7
    const others = [card(10, 0, 100, 80)]  // left edge 10
    const snapped = applySnapToPosition(dragged, others, 5)
    expect(snapped.x).toBe(10)
  })

  it('does not snap when beyond tolerance', () => {
    const dragged = card(20, 100, 100, 80)
    const others = [card(10, 0, 100, 80)]
    const snapped = applySnapToPosition(dragged, others, 5)
    expect(snapped.x).toBe(20)
  })
})

describe('isBleedOutsideFrame', () => {
  it('detects bleed when card left < frame left', () => {
    const c = card(-10, 100, 100, 80)
    const frame = { x: 0, y: 0, width: 500, height: 500 }
    expect(isBleedOutsideFrame(c, frame)).toBe(true)
  })

  it('no bleed when fully inside', () => {
    const c = card(50, 100, 100, 80)
    const frame = { x: 0, y: 0, width: 500, height: 500 }
    expect(isBleedOutsideFrame(c, frame)).toBe(false)
  })
})
