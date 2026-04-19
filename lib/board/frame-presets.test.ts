import { describe, it, expect } from 'vitest'
import { FRAME_PRESETS, getPresetById, computeFrameSize, DEFAULT_PRESET_ID } from './frame-presets'

describe('FRAME_PRESETS', () => {
  it('contains 9 presets', () => {
    expect(FRAME_PRESETS).toHaveLength(9)
  })
  it('all preset ids are unique', () => {
    const ids = FRAME_PRESETS.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('default preset exists', () => {
    expect(FRAME_PRESETS.find(p => p.id === DEFAULT_PRESET_ID)).toBeDefined()
  })
})

describe('getPresetById', () => {
  it('returns the matching preset', () => {
    const p = getPresetById('ig-square')
    expect(p?.label).toBe('Instagram')
  })
  it('returns null for unknown id', () => {
    expect(getPresetById('nonexistent')).toBeNull()
  })
})

describe('computeFrameSize', () => {
  it('1:1 preset fits into 1000x800 as 800x800', () => {
    const size = computeFrameSize({ kind: 'preset', presetId: 'ig-square' }, 1000, 800)
    expect(size.width).toBeCloseTo(800)
    expect(size.height).toBeCloseTo(800)
  })
  it('9:16 preset fits tall', () => {
    const size = computeFrameSize({ kind: 'preset', presetId: 'story-reels' }, 1000, 800)
    expect(size.width / size.height).toBeCloseTo(9 / 16)
    expect(size.height).toBeLessThanOrEqual(800)
  })
  it('custom 200x100 returns exact', () => {
    const size = computeFrameSize({ kind: 'custom', width: 200, height: 100 }, 1000, 800)
    expect(size.width).toBe(200)
    expect(size.height).toBe(100)
  })
})
