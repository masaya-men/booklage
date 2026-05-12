'use client'

import { useState, type MouseEvent, type ReactNode } from 'react'
import styles from './RefetchButton.module.css'

type Props = {
  readonly bookmarkId: string
  readonly url: string
  readonly hovered: boolean
  readonly onRevalidate: (bookmarkId: string, url: string) => Promise<void>
}

// Hover-revealed refetch action. Bypasses the 30-day age guard — user
// intent overrides the natural revalidation cadence. Click animates the
// icon (spin during fetch → checkmark on success → fade out).
export function RefetchButton({ bookmarkId, url, hovered, onRevalidate }: Props): ReactNode {
  const [state, setState] = useState<'idle' | 'fetching' | 'done'>('idle')

  const handleClick = async (e: MouseEvent<HTMLButtonElement>): Promise<void> => {
    e.preventDefault()
    e.stopPropagation()
    if (state !== 'idle') return
    setState('fetching')
    try {
      await onRevalidate(bookmarkId, url)
      setState('done')
      setTimeout(() => setState('idle'), 1200)
    } catch {
      setState('idle')
    }
  }

  return (
    <button
      type="button"
      className={styles.button}
      data-visible={hovered || state === 'fetching' || state === 'done'}
      data-state={state}
      onClick={handleClick}
      onPointerDown={(e): void => {
        e.stopPropagation()
      }}
      onMouseDown={(e): void => {
        e.stopPropagation()
      }}
      aria-label="Refetch thumbnail"
    >
      {state === 'done' ? '✓' : '↻'}
    </button>
  )
}
