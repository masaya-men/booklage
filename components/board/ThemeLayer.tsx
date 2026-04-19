'use client'

import { getThemeMeta } from '@/lib/board/theme-registry'
import type { ThemeId } from '@/lib/board/types'
import { BOARD_Z_INDEX } from '@/lib/board/constants'
import themeStyles from './themes.module.css'

type ThemeLayerProps = {
  readonly themeId: ThemeId
  readonly totalWidth: number
  readonly totalHeight: number
}

export function ThemeLayer({ themeId, totalWidth, totalHeight }: ThemeLayerProps) {
  const meta = getThemeMeta(themeId)
  const className = themeStyles[meta.backgroundClassName] ?? ''

  return (
    <div
      className={className}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: `${totalWidth}px`,
        height: `${totalHeight}px`,
        zIndex: BOARD_Z_INDEX.THEME_BG,
        pointerEvents: 'none',
      }}
      data-theme-id={themeId}
    />
  )
}
