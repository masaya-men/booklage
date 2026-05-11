'use client'

import type { ReactElement, ReactNode } from 'react'
import styles from './TopHeader.module.css'

type Props = {
  readonly nav: ReactNode
  readonly instrument: ReactNode
  readonly actions: ReactNode
  /** When the Lightbox is open we fade the header out so its chrome doesn't
   *  compete with the lightbox surface, and the lightbox close button (top-
   *  right of the canvas) doesn't collide with Share/Size controls. The
   *  header keeps its slot in the canvas grid — only opacity + pointer
   *  events transition — so the cards layout below doesn't reflow. */
  readonly hidden?: boolean
}

export function TopHeader({ nav, instrument, actions, hidden }: Props): ReactElement {
  const className = hidden ? `${styles.header} ${styles.hidden}` : styles.header
  return (
    <header
      className={className}
      data-testid="board-top-header"
      aria-hidden={hidden ? 'true' : undefined}
    >
      <div className={styles.group} data-group="nav">{nav}</div>
      <span className={styles.divider} aria-hidden="true" />
      <div className={styles.group} data-group="instrument">{instrument}</div>
      <span className={styles.divider} aria-hidden="true" />
      <div className={styles.group} data-group="actions">{actions}</div>
    </header>
  )
}
