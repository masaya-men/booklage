/**
 * TextCard height measurement using @chenglou/pretext.
 * Runs browser-side only (pretext uses canvas font metrics).
 *
 * Returns the natural card aspect ratio (width / height) so masonry can size
 * the card tall enough to display the full title without clipping. Matches
 * the chrome padding and meta-row dimensions defined in TextCard.module.css.
 */
import { prepare, layout } from '@chenglou/pretext'
import type { TitleTypographyResult } from './types'

// Keep in sync with TextCard.module.css
const CARD_PADDING_X_PX = 22
const CARD_PADDING_Y_PX = 20
const META_ROW_HEIGHT_PX = 30 // favicon (16) + domain text + gap, laid out in a single row
const META_ROW_GAP_PX = 14 // .metaTop margin-bottom / .metaBottom padding-top

function fontForMode(typography: TitleTypographyResult): string {
  const size = `${typography.fontSize}px`
  switch (typography.mode) {
    case 'headline':
      // Matches `.headline .title` in TextCard.module.css — italic 700 serif.
      return `italic 700 ${size} Fraunces, "Playfair Display", Georgia, serif`
    case 'editorial':
      return `600 ${size} Inter, system-ui, sans-serif`
    case 'index':
      return `400 ${size} "JetBrains Mono", ui-monospace, monospace`
  }
}

/**
 * Compute the natural total card height (including padding + meta row)
 * needed to display the title at the chosen typography without clipping.
 * Returns null if pretext can't measure in this environment (SSR, tests).
 */
export function measureTextCardHeight(input: {
  readonly title: string
  readonly cardWidth: number
  readonly typography: TitleTypographyResult
}): number | null {
  const { title, cardWidth, typography } = input
  if (!title) return null
  if (typeof document === 'undefined') return null // SSR guard

  const innerWidth = Math.max(60, cardWidth - CARD_PADDING_X_PX * 2)
  const font = fontForMode(typography)

  let textHeight: number
  try {
    const prepared = prepare(title, font)
    const result = layout(prepared, innerWidth, typography.lineHeight)
    textHeight = result.height
  } catch {
    return null
  }

  // Chrome: padding top+bottom + one meta row (favicon + domain).
  // Both `headline` (meta at bottom) and `editorial`/`index` (meta at top)
  // allocate the same vertical budget for the meta row.
  const chromeHeight = CARD_PADDING_Y_PX * 2 + META_ROW_HEIGHT_PX + META_ROW_GAP_PX
  return Math.ceil(textHeight + chromeHeight)
}

/** Returns aspectRatio (width / height), or null when measurement is unavailable. */
export function measureTextCardAspectRatio(input: {
  readonly title: string
  readonly cardWidth: number
  readonly typography: TitleTypographyResult
}): number | null {
  const height = measureTextCardHeight(input)
  if (!height || height <= 0) return null
  return input.cardWidth / height
}
