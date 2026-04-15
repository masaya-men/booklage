'use client'

import { useState } from 'react'
import { useLiquidGlass } from '@/lib/glass/use-liquid-glass'
import type { CardStyle } from '@/components/board/card-styles/CardStyleWrapper'
import { CURSOR_STYLES, type CursorStyleId } from '@/components/board/CustomCursor'
import styles from './SettingsPanel.module.css'

const BG_THEMES = [
  { id: 'dark', label: 'ダーク', bg: '#0a0a0f' },
  { id: 'minimal-white', label: 'ホワイト', bg: '#fafafa' },
  { id: 'grid', label: '方眼紙', bg: '#0a0a0f' },
  { id: 'cork', label: 'コルク', bg: '#c4956a' },
  { id: 'cardboard', label: '厚紙', bg: '#d2c8ba' },
  { id: 'cutting-mat', label: 'カッティングマット', bg: '#1a5c36' },
  { id: 'notebook', label: 'ノート', bg: '#f8f4eb' },
  { id: 'dotted-notebook', label: '点線ノート', bg: '#f7f7f4' },
  { id: 'drafting-paper', label: '作図用紙', bg: '#eef2f6' },
  { id: 'space', label: '宇宙', bg: '#0a0a2e' },
  { id: 'forest', label: '森', bg: '#1a3a1a' },
  { id: 'ocean', label: '海', bg: '#0a2a4a' },
  { id: 'custom-color', label: 'カスタム色', bg: '#333' },
] as const

const CARD_STYLES: { id: CardStyle; label: string }[] = [
  { id: 'glass', label: 'ガラス' },
  { id: 'polaroid', label: 'ポラロイド' },
  { id: 'newspaper', label: '新聞' },
  { id: 'magnet', label: 'マグネット' },
]

const UI_THEMES: { id: 'auto' | 'dark' | 'light'; label: string }[] = [
  { id: 'auto', label: '自動' },
  { id: 'dark', label: 'ダーク' },
  { id: 'light', label: 'ライト' },
]

const SIZE_OPTIONS: { id: 'random' | 'S' | 'M' | 'L' | 'XL'; label: string }[] = [
  { id: 'random', label: 'ランダム' },
  { id: 'S', label: 'S' },
  { id: 'M', label: 'M' },
  { id: 'L', label: 'L' },
  { id: 'XL', label: 'XL' },
]

const ASPECT_OPTIONS: { id: 'random' | 'auto' | '1:1' | '16:9' | '3:4'; label: string }[] = [
  { id: 'random', label: 'ランダム' },
  { id: 'auto', label: '自動' },
  { id: '1:1', label: '1:1' },
  { id: '16:9', label: '16:9' },
  { id: '3:4', label: '3:4' },
]

/** Props for SettingsPanel */
type SettingsPanelProps = {
  /** Currently selected background theme ID */
  bgTheme: string
  /** Called when the user selects a background theme */
  onChangeBgTheme: (theme: string) => void
  /** Currently selected card style */
  cardStyle: CardStyle
  /** Called when the user selects a card style */
  onChangeCardStyle: (style: CardStyle) => void
  /** Currently selected UI color mode */
  uiTheme: 'auto' | 'dark' | 'light'
  /** Called when the user selects a UI color mode */
  onChangeUiTheme: (theme: 'auto' | 'dark' | 'light') => void
  /** Default card size for new cards */
  defaultCardSize: string
  /** Called when the user changes the default card size */
  onChangeDefaultCardSize: (size: string) => void
  /** Default aspect ratio for new cards */
  defaultAspectRatio: string
  /** Called when the user changes the default aspect ratio */
  onChangeDefaultAspectRatio: (ratio: string) => void
  /** Currently selected cursor style */
  cursorStyle: CursorStyleId
  /** Called when the user selects a cursor style */
  onChangeCursorStyle: (style: CursorStyleId) => void
}

/** Unified settings panel: background theme, card style, UI mode, card defaults */
export function SettingsPanel({
  bgTheme,
  onChangeBgTheme,
  cardStyle,
  onChangeCardStyle,
  uiTheme,
  onChangeUiTheme,
  defaultCardSize,
  onChangeDefaultCardSize,
  defaultAspectRatio,
  onChangeDefaultAspectRatio,
  cursorStyle,
  onChangeCursorStyle,
}: SettingsPanelProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const glass = useLiquidGlass({ id: 'settings-panel', strength: 'strong', fixedSize: false })

  return (
    <div className={styles.wrapper}>
      <button className={styles.toggle} onClick={() => setOpen(!open)}>
        設定
      </button>
      {open && (
        <div ref={glass.ref} className={`${styles.panel} ${glass.className}`} style={glass.style}>
          {/* Background Theme */}
          <div className={styles.section}>
            <span className={styles.sectionTitle}>背景テーマ</span>
            <div className={styles.swatchGrid}>
              {BG_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  className={theme.id === bgTheme ? styles.swatchActive : styles.swatch}
                  style={{ background: theme.bg }}
                  title={theme.label}
                  onClick={() => onChangeBgTheme(theme.id)}
                />
              ))}
            </div>
          </div>

          <div className={styles.divider} />

          {/* Card Style */}
          <div className={styles.section}>
            <span className={styles.sectionTitle}>カードスタイル</span>
            <div className={styles.optionRow}>
              {CARD_STYLES.map((s) => (
                <button
                  key={s.id}
                  className={s.id === cardStyle ? styles.optionButtonActive : styles.optionButton}
                  onClick={() => onChangeCardStyle(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.divider} />

          {/* UI Mode */}
          <div className={styles.section}>
            <span className={styles.sectionTitle}>UIモード</span>
            <div className={styles.optionRow}>
              {UI_THEMES.map((t) => (
                <button
                  key={t.id}
                  className={t.id === uiTheme ? styles.optionButtonActive : styles.optionButton}
                  onClick={() => onChangeUiTheme(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.divider} />

          {/* Card Defaults */}
          <div className={styles.section}>
            <span className={styles.sectionTitle}>カードサイズ</span>
            <div className={styles.optionRow}>
              {SIZE_OPTIONS.map((s) => (
                <button
                  key={s.id}
                  className={s.id === defaultCardSize ? styles.optionButtonActive : styles.optionButton}
                  onClick={() => onChangeDefaultCardSize(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.section}>
            <span className={styles.sectionTitle}>アスペクト比</span>
            <div className={styles.optionRow}>
              {ASPECT_OPTIONS.map((a) => (
                <button
                  key={a.id}
                  className={a.id === defaultAspectRatio ? styles.optionButtonActive : styles.optionButton}
                  onClick={() => onChangeDefaultAspectRatio(a.id)}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.divider} />

          {/* Cursor Style */}
          <div className={styles.section}>
            <span className={styles.sectionTitle}>カーソル</span>
            <div className={styles.swatchGrid}>
              {CURSOR_STYLES.map((c) => (
                <button
                  key={c.id}
                  className={c.id === cursorStyle ? styles.cursorSwatchActive : styles.cursorSwatch}
                  title={c.label}
                  onClick={() => onChangeCursorStyle(c.id)}
                >
                  {c.emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
