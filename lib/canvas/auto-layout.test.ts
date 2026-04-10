import { describe, it, expect } from 'vitest'
import {
  calculateMasonryPositions,
  calculateResponsiveColumns,
  estimateCardHeight,
  type CardDimension,
} from './auto-layout'

describe('calculateResponsiveColumns', () => {
  it('returns 4 columns for desktop viewport (1200px)', () => {
    expect(calculateResponsiveColumns(1200)).toBe(4)
  })

  it('returns 3 columns for tablet viewport (900px)', () => {
    expect(calculateResponsiveColumns(900)).toBe(3)
  })

  it('returns 2 columns for mobile viewport (400px)', () => {
    expect(calculateResponsiveColumns(400)).toBe(2)
  })

  it('returns 5 columns for wide viewport (1800px)', () => {
    expect(calculateResponsiveColumns(1800)).toBe(5)
  })
})

describe('calculateMasonryPositions', () => {
  it('returns empty array for no cards', () => {
    expect(calculateMasonryPositions([], 3, 240, 16)).toEqual([])
  })

  it('places one card at origin', () => {
    const cards: CardDimension[] = [{ id: 'a', width: 240, height: 160 }]
    const positions = calculateMasonryPositions(cards, 3, 240, 16, 50, 50)
    expect(positions).toHaveLength(1)
    expect(positions[0].id).toBe('a')
    expect(positions[0].x).toBe(50)
    expect(positions[0].y).toBe(50)
  })

  it('places cards in columns (shortest column first)', () => {
    const cards: CardDimension[] = [
      { id: 'a', width: 240, height: 100 },
      { id: 'b', width: 240, height: 200 },
      { id: 'c', width: 240, height: 100 },
      { id: 'd', width: 240, height: 100 },
    ]
    const positions = calculateMasonryPositions(cards, 3, 240, 16, 0, 0)

    const posD = positions.find((p) => p.id === 'd')!
    const posB = positions.find((p) => p.id === 'b')!
    // posD should NOT be directly below posB (col 1 is tallest)
    expect(posD.x).not.toBe(posB.x)
  })

  it('respects gap between rows', () => {
    const cards: CardDimension[] = [
      { id: 'a', width: 240, height: 100 },
      { id: 'b', width: 240, height: 100 },
      { id: 'c', width: 240, height: 100 },
      { id: 'd', width: 240, height: 100 },
    ]
    const gap = 16
    const positions = calculateMasonryPositions(cards, 3, 240, gap, 0, 0)
    const posA = positions.find((p) => p.id === 'a')!
    const posD = positions.find((p) => p.id === 'd')!
    expect(posD.x).toBe(posA.x)
    expect(posD.y).toBe(posA.y + 100 + gap)
  })
})

describe('estimateCardHeight', () => {
  it('returns tweet height for tweet type', () => {
    expect(estimateCardHeight('tweet', true)).toBe(300)
  })

  it('returns thumbnail height when thumbnail exists', () => {
    expect(estimateCardHeight('website', true)).toBe(160)
  })

  it('returns no-thumbnail height when no thumbnail', () => {
    expect(estimateCardHeight('website', false)).toBe(130)
  })
})
