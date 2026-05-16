import { describe, it, expect } from 'vitest'
import { pickTitleTypography } from './title-typography'

describe('pickTitleTypography', () => {
  const baseInput = { cardWidth: 280, cardHeight: 360 }

  it('picks headline mode for short title (≤ 24 chars)', () => {
    const result = pickTitleTypography({ ...baseInput, title: 'Dispersion' })
    expect(result.mode).toBe('headline')
    // Session 31 redesign: base headline sizes shrunk ~40% so they read as
    // "reference-image faithful" typography rather than the previous oversized
    // display. The smallest headline tier (>= 25 units) lands at 24px.
    expect(result.fontSize).toBeGreaterThanOrEqual(24)
  })

  it('picks editorial mode for medium title (25-80 chars)', () => {
    const title = 'Refraction, dispersion, and other shader light effects'
    const result = pickTitleTypography({ ...baseInput, title })
    expect(result.mode).toBe('editorial')
    expect(result.fontSize).toBeLessThanOrEqual(28)
  })

  it('picks index mode for long title (>160 units)', () => {
    const title = 'A very long page title that goes on and on with detail covering many topics in great depth across multiple lines of text for comprehensive information display and archival purposes here'
    const result = pickTitleTypography({ ...baseInput, title })
    expect(result.mode).toBe('index')
  })

  it('treats CJK characters as full-width (counts as longer)', () => {
    // 30 Japanese chars ≈ 60 visual half-width units
    const title = 'これは日本語のタイトルでまあまあ長いものです測定確認用'
    const result = pickTitleTypography({ ...baseInput, title })
    expect(result.mode).toBe('editorial')
  })

  it('handles emoji-only title gracefully', () => {
    const result = pickTitleTypography({ ...baseInput, title: '🎨🌈✨' })
    expect(result.mode).toBe('headline')
    expect(result.fontSize).toBeGreaterThan(0)
  })

  it('returns sane defaults for empty title', () => {
    const result = pickTitleTypography({ ...baseInput, title: '' })
    expect(result.mode).toBe('headline')
    expect(result.fontSize).toBeGreaterThan(0)
    expect(result.maxLines).toBeGreaterThanOrEqual(1)
  })
})
