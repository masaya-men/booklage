// lib/share/board-to-cards.ts
import type { ShareCard, ShareSize } from './types'

type Item = {
  readonly bookmarkId: string
  readonly url: string
  readonly title: string
  readonly description?: string
  readonly thumbnail: string
  readonly type: ShareCard['ty']
  readonly sizePreset: ShareSize
}

type Pos = { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
type Viewport = { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

/** Keep items whose layout rect intersects the viewport (rectangle overlap test). */
export function filterByViewport<T extends { readonly bookmarkId: string }>(
  items: ReadonlyArray<T>,
  positions: Readonly<Record<string, Pos>>,
  viewport: Viewport,
): T[] {
  const out: T[] = []
  for (const it of items) {
    const p = positions[it.bookmarkId]
    if (!p) continue
    const right = p.x + p.w
    const bottom = p.y + p.h
    const vRight = viewport.x + viewport.w
    const vBottom = viewport.y + viewport.h
    if (right < viewport.x || p.x > vRight) continue
    if (bottom < viewport.y || p.y > vBottom) continue
    out.push(it)
  }
  return out
}

/** Convert board items + masonry positions into a ShareCard array (0..1 normalized). */
export function boardItemsToShareCards(
  items: ReadonlyArray<Item>,
  positions: Readonly<Record<string, Pos>>,
  frameSize: { readonly width: number; readonly height: number },
): ShareCard[] {
  const out: ShareCard[] = []
  for (const it of items) {
    const p = positions[it.bookmarkId]
    if (!p) continue
    out.push({
      u: it.url,
      t: it.title,
      d: it.description || undefined,
      th: it.thumbnail || undefined,
      ty: it.type,
      x: p.x / frameSize.width,
      y: p.y / frameSize.height,
      w: p.w / frameSize.width,
      h: p.h / frameSize.height,
      s: it.sizePreset,
    })
  }
  return out
}
