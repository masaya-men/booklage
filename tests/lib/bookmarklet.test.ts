import { describe, it, expect } from 'vitest'
import { generateBookmarkletCode } from '@/lib/utils/bookmarklet'

describe('generateBookmarkletCode', () => {
  it('returns a javascript: URI', () => {
    const code = generateBookmarkletCode('https://booklage.com')
    expect(code).toMatch(/^javascript:/)
  })

  it('includes the app URL', () => {
    const code = generateBookmarkletCode('https://booklage.com')
    expect(code).toContain('booklage.com')
  })

  it('is URL-encoded', () => {
    const code = generateBookmarkletCode('https://booklage.com')
    expect(code).not.toContain(' ')
  })
})
