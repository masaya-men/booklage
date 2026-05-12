import { describe, it, expect } from 'vitest'
import { applyFilter } from '@/lib/board/filter'

const make = (id: string, opts: { linkStatus?: 'alive' | 'gone' | 'unknown'; isDeleted?: boolean }) =>
  ({
    bookmarkId: id, cardId: id, url: '', title: '',
    aspectRatio: 1, gridIndex: 0, orderIndex: 0,
    cardWidth: 240, customCardWidth: false,
    isRead: false, isDeleted: !!opts.isDeleted,
    tags: [], displayMode: null,
    linkStatus: opts.linkStatus,
  } as never)

describe("applyFilter 'dead'", () => {
  it('returns only items with linkStatus = gone, excluding archived', () => {
    const items = [
      make('a', { linkStatus: 'alive' }),
      make('b', { linkStatus: 'gone' }),
      make('c', { linkStatus: 'gone', isDeleted: true }),
      make('d', { linkStatus: 'unknown' }),
      make('e', {}),
    ]
    const out = applyFilter(items, 'dead')
    expect(out.map((x) => x.bookmarkId)).toEqual(['b'])
  })

  it('returns empty array when no gone items exist', () => {
    const items = [make('a', { linkStatus: 'alive' }), make('b', {})]
    expect(applyFilter(items, 'dead')).toEqual([])
  })
})
