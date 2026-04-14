import {
  CARD_SIZES,
  CARD_ASPECT_RATIOS,
  RANDOM_CARD_SIZES,
  RANDOM_ASPECT_RATIOS,
  type CardSizePreset,
  type CardAspectPreset,
} from '@/lib/constants'

type CardDimensions = {
  width: number
  height: number
  sizePreset: CardSizePreset
  aspectPreset: CardAspectPreset
}

export function generateCardDimensions(
  preferredSize: 'random' | CardSizePreset = 'random',
  preferredAspect: 'random' | CardAspectPreset = 'random',
  thumbnailAspect?: number,
): CardDimensions {
  const sizePreset: CardSizePreset =
    preferredSize === 'random'
      ? RANDOM_CARD_SIZES[Math.floor(Math.random() * RANDOM_CARD_SIZES.length)]
      : preferredSize

  const width = CARD_SIZES[sizePreset]

  const aspectPreset: CardAspectPreset =
    preferredAspect === 'random'
      ? RANDOM_ASPECT_RATIOS[Math.floor(Math.random() * RANDOM_ASPECT_RATIOS.length)]
      : preferredAspect

  let ratio = CARD_ASPECT_RATIOS[aspectPreset]
  if (ratio === null) {
    ratio = thumbnailAspect ?? 4 / 3
  }

  const height = Math.round(width / ratio)

  return { width, height, sizePreset, aspectPreset }
}
