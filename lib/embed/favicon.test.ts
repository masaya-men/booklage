import { describe, it, expect } from 'vitest'
import { getFaviconUrl, hostnameFromUrl } from './favicon'

describe('favicon', () => {
  it('getFaviconUrl returns Google s2 URL for hostname', () => {
    expect(getFaviconUrl('example.com')).toBe(
      'https://www.google.com/s2/favicons?domain=example.com&sz=64',
    )
  })

  it('hostnameFromUrl extracts hostname', () => {
    expect(hostnameFromUrl('https://r3f.maximeheckel.com/lens2')).toBe('r3f.maximeheckel.com')
    expect(hostnameFromUrl('https://www.example.com/path')).toBe('www.example.com')
  })

  it('hostnameFromUrl returns empty string for invalid URL', () => {
    expect(hostnameFromUrl('not-a-url')).toBe('')
  })
})
