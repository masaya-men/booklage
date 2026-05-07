import { describe, it, expect } from 'vitest'
import { applyFilter } from '@/lib/board/filter'
import type { BoardItem } from '@/lib/storage/use-board-data'

function mk(partial: Partial<BoardItem> & { bookmarkId: string; tags?: string[] }): BoardItem {
  return {
    bookmarkId: partial.bookmarkId,
    cardId: 'c-' + partial.bookmarkId,
    title: partial.bookmarkId,
    url: 'https://example.com/' + partial.bookmarkId,
    aspectRatio: 1,
    gridIndex: 0,
    orderIndex: 0,
    sizePreset: 'S',
    cardWidth: 240,
    isRead: partial.isRead ?? false,
    isDeleted: partial.isDeleted ?? false,
    tags: partial.tags ?? [],
    displayMode: null,
  } as BoardItem
}

describe('applyFilter', () => {
  const items: BoardItem[] = [
    mk({ bookmarkId: 'a', tags: ['m1'] }),
    mk({ bookmarkId: 'b', tags: [] }),
    mk({ bookmarkId: 'c', tags: ['m2'], isDeleted: true }),
    mk({ bookmarkId: 'd', tags: ['m1', 'm2'] }),
  ]

  it("'all' returns non-deleted items", () => {
    expect(applyFilter(items, 'all').map((x) => x.bookmarkId)).toEqual(['a', 'b', 'd'])
  })

  it("'inbox' returns non-deleted items with empty tags", () => {
    expect(applyFilter(items, 'inbox').map((x) => x.bookmarkId)).toEqual(['b'])
  })

  it("'archive' returns deleted items only", () => {
    expect(applyFilter(items, 'archive').map((x) => x.bookmarkId)).toEqual(['c'])
  })

  it("'mood:<id>' returns non-deleted items whose tags include id", () => {
    expect(applyFilter(items, 'mood:m1').map((x) => x.bookmarkId)).toEqual(['a', 'd'])
    expect(applyFilter(items, 'mood:m2').map((x) => x.bookmarkId)).toEqual(['d']) // c is deleted
  })
})
