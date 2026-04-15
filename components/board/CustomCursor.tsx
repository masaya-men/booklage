'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import styles from './CustomCursor.module.css'

/** Available cursor styles */
export const CURSOR_STYLES = [
  { id: 'glass-lens', label: 'ガラスレンズ', emoji: '🔍' },
  { id: 'crosshair', label: '十字', emoji: '➕' },
  { id: 'dot', label: 'ドット', emoji: '⊙' },
  { id: 'ring', label: 'リング', emoji: '◎' },
  { id: 'star', label: 'スター', emoji: '✦' },
  { id: 'heart', label: 'ハート', emoji: '♥' },
  { id: 'diamond', label: 'ダイヤ', emoji: '◆' },
  { id: 'scissors', label: 'ハサミ', emoji: '✂' },
  { id: 'pen', label: 'ペン', emoji: '✎' },
  { id: 'pin', label: 'ピン', emoji: '📌' },
  { id: 'sparkle', label: 'キラキラ', emoji: '✨' },
  { id: 'ghost', label: 'ゴースト', emoji: '👻' },
] as const

export type CursorStyleId = typeof CURSOR_STYLES[number]['id']

type CustomCursorProps = {
  /** Which cursor style to use */
  cursorStyle: CursorStyleId
}

/** Custom cursor that follows the mouse with a glass lens or emoji effect.
 *  Hides the native cursor on the canvas area. */
export function CustomCursor({ cursorStyle }: CustomCursorProps): React.ReactElement {
  const cursorRef = useRef<HTMLDivElement>(null)
  const posRef = useRef({ x: -100, y: -100 })
  const [visible, setVisible] = useState(false)

  // Smooth follow via requestAnimationFrame
  const rafRef = useRef<number>(0)
  const targetRef = useRef({ x: -100, y: -100 })

  const animate = useCallback(() => {
    const lerp = 0.15
    posRef.current.x += (targetRef.current.x - posRef.current.x) * lerp
    posRef.current.y += (targetRef.current.y - posRef.current.y) * lerp

    if (cursorRef.current) {
      cursorRef.current.style.transform =
        `translate(${posRef.current.x}px, ${posRef.current.y}px)`
    }
    rafRef.current = requestAnimationFrame(animate)
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent): void => {
      targetRef.current = { x: e.clientX, y: e.clientY }
      if (!visible) setVisible(true)
    }

    const handleMouseLeave = (): void => {
      setVisible(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseleave', handleMouseLeave)
    rafRef.current = requestAnimationFrame(animate)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseleave', handleMouseLeave)
      cancelAnimationFrame(rafRef.current)
    }
  }, [animate, visible])

  const isGlass = cursorStyle === 'glass-lens'
  const cursorInfo = CURSOR_STYLES.find((c) => c.id === cursorStyle)

  return (
    <div
      ref={cursorRef}
      className={`${styles.cursor} ${isGlass ? styles.glassLens : styles.emojiCursor}`}
      style={{ opacity: visible ? 1 : 0 }}
    >
      {isGlass ? (
        <div className={styles.lensInner} />
      ) : (
        <span className={styles.emojiInner}>{cursorInfo?.emoji ?? '🔍'}</span>
      )}
    </div>
  )
}
