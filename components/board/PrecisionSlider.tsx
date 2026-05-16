'use client'

import {
  useCallback,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
} from 'react'
import styles from './PrecisionSlider.module.css'

/** マウス N px で min→max を移動する基準値。 spec §1-2: N=1000 でスタート、
 *  実機で 800-1500 の範囲で調整想定。 大きいほど slider が「遅く動く」 = 細かく狙える。 */
const MOUSE_PX_FOR_FULL_RANGE = 1000

function pad4(n: number): string {
  return Math.max(0, Math.min(9999, Math.round(n))).toString().padStart(4, '0')
}

function clamp(n: number, min: number, max: number): number {
  if (n < min) return min
  if (n > max) return max
  return n
}

type Props = {
  readonly label: string
  readonly min: number
  readonly max: number
  readonly value: number
  readonly onChange: (next: number) => void
  readonly testId?: string
  readonly ariaLabel?: string
}

/**
 * Custom pointer-based slider — replaces native `<input type=range>` so the
 * value moves much slower than the mouse, letting the user land exact
 * integer (or sub-integer) values. Used for the board's W (card width) and
 * G (card gap) controls.
 *
 * Interaction model (spec §3):
 * - pointerdown anywhere on track → `setPointerCapture`, drag starts
 * - pointermove during drag: `value += movementX × ratio`, where
 *   `ratio = (max - min) / 1000` so 1000px of mouse travel covers the
 *   entire range regardless of which slider — W and G feel identical
 * - pointerup releases capture, drag ends
 * - clicking without movement does NOT jump the value (= no native-style
 *   click-to-position; the entire affordance is drag)
 * - keyboard: arrow keys ±1, Home/End to min/max
 *
 * Value model: float — `onChange` fires with raw float values. Display
 * rounds to integer (4-digit zero-pad) but the internal value retains
 * precision for smooth sub-integer drag movement.
 */
export function PrecisionSlider({
  label,
  min,
  max,
  value,
  onChange,
  testId,
  ariaLabel,
}: Props): ReactElement {
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const valueRef = useRef(value)
  valueRef.current = value
  const [dragging, setDragging] = useState(false)

  const ratio = (max - min) / MOUSE_PX_FOR_FULL_RANGE

  const handlePointerDown = useCallback((e: PointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    const el = trackRef.current
    if (!el) return
    if (typeof el.setPointerCapture === 'function') {
      el.setPointerCapture(e.pointerId)
    }
    draggingRef.current = true
    setDragging(true)
  }, [])

  const handlePointerMove = useCallback((e: PointerEvent<HTMLDivElement>): void => {
    if (!draggingRef.current) return
    const next = clamp(valueRef.current + e.movementX * ratio, min, max)
    if (next !== valueRef.current) {
      onChange(next)
    }
  }, [min, max, ratio, onChange])

  const handlePointerUp = useCallback((e: PointerEvent<HTMLDivElement>): void => {
    const el = trackRef.current
    if (el && typeof el.hasPointerCapture === 'function' && el.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId)
    }
    draggingRef.current = false
    setDragging(false)
  }, [])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>): void => {
    let next: number | null = null
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        next = valueRef.current - 1
        break
      case 'ArrowRight':
      case 'ArrowUp':
        next = valueRef.current + 1
        break
      case 'Home':
        next = min
        break
      case 'End':
        next = max
        break
    }
    if (next === null) return
    e.preventDefault()
    onChange(clamp(next, min, max))
  }, [min, max, onChange])

  const safeValue = Number.isFinite(value) ? value : min
  const pct = max > min ? ((safeValue - min) / (max - min)) * 100 : 0
  const clampedPct = Math.max(0, Math.min(100, pct))

  return (
    <label className={styles.row} aria-label={ariaLabel ?? label}>
      <span className={styles.label}>{label}</span>
      <div
        ref={trackRef}
        className={styles.track}
        role="slider"
        tabIndex={0}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(safeValue)}
        aria-label={ariaLabel ?? label}
        data-testid={testId}
        data-dragging={dragging || undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
      >
        <div className={styles.trackLine} aria-hidden="true" />
        <div
          className={styles.thumb}
          aria-hidden="true"
          style={{ left: `${clampedPct}%` }}
        />
      </div>
      <span className={styles.value}>{pad4(safeValue)}</span>
    </label>
  )
}
