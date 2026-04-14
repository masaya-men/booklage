'use client'

import styles from './CardStyleWrapper.module.css'

export type CardStyle = 'glass' | 'polaroid' | 'newspaper' | 'magnet'

/** Liquid glass hook return value — ref + class + inline style */
type LiquidGlassProps = {
  ref: React.RefCallback<HTMLElement>
  className: string
  style: React.CSSProperties
}

type CardStyleWrapperProps = {
  /** Visual style to apply to the card */
  children: React.ReactNode
  /** The card style variant */
  cardStyle: CardStyle
  /** Title shown as polaroid caption (only used for polaroid style) */
  title?: string
  /** Custom magnet color (only used for magnet style) */
  magnetColor?: string
  /** Liquid glass hook output — applied only when cardStyle is 'glass' */
  liquidGlass?: LiquidGlassProps
}

/** Wraps a card with one of 4 visual styles: glass, polaroid, newspaper, or magnet */
export function CardStyleWrapper({
  children,
  cardStyle,
  title,
  magnetColor,
  liquidGlass,
}: CardStyleWrapperProps): React.ReactElement {
  const baseClassName = styles[cardStyle] ?? styles.glass
  const useLG = cardStyle === 'glass' && liquidGlass
  const className = useLG ? `${baseClassName} ${liquidGlass.className}` : baseClassName

  const inlineStyle: React.CSSProperties = {
    ...(magnetColor ? { ['--magnet-color' as string]: magnetColor } : {}),
    ...(useLG ? liquidGlass.style : {}),
  }

  return (
    <div
      ref={useLG ? liquidGlass.ref : undefined}
      className={className}
      style={Object.keys(inlineStyle).length > 0 ? inlineStyle : undefined}
    >
      {children}
      {cardStyle === 'polaroid' && title && (
        <span className={styles.polaroidCaption}>{title}</span>
      )}
    </div>
  )
}
