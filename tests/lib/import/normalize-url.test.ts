import { describe, it, expect } from 'vitest'
import { normalizeUrl } from '@/lib/import/normalize-url'

describe('normalizeUrl', () => {
  it('removes trailing slash', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com')
  })
  it('removes www prefix', () => {
    expect(normalizeUrl('https://www.example.com')).toBe('https://example.com')
  })
  it('normalizes http to https', () => {
    expect(normalizeUrl('http://example.com')).toBe('https://example.com')
  })
  it('lowercases hostname', () => {
    expect(normalizeUrl('https://Example.COM/Path')).toBe('https://example.com/Path')
  })
  it('combines all normalizations', () => {
    expect(normalizeUrl('http://www.Example.com/')).toBe('https://example.com')
  })
  it('preserves path and query', () => {
    expect(normalizeUrl('https://example.com/page?q=1')).toBe('https://example.com/page?q=1')
  })
  it('returns original string for invalid URLs', () => {
    expect(normalizeUrl('not-a-url')).toBe('not-a-url')
  })
})
