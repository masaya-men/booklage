import type { ComponentType } from 'react'
import type { BoardItem } from '@/lib/storage/use-board-data'
import type { DisplayMode } from '@/lib/board/types'
import { detectUrlType } from '@/lib/utils/url'
import { VideoThumbCard } from './VideoThumbCard'
import { ImageCard } from './ImageCard'
import { TextCard } from './TextCard'
import { MinimalCard } from './MinimalCard'

export { VideoThumbCard, ImageCard, TextCard, MinimalCard }

export type CardComponentProps = {
  readonly item: BoardItem
  readonly persistMeasuredAspect?: (cardId: string, aspectRatio: number) => Promise<void>
  /** Reports the card's actual rendered height in px to the parent layout.
   * Used by text-heavy cards where height does not scale with width. */
  readonly reportIntrinsicHeight?: (cardId: string, heightPx: number) => void
  readonly cardWidth?: number
  readonly cardHeight?: number
  readonly displayMode: DisplayMode
}

export type CardComponent = ComponentType<CardComponentProps>

/** Returns false when title is empty/equals-url AND thumbnail is empty. */
function hasUsableMetadata(item: BoardItem): boolean {
  const hasTitle = !!item.title && item.title !== item.url
  const hasThumb = !!item.thumbnail
  return hasTitle || hasThumb
}

/**
 * Pick the appropriate card component based on URL type and OGP availability.
 * Pure function — easy to test in isolation.
 *
 * Routing logic:
 * - 'youtube' or 'tiktok' → VideoThumbCard (always — fetches thumbnail itself)
 * - no usable metadata (title empty/URL-only AND no thumbnail) → MinimalCard
 * - any other URL with thumbnail → ImageCard (tweets with media land here too)
 * - any other URL without thumbnail → TextCard
 */
export function pickCard(item: BoardItem): CardComponent {
  const type = detectUrlType(item.url)
  if (type === 'youtube' || type === 'tiktok') return VideoThumbCard
  if (!hasUsableMetadata(item)) return MinimalCard
  return item.thumbnail ? ImageCard : TextCard
}
