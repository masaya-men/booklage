// lib/share/validate.test.ts
import { describe, it, expect } from 'vitest'
import { sanitizeShareData } from './validate'
import { SHARE_SCHEMA_VERSION, SHARE_LIMITS } from './types'
import type { ShareData } from './types'

const baseCard = {
  t: 'Title',
  ty: 'website' as const,
  x: 0, y: 0, w: 0.1, h: 0.1,
  s: 'S' as const,
}

const baseData = (cards: ShareData['cards']): ShareData => ({
  v: SHARE_SCHEMA_VERSION,
  aspect: 'free',
  cards,
})

describe('sanitizeShareData', () => {
  it('drops cards with javascript: URL', () => {
    const out = sanitizeShareData(baseData([
      { ...baseCard, u: 'javascript:alert(1)' },
      { ...baseCard, u: 'https://safe.example.com' },
    ]))
    expect(out.cards).toHaveLength(1)
    expect(out.cards[0].u).toBe('https://safe.example.com')
  })

  it('drops cards with data: URL', () => {
    const out = sanitizeShareData(baseData([
      { ...baseCard, u: 'data:text/html,<script>x</script>' },
    ]))
    expect(out.cards).toHaveLength(0)
  })

  it('drops cards with file: URL', () => {
    const out = sanitizeShareData(baseData([
      { ...baseCard, u: 'file:///etc/passwd' },
    ]))
    expect(out.cards).toHaveLength(0)
  })

  it('drops thumbnail field with non-http(s) scheme but keeps the card', () => {
    const out = sanitizeShareData(baseData([
      { ...baseCard, u: 'https://safe.com', th: 'javascript:alert(1)' },
    ]))
    expect(out.cards).toHaveLength(1)
    expect(out.cards[0].th).toBeUndefined()
  })

  it('re-detects type from URL (ignores attacker-controlled ty)', () => {
    const out = sanitizeShareData(baseData([
      { ...baseCard, u: 'https://www.youtube.com/watch?v=abc12345678', ty: 'website' },
    ]))
    expect(out.cards[0].ty).toBe('youtube')
  })

  it('caps cards at MAX_CARDS', () => {
    const many = Array.from({ length: SHARE_LIMITS.MAX_CARDS + 10 }, () => ({
      ...baseCard, u: 'https://example.com',
    }))
    const out = sanitizeShareData(baseData(many))
    expect(out.cards).toHaveLength(SHARE_LIMITS.MAX_CARDS)
  })

  it('truncates over-long titles', () => {
    const long = 'x'.repeat(SHARE_LIMITS.MAX_TITLE + 50)
    const out = sanitizeShareData(baseData([{ ...baseCard, u: 'https://e.com', t: long }]))
    expect(out.cards[0].t.length).toBe(SHARE_LIMITS.MAX_TITLE)
  })

  it('truncates over-long descriptions', () => {
    const long = 'y'.repeat(SHARE_LIMITS.MAX_DESCRIPTION + 50)
    const out = sanitizeShareData(baseData([{ ...baseCard, u: 'https://e.com', d: long }]))
    expect(out.cards[0].d?.length).toBe(SHARE_LIMITS.MAX_DESCRIPTION)
  })

  it('clamps positions/sizes to [0, 1]', () => {
    const out = sanitizeShareData(baseData([
      { ...baseCard, u: 'https://e.com', x: -0.5, y: 2, w: 5, h: -1 },
    ]))
    expect(out.cards[0].x).toBe(0)
    expect(out.cards[0].y).toBe(1)
    expect(out.cards[0].w).toBeGreaterThan(0)
    expect(out.cards[0].w).toBeLessThanOrEqual(1)
  })
})
