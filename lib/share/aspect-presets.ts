// lib/share/aspect-presets.ts
import type { ShareAspect } from './types'

export type AspectPreset = {
  readonly id: ShareAspect
  readonly label: string
  /** [w, h] ratio. `null` for 'free' (viewport-fit). */
  readonly ratio: readonly [number, number] | null
}

export const ASPECT_PRESETS: ReadonlyArray<AspectPreset> = [
  { id: 'free',  label: '全体',   ratio: null },
  { id: '1:1',   label: '1:1',    ratio: [1, 1] },
  { id: '9:16',  label: '9:16',   ratio: [9, 16] },
  { id: '16:9',  label: '16:9',   ratio: [16, 9] },
]

export type FrameSize = { readonly width: number; readonly height: number }

/**
 * Fit the preset ratio into the available viewport, preserving aspect.
 * 'free' returns the viewport itself.
 */
export function computeAspectFrameSize(
  aspect: ShareAspect,
  viewportWidth: number,
  viewportHeight: number,
): FrameSize {
  const preset = ASPECT_PRESETS.find((p) => p.id === aspect)
  if (!preset || preset.ratio === null) {
    return { width: viewportWidth, height: viewportHeight }
  }
  const [rw, rh] = preset.ratio
  const scale = Math.min(viewportWidth / rw, viewportHeight / rh)
  return { width: rw * scale, height: rh * scale }
}
