'use client'

import { useRef, type PointerEvent, type ReactElement } from 'react'
import { ROTATION } from '@/lib/board/constants'
import styles from './RotationHandle.module.css'

type RotationHandleProps = {
  readonly currentRotation: number
  readonly cardCenterClientX: number
  readonly cardCenterClientY: number
  readonly onRotate: (degrees: number) => void
  readonly onReset?: () => void
}

export function RotationHandle({
  currentRotation,
  cardCenterClientX,
  cardCenterClientY,
  onRotate,
  onReset,
}: RotationHandleProps): ReactElement {
  const dragRef = useRef<{
    startAngle: number
    startRotation: number
  } | null>(null)

  const getAngle = (x: number, y: number): number => {
    const dx = x - cardCenterClientX
    const dy = y - cardCenterClientY
    return (Math.atan2(dy, dx) * 180) / Math.PI
  }

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      startAngle: getAngle(e.clientX, e.clientY),
      startRotation: currentRotation,
    }
  }

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    const s = dragRef.current
    if (!s) return
    const a = getAngle(e.clientX, e.clientY)
    let delta = a - s.startAngle
    if (delta > 180) delta -= 360
    else if (delta < -180) delta += 360
    let rot = s.startRotation + delta
    if (!e.shiftKey) {
      rot = Math.round(rot / ROTATION.SNAP_STEP_DEG) * ROTATION.SNAP_STEP_DEG
    }
    onRotate(rot)
  }

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>): void => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    dragRef.current = null
  }

  const handleDoubleClick = (): void => {
    onReset?.()
  }

  return (
    <>
      <div className={styles.line} />
      <div
        className={styles.handle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        role="slider"
        aria-label="回転ハンドル"
        aria-valuenow={Math.round(currentRotation)}
        aria-valuemin={-180}
        aria-valuemax={180}
      />
    </>
  )
}
