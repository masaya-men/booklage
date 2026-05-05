// lib/share/png-export.ts
import domtoimage from 'dom-to-image-more'
import type { WatermarkSpec } from './watermark-config'

/**
 * Draw watermark badge in bottom-right of an existing <canvas>. Returns the
 * same canvas (chainable).
 */
export function drawWatermarkOnCanvas(canvas: HTMLCanvasElement, spec: WatermarkSpec): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  ctx.font = `${spec.fontWeight} ${spec.primaryFontSize}px ${spec.fontFamily}`
  const primaryW = ctx.measureText(spec.primary).width
  let secondaryW = 0
  if (spec.secondary) {
    ctx.font = `400 ${spec.secondaryFontSize}px ${spec.fontFamily}`
    secondaryW = ctx.measureText(spec.secondary).width
  }

  const lineGap = spec.secondary ? 2 : 0
  const textW = Math.max(primaryW, secondaryW)
  const textH = spec.primaryFontSize + (spec.secondary ? lineGap + spec.secondaryFontSize : 0)
  const boxW = textW + 2 * spec.paddingX
  const boxH = textH + 2 * spec.paddingY

  const x = canvas.width - spec.margin - boxW
  const y = canvas.height - spec.margin - boxH

  ctx.fillStyle = spec.bg
  const r = spec.borderRadius
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + boxW, y, x + boxW, y + boxH, r)
  ctx.arcTo(x + boxW, y + boxH, x, y + boxH, r)
  ctx.arcTo(x, y + boxH, x, y, r)
  ctx.arcTo(x, y, x + boxW, y, r)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = spec.textColor
  ctx.font = `${spec.fontWeight} ${spec.primaryFontSize}px ${spec.fontFamily}`
  ctx.textBaseline = 'top'
  ctx.fillText(spec.primary, x + spec.paddingX, y + spec.paddingY)

  if (spec.secondary) {
    ctx.fillStyle = spec.secondaryColor
    ctx.font = `400 ${spec.secondaryFontSize}px ${spec.fontFamily}`
    ctx.fillText(
      spec.secondary,
      x + spec.paddingX,
      y + spec.paddingY + spec.primaryFontSize + lineGap,
    )
  }
  return canvas
}

type ExportOpts = {
  /** Test-only: skip canvas-image roundtrip and return the dom-to-image dataURL directly. */
  readonly skipCanvasOverlay?: boolean
  readonly scale?: number
}

/**
 * Render an element to PNG with watermark composited via canvas (so the
 * watermark cannot be removed by DOM tampering before export).
 */
export async function exportFrameAsPng(
  el: HTMLElement,
  watermark: WatermarkSpec,
  opts: ExportOpts = {},
): Promise<string> {
  const scale = opts.scale ?? 2
  const dataUrl = await domtoimage.toPng(el, { scale, bgcolor: '#0c0c0e' } as never)
  if (opts.skipCanvasOverlay) return dataUrl

  const img = await loadImage(dataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0)
  drawWatermarkOnCanvas(canvas, watermark)
  return canvas.toDataURL('image/png')
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = (): void => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
