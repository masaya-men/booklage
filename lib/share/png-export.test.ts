// lib/share/png-export.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('dom-to-image-more', () => ({
  default: {
    toPng: vi.fn().mockResolvedValue('data:image/png;base64,iVBORw0KGgo='),
  },
}))

import { exportFrameAsPng, drawWatermarkOnCanvas } from './png-export'
import { WATERMARK_VARIANT_A } from './watermark-config'

describe('drawWatermarkOnCanvas', () => {
  it('returns the canvas after drawing (smoke)', () => {
    const ctxStub = {
      measureText: () => ({ width: 50 }),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      arcTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      set fillStyle(_v: string) {},
      set font(_v: string) {},
      set textBaseline(_v: string) {},
    }
    const canvas = {
      width: 800,
      height: 600,
      getContext: (): typeof ctxStub => ctxStub,
    } as unknown as HTMLCanvasElement
    const out = drawWatermarkOnCanvas(canvas, WATERMARK_VARIANT_A)
    expect(out).toBe(canvas)
  })
})

describe('exportFrameAsPng', () => {
  it('calls dom-to-image-more.toPng with element (skipping canvas overlay)', async () => {
    const fakeEl = document.createElement('div')
    fakeEl.style.width = '800px'
    fakeEl.style.height = '600px'
    const dataUrl = await exportFrameAsPng(fakeEl, WATERMARK_VARIANT_A, { skipCanvasOverlay: true })
    expect(dataUrl.startsWith('data:image/png')).toBe(true)
  })
})
