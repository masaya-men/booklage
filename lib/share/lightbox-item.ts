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
  /** Board-side only: stable card id (drives TextCard's deterministic
   *  color variant so opening the lightbox doesn't flip the variant).
   *  Undefined for share-card view; fallback hashing uses `url`. */
  readonly cardId?: string
  /** Board-side only: all photo URLs for multi-image tweets (Twitter/X up to
   *  4, Bluesky up to 4). photos[0] equals thumbnail. Undefined or
   *  zero-length when single-image or video-only. I-07 Phase 1. */
  readonly photos?: readonly string[]
  /** Board-side only: v13 unified media slot array. mediaSlots[0] may be a
   *  video poster for mix tweets. Undefined → fall through to photos /
   *  thumbnail (= 旧挙動). */
  readonly mediaSlots?: readonly MediaSlot[]
  /** Board card aspect ratio (width / height). Used by Lightbox video embeds
   *  (YouTube / TikTok / Instagram) to render the pre-play poster at the
   *  *same* aspect the user saw on the board card, so the open animation's
   *  clone-to-media swap is visually unbroken. Falls back to 16:9 when
   *  undefined (share cards have no persisted aspect). B-#17-#2. */
  readonly aspectRatio?: number
  /** Board-side only: the cardWidth the board card was rendered at.
   *  Lightbox uses this to re-render TextCard at the *exact same* cardWidth
   *  and then up-scale the wrapper via transform:scale — board と Lightbox で
   *  font サイズ / padding / レイアウトが完全同一になる (session 32 fix)。
   *  Undefined for share-card view; fallback to a sensible default. */
  readonly cardWidth?: number
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
      cardId: item.cardId,
      photos: item.photos,
      mediaSlots: item.mediaSlots,
      aspectRatio: item.aspectRatio,
      cardWidth: item.cardWidth,
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
