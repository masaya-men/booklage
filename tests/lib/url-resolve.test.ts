import { describe, it, expect } from 'vitest'
import { resolveMaybeRelative } from '@/lib/utils/url-resolve'

describe('resolveMaybeRelative', () => {
  const base = 'https://labs.noomoagency.com/'

  it('returns absolute URL unchanged', () => {
    expect(resolveMaybeRelative('https://cdn.example.com/img.jpg', base))
      .toBe('https://cdn.example.com/img.jpg')
  })

  it('promotes protocol-relative URL to https', () => {
    expect(resolveMaybeRelative('//cdn.example.com/img.jpg', base))
      .toBe('https://cdn.example.com/img.jpg')
  })

  it('resolves root-relative path against base origin', () => {
    expect(resolveMaybeRelative('/OpenGraph.jpg', base))
      .toBe('https://labs.noomoagency.com/OpenGraph.jpg')
  })

  it('resolves relative path against base URL directory', () => {
    expect(resolveMaybeRelative('og.jpg', 'https://example.com/blog/post/'))
      .toBe('https://example.com/blog/post/og.jpg')
  })

  it('returns empty string for empty input', () => {
    expect(resolveMaybeRelative('', base)).toBe('')
  })

  it('returns empty string when input cannot be parsed', () => {
    expect(resolveMaybeRelative('not a url at all', 'invalid')).toBe('')
  })
})
