'use client'

import { useState } from 'react'
import styles from './ThemeSelector.module.css'

const THEMES = [
  { id: 'dark', label: 'ダーク', bg: '#0a0a0f' },
  { id: 'minimal-white', label: 'ホワイト', bg: '#fafafa' },
  { id: 'grid', label: '方眼紙', bg: '#fafafa' },
  { id: 'cork', label: 'コルク', bg: '#c4956a' },
  { id: 'space', label: '宇宙', bg: 'linear-gradient(135deg, #0a0a2e, #1a0a3e)' },
  { id: 'forest', label: '森', bg: '#1a3a1a' },
  { id: 'ocean', label: '海', bg: 'linear-gradient(180deg, #0a2a4a, #0a4a6a)' },
  { id: 'custom-color', label: 'カスタム色', bg: '#333' },
  { id: 'custom-image', label: 'カスタム画像', bg: '#555' },
] as const

type ThemeSelectorProps = {
  /** Currently selected theme ID */
  currentTheme: string
  /** Callback when a theme is selected */
  onSelectTheme: (themeId: string) => void
}

/** Floating panel for selecting background themes */
export function ThemeSelector({ currentTheme, onSelectTheme }: ThemeSelectorProps): React.ReactElement {
  const [open, setOpen] = useState(false)

  return (
    <div className={styles.wrapper}>
      <button className={styles.toggle} onClick={() => setOpen(!open)}>
        背景テーマ
      </button>
      {open && (
        <div className={styles.panel}>
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              className={theme.id === currentTheme ? styles.swatchActive : styles.swatch}
              style={{ background: theme.bg }}
              title={theme.label}
              onClick={() => {
                onSelectTheme(theme.id)
                setOpen(false)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
