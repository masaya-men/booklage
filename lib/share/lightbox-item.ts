import type { BoardItem } from '@/lib/storage/use-board-data'
import type { ShareCard } from './types'

export type LightboxItem = {
  readonly url: string
  readonly title: string
  readonly description: string | null
  readonly thumbnail: string | null
  readonly kind: 'board' | 'share'
}

function isBoardItem(item: BoardItem | ShareCard): item is BoardItem {
  return 'bookmarkId' in item
}

export function normalizeItem(item: BoardItem | ShareCard): LightboxItem {
  if (isBoardItem(item)) {
    return {
      url: item.url,
      title: item.title,
      description: item.description ?? null,
      thumbnail: item.thumbnail ?? null,
      kind: 'board',
    }
  }
  return {
    url: item.u,
    title: item.t,
    description: item.d ?? null,
    thumbnail: item.th ?? null,
    kind: 'share',
  }
}
