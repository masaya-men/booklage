import { describe, it, expect } from 'vitest'
import { presetToCardWidth, clampCardWidth, widthToPreset, DEFAULT_CARD_WIDTH, MIN_CARD_WIDTH, MAX_CARD_WIDTH, LegacyPreset } from './size-migration'

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

  it('returns default for unknown preset string at runtime (DB boundary)', () => {
    // Simulate a corrupted/unexpected value coming back from an older or modified DB row.
    const sneaky = 'XL' as unknown as LegacyPreset
    expect(presetToCardWidth(sneaky)).toBe(DEFAULT_CARD_WIDTH)
  })

  it('widthToPreset projects width back into S/M/L buckets', () => {
    expect(widthToPreset(80)).toBe('S')
    expect(widthToPreset(160)).toBe('S')
    expect(widthToPreset(199)).toBe('S')
    expect(widthToPreset(200)).toBe('M')
    expect(widthToPreset(240)).toBe('M')
    expect(widthToPreset(279)).toBe('M')
    expect(widthToPreset(280)).toBe('L')
    expect(widthToPreset(320)).toBe('L')
    expect(widthToPreset(480)).toBe('L')
  })
})
