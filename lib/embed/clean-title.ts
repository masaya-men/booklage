/**
 * Title text cleaner shared by TextCard (board) and LightboxTextDisplay
 * (Lightbox). Two passes:
 *  1) Strip `http(s)://` prefix so raw-URL titles don't dominate display.
 *  2) For X / Twitter URLs, lift the body out of the OGP boilerplate
 *     ("Xユーザーの 〜 さん:「本文」 / X" → "本文").
 */
export function cleanTitle(title: string, url: string): string {
  let cleaned = title
  if (/^https?:\/\//i.test(cleaned)) {
    cleaned = cleaned.replace(/^https?:\/\//i, '')
  }
  if (url.includes('x.com') || url.includes('twitter.com')) {
    const m = cleaned.match(/「([\s\S]+)」/)
    if (m) return m[1].trim()
  }
  return cleaned
}
