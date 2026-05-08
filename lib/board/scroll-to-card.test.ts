import { describe, it, expect } from 'vitest'
import { computeFocusScrollY } from './scroll-to-card'

describe('computeFocusScrollY', () => {
  it('centers the target card vertically in the viewport', () => {
    expect(computeFocusScrollY({ cardY: 400, cardH: 200, viewportH: 800 })).toBe(100)
  })

  it('clamps to 0 when card is near the top', () => {
    expect(computeFocusScrollY({ cardY: 50, cardH: 100, viewportH: 800 })).toBe(0)
  })

  it('clamps to contentH - viewportH when card-centered scroll would exceed it', () => {
    // Card very close to bottom: cardY=9400, h=100 → desired = 9400 + 50 - 400 = 9050.
    // contentH-viewportH = 9500-800 = 8700. clamp 9050 → 8700.
    expect(computeFocusScrollY({ cardY: 9400, cardH: 100, viewportH: 800, contentH: 9500 })).toBe(8700)
  })

  it('returns the centered value when contentH allows it', () => {
    // Card near bottom but contentH leaves room: cardY=9000, h=100 → desired 8650, contentH-viewport = 8700, no clamp.
    expect(computeFocusScrollY({ cardY: 9000, cardH: 100, viewportH: 800, contentH: 9500 })).toBe(8650)
  })

  it('returns 0 for cards outside layout bounds (cardY < 0)', () => {
    expect(computeFocusScrollY({ cardY: -50, cardH: 100, viewportH: 800 })).toBe(0)
  })
})
