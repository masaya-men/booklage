// components/share/SharedView.tsx
'use client'

import { useEffect, useState, type ReactElement } from 'react'
import Link from 'next/link'
import { decodeShareData, type DecodeDiagnostics } from '@/lib/share/decode'
import { sanitizeShareData } from '@/lib/share/validate'
import { computeAspectFrameSize } from '@/lib/share/aspect-presets'
import type { ShareData } from '@/lib/share/types'
import { ShareFrame } from './ShareFrame'
import styles from './SharedView.module.css'

type ErrorInfo = {
  readonly message: string
  readonly hashLen: number
  readonly diag?: DecodeDiagnostics
}

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly info: ErrorInfo }
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
      const hashLen = hash.length
      const match = hash.match(/^#d=(.+)$/)
      if (!match) {
        setState({
          kind: 'error',
          info: { message: 'シェアデータが見つかりません', hashLen },
        })
        return
      }
      const result = await decodeShareData(match[1])
      if (!result.ok) {
        const { ok: _ok, ...diag } = result
        setState({
          kind: 'error',
          info: { message: 'シェアデータが破損しています', hashLen, diag },
        })
        return
      }
      setState({ kind: 'ready', data: sanitizeShareData(result.data) })
    })()
  }, [])

  if (state.kind === 'loading') {
    return <div className={styles.center}>読み込み中…</div>
  }
  if (state.kind === 'error') {
    return <ErrorView info={state.info} />
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

function ErrorView({ info }: { readonly info: ErrorInfo }): ReactElement {
  const { message, hashLen, diag } = info
  return (
    <div className={styles.center}>
      <p className={styles.errorTitle}>{message}</p>

      <div className={styles.diagBox} data-testid="share-diagnostics">
        <div className={styles.diagRow}>
          <span className={styles.diagLabel}>hash 長</span>
          <span className={styles.diagValue}>{hashLen} 文字</span>
        </div>

        {diag && (
          <>
            <div className={styles.diagRow}>
              <span className={styles.diagLabel}>失敗ステージ</span>
              <span className={styles.diagValue}>{diag.stage}</span>
            </div>
            <div className={styles.diagRow}>
              <span className={styles.diagLabel}>fragment 長</span>
              <span className={styles.diagValue}>{diag.fragmentLen} 文字</span>
            </div>
            {diag.bytesLen !== undefined && (
              <div className={styles.diagRow}>
                <span className={styles.diagLabel}>decode 後 bytes</span>
                <span className={styles.diagValue}>{diag.bytesLen} bytes</span>
              </div>
            )}
            {diag.headHex && (
              <div className={styles.diagRow}>
                <span className={styles.diagLabel}>先頭 4 byte</span>
                <span className={styles.diagValueMono}>{diag.headHex}</span>
              </div>
            )}
            {diag.tailHex && (
              <div className={styles.diagRow}>
                <span className={styles.diagLabel}>末尾 16 byte</span>
                <span className={styles.diagValueMono}>{diag.tailHex}</span>
              </div>
            )}
            {diag.decompressedLen !== undefined && (
              <div className={styles.diagRow}>
                <span className={styles.diagLabel}>解凍後 bytes</span>
                <span className={styles.diagValue}>{diag.decompressedLen} bytes</span>
              </div>
            )}
            {diag.jsonPreview && (
              <div className={styles.diagRow}>
                <span className={styles.diagLabel}>JSON 先頭</span>
                <span className={styles.diagValueMono}>{diag.jsonPreview}</span>
              </div>
            )}
            {diag.rawError && (
              <div className={styles.diagRow}>
                <span className={styles.diagLabel}>raw error</span>
                <span className={styles.diagValueMono}>{diag.rawError}</span>
              </div>
            )}
          </>
        )}
      </div>

      <p className={styles.diagHint}>
        この画面の数値を送信者にスクリーンショットで送ってください
      </p>

      <Link href="/board" className={styles.fallbackLink}>ボードへ戻る</Link>
    </div>
  )
}
