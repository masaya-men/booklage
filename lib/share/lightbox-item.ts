import type { BoardItem } from '@/lib/storage/use-board-data'
import type { ShareCard } from './types'
import type { MediaSlot } from '@/lib/embed/types'

export type LightboxItem = {
  readonly url: string
  readonly title: string
  readonly description: string | null
  readonly thumbnail: string | null
  readonly kind: 'board' | 'share'
  /** Board-side only: stable bookmark id (used as effect dep / persist key).
   *  Undefined for share-card view. I-07 Phase 1. */
  readonly bookmarkId?: string
  /** Board-side only: all photo URLs for multi-image tweets (Twitter/X up to
   *  4, Bluesky up to 4). photos[0] equals thumbnail. Undefined or
   *  zero-length when single-image or video-only. I-07 Phase 1. */
  readonly photos?: readonly string[]
  /** Board-side only: v13 unified media slot array. mediaSlots[0] may be a
   *  video poster for mix tweets. Undefined → fall through to photos /
   *  thumbnail (= 旧挙動). */
  readonly mediaSlots?: readonly MediaSlot[]
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
      bookmarkId: item.bookmarkId,
      photos: item.photos,
      mediaSlots: item.mediaSlots,
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
