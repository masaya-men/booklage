// components/share/SharedView.tsx
'use client'

import { useEffect, useState, type ReactElement } from 'react'
import Link from 'next/link'
import { decodeShareData } from '@/lib/share/decode'
import { sanitizeShareData } from '@/lib/share/validate'
import { computeAspectFrameSize } from '@/lib/share/aspect-presets'
import type { ShareData } from '@/lib/share/types'
import { ShareFrame } from './ShareFrame'
import styles from './SharedView.module.css'

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly data: ShareData }

const VIEWPORT_PADDING_X = 64
const VIEWPORT_PADDING_Y = 200
const VIEWPORT_MAX_W = 1280
const VIEWPORT_MAX_H = 820
const VIEWPORT_FALLBACK = { w: 1080, h: 720 } as const

export function SharedView(): ReactElement {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [size, setSize] = useState<{ w: number; h: number }>(VIEWPORT_FALLBACK)

  useEffect((): (() => void) => {
    const onResize = (): void => {
      setSize({
        w: Math.min(window.innerWidth - VIEWPORT_PADDING_X, VIEWPORT_MAX_W),
        h: Math.min(window.innerHeight - VIEWPORT_PADDING_Y, VIEWPORT_MAX_H),
      })
    }
    onResize()
    window.addEventListener('resize', onResize)
    return (): void => window.removeEventListener('resize', onResize)
  }, [])

  useEffect((): void => {
    void (async (): Promise<void> => {
      const hash = typeof window !== 'undefined' ? window.location.hash : ''
      const match = hash.match(/^#d=(.+)$/)
      if (!match) {
        setState({ kind: 'error', message: 'シェアデータが見つかりません' })
        return
      }
      const result = await decodeShareData(match[1])
      if (!result.ok) {
        setState({ kind: 'error', message: 'シェアデータが破損しています' })
        return
      }
      setState({ kind: 'ready', data: sanitizeShareData(result.data) })
    })()
  }, [])

  if (state.kind === 'loading') {
    return <div className={styles.center}>読み込み中…</div>
  }
  if (state.kind === 'error') {
    return (
      <div className={styles.center}>
        <p>{state.message}</p>
        <Link href="/board" className={styles.fallbackLink}>ボードへ戻る</Link>
      </div>
    )
  }

  const frame = computeAspectFrameSize(state.data.aspect, size.w, size.h)

  return (
    <div className={styles.page}>
      <div className={styles.frameHost}>
        <ShareFrame
          cards={state.data.cards}
          width={frame.width}
          height={frame.height}
          editable={false}
        />
      </div>
      <Link href="/board" className={styles.cornerLink}>
        Booklage で表現する ↗
      </Link>
    </div>
  )
}
