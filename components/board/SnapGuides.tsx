'use client'

import { BOARD_Z_INDEX } from '@/lib/board/constants'
import type { SnapGuideLine } from '@/lib/board/types'
import styles from './SnapGuides.module.css'

type Props = {
  readonly guides: ReadonlyArray<SnapGuideLine>
  readonly offsetX?: number
  readonly offsetY?: number
}

export function SnapGuides({ guides, offsetX = 0, offsetY = 0 }: Props) {
  if (guides.length === 0) return null

  return (
    <div className={styles.container} style={{ zIndex: BOARD_Z_INDEX.SNAP_GUIDES }}>
      {guides.map((g, i) => {
        if (g.kind === 'vertical') {
          return (
            <div
              key={i}
              className={styles.vertical}
              style={{
                left: g.x + offsetX,
                top: g.y1 + offsetY,
                height: g.y2 - g.y1,
              }}
            />
          )
        }
        if (g.kind === 'horizontal') {
          return (
            <div
              key={i}
              className={styles.horizontal}
              style={{
                top: g.y + offsetY,
                left: g.x1 + offsetX,
                width: g.x2 - g.x1,
              }}
            />
          )
        }
        // spacing
        return (
          <div key={i}>
            <div
              className={styles.spacing}
              style={{
                top: g.y1 + offsetY,
                left: g.x1 + offsetX,
                width: g.x2 - g.x1,
              }}
            />
            <span
              className={styles.spacingLabel}
              style={{
                top: (g.y1 + g.y2) / 2 + offsetY,
                left: (g.x1 + g.x2) / 2 + offsetX - 20,
              }}
            >{g.label}</span>
          </div>
        )
      })}
    </div>
  )
}
