'use client'

import { useEffect, type ReactElement } from 'react'
import { LiquidGlass } from './LiquidGlass'
import styles from './Sidebar.module.css'

type Props = {
  readonly collapsed: boolean
  readonly onToggle: () => void
}

/**
 * Left edge-anchored sidebar. Expanded 240px, collapsed slides to 52px icon rail.
 * F key toggles collapse state (wired in BoardRoot).
 */
export function Sidebar({ collapsed, onToggle }: Props): ReactElement {
  useEffect(() => {
    // No-op here — kept for future hover behaviours.
  }, [])

  return (
    <aside
      className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`.trim()}
      data-testid="board-sidebar"
      aria-label="ボードナビゲーション"
    >
      <LiquidGlass>
        <div className={styles.inner}>
          <div className={styles.placeholder}>
            Sidebar placeholder — content lands in Task 5.
          </div>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onToggle}
            style={{ padding: 4, fontSize: 11 }}
          >
            {collapsed ? '展開 (F)' : '折り畳む (F)'}
          </button>
        </div>
      </LiquidGlass>
    </aside>
  )
}
