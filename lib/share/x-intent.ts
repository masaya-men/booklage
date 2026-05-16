// lib/share/x-intent.ts
type IntentInput = {
  readonly shareUrl: string
  readonly text?: string
}

const DEFAULT_TEXT = 'AllMarks で見る ↗'

/**
 * Build a Twitter / X Web Intent URL. The image must be attached manually by
 * the user — Web Intent has no image upload param.
 */
export function buildXIntent(input: IntentInput): string {
  const params = new URLSearchParams()
  params.set('text', input.text ?? DEFAULT_TEXT)
  params.set('url', input.shareUrl)
  return `https://twitter.com/intent/tweet?${params.toString()}`
}
