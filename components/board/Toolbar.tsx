'use client'

import type { ReactElement } from 'react'
import type { BoardFilter, DisplayMode } from '@/lib/board/types'
import type { MoodRecord } from '@/lib/storage/indexeddb'
import { FilterPill } from './FilterPill'
import { DisplayModeSwitch } from './DisplayModeSwitch'
import styles from './Toolbar.module.css'

type Props = {
  readonly activeFilter: BoardFilter
  readonly onFilterChange: (f: BoardFilter) => void
  readonly displayMode: DisplayMode
  readonly onDisplayModeChange: (m: DisplayMode) => void
  readonly moods: ReadonlyArray<MoodRecord>
  readonly counts: { readonly all: number; readonly inbox: number; readonly archive: number }
  readonly onShareClick: () => void
}

export function Toolbar({
  activeFilter, onFilterChange, displayMode, onDisplayModeChange, moods, counts, onShareClick,
}: Props): ReactElement {
  return (
    <div className={styles.container} data-testid="board-toolbar">
      <FilterPill value={activeFilter} onChange={onFilterChange} moods={moods} counts={counts} />
      <DisplayModeSwitch value={displayMode} onChange={onDisplayModeChange} />
      <button
        type="button"
        className={styles.sharePill}
        onClick={onShareClick}
        data-testid="share-pill"
      >
        Share ↗
      </button>
    </div>
  )
}
