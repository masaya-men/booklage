'use client'

import styles from './CardStyleWrapper.module.css'

export type CardStyle = 'glass' | 'polaroid' | 'newspaper' | 'magnet'

type CardStyleWrapperProps = {
  /** Visual style to apply to the card */
  children: React.ReactNode
  /** The card style variant */
  cardStyle: CardStyle
  /** Title shown as polaroid caption (only used for polaroid style) */
  title?: string
  /** Custom magnet color (only used for magnet style) */
  magnetColor?: string
}

/** Wraps a card with one of 4 visual styles: glass, polaroid, newspaper, or magnet */
export function CardStyleWrapper({
  children,
  cardStyle,
  title,
  magnetColor,
}: CardStyleWrapperProps): React.ReactElement {
  const className = styles[cardStyle] ?? styles.glass

  return (
    <div
      className={className}
      style={magnetColor ? { ['--magnet-color' as string]: magnetColor } : undefined}
    >
      {children}
      {cardStyle === 'polaroid' && title && (
        <span className={styles.polaroidCaption}>{title}</span>
      )}
    </div>
  )
}
