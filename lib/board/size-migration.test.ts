import { describe, it, expect } from 'vitest'
import { presetToCardWidth, clampCardWidth, DEFAULT_CARD_WIDTH, MIN_CARD_WIDTH, MAX_CARD_WIDTH } from './size-migration'

describe('size-migration', () => {
  it('S maps to 160, M to 240, L to 320', () => {
    expect(presetToCardWidth('S')).toBe(160)
    expect(presetToCardWidth('M')).toBe(240)
    expect(presetToCardWidth('L')).toBe(320)
  })

  it('undefined preset falls back to default', () => {
    expect(presetToCardWidth(undefined)).toBe(DEFAULT_CARD_WIDTH)
  })

  it('clamp keeps values inside [MIN, MAX]', () => {
    expect(clampCardWidth(50)).toBe(MIN_CARD_WIDTH)
    expect(clampCardWidth(9999)).toBe(MAX_CARD_WIDTH)
    expect(clampCardWidth(200)).toBe(200)
    expect(clampCardWidth(NaN)).toBe(DEFAULT_CARD_WIDTH)
  })

  it('exports the expected constants', () => {
    expect(MIN_CARD_WIDTH).toBe(80)
    expect(MAX_CARD_WIDTH).toBe(480)
    expect(DEFAULT_CARD_WIDTH).toBe(240)
  })
})
