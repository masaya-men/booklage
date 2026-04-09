import { describe, it, expect } from 'vitest'
import { detectUrlType, extractTweetId, isValidUrl } from '@/lib/utils/url'

describe('isValidUrl', () => {
  it('accepts valid HTTP URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true)
    expect(isValidUrl('http://example.com/path?q=1')).toBe(true)
  })
  it('rejects invalid strings', () => {
    expect(isValidUrl('')).toBe(false)
    expect(isValidUrl('not a url')).toBe(false)
    expect(isValidUrl('ftp://file.txt')).toBe(false)
  })
})

describe('detectUrlType', () => {
  it('detects tweets', () => {
    expect(detectUrlType('https://twitter.com/user/status/123')).toBe('tweet')
    expect(detectUrlType('https://x.com/user/status/456')).toBe('tweet')
  })
  it('detects YouTube', () => {
    expect(detectUrlType('https://www.youtube.com/watch?v=abc')).toBe('youtube')
    expect(detectUrlType('https://youtu.be/abc')).toBe('youtube')
  })
  it('detects TikTok', () => {
    expect(detectUrlType('https://www.tiktok.com/@user/video/123')).toBe('tiktok')
  })
  it('detects Instagram', () => {
    expect(detectUrlType('https://www.instagram.com/p/abc123/')).toBe('instagram')
  })
  it('defaults to website', () => {
    expect(detectUrlType('https://example.com')).toBe('website')
  })
})

describe('extractTweetId', () => {
  it('extracts tweet ID from twitter.com', () => {
    expect(extractTweetId('https://twitter.com/user/status/1234567890')).toBe('1234567890')
  })
  it('extracts tweet ID from x.com', () => {
    expect(extractTweetId('https://x.com/user/status/9876543210')).toBe('9876543210')
  })
  it('returns null for non-tweet URLs', () => {
    expect(extractTweetId('https://example.com')).toBeNull()
  })
})
