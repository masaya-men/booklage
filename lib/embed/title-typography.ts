import type { TitleMode, TitleTypographyResult } from './types'

type Input = {
  readonly title: string
  readonly cardWidth: number
  readonly cardHeight: number
}

/** Half-width unit count: CJK / wide chars count as 2, ascii as 1. */
function widthUnits(title: string): number {
  let count = 0
  for (const ch of title) {
    const code = ch.codePointAt(0) ?? 0
    // CJK Unified Ideographs, Hiragana, Katakana, Hangul, Fullwidth ASCII
    if (
      (code >= 0x3040 && code <= 0x309f) ||
      (code >= 0x30a0 && code <= 0x30ff) ||
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0xff00 && code <= 0xffef)
    ) {
      count += 2
    } else {
      count += 1
    }
  }
  return count
}

/**
 * Pick a typography mode for a TextCard title.
 * Decision is based on visual width units (CJK counts as 2x ASCII).
 *
 * - headline: ≤ 48 units → big display serif
 * - editorial: 49–160 units → sans 22px multi-line
 * - index: > 160 units → small mono / sans, many lines
 */
export function pickTitleTypography(input: Input): TitleTypographyResult {
  const units = widthUnits(input.title)

  let mode: TitleMode
  let fontSize: number
  let lineHeight: number
  let maxLines: number

  // Sizes are 40% smaller than the pre-redesign baseline (session 31):
  // tighter, reference-image-faithful typography that still keeps editorial
  // and index modes legible on a board card. lineHeight stays proportional
  // to fontSize so multi-line titles breathe consistently.
  if (units <= 48) {
    mode = 'headline'
    fontSize = units <= 12 ? 34 : units <= 24 ? 29 : 24
    lineHeight = Math.round(fontSize * 1.18)
    maxLines = 6
  } else if (units <= 160) {
    mode = 'editorial'
    fontSize = 18
    lineHeight = Math.round(fontSize * 1.4)
    maxLines = 8
  } else {
    mode = 'index'
    fontSize = 13
    lineHeight = Math.round(fontSize * 1.5)
    maxLines = 12
  }

  return { mode, fontSize, lineHeight, maxLines }
}
