'use client'

import { useState } from 'react'
import { gsap } from 'gsap'
import { FOLDER_COLORS } from '@/lib/constants'
import styles from './ColorSuggest.module.css'

type ColorSuggestProps = {
  /** Map of cardId to its dominant color */
  cardColors: Map<string, string>
}

/** Color dot filter: highlights cards matching selected color, dims the rest */
export function ColorSuggest({ cardColors }: ColorSuggestProps): React.ReactElement {
  const [activeColor, setActiveColor] = useState<string | null>(null)

  function handleColorClick(color: string): void {
    if (activeColor === color) {
      // Deselect — reset all cards
      setActiveColor(null)
      cardColors.forEach((_, cardId) => {
        const el = document.querySelector(`[data-card-wrapper="${cardId}"]`)
        if (el) gsap.to(el, { opacity: 1, filter: 'none', duration: 0.3 })
      })
      return
    }

    setActiveColor(color)
    cardColors.forEach((cardColor, cardId) => {
      const el = document.querySelector(`[data-card-wrapper="${cardId}"]`)
      if (!el) return
      if (cardColor === color) {
        gsap.to(el, { opacity: 1, filter: 'none', duration: 0.3 })
      } else {
        gsap.to(el, { opacity: 0.15, filter: 'grayscale(0.8)', duration: 0.3 })
      }
    })
  }

  return (
    <div className={styles.wrapper}>
      {FOLDER_COLORS.map((color) => (
        <button
          key={color}
          className={activeColor === color ? styles.dotActive : styles.dot}
          style={{ backgroundColor: color }}
          onClick={() => handleColorClick(color)}
        />
      ))}
    </div>
  )
}
