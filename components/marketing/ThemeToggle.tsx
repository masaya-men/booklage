'use client'

import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'booklage-lp-theme'

/** Lightweight dark/light toggle for marketing pages.
 *  Defaults to light theme. Persists choice in localStorage. */
export function ThemeToggle(): React.ReactElement {
  const [theme, setTheme] = useState<'dark' | 'light'>('light')

  // On mount: read stored pref or default to light
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as 'dark' | 'light' | null
    const initial = stored ?? 'light'
    setTheme(initial)
    document.documentElement.setAttribute('data-theme', initial)
  }, [])

  const toggle = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem(STORAGE_KEY, next)
  }, [theme])

  return (
    <button
      onClick={toggle}
      aria-label={theme === 'dark' ? 'ライトモードに切替' : 'ダークモードに切替'}
      style={{
        background: 'none',
        border: '1px solid var(--color-glass-border)',
        borderRadius: '50%',
        width: 32,
        height: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        color: 'var(--color-text-secondary)',
        fontSize: '14px',
        transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1), color 0.2s',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.15)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  )
}
