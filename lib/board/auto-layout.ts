import type { LayoutInput, LayoutResult, LayoutCard, CardPosition } from './types'
import { LAYOUT_CONFIG } from './constants'

export function computeAutoLayout(input: LayoutInput): LayoutResult {
  const { cards, viewportWidth, targetRowHeight, gap } = input
  const positions: Record<string, CardPosition> = {}

  if (cards.length === 0) {
    return { positions, totalHeight: 0, totalWidth: viewportWidth }
  }

  const autoCards: LayoutCard[] = []
  for (const c of cards) {
    if (c.userOverridePos) {
      positions[c.id] = c.userOverridePos
    } else {
      autoCards.push(c)
    }
  }

  const marginX = LAYOUT_CONFIG.CONTAINER_MARGIN_PX
  const contentWidth = Math.max(0, viewportWidth - marginX * 2)

  const rows: LayoutCard[][] = []
  let currentRow: LayoutCard[] = []
  let currentRowWantedWidth = 0

  for (const c of autoCards) {
    currentRow.push(c)
    currentRowWantedWidth += c.aspectRatio * targetRowHeight
    const gapsTotal = (currentRow.length - 1) * gap
    if (currentRowWantedWidth + gapsTotal >= contentWidth) {
      rows.push(currentRow)
      currentRow = []
      currentRowWantedWidth = 0
    }
  }
  if (currentRow.length > 0) rows.push(currentRow)

  let cursorY = 0
  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx]
    const isLastRow = rowIdx === rows.length - 1
    const totalWantedWidth = row.reduce(
      (sum, c) => sum + c.aspectRatio * targetRowHeight,
      0,
    )
    const gapsTotal = (row.length - 1) * gap
    const availableWidth = contentWidth - gapsTotal

    const shouldJustify = !isLastRow || totalWantedWidth >= availableWidth
    const scale = shouldJustify && totalWantedWidth > 0 ? availableWidth / totalWantedWidth : 1
    const rowHeight = targetRowHeight * scale

    let cursorX = marginX
    for (const c of row) {
      const w = c.aspectRatio * targetRowHeight * scale
      const h = rowHeight
      positions[c.id] = { x: cursorX, y: cursorY, w, h }
      cursorX += w + gap
    }
    cursorY += rowHeight
    if (!isLastRow) cursorY += gap
  }

  return {
    positions,
    totalHeight: cursorY,
    totalWidth: viewportWidth,
  }
}
