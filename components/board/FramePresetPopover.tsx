'use client'

import { useState, type ChangeEvent, type ReactElement } from 'react'
import { FRAME_PRESETS, type FramePreset } from '@/lib/board/frame-presets'
import type { FrameRatio } from '@/lib/board/types'
import { FRAME } from '@/lib/board/constants'
import { t } from '@/lib/i18n/t'
import styles from './FramePresetPopover.module.css'

type Props = {
  readonly currentRatio: FrameRatio
  readonly onSelect: (ratio: FrameRatio) => void
  readonly onClose: () => void
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/**
 * Popover shown in Free mode for picking a frame aspect ratio.
 * - 9 SNS/print presets + Custom width×height input.
 * - Toggle-open/close is owned by Toolbar; we do not handle outside-click
 *   (deferred — simplest correct behavior for now; matches Task 19 decision).
 *
 * Design: chrome stays neutral near-black (Toolbar pattern). The only violet
 * accent is the input focus ring, which is an edit affordance.
 *
 * Label text intentionally uses `preset.label` directly (same as Toolbar's
 * current-preset chip) for consistency; the `messageKey` field on each preset
 * is reserved for future full i18n expansion.
 */
export function FramePresetPopover({ currentRatio, onSelect }: Props): ReactElement {
  // Initial values are read from currentRatio only when the component mounts.
  // Toolbar unmounts this popover on close, so reopening naturally re-reads
  // the latest custom dimensions. No useEffect sync needed.
  const [customW, setCustomW] = useState<number>(
    currentRatio.kind === 'custom' ? currentRatio.width : 800,
  )
  const [customH, setCustomH] = useState<number>(
    currentRatio.kind === 'custom' ? currentRatio.height : 800,
  )

  const isCustom = currentRatio.kind === 'custom'
  const currentPresetId = currentRatio.kind === 'preset' ? currentRatio.presetId : null

  const handleWidthChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const n = Number(e.target.value)
    if (!Number.isFinite(n)) return
    setCustomW(n)
  }

  const handleHeightChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const n = Number(e.target.value)
    if (!Number.isFinite(n)) return
    setCustomH(n)
  }

  const applyCustom = (): void => {
    // Clamp only at apply-time — free-form typing in the middle of a number
    // (e.g. "30" on the way to "3000") should not be hijacked.
    const w = clamp(customW, FRAME.MIN_PX, FRAME.MAX_PX)
    const h = clamp(customH, FRAME.MIN_PX, FRAME.MAX_PX)
    setCustomW(w)
    setCustomH(h)
    onSelect({ kind: 'custom', width: w, height: h })
  }

  const handleCustomPresetClick = (): void => {
    const w = clamp(customW, FRAME.MIN_PX, FRAME.MAX_PX)
    const h = clamp(customH, FRAME.MIN_PX, FRAME.MAX_PX)
    onSelect({ kind: 'custom', width: w, height: h })
  }

  return (
    <div
      className={styles.container}
      role="dialog"
      aria-label={t('board.frame.popover.title')}
      data-testid="frame-preset-popover"
    >
      <h2 className={styles.title}>{t('board.frame.popover.title')}</h2>
      <div className={styles.grid}>
        {FRAME_PRESETS.filter((p) => p.id !== 'custom').map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            selected={currentPresetId === preset.id}
            onClick={(): void => onSelect({ kind: 'preset', presetId: preset.id })}
          />
        ))}
        <button
          type="button"
          className={`${styles.preset} ${isCustom ? styles.selected : ''}`}
          onClick={handleCustomPresetClick}
          aria-pressed={isCustom}
        >
          <span
            className={`${styles.swatch} ${styles.customSwatch}`}
            style={{ width: 34, height: 16 }}
            aria-hidden="true"
          />
          <span className={styles.label}>{t('board.frame.preset.custom')}</span>
        </button>
      </div>
      {isCustom && (
        <div className={styles.customForm}>
          <input
            type="number"
            value={customW}
            min={FRAME.MIN_PX}
            max={FRAME.MAX_PX}
            onChange={handleWidthChange}
            aria-label="幅"
          />
          <span className={styles.times} aria-hidden="true">
            ×
          </span>
          <input
            type="number"
            value={customH}
            min={FRAME.MIN_PX}
            max={FRAME.MAX_PX}
            onChange={handleHeightChange}
            aria-label="高さ"
          />
          <button type="button" className={styles.apply} onClick={applyCustom}>
            {t('board.frame.popover.applyCustom')}
          </button>
        </div>
      )}
    </div>
  )
}

type PresetCardProps = {
  readonly preset: FramePreset
  readonly selected: boolean
  readonly onClick: () => void
}

function PresetCard({ preset, selected, onClick }: PresetCardProps): ReactElement {
  const [rw, rh] = preset.ratio
  const maxSide = 34
  const scale = Math.min(maxSide / rw, maxSide / rh)
  const swW = rw * scale
  const swH = rh * scale

  return (
    <button
      type="button"
      className={`${styles.preset} ${selected ? styles.selected : ''}`}
      onClick={onClick}
      aria-pressed={selected}
    >
      <span
        className={styles.swatch}
        style={{ width: swW, height: swH }}
        aria-hidden="true"
      />
      <span className={styles.label}>{preset.label}</span>
    </button>
  )
}
