'use client'

import type { ReactElement, ReactNode } from 'react'
import styles from './LiquidGlass.module.css'

type Props = {
  readonly children: ReactNode
  readonly className?: string
}

/**
 * Refractive liquid glass wrapper. Uses SVG feDisplacementMap for true
 * refraction (Chrome/Edge). Firefox/Safari fall back to blur+opacity.
 *
 * Requires `/displacement/glass-001.png` to exist in public/.
 */
export function LiquidGlass({ children, className }: Props): ReactElement {
  return (
    <>
      <svg className={styles.svgDefs} aria-hidden="true">
        <defs>
          <filter id="booklage-refract" x="0%" y="0%" width="100%" height="100%">
            <feImage
              href="/displacement/glass-001.png"
              result="dmap"
              preserveAspectRatio="xMidYMid slice"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="dmap"
              scale="12"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>
      <div className={`${styles.glass} ${className ?? ''}`.trim()}>
        {children}
      </div>
    </>
  )
}
