import { describe, it, expect } from 'vitest'
import {
  applyRotation,
  calculateInertia,
  calculateZoomCurvature,
  wrapUv,
} from '../sphere-interaction'

describe('sphere-interaction', () => {
  describe('applyRotation', () => {
    it('moves camera UV based on drag delta', () => {
      const result = applyRotation(0.5, 0.5, 100, 0, 1000, 1.0)
      expect(result.u).toBeLessThan(0.5)
      expect(result.v).toBeCloseTo(0.5, 5)
    })

    it('scales rotation by zoom level', () => {
      const slow = applyRotation(0.5, 0.5, 100, 0, 1000, 2.0)
      const fast = applyRotation(0.5, 0.5, 100, 0, 1000, 0.5)
      const slowDelta = Math.abs(slow.u - 0.5)
      const fastDelta = Math.abs(fast.u - 0.5)
      expect(fastDelta).toBeGreaterThan(slowDelta)
    })
  })

  describe('wrapUv', () => {
    it('wraps u beyond 1 to 0+remainder', () => {
      expect(wrapUv(1.3).u).toBeCloseTo(0.3, 5)
    })

    it('wraps u below 0 to 1-remainder', () => {
      expect(wrapUv(-0.2).u).toBeCloseTo(0.8, 5)
    })

    it('clamps v to [0.05, 0.95] to avoid poles', () => {
      expect(wrapUv(0.5, -0.1).v).toBeCloseTo(0.05, 5)
      expect(wrapUv(0.5, 1.2).v).toBeCloseTo(0.95, 5)
    })
  })

  describe('calculateInertia', () => {
    it('returns velocity from recent drag history', () => {
      const history = [
        { u: 0.5, v: 0.5, time: 0 },
        { u: 0.48, v: 0.5, time: 16 },
        { u: 0.46, v: 0.5, time: 32 },
      ]
      const vel = calculateInertia(history)
      expect(vel.du).toBeLessThan(0)
      expect(Math.abs(vel.dv)).toBeLessThan(0.001)
    })

    it('returns zero for empty history', () => {
      const vel = calculateInertia([])
      expect(vel.du).toBe(0)
      expect(vel.dv).toBe(0)
    })
  })

  describe('calculateZoomCurvature', () => {
    it('returns 0 curvature at max zoom', () => {
      const c = calculateZoomCurvature(3.0)
      expect(c).toBeCloseTo(0, 1)
    })

    it('returns 1 curvature at min zoom', () => {
      const c = calculateZoomCurvature(0.1)
      expect(c).toBeCloseTo(1, 1)
    })

    it('returns intermediate curvature at default zoom', () => {
      const c = calculateZoomCurvature(1.0)
      expect(c).toBeGreaterThan(0)
      expect(c).toBeLessThan(1)
    })
  })
})
