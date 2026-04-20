import type { ComponentType } from 'react'
import type { BoardItem } from '@/lib/storage/use-board-data'
import { detectUrlType } from '@/lib/utils/url'
import { TweetCard } from './TweetCard'
import { VideoThumbCard } from './VideoThumbCard'
import { ImageCard } from './ImageCard'
import { TextCard } from './TextCard'

export { TweetCard, VideoThumbCard, ImageCard, TextCard }

export type CardComponentProps = {
  readonly item: BoardItem
  readonly persistMeasuredAspect?: (cardId: string, aspectRatio: number) => Promise<void>
  readonly cardWidth?: number
  readonly cardHeight?: number
}

export type CardComponent = ComponentType<CardComponentProps>

/**
 * Pick the appropriate card component based on URL type and OGP availability.
 * Pure function — easy to test in isolation.
 *
 * Routing logic:
 * - 'tweet' URL → TweetCard
 * - 'youtube' or 'tiktok' → VideoThumbCard
 * - 'website' with thumbnail → ImageCard
 * - 'website' without thumbnail → TextCard (solves white card issue)
 */
export function pickCard(item: BoardItem): CardComponent {
  const type = detectUrlType(item.url)
  switch (type) {
    case 'tweet':
      return TweetCard
    case 'youtube':
    case 'tiktok':
      return VideoThumbCard
    default:
      // OGP image present → ImageCard, else TextCard (solves white card)
      return item.thumbnail ? ImageCard : TextCard
  }
}
