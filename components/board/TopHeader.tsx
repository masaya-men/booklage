'use client'

import type { ReactElement, ReactNode } from 'react'
import styles from './TopHeader.module.css'

type Props = {
  readonly nav: ReactNode
  readonly instrument: ReactNode
  readonly actions: ReactNode
}

export function TopHeader({ nav, instrument, actions }: Props): ReactElement {
  return (
    <header className={styles.header} data-testid="board-top-header">
      <div className={styles.group} data-group="nav">{nav}</div>
      <span className={styles.divider} aria-hidden="true" />
      <div className={styles.group} data-group="instrument">{instrument}</div>
      <span className={styles.divider} aria-hidden="true" />
      <div className={styles.group} data-group="actions">{actions}</div>
    </header>
  )
}
