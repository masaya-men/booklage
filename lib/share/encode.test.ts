// lib/share/encode.test.ts
import { describe, it, expect } from 'vitest'
import { encodeShareData } from './encode'
import { SHARE_SCHEMA_VERSION } from './types'

describe('encodeShareData', () => {
  it('returns a non-empty base64url string', async () => {
    const out = await encodeShareData({
      v: SHARE_SCHEMA_VERSION,
      aspect: '1:1',
      cards: [
        { u: 'https://example.com', t: 'Title', ty: 'website', x: 0, y: 0, w: 0.5, h: 0.5, s: 'S' },
      ],
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('compresses 50 cards into reasonably small payload', async () => {
    const cards = Array.from({ length: 50 }, (_, i) => ({
      u: `https://example.com/path/to/page-${i}-with-some-extra-text`,
      t: `Card title number ${i} — descriptive`,
      ty: 'website' as const,
      x: i / 50, y: 0, w: 0.1, h: 0.1, s: 'S' as const,
    }))
    const out = await encodeShareData({
      v: SHARE_SCHEMA_VERSION,
      aspect: 'free',
      cards,
    })
    expect(out.length).toBeLessThan(4 * 1024)
  })
})
