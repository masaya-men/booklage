import { describe, it, expect } from 'vitest'
import { generateBookmarkletCode } from '@/lib/utils/bookmarklet'

describe('generateBookmarkletCode', () => {
  const appUrl = 'https://booklage.com'

  it('starts with javascript: protocol', () => {
    const code = generateBookmarkletCode(appUrl)
    expect(code.startsWith('javascript:')).toBe(true)
  })

  it('contains the app URL for /save route', () => {
    const code = generateBookmarkletCode(appUrl)
    const decoded = decodeURIComponent(code)
    expect(decoded).toContain('booklage.com/save')
  })

  it('contains OGP extraction logic', () => {
    const code = generateBookmarkletCode(appUrl)
    const decoded = decodeURIComponent(code)
    expect(decoded).toContain('og:title')
    expect(decoded).toContain('og:image')
    expect(decoded).toContain('og:description')
  })

  it('contains window.open call', () => {
    const code = generateBookmarkletCode(appUrl)
    const decoded = decodeURIComponent(code)
    expect(decoded).toContain('window.open')
  })

  it('has no spaces (URL-safe)', () => {
    const code = generateBookmarkletCode(appUrl)
    // After javascript: prefix, should be URI-encoded
    const body = code.slice('javascript:'.length)
    expect(body).not.toContain(' ')
  })
})
