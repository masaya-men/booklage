import { describe, it, expect } from 'vitest'
import { findDuplicates } from '@/lib/import/deduplicate'
import type { ImportedBookmark } from '@/lib/import/types'

describe('findDuplicates', () => {
  const incoming: ImportedBookmark[] = [
    { url: 'https://example.com', title: 'Example', source: 'browser' },
    { url: 'https://github.com', title: 'GitHub', source: 'browser' },
    { url: 'http://www.example.com/', title: 'Example Dupe', source: 'browser' },
    { url: 'https://unique.com', title: 'Unique', source: 'browser' },
  ]
  const existingUrls = ['https://example.com', 'https://other.com']

  it('identifies duplicates against existing URLs', () => {
    const result = findDuplicates(incoming, existingUrls)
    expect(result.unique).toHaveLength(2)
    expect(result.duplicates).toHaveLength(2)
  })
  it('normalizes URLs for comparison', () => {
    const result = findDuplicates(incoming, existingUrls)
    const dupUrls = result.duplicates.map((b) => b.url)
    expect(dupUrls).toContain('http://www.example.com/')
  })
  it('deduplicates within incoming list', () => {
    const result = findDuplicates(incoming, [])
    expect(result.unique).toHaveLength(3)
    expect(result.duplicates).toHaveLength(1)
  })
  it('handles empty inputs', () => {
    expect(findDuplicates([], []).unique).toHaveLength(0)
    expect(findDuplicates(incoming, []).unique.length).toBeGreaterThan(0)
  })
})
