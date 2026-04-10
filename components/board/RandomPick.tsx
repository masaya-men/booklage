'use client'

import { useCallback } from 'react'
import { gsap } from 'gsap'
import styles from './RandomPick.module.css'

type RandomPickProps = {
  /** List of card IDs currently visible on the board */
  cardIds: string[]
}

/** Randomly highlights one card and dims the rest for 3 seconds */
export function RandomPick({ cardIds }: RandomPickProps): React.ReactElement {
  const handlePick = useCallback(() => {
    if (cardIds.length === 0) return
    const chosen = cardIds[Math.floor(Math.random() * cardIds.length)]

    // Dim all cards except the chosen one
    cardIds.forEach((id) => {
      const el = document.querySelector(`[data-card-wrapper="${id}"]`)
      if (el && id !== chosen) {
        gsap.to(el, { opacity: 0.15, filter: 'grayscale(0.8)', duration: 0.3 })
      }
    })

    // Highlight chosen
    const chosenEl = document.querySelector(`[data-card-wrapper="${chosen}"]`)
    if (chosenEl) {
      gsap.to(chosenEl, { scale: 1.2, zIndex: 50, duration: 0.5, ease: 'back.out(1.7)' })
    }

    // Reset after 3 seconds
    setTimeout(() => {
      cardIds.forEach((id) => {
        const el = document.querySelector(`[data-card-wrapper="${id}"]`)
        if (el) {
          gsap.to(el, { opacity: 1, filter: 'none', scale: 1, zIndex: 1, duration: 0.4 })
        }
      })
    }, 3000)
  }, [cardIds])

  return (
    <button className={styles.button} onClick={handlePick} disabled={cardIds.length === 0}>
      ランダムピック
    </button>
  )
}
