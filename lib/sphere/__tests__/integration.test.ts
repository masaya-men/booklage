import { describe, it, expect } from 'vitest'
import {
  uvToSphere,
  sphereToUv,
  worldToUv,
  calculateSphereRadius,
} from '../sphere-projection'
import { getVisibleCards, type SphereCard } from '../sphere-culling'
import { applyRotation } from '../sphere-interaction'

describe('sphere integration', () => {
  it('full pipeline: world coords → UV → sphere → culling', () => {
    const worldCards = Array.from({ length: 10 }, (_, i) => ({
      id: `card-${i}`,
      x: (i % 5) * 300 - 600,
      y: Math.floor(i / 5) * 300 - 150,
      width: 280,
      height: 200,
    }))

    const radius = calculateSphereRadius(10)
    const worldSpan = radius * 2

    const sphereCards: SphereCard[] = worldCards.map(c => {
      const uv = worldToUv(c.x, c.y, worldSpan, worldSpan)
      return { id: c.id, u: uv.u, v: uv.v, width: c.width, height: c.height }
    })

    const visible = getVisibleCards(sphereCards, 0.5, 0.5, 1.0)
    expect(visible.length).toBeGreaterThan(0)
    expect(visible.every(v => v.lod !== undefined)).toBe(true)
  })

  it('rotation wraps around the sphere', () => {
    let pos = { u: 0.5, v: 0.5 }
    for (let i = 0; i < 100; i++) {
      pos = applyRotation(pos.u, pos.v, 50, 0, 800, 1.0)
    }
    expect(pos.u).toBeGreaterThanOrEqual(0)
    expect(pos.u).toBeLessThanOrEqual(1)
  })

  it('sphere coords roundtrip preserves position (away from poles)', () => {
    const radius = 1000
    for (let i = 0; i < 20; i++) {
      const u = Math.random()
      const v = 0.1 + Math.random() * 0.8
      const sphere = uvToSphere(u, v, radius)
      const back = sphereToUv(sphere.x, sphere.y, sphere.z, radius)
      expect(back.u).toBeCloseTo(u, 3)
      expect(back.v).toBeCloseTo(v, 3)
    }
  })
})
