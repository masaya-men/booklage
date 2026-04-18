import { describe, it, expect } from 'vitest'
import {
  getLodLevel,
  getVisibleCards,
  type SphereCard,
} from '../sphere-culling'

describe('sphere-culling', () => {
  describe('getLodLevel', () => {
    it('returns "full" for cards directly in front', () => {
      expect(getLodLevel(0)).toBe('full')
      expect(getLodLevel(0.3)).toBe('full')
    })

    it('returns "reduced" for cards at an angle', () => {
      expect(getLodLevel(1.0)).toBe('reduced')
    })

    it('returns "dot" for cards near the back', () => {
      expect(getLodLevel(1.8)).toBe('dot')
    })

    it('returns "hidden" for cards behind', () => {
      expect(getLodLevel(2.5)).toBe('hidden')
    })
  })

  describe('getVisibleCards', () => {
    const cards: SphereCard[] = [
      { id: 'front', u: 0.5, v: 0.5, width: 280, height: 200 },
      { id: 'side', u: 0.7, v: 0.5, width: 280, height: 200 },
      { id: 'back', u: 0.0, v: 0.5, width: 280, height: 200 },
    ]

    it('assigns full LOD to front, excludes back from result', () => {
      const result = getVisibleCards(cards, 0.5, 0.5, 1.0)
      const front = result.find(c => c.id === 'front')
      const back = result.find(c => c.id === 'back')
      expect(front?.lod).toBe('full')
      expect(back).toBeUndefined()
    })

    it('never includes hidden cards in result', () => {
      const result = getVisibleCards(cards, 0.5, 0.5, 1.0)
      const hidden = result.filter(c => (c.lod as string) === 'hidden')
      expect(hidden).toHaveLength(0)
    })

    it('adjusts thresholds based on zoom', () => {
      const zoomedIn = getVisibleCards(cards, 0.5, 0.5, 2.0)
      const zoomedOut = getVisibleCards(cards, 0.5, 0.5, 0.3)
      const fullIn = zoomedIn.filter(c => c.lod === 'full').length
      const fullOut = zoomedOut.filter(c => c.lod === 'full').length
      expect(fullOut).toBeGreaterThanOrEqual(fullIn)
    })
  })
})
