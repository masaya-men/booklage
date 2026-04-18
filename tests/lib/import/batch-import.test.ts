import { describe, it, expect } from 'vitest'
import { formatImportFolderName } from '@/lib/import/batch-import'

describe('formatImportFolderName', () => {
  it('returns インポート YYYY-MM-DD in local date', () => {
    const date = new Date(2026, 3, 18, 12, 0, 0) // 2026-04-18 local
    expect(formatImportFolderName(date)).toBe('インポート 2026-04-18')
  })

  it('zero-pads month and day', () => {
    const date = new Date(2026, 0, 5, 12, 0, 0) // 2026-01-05 local
    expect(formatImportFolderName(date)).toBe('インポート 2026-01-05')
  })
})
