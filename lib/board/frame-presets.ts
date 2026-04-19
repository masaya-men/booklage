import type { FrameRatio } from './types'
import { FRAME } from './constants'

export type FramePreset = {
  readonly id: string
  readonly label: string
  readonly ratio: readonly [number, number]  // [w, h]
  readonly messageKey: string
  readonly group: 'sns' | 'print' | 'misc'
}

export const FRAME_PRESETS: readonly FramePreset[] = [
  { id: 'ig-square',    label: 'Instagram',    ratio: [1, 1],     messageKey: 'frame.preset.igSquare',    group: 'sns' },
  { id: 'story-reels',  label: 'Story/Reels',  ratio: [9, 16],    messageKey: 'frame.preset.storyReels',  group: 'sns' },
  { id: 'ig-landscape', label: 'IG Landscape', ratio: [191, 100], messageKey: 'frame.preset.igLandscape', group: 'sns' },
  { id: 'x-landscape',  label: 'X 横',         ratio: [16, 9],    messageKey: 'frame.preset.xLandscape',  group: 'sns' },
  { id: 'x-portrait',   label: 'X 縦',         ratio: [4, 5],     messageKey: 'frame.preset.xPortrait',   group: 'sns' },
  { id: 'pinterest',    label: 'Pinterest',    ratio: [2, 3],     messageKey: 'frame.preset.pinterest',   group: 'sns' },
  { id: 'yt-thumb',     label: 'YT Thumbnail', ratio: [16, 9],    messageKey: 'frame.preset.ytThumb',     group: 'misc' },
  { id: 'a4',           label: 'A4',           ratio: [1000, 1414], messageKey: 'frame.preset.a4',        group: 'print' },
  { id: 'custom',       label: 'Custom',       ratio: [1, 1],     messageKey: 'frame.preset.custom',      group: 'misc' },
] as const

export const DEFAULT_PRESET_ID = 'ig-square'

export function getPresetById(id: string): FramePreset | null {
  return FRAME_PRESETS.find(p => p.id === id) ?? null
}

export type FrameSize = { readonly width: number; readonly height: number }

/**
 * Compute frame pixel size to fit within viewport, preserving the preset ratio.
 * For custom: uses explicit width/height, clamped to FRAME.MIN_PX..MAX_PX.
 */
export function computeFrameSize(ratio: FrameRatio, viewportWidth: number, viewportHeight: number): FrameSize {
  if (ratio.kind === 'custom') {
    return { width: ratio.width, height: ratio.height }
  }
  const preset = getPresetById(ratio.presetId)
  if (!preset) {
    return computeFrameSize({ kind: 'preset', presetId: DEFAULT_PRESET_ID }, viewportWidth, viewportHeight)
  }
  const [rw, rh] = preset.ratio
  // Fit into viewport while preserving rw:rh
  const scale = Math.min(viewportWidth / rw, viewportHeight / rh)
  return { width: rw * scale, height: rh * scale }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
