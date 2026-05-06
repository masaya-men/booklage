import { describe, it, expect } from 'vitest'
import type { BoardItem } from '@/lib/storage/use-board-data'
import type { ShareCard } from '@/lib/share/types'
import { normalizeItem } from './lightbox-item'

describe('normalizeItem', () => {
  it('normalizes a BoardItem with all fields', () => {
    const board: BoardItem = {
      bookmarkId: 'b-1',
      cardId: 'c-1',
      title: 'Hello',
      description: 'desc',
      thumbnail: 'https://example.com/t.jpg',
      url: 'https://example.com/page',
      aspectRatio: 1.5,
      gridIndex: 0,
      orderIndex: 0,
      sizePreset: 'M',
      isRead: false,
      isDeleted: false,
      tags: [],
      displayMode: 'visual',
    }
    expect(normalizeItem(board)).toEqual({
      url: 'https://example.com/page',
      title: 'Hello',
      description: 'desc',
      thumbnail: 'https://example.com/t.jpg',
      kind: 'board',
    })
  })

  it('normalizes a BoardItem with optional fields missing', () => {
    const board: BoardItem = {
      bookmarkId: 'b-2',
      cardId: 'c-2',
      title: 'Only',
      url: 'https://example.com/x',
      aspectRatio: 1,
      gridIndex: 0,
      orderIndex: 0,
      sizePreset: 'S',
      isRead: false,
      isDeleted: false,
      tags: [],
      displayMode: null,
    }
    expect(normalizeItem(board)).toEqual({
      url: 'https://example.com/x',
      title: 'Only',
      description: null,
      thumbnail: null,
      kind: 'board',
    })
  })

  it('normalizes a ShareCard with all fields', () => {
    const card: ShareCard = {
      u: 'https://example.com/p',
      t: 'Title',
      d: 'Desc',
      th: 'https://example.com/thumb.jpg',
      ty: 'website',
      x: 0, y: 0, w: 0.5, h: 0.5, s: 'M',
    }
    expect(normalizeItem(card)).toEqual({
      url: 'https://example.com/p',
      title: 'Title',
      description: 'Desc',
      thumbnail: 'https://example.com/thumb.jpg',
      kind: 'share',
    })
  })

  it('normalizes a ShareCard with optional fields missing', () => {
    const card: ShareCard = {
      u: 'https://example.com/p',
      t: 'Title only',
      ty: 'website',
      x: 0, y: 0, w: 0.5, h: 0.5, s: 'M',
    }
    expect(normalizeItem(card)).toEqual({
      url: 'https://example.com/p',
      title: 'Title only',
      description: null,
      thumbnail: null,
      kind: 'share',
    })
  })

  it('discriminates BoardItem vs ShareCard by presence of bookmarkId', () => {
    const board = normalizeItem({
      bookmarkId: 'b', cardId: 'c', title: 't', url: 'https://e/x',
      aspectRatio: 1, gridIndex: 0, orderIndex: 0, sizePreset: 'M',
      isRead: false, isDeleted: false, tags: [], displayMode: null,
    } as BoardItem)
    const share = normalizeItem({
      u: 'https://e/x', t: 't', ty: 'website',
      x: 0, y: 0, w: 0, h: 0, s: 'M',
    } as ShareCard)
    expect(board.kind).toBe('board')
    expect(share.kind).toBe('share')
  })
})
