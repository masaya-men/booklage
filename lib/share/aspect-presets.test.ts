// lib/share/aspect-presets.test.ts
import { describe, it, expect } from 'vitest'
import { computeAspectFrameSize, ASPECT_PRESETS } from './aspect-presets'

describe('aspect-presets', () => {
  it('exposes all four preset ids', () => {
    expect(ASPECT_PRESETS.map((p) => p.id)).toEqual(['free', '1:1', '9:16', '16:9'])
  })

  it('1:1 fits a square in any viewport', () => {
    const size = computeAspectFrameSize('1:1', 1000, 600)
    expect(size.width).toBe(size.height)
    expect(size.width).toBeLessThanOrEqual(600)
  })

  it('9:16 keeps portrait ratio', () => {
    const size = computeAspectFrameSize('9:16', 1000, 800)
    expect(size.height / size.width).toBeCloseTo(16 / 9, 2)
  })

  it('free returns viewport-fit', () => {
    const size = computeAspectFrameSize('free', 800, 600)
    expect(size.width).toBe(800)
    expect(size.height).toBe(600)
  })
})
