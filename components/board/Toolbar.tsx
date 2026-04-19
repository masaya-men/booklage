'use client'

import { useState, type ReactElement } from 'react'
import type { FrameRatio, LayoutMode, ThemeId } from '@/lib/board/types'
import { t } from '@/lib/i18n/t'
import { getPresetById } from '@/lib/board/frame-presets'
import { FramePresetPopover } from './FramePresetPopover'
import styles from './Toolbar.module.css'

type Props = {
  readonly layoutMode: LayoutMode
  readonly onModeChange: (mode: LayoutMode) => void
  readonly frameRatio: FrameRatio
  readonly onFrameRatioChange: (ratio: FrameRatio) => void
  readonly themeId: ThemeId
  readonly onThemeClick?: () => void
  readonly onExportClick?: () => void
  readonly onShareClick?: () => void
}

export function Toolbar(props: Props): ReactElement {
  const [presetOpen, setPresetOpen] = useState<boolean>(false)

  const currentPresetLabel: string =
    props.frameRatio.kind === 'preset'
      ? getPresetById(props.frameRatio.presetId)?.label ?? 'Custom'
      : `${props.frameRatio.width}×${props.frameRatio.height}`

  const handleGridClick = (): void => props.onModeChange('grid')
  const handleFreeClick = (): void => props.onModeChange('free')
  const togglePresetOpen = (): void => setPresetOpen((v) => !v)
  const handlePresetSelect = (r: FrameRatio): void => {
    props.onFrameRatioChange(r)
    setPresetOpen(false)
  }

  return (
    <div className={styles.container} data-testid="board-toolbar">
      <button
        type="button"
        className={`${styles.button} ${props.layoutMode === 'grid' ? styles.active : ''}`}
        onClick={handleGridClick}
        data-mode-button="grid"
      >
        ⊞ {t('board.mode.grid')}
      </button>
      <button
        type="button"
        className={`${styles.button} ${props.layoutMode === 'free' ? styles.active : ''}`}
        onClick={handleFreeClick}
        data-mode-button="free"
      >
        ◇ {t('board.mode.free')}
      </button>

      {props.layoutMode === 'free' && (
        <>
          <div className={styles.sep} role="separator" aria-orientation="vertical" />
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
        </>
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
      {props.layoutMode === 'grid' ? (
        <button
          type="button"
          className={styles.button}
          onClick={props.onExportClick}
          data-toolbar-button="export"
        >
          {t('board.toolbar.export')}
        </button>
      ) : (
        <button
          type="button"
          className={styles.button}
          onClick={props.onShareClick}
          data-toolbar-button="share"
        >
          {t('board.toolbar.share')}
        </button>
      )}
    </div>
  )
}
