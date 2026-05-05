// lib/share/x-intent.test.ts
import { describe, it, expect } from 'vitest'
import { buildXIntent } from './x-intent'

describe('buildXIntent', () => {
  it('encodes text and url params', () => {
    const u = buildXIntent({ shareUrl: 'https://booklage.pages.dev/share#d=abc' })
    expect(u.startsWith('https://twitter.com/intent/tweet?')).toBe(true)
    expect(u).toContain('url=https%3A%2F%2Fbooklage.pages.dev%2Fshare%23d%3Dabc')
    expect(u).toContain('text=')
  })

  it('uses custom text when provided', () => {
    const u = buildXIntent({ shareUrl: 'https://example.com', text: 'Custom message' })
    expect(u).toContain('text=Custom+message')
  })
})
