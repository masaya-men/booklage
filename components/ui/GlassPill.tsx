'use client'

/**
 * <GlassPill> — pill-shaped LiquidGlass button with auto-fit width.
 *
 * Uses the play-button visual language (`lens-magnify` preset) on toolbar
 * pills whose text content varies in length. A hidden ruler measures the
 * natural text width and feeds it to <LiquidGlass>'s `width` prop because
 * LiquidGlass needs an explicit pixel width for its SVG displacement map.
 */

import {
  useLayoutEffect, useRef, useState,
  type CSSProperties, type MouseEventHandler, type ReactNode,
} from 'react'
import { LiquidGlass } from './LiquidGlass'
import type { GlassPreset, PresetName } from '@/lib/glass/presets'

type Props = {
  readonly children: ReactNode
  readonly onClick?: MouseEventHandler<HTMLElement>
  /** Pill height in px — drives borderRadius (= height/2) for full pill shape */
  readonly height?: number
  /** Horizontal padding inside the pill (added to ruler-measured text width) */
  readonly paddingX?: number
  readonly fontSize?: number
  readonly preset?: PresetName
  /** Per-instance overrides on top of the preset (rare). Use this if the
   *  default lens-magnify is too transparent for legible text. */
  readonly override?: Partial<GlassPreset>
  readonly className?: string
  readonly 'aria-haspopup'?: 'menu' | 'listbox' | 'dialog' | 'true' | 'false' | boolean
  readonly 'aria-expanded'?: boolean
  readonly 'data-testid'?: string
}

export function GlassPill({
  children,
  onClick,
  height = 40,
  paddingX = 18,
  fontSize = 14,
  preset = 'glass-pill',
  override,
  className,
  'aria-haspopup': ariaHasPopup,
  'aria-expanded': ariaExpanded,
  'data-testid': dataTestId,
}: Props): React.ReactElement {
  const rulerRef = useRef<HTMLSpanElement>(null)
  // Initial guess (~120 px) keeps SSR / first paint from collapsing to 0.
  // Real width lands on the next frame via ResizeObserver.
  const [width, setWidth] = useState<number>(120)

  useLayoutEffect(() => {
    const node = rulerRef.current
    if (!node) return
    const measure = (): void => {
      const w = Math.ceil(node.getBoundingClientRect().width) + paddingX * 2
      // Clamp to a sensible minimum so the displacement map never tries to
      // render a degenerate 0-px region.
      setWidth(Math.max(64, w))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(node)
    return (): void => ro.disconnect()
  }, [paddingX, children])

  const rulerStyle: CSSProperties = {
    position: 'fixed',
    top: -9999,
    left: -9999,
    visibility: 'hidden',
    whiteSpace: 'nowrap',
    fontSize,
    fontFamily: 'inherit',
    fontWeight: 'inherit',
    pointerEvents: 'none',
  }

  const textStyle: CSSProperties = {
    fontSize,
    whiteSpace: 'nowrap',
    color: 'var(--text-primary)',
    fontFamily: 'inherit',
    lineHeight: 1,
  }

  return (
    <>
      <span ref={rulerRef} aria-hidden="true" style={rulerStyle}>
        {children}
      </span>
      <LiquidGlass
        shape="rect"
        size={height}
        width={width}
        borderRadius={height / 2}
        as="button"
        preset={preset}
        override={override}
        onClick={onClick}
        className={className}
        aria-haspopup={ariaHasPopup}
        aria-expanded={ariaExpanded}
        data-testid={dataTestId}
      >
        <span style={textStyle}>{children}</span>
      </LiquidGlass>
    </>
  )
}
