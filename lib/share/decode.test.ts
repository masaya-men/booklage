// lib/share/decode.test.ts
import { describe, it, expect } from 'vitest'
import { encodeShareData } from './encode'
import { decodeShareData } from './decode'
import { SHARE_SCHEMA_VERSION } from './types'
import type { ShareData } from './types'
import { sanitizeShareData } from './validate'

describe('decodeShareData', () => {
  it('round-trips encoded data', async () => {
    const original: ShareData = {
      v: SHARE_SCHEMA_VERSION,
      aspect: '9:16',
      cards: [
        { u: 'https://example.com', t: 'A', ty: 'website', x: 0.1, y: 0.2, w: 0.3, h: 0.4, s: 'M' },
        { u: 'https://x.com/a/status/1', t: 'B', ty: 'tweet', x: 0.5, y: 0.6, w: 0.2, h: 0.3, s: 'S' },
      ],
    }
    const encoded = await encodeShareData(original)
    const result = await decodeShareData(encoded)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.aspect).toBe('9:16')
      expect(result.data.cards).toHaveLength(2)
      expect(result.data.cards[0].t).toBe('A')
    }
  })

  it('returns error result for malformed base64', async () => {
    const result = await decodeShareData('!!!not-valid-base64!!!')
    expect(result.ok).toBe(false)
  })

  it('returns error result for non-gzip bytes', async () => {
    const result = await decodeShareData('AAAA')
    expect(result.ok).toBe(false)
  })

  it('returns error for valid gzip but invalid schema', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"v":"wrong"}'))
        controller.close()
      },
    })
    const compressed = stream.pipeThrough(new CompressionStream('gzip') as TransformStream<Uint8Array, Uint8Array>)
    const buf = new Uint8Array(await new Response(compressed).arrayBuffer())
    let bin = ''
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
    const b64url = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const result = await decodeShareData(b64url)
    expect(result.ok).toBe(false)
  })
})

describe('encode → decode → sanitize integration', () => {
  it('ignores attacker-controlled ty after full pipeline', async () => {
    const malicious = await encodeShareData({
      v: SHARE_SCHEMA_VERSION,
      aspect: 'free',
      cards: [{
        u: 'https://www.youtube.com/watch?v=abcdefghijk',
        t: 'fake',
        ty: 'website',
        x: 0, y: 0, w: 0.1, h: 0.1, s: 'S',
      }],
    })
    const result = await decodeShareData(malicious)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const sanitized = sanitizeShareData(result.data)
    expect(sanitized.cards[0].ty).toBe('youtube')
  })
})
