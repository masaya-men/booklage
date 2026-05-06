// components/share/ShareFrame.tsx
'use client'

import type { ReactElement } from 'react'
import type { ShareCard } from '@/lib/share/types'
import { CardNode } from '@/components/board/CardNode'
import styles from './ShareFrame.module.css'

type Props = {
  readonly cards: ReadonlyArray<ShareCard>
  readonly width: number
  readonly height: number
  /** When true, cards respond to drag/click. Off in <SharedView>. */
  readonly editable: boolean
  readonly onCardSelect?: (index: number) => void
  readonly onCardDelete?: (index: number) => void
}

export function ShareFrame({ cards, width, height, editable, onCardSelect, onCardDelete }: Props): ReactElement {
  return (
    <div
      className={styles.frame}
      style={{ width, height }}
      data-testid="share-frame"
    >
      {cards.map((c, i) => (
        <div
          key={`${c.u}-${i}`}
          className={styles.cardWrap}
          style={{
            left: `${c.x * width}px`,
            top: `${c.y * height}px`,
            width: `${c.w * width}px`,
            height: `${c.h * height}px`,
            cursor: editable ? 'grab' : 'default',
          }}
          onClick={(): void => { if (editable) onCardSelect?.(i) }}
          onContextMenu={(e): void => {
            if (!editable) return
            e.preventDefault()
            onCardDelete?.(i)
          }}
        >
          <CardNode
            id={`share-${i}`}
            title={c.t}
            thumbnailUrl={c.th}
            rotation={c.r}
          >
            {c.th
              ? <img className={styles.thumbOnly} src={c.th} alt="" draggable={false} />
              : <div className={styles.thumbPlaceholder}>{c.t.slice(0, 24)}</div>}
          </CardNode>
        </div>
      ))}
    </div>
  )
}
