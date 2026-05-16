import type { ReactElement } from 'react'
import styles from './PipEmptyState.module.css'

export function PipEmptyState(): ReactElement {
  return (
    <div className={styles.empty} data-testid="pip-empty-state">
      <div className={styles.wordmark}>AllMarks</div>
    </div>
  )
}
