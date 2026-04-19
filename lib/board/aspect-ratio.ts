import type { UrlType } from '@/lib/utils/url'

export type AspectRatioSource =
  | { type: 'youtube' }
  | { type: 'tiktok' }
  | { type: 'instagram-post' }
  | { type: 'instagram-story' }
  | { type: 'tweet'; hasImage: boolean; textLength: number }
  | { type: 'pinterest' }
  | { type: 'soundcloud' | 'spotify' }
  | { type: 'image'; intrinsicRatio?: number }
  | { type: 'generic'; ogImageRatio?: number }

export function estimateAspectRatio(source: AspectRatioSource): number {
  switch (source.type) {
    case 'youtube':
      return 16 / 9
    case 'tiktok':
      return 9 / 16
    case 'instagram-post':
      return 1
    case 'instagram-story':
      return 9 / 16
    case 'tweet':
      if (source.hasImage) return 16 / 9
      if (source.textLength > 140) return 3 / 4
      return 1
    case 'pinterest':
      return 2 / 3
    case 'soundcloud':
    case 'spotify':
      return 1
    case 'image':
      return source.intrinsicRatio ?? 4 / 3
    case 'generic':
      return source.ogImageRatio ?? 4 / 3
  }
}

export type DetectInput = {
  url: string
  urlType: UrlType
  title: string
  description: string
  ogImage?: string
  ogImageRatio?: number
  intrinsicImageRatio?: number
}

const IMAGE_URL_RE = /\.(jpe?g|png|gif|webp|avif|bmp)(\?|$)/i
const STORY_URL_RE = /\/(stories|reels)\//i
const PINTEREST_RE = /pinterest\.com\/pin\//i

export function detectAspectRatioSource(input: DetectInput): AspectRatioSource {
  const { url, urlType, title, description, ogImageRatio, intrinsicImageRatio } = input

  if (urlType === 'youtube') return { type: 'youtube' }
  if (urlType === 'tiktok') return { type: 'tiktok' }

  if (urlType === 'instagram') {
    if (STORY_URL_RE.test(url)) return { type: 'instagram-story' }
    return { type: 'instagram-post' }
  }

  if (urlType === 'tweet') {
    return {
      type: 'tweet',
      hasImage: Boolean(input.ogImage),
      textLength: (description || title).length,
    }
  }

  if (PINTEREST_RE.test(url)) return { type: 'pinterest' }

  if (/soundcloud\.com/i.test(url)) return { type: 'soundcloud' }
  if (/open\.spotify\.com/i.test(url)) return { type: 'spotify' }

  if (IMAGE_URL_RE.test(url)) {
    return { type: 'image', intrinsicRatio: intrinsicImageRatio }
  }

  return { type: 'generic', ogImageRatio }
}
