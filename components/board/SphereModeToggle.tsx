'use client'

import { type ReactElement, type CSSProperties } from 'react'
import { Z_INDEX } from '@/lib/constants'

export type CanvasMode = 'flat' | 'sphere'

interface SphereModeToggleProps {
  mode: CanvasMode
  onChange: (mode: CanvasMode) => void
  /** Position from top (px). Used to stack below the theme toggle. */
  topPx: number
}

/**
 * Round toggle button for switching between 2D flat canvas and 3D sphere canvas.
 * Rendered independently of ViewModeToggle (which handles grid/collage).
 * Stacked below the theme toggle on the top-right.
 */
export function SphereModeToggle({
  mode,
  onChange,
  topPx,
}: SphereModeToggleProps): ReactElement {
  const style: CSSProperties = {
    position: 'fixed',
    top: topPx,
    right: 16,
    zIndex: Z_INDEX.TOOLBAR,
    width: 36,
    height: 36,
    borderRadius: '50%',
    border: '1px solid var(--color-glass-border)',
    background: 'var(--color-glass-bg)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    color: 'var(--color-text-primary)',
    fontSize: '16px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform 0.3s var(--ease-out-back)',
  }

  const nextMode: CanvasMode = mode === 'sphere' ? 'flat' : 'sphere'

  return (
    <button
      onClick={() => onChange(nextMode)}
      style={style}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.1)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
      type="button"
      title={mode === 'sphere' ? '2D平面モードに切替' : '3D球面モードに切替'}
      aria-pressed={mode === 'sphere'}
    >
      {mode === 'sphere' ? '🌐' : '📋'}
    </button>
  )
}
