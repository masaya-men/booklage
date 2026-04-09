'use client'

import type { RefObject } from 'react'
import styles from './Canvas.module.css'

/** Props for the Canvas component */
type CanvasProps = {
  /** Child elements rendered inside the scrollable canvas area */
  children: React.ReactNode
  /** Ref to the inner scrollable container, used for image export */
  canvasRef?: RefObject<HTMLDivElement | null>
  /** Background theme name (matches [data-bg-theme] in globals.css) */
  bgTheme?: string
}

/**
 * Full-viewport canvas that hosts bookmark cards.
 * Provides a scrollable inner area and applies a background theme.
 */
export function Canvas({
  children,
  canvasRef,
  bgTheme = 'dark',
}: CanvasProps): React.ReactElement {
  return (
    <div className={styles.canvas} data-bg-theme={bgTheme}>
      <div className={styles.inner} ref={canvasRef}>
        {children}
      </div>
    </div>
  )
}
