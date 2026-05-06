// lib/share/relay-layout.test.ts
import { describe, it, expect } from 'vitest'
import { relayShareLayout } from './relay-layout'
import type { ShareCard } from './types'

const card = (
  i: number,
  opts: Partial<{ a: number; s: 'S' | 'M' | 'L' }> = {},
): ShareCard => ({
  u: `https://example.com/${i}`,
  t: `t-${i}`,
  ty: 'website',
  x: 0,
  y: 0,
  w: 0.1,
  h: 0.1,
  s: opts.s ?? 'S',
  a: opts.a ?? 1,
})

describe('relayShareLayout', () => {
  it('produces normalized 0..1 coords filling the receiver viewport width', () => {
    const cards = [card(0), card(1), card(2)]
    const r = relayShareLayout({ cards, viewport: { width: 1600, height: 900 } })
    expect(r.cards).toHaveLength(3)
    expect(r.frameSize.width).toBe(1600)
    expect(r.frameSize.height).toBeGreaterThan(0)
    for (const c of r.cards) {
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.y).toBeGreaterThanOrEqual(0)
      expect(c.x + c.w).toBeLessThanOrEqual(1.0001)
      expect(c.y + c.h).toBeLessThanOrEqual(1.0001)
    }
  })

  it('respects size preset — L spans wider than S', () => {
    const cards = [card(0, { s: 'S' }), card(1, { s: 'L' })]
    const r = relayShareLayout({ cards, viewport: { width: 1600, height: 900 } })
    const s = r.cards[0]
    const l = r.cards[1]
    expect(l.w).toBeGreaterThan(s.w)
  })

  it('preserves card identity (u/t/ty/s/a) — only x/y/w/h are recomputed', () => {
    const cards = [card(0, { s: 'M', a: 1.5 })]
    const r = relayShareLayout({ cards, viewport: { width: 1600, height: 900 } })
    expect(r.cards[0].u).toBe(cards[0].u)
    expect(r.cards[0].t).toBe(cards[0].t)
    expect(r.cards[0].ty).toBe(cards[0].ty)
    expect(r.cards[0].s).toBe(cards[0].s)
    expect(r.cards[0].a).toBe(cards[0].a)
  })

  it('falls back to encoded positions when any card lacks `a`', () => {
    const cards: ShareCard[] = [
      { ...card(0), a: undefined },
      card(1),
    ]
    const r = relayShareLayout({ cards, viewport: { width: 1600, height: 900 } })
    expect(r.cards).toEqual(cards)
    expect(r.frameSize).toEqual({ width: 1600, height: 900 })
  })

  it('handles empty input gracefully', () => {
    const r = relayShareLayout({ cards: [], viewport: { width: 1600, height: 900 } })
    expect(r.cards).toEqual([])
    expect(r.frameSize).toEqual({ width: 1600, height: 900 })
  })

  it('frame width matches receiver viewport regardless of card count', () => {
    for (const n of [1, 5, 20, 50]) {
      const cards = Array.from({ length: n }, (_, i) => card(i))
      const r = relayShareLayout({ cards, viewport: { width: 1280, height: 800 } })
      expect(r.frameSize.width).toBe(1280)
    }
  })
})
