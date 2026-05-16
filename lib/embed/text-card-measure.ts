/**
 * TextCard height measurement using @chenglou/pretext.
 * Runs browser-side only (pretext uses canvas font metrics).
 *
 * Returns layout hints (natural aspect ratio + display max-lines) so masonry
 * can size the card tall enough to display the full title without clipping,
 * AND so TextCard can clamp display lines once the natural height would
 * exceed the 9:16 ceiling (matching Twitter / TikTok portrait video bounds).
 */
import { prepare, layout } from '@chenglou/pretext'
import type { TitleTypographyResult } from './types'

// Keep in sync with TextCard.module.css
const CARD_PADDING_X_PX = 22
const CARD_PADDING_Y_PX = 20
const META_ROW_HEIGHT_PX = 30 // favicon (16) + domain text + gap, laid out in a single row
const META_ROW_GAP_PX = 14 // .metaTop margin-bottom / .metaBottom padding-top

/** Aspect ratio floor — height ceiling expressed as width / height.
 *  9 / 16 = 0.5625 matches Twitter / TikTok portrait video. Beyond this
 *  the card is clipped with an ellipsis instead of growing further. */
export const TEXT_CARD_MIN_ASPECT = 9 / 16

function fontForMode(typography: TitleTypographyResult): string {
  const size = `${typography.fontSize}px`
  // Matches the Geist family unified across TextCard (headline / editorial / index).
  // Canvas font spec needs literal family names — Geist is loaded via next/font, with
  // CJK + system fallback so canvas measurement degrades gracefully in test envs.
  const sansFallback = 'Geist, "Hiragino Sans", "Yu Gothic", system-ui, sans-serif'
  const monoFallback = '"Geist Mono", ui-monospace, "Cascadia Code", Menlo, Consolas, monospace'
  switch (typography.mode) {
    case 'headline':
      return `700 ${size} ${sansFallback}`
    case 'editorial':
      return `500 ${size} ${sansFallback}`
    case 'index':
      return `400 ${size} ${monoFallback}`
  }
}

export type TextCardLayout = {
  /** width / height ratio used to size the card in masonry */
  readonly aspectRatio: number
  /** Number of title lines to display. When `clamped` is true this is the
   *  visible line cap; the remainder is hidden with an ellipsis. */
  readonly maxLines: number
  /** True when the title's natural rendered height would have exceeded the
   *  9:16 ceiling and was clamped. TextCard.tsx uses this to enable
   *  `-webkit-line-clamp` ellipsis truncation. */
  readonly clamped: boolean
}

/**
 * Resolve the TextCard's display layout: aspect ratio + visible line count.
 * Returns null if pretext can't measure in this environment (SSR, tests).
 */
export function measureTextCardLayout(input: {
  readonly title: string
  readonly cardWidth: number
  readonly typography: TitleTypographyResult
}): TextCardLayout | null {
  const { title, cardWidth, typography } = input
  if (!title) return null
  if (typeof document === 'undefined') return null // SSR guard

  const innerWidth = Math.max(60, cardWidth - CARD_PADDING_X_PX * 2)
  const font = fontForMode(typography)

  let naturalTextHeight: number
  try {
    const prepared = prepare(title, font)
    const result = layout(prepared, innerWidth, typography.lineHeight)
    naturalTextHeight = result.height
  } catch {
    return null
  }

  const chromeHeight = CARD_PADDING_Y_PX * 2 + META_ROW_HEIGHT_PX + META_ROW_GAP_PX
  const naturalTotalHeight = Math.ceil(naturalTextHeight + chromeHeight)
  const ceilingHeight = Math.floor(cardWidth / TEXT_CARD_MIN_ASPECT)

  if (naturalTotalHeight <= ceilingHeight) {
    // Fits inside the 9:16 ceiling — show the full title, no ellipsis.
    const naturalLines = Math.max(1, Math.round(naturalTextHeight / typography.lineHeight))
    return {
      aspectRatio: cardWidth / naturalTotalHeight,
      maxLines: Math.min(naturalLines, typography.maxLines),
      clamped: false,
    }
  }

  // Clamp height to the 9:16 ceiling and compute how many lines fit.
  const availableTextHeight = Math.max(typography.lineHeight, ceilingHeight - chromeHeight)
  const fittingLines = Math.max(1, Math.floor(availableTextHeight / typography.lineHeight))
  return {
    aspectRatio: TEXT_CARD_MIN_ASPECT,
    maxLines: fittingLines,
    clamped: true,
  }
}
