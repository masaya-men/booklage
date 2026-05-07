'use client'

import { useMemo, type CSSProperties, type ReactElement } from 'react'
import styles from './WaveformTrack.module.css'

type Props = {
  readonly barCount: number
  /** 0..1, fraction of the track that is "filled" */
  readonly progress: number
  /** Optional seed so the bar heights are deterministic per-instance. */
  readonly seed?: number
}

function pseudoRandom(i: number, seed: number): number {
  let h = (i * 374761393 + seed * 668265263) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return ((h >>> 0) % 1000) / 1000
}

export function WaveformTrack({ barCount, progress, seed = 1 }: Props): ReactElement {
  const heights = useMemo(() => {
    const out: number[] = []
    for (let i = 0; i < barCount; i++) {
      out.push(0.25 + 0.75 * pseudoRandom(i, seed))
    }
    return out
  }, [barCount, seed])

  return (
    <div className={styles.track} data-testid="waveform-track">
      {heights.map((h, i) => {
        const fillFrac = i / Math.max(1, barCount - 1)
        const active = fillFrac <= progress
        const style: CSSProperties = {
          height: `${(h * 100).toFixed(1)}%`,
          ['--bar-i' as string]: i,
        }
        return (
          <span
            key={i}
            data-bar
            data-active={active}
            className={styles.bar}
            style={style}
          />
        )
      })}
    </div>
  )
}
