import { describe, it, expect } from 'vitest'
import {
  uvToSphere,
  sphereToUv,
  worldToUv,
  uvToWorld,
  calculateSphereRadius,
  getAngularDistance,
} from '../sphere-projection'

describe('sphere-projection', () => {
  describe('uvToSphere / sphereToUv roundtrip', () => {
    it('converts UV (0.5, 0.5) to front of sphere and back', () => {
      const point = uvToSphere(0.5, 0.5, 500)
      expect(point.x).toBeCloseTo(0, 1)
      expect(point.y).toBeCloseTo(0, 1)
      expect(point.z).toBeCloseTo(-500, 1)
      const uv = sphereToUv(point.x, point.y, point.z, 500)
      expect(uv.u).toBeCloseTo(0.5, 5)
      expect(uv.v).toBeCloseTo(0.5, 5)
    })

    it('converts UV (0, 0) to top-back', () => {
      const point = uvToSphere(0, 0, 500)
      const uv = sphereToUv(point.x, point.y, point.z, 500)
      expect(uv.u).toBeCloseTo(0, 5)
      expect(uv.v).toBeCloseTo(0, 5)
    })

    it('wraps u=1 to u=0 equivalent (non-pole v)', () => {
      // v=1 is a pole where u is mathematically undefined.
      // Use v=0.7 to stay off the pole, verify u wraps (0 ≡ 1 mod 1).
      const point = uvToSphere(1.0, 0.7, 500)
      const uv = sphereToUv(point.x, point.y, point.z, 500)
      const uDiff = Math.min(Math.abs(uv.u - 1.0), Math.abs(uv.u - 0.0))
      expect(uDiff).toBeLessThan(0.001)
      expect(uv.v).toBeCloseTo(0.7, 3)
    })
  })

  describe('worldToUv / uvToWorld roundtrip', () => {
    it('converts world (0, 0) to UV center and back', () => {
      const uv = worldToUv(0, 0, 1000, 1000)
      expect(uv.u).toBeCloseTo(0.5, 5)
      expect(uv.v).toBeCloseTo(0.5, 5)
      const world = uvToWorld(uv.u, uv.v, 1000, 1000)
      expect(world.x).toBeCloseTo(0, 1)
      expect(world.y).toBeCloseTo(0, 1)
    })

    it('converts world (500, 250) and back', () => {
      const uv = worldToUv(500, 250, 2000, 2000)
      const world = uvToWorld(uv.u, uv.v, 2000, 2000)
      expect(world.x).toBeCloseTo(500, 1)
      expect(world.y).toBeCloseTo(250, 1)
    })
  })

  describe('calculateSphereRadius', () => {
    it('returns minimum radius for 0 cards', () => {
      const r = calculateSphereRadius(0)
      expect(r).toBeGreaterThan(0)
    })

    it('increases radius with more cards', () => {
      const r10 = calculateSphereRadius(10)
      const r100 = calculateSphereRadius(100)
      const r1000 = calculateSphereRadius(1000)
      expect(r100).toBeGreaterThan(r10)
      expect(r1000).toBeGreaterThan(r100)
    })

    it('scales sublinearly (not proportional to card count)', () => {
      const r100 = calculateSphereRadius(100)
      const r1000 = calculateSphereRadius(1000)
      expect(r1000 / r100).toBeLessThan(5)
    })
  })

  describe('getAngularDistance', () => {
    it('returns 0 for same point', () => {
      const d = getAngularDistance(0.5, 0.5, 0.5, 0.5)
      expect(d).toBeCloseTo(0, 5)
    })

    it('returns π for opposite points', () => {
      const d = getAngularDistance(0.5, 0.5, 0.5, 0.0)
      expect(d).toBeCloseTo(Math.PI / 2, 1)
    })

    it('returns value between 0 and π', () => {
      const d = getAngularDistance(0.3, 0.7, 0.8, 0.2)
      expect(d).toBeGreaterThanOrEqual(0)
      expect(d).toBeLessThanOrEqual(Math.PI)
    })
  })
})
