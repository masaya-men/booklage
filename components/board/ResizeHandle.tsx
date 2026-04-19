'use client'

import {
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
  type ReactElement,
} from 'react'
import { RESIZE } from '@/lib/board/constants'
import styles from './ResizeHandle.module.css'

export type ResizeCorner = 'tl' | 'tr' | 'bl' | 'br'
export type ResizeEdge = 't' | 'b' | 'l' | 'r'
export type ResizeHandleKind = ResizeCorner | ResizeEdge

type ResizeHandleProps = {
  readonly currentW: number
  readonly currentH: number
  readonly aspectRatio: number
  readonly onResize: (w: number, h: number) => void
  readonly onResetToNative: () => void
}

const HANDLES: ReadonlyArray<ResizeHandleKind> = [
  'tl',
  'tr',
  'bl',
  'br',
  't',
  'b',
  'l',
  'r',
]

const LABELS: Readonly<Record<ResizeHandleKind, string>> = {
  tl: '角リサイズ（左上）',
  tr: '角リサイズ（右上）',
  bl: '角リサイズ（左下）',
  br: '角リサイズ（右下）',
  t: '辺リサイズ（上）',
  b: '辺リサイズ（下）',
  l: '辺リサイズ（左）',
  r: '辺リサイズ（右）',
}

const CORNER_KINDS: ReadonlySet<ResizeHandleKind> = new Set<ResizeHandleKind>([
  'tl',
  'tr',
  'bl',
  'br',
])

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

export function ResizeHandle({
  currentW,
  currentH,
  aspectRatio,
  onResize,
  onResetToNative,
}: ResizeHandleProps): ReactElement {
  const dragRef = useRef<{
    kind: ResizeHandleKind
    startClientX: number
    startClientY: number
    startW: number
    startH: number
  } | null>(null)

  const handleDown =
    (kind: ResizeHandleKind) =>
    (e: PointerEvent<HTMLDivElement>): void => {
      e.stopPropagation()
      e.currentTarget.setPointerCapture(e.pointerId)
      dragRef.current = {
        kind,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startW: currentW,
        startH: currentH,
      }
    }

  // NOTE: This API only updates width/height — the card's left/top anchor
  // stays fixed. So dragging the top or left handle visually grows the card,
  // but the right/bottom edge does NOT extend leftward/upward as a user might
  // expect from typical resize affordances. Position-update support is out of
  // scope for this task (plan §Task 18 limitation, accepted).
  const handleMove = (e: PointerEvent<HTMLDivElement>): void => {
    const s = dragRef.current
    if (!s) return
    const dx = e.clientX - s.startClientX
    const dy = e.clientY - s.startClientY
    const isCorner = CORNER_KINDS.has(s.kind)
    let newW = s.startW
    let newH = s.startH
    if (s.kind.includes('r')) newW = s.startW + dx
    if (s.kind.includes('l')) newW = s.startW - dx
    if (s.kind.includes('b')) newH = s.startH + dy
    if (s.kind.includes('t')) newH = s.startH - dy
    if (isCorner) {
      // Aspect-locked: pick whichever axis the user moved more so dragging
      // a corner mostly vertically does not get rounded down to a tiny dx.
      if (Math.abs(dx) > Math.abs(dy)) newH = newW / aspectRatio
      else newW = newH * aspectRatio
    }
    newW = clamp(newW, RESIZE.MIN_PX, RESIZE.MAX_PX)
    newH = clamp(newH, RESIZE.MIN_PX, RESIZE.MAX_PX)
    onResize(newW, newH)
  }

  const handleUp = (e: PointerEvent<HTMLDivElement>): void => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    dragRef.current = null
  }

  const handleDoubleClick = (e: ReactMouseEvent<HTMLDivElement>): void => {
    e.stopPropagation()
    onResetToNative()
  }

  return (
    <>
      {HANDLES.map((k) => (
        <div
          key={k}
          className={`${styles.handle} ${styles[k]}`}
          onPointerDown={handleDown(k)}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
          onDoubleClick={handleDoubleClick}
          role="slider"
          aria-label={LABELS[k]}
        />
      ))}
    </>
  )
}
