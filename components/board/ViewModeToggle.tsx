'use client'

import styles from './ViewModeToggle.module.css'

/** View mode for the canvas */
export type ViewMode = 'grid' | 'collage'

/** Props for ViewModeToggle */
type ViewModeToggleProps = {
  /** Current view mode */
  mode: ViewMode
  /** Called when the mode changes */
  onToggle: (mode: ViewMode) => void
}

/**
 * Toggle button for switching between grid and collage view modes.
 * Uses inline SVG icons — no external icon library.
 */
export function ViewModeToggle({
  mode,
  onToggle,
}: ViewModeToggleProps): React.ReactElement {
  return (
    <div className={styles.container}>
      <button
        className={mode === 'grid' ? styles.buttonActive : styles.button}
        onClick={() => onToggle('grid')}
        type="button"
        title="グリッド表示"
        aria-label="Grid view"
        aria-pressed={mode === 'grid'}
      >
        {/* Grid icon: 2x2 squares */}
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect x="1" y="1" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <rect x="10" y="1" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <rect x="1" y="10" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <rect x="10" y="10" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      <button
        className={mode === 'collage' ? styles.buttonActive : styles.button}
        onClick={() => onToggle('collage')}
        type="button"
        title="コラージュ表示"
        aria-label="Collage view"
        aria-pressed={mode === 'collage'}
      >
        {/* Collage icon: scattered overlapping cards */}
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect x="2" y="4" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" transform="rotate(-5 6 7)" />
          <rect x="7" y="2" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" transform="rotate(3 11 5)" />
          <rect x="5" y="9" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" transform="rotate(4 9 12)" />
        </svg>
      </button>
    </div>
  )
}
