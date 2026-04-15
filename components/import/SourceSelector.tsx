'use client'

import type { ImportSource } from '@/lib/import/types'
import styles from './SourceSelector.module.css'

/** Platform tile data */
const SOURCES: {
  id: ImportSource
  icon: string
  name: string
  hint: string
  fullWidth?: boolean
}[] = [
  { id: 'browser', icon: '\u{1F310}', name: '\u30D6\u30E9\u30A6\u30B6', hint: 'HTML\u30D5\u30A1\u30A4\u30EB' },
  { id: 'youtube', icon: '\u25B6\uFE0F', name: 'YouTube', hint: 'Google Takeout CSV' },
  { id: 'tiktok', icon: '\u{1F3B5}', name: 'TikTok', hint: 'JSON\u30D5\u30A1\u30A4\u30EB' },
  { id: 'reddit', icon: '\u{1F4AC}', name: 'Reddit', hint: 'CSV (GDPR)' },
  { id: 'twitter', icon: '\u{1F426}', name: 'Twitter / X', hint: 'CSV / JSON' },
  { id: 'instagram', icon: '\u{1F4F7}', name: 'Instagram', hint: 'CSV / JSON' },
  { id: 'url-list', icon: '\u{1F4CB}', name: 'URL\u30EA\u30B9\u30C8\u3092\u8CBC\u308A\u4ED8\u3051', hint: '\u30C6\u30AD\u30B9\u30C8\u5165\u529B', fullWidth: true },
]

/** Props for SourceSelector */
type SourceSelectorProps = {
  /** Called when the user selects an import source */
  onSelect: (source: ImportSource) => void
}

/**
 * Step 1: Platform selection tiles.
 * Displays 7 import sources in a 2-column grid with a full-width URL list option.
 */
export function SourceSelector({ onSelect }: SourceSelectorProps): React.ReactElement {
  return (
    <div className={styles.container}>
      <p className={styles.title}>
        {'\u30A4\u30F3\u30DD\u30FC\u30C8\u5143\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044'}
      </p>
      <div className={styles.grid}>
        {SOURCES.map((src) => (
          <button
            key={src.id}
            className={src.fullWidth ? styles.tileFullWidth : styles.tile}
            onClick={() => onSelect(src.id)}
            type="button"
          >
            <span className={styles.tileIcon}>{src.icon}</span>
            <span className={styles.tileInfo}>
              <span className={styles.tileName}>{src.name}</span>
              <span className={styles.tileHint}>{src.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
