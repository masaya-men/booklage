'use client'

import type { ReactElement } from 'react'
import type { FrameRatio } from '@/lib/board/types'

type Props = {
  readonly currentRatio: FrameRatio
  readonly onSelect: (ratio: FrameRatio) => void
  readonly onClose: () => void
}

// TODO(Task 20): replace this stub with the full preset picker UI.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function FramePresetPopover(_props: Props): ReactElement {
  return (
    <div
      style={{
        position: 'fixed',
        top: 60,
        left: '50%',
        transform: 'translateX(-50%)',
        padding: 16,
        background: 'white',
        border: '1px solid #ddd',
        borderRadius: 8,
        zIndex: 120,
      }}
      data-testid="frame-preset-popover-stub"
    >
      <p style={{ margin: 0, fontSize: 12, color: '#666' }}>
        FramePresetPopover (Task 20 で実装)
      </p>
    </div>
  )
}
