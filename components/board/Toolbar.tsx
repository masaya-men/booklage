'use client'

import { useState, type ReactElement } from 'react'
import type { FrameRatio, ThemeId } from '@/lib/board/types'
import { t } from '@/lib/i18n/t'
import { getPresetById } from '@/lib/board/frame-presets'
import { FramePresetPopover } from './FramePresetPopover'
import styles from './Toolbar.module.css'

// TODO(Task 8): Replace Toolbar body with { onAlign, onShare } only.
// FramePresetPopover + preset button move into ShareModal (Plan B).
type Props = {
  readonly frameRatio: FrameRatio
  readonly onFrameRatioChange: (ratio: FrameRatio) => void
  readonly themeId: ThemeId
  readonly onThemeClick?: () => void
  readonly onShareClick?: () => void
}

export function Toolbar(props: Props): ReactElement {
  const [presetOpen, setPresetOpen] = useState<boolean>(false)

  const currentPresetLabel: string =
    props.frameRatio.kind === 'preset'
      ? getPresetById(props.frameRatio.presetId)?.label ?? 'Custom'
      : `${props.frameRatio.width}×${props.frameRatio.height}`

  const togglePresetOpen = (): void => setPresetOpen((v) => !v)
  const handlePresetSelect = (r: FrameRatio): void => {
    props.onFrameRatioChange(r)
    setPresetOpen(false)
  }

  return (
    <div className={styles.container} data-testid="board-toolbar">
      <button
        type="button"
        className={`${styles.button} ${presetOpen ? styles.active : ''}`}
        onClick={togglePresetOpen}
        data-toolbar-button="preset"
      >
        {currentPresetLabel} ▾
      </button>
      {presetOpen && (
        <FramePresetPopover
          currentRatio={props.frameRatio}
          onSelect={handlePresetSelect}
        />
      )}

      <div className={styles.sep} role="separator" aria-orientation="vertical" />
      <button
        type="button"
        className={styles.button}
        onClick={props.onThemeClick}
        data-toolbar-button="theme"
      >
        {t('board.toolbar.theme')}
      </button>
      <button
        type="button"
        className={styles.button}
        onClick={props.onShareClick}
        data-toolbar-button="share"
      >
        {t('board.toolbar.share')}
      </button>
    </div>
  )
}
