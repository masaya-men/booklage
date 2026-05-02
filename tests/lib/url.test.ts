import { describe, it, expect } from 'vitest'
import {
  detectUrlType,
  extractInstagramShortcode,
  extractTikTokVideoId,
  extractTweetId,
  extractUrlFromText,
  isValidUrl,
} from '@/lib/utils/url'

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

describe('extractTikTokVideoId', () => {
  it('extracts video ID from canonical TikTok URL', () => {
    expect(extractTikTokVideoId('https://www.tiktok.com/@user/video/7212345678901234567'))
      .toBe('7212345678901234567')
  })
  it('returns null for non-video URLs', () => {
    expect(extractTikTokVideoId('https://www.tiktok.com/@user')).toBeNull()
    expect(extractTikTokVideoId('https://example.com')).toBeNull()
  })
})

describe('extractInstagramShortcode', () => {
  it('extracts shortcode from /p/ URL', () => {
    expect(extractInstagramShortcode('https://www.instagram.com/p/C2X3y_aBcDe/')).toBe('C2X3y_aBcDe')
  })
  it('extracts shortcode from /reel/ URL', () => {
    expect(extractInstagramShortcode('https://www.instagram.com/reel/AbCdEf-12_/')).toBe('AbCdEf-12_')
  })
  it('returns null for non-post URLs', () => {
    expect(extractInstagramShortcode('https://www.instagram.com/user/')).toBeNull()
    expect(extractInstagramShortcode('https://example.com')).toBeNull()
  })
})

describe('extractUrlFromText', () => {
  it('extracts URL from plain text', () => {
    expect(extractUrlFromText('Check this out https://example.com/page')).toBe(
      'https://example.com/page',
    )
  })

  it('returns the URL when text is just a URL', () => {
    expect(extractUrlFromText('https://example.com')).toBe('https://example.com')
  })

  it('extracts first URL when multiple URLs present', () => {
    expect(extractUrlFromText('https://a.com and https://b.com')).toBe('https://a.com')
  })

  it('returns null when no URL found', () => {
    expect(extractUrlFromText('no url here')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(extractUrlFromText('')).toBeNull()
  })

  it('handles URL with query params and hash', () => {
    expect(extractUrlFromText('Watch https://youtube.com/watch?v=abc123#t=10')).toBe(
      'https://youtube.com/watch?v=abc123#t=10',
    )
  })

  it('handles http URL', () => {
    expect(extractUrlFromText('Visit http://legacy-site.com/path')).toBe(
      'http://legacy-site.com/path',
    )
  })
})
