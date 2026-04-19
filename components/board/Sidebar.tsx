'use client'

import type { ReactElement } from 'react'
import { LiquidGlass } from './LiquidGlass'
import { t } from '@/lib/i18n/t'
import styles from './Sidebar.module.css'

type Props = {
  readonly collapsed: boolean
  readonly onToggle: () => void
  readonly counts: {
    readonly all: number
    readonly unread: number
    readonly read: number
  }
  readonly onThemeClick: () => void
}

export function Sidebar({ collapsed, onToggle, counts, onThemeClick }: Props): ReactElement {
  return (
    <aside
      className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`.trim()}
      data-testid="board-sidebar"
      aria-label="ボードナビゲーション"
    >
      <LiquidGlass className={styles.sidebarGlass}>
        <div className={styles.inner}>
          {/* Brand */}
          <div className={styles.brand}>
            <span className={styles.brandName}>Booklage</span>
            <span className={styles.brandMono}>v1</span>
            <button
              type="button"
              className={styles.collapseBtn}
              onClick={onToggle}
              aria-label={collapsed ? t('board.sidebar.expandAria') : t('board.sidebar.collapseAria')}
            >
              {collapsed ? '⇥' : '⇤'}
            </button>
          </div>

          {/* Search (shell — functional in B2) */}
          <div className={styles.search}>
            <span className={styles.searchIcon}>🔍</span>
            <span className={styles.searchPlaceholder}>{t('board.sidebar.searchPlaceholder')}</span>
            <span className={styles.searchHint}>{t('board.sidebar.searchHint')}</span>
          </div>

          {/* Library */}
          <div className={styles.sectionHeader}>{t('board.sidebar.libraryHeader')}</div>
          <button type="button" className={`${styles.navItem} ${styles.active}`.trim()}>
            <span className={styles.navLabel}>{t('board.sidebar.all')}</span>
            <span className={styles.navCount}>{counts.all}</span>
          </button>
          <button type="button" className={styles.navItem}>
            <span className={styles.navLabel}>{t('board.sidebar.unread')}</span>
            <span className={styles.navCount}>{counts.unread}</span>
          </button>
          <button type="button" className={styles.navItem}>
            <span className={styles.navLabel}>{t('board.sidebar.read')}</span>
            <span className={styles.navCount}>{counts.read}</span>
          </button>

          {/* Folders (placeholder) */}
          <div className={styles.sectionHeader}>{t('board.sidebar.foldersHeader')}</div>
          <div className={styles.foldersPlaceholder}>{t('board.sidebar.foldersPlaceholder')}</div>

          <div className={styles.spacer} />

          {/* Bottom: theme + hide hint */}
          <div className={styles.footRow}>
            <button type="button" className={styles.themeBtn} onClick={onThemeClick}>
              🎨 {t('board.sidebar.themeLabel')}
            </button>
            <span className={styles.hideHint}>{t('board.sidebar.hideHint')}</span>
          </div>

          {/* Vertical signature */}
          <div className={styles.signature}>{t('board.sidebar.signature')}</div>
        </div>
      </LiquidGlass>
    </aside>
  )
}
