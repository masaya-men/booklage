// components/share/SharedView.tsx
'use client'

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import Link from 'next/link'
import { decodeShareData, type DecodeDiagnostics } from '@/lib/share/decode'
import { sanitizeShareData } from '@/lib/share/validate'
import { relayShareLayout } from '@/lib/share/relay-layout'
import type { ShareData } from '@/lib/share/types'
import { ShareFrame } from './ShareFrame'
import { Lightbox } from '@/components/board/Lightbox'
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

type LightboxOpenState = {
  readonly index: number
  readonly rect: DOMRect | null
}

const PAGE_PADDING_X = 16
const PAGE_PADDING_Y = 24

export function SharedView(): ReactElement {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [innerWidth, setInnerWidth] = useState<number>(1080)
  const [openState, setOpenState] = useState<LightboxOpenState | null>(null)

  useEffect((): (() => void) => {
    const onResize = (): void => {
      setInnerWidth(Math.max(320, window.innerWidth - 2 * PAGE_PADDING_X))
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

  // Re-run the board's masonry against the receiver's viewport width so the
  // shared collage fills the screen the same way the sender's board does.
  // Older URLs without per-card `a` fall through unchanged inside relay.
  const relayed = useMemo(() => {
    if (state.kind !== 'ready') return null
    return relayShareLayout({
      cards: state.data.cards,
      viewport: { width: innerWidth, height: 0 },
    })
  }, [state, innerWidth])

  const cardsLen = relayed ? relayed.cards.length : 0

  const handleClose = useCallback((): void => {
    setOpenState(null)
  }, [])

  const handleNav = useCallback((dir: -1 | 1): void => {
    if (cardsLen === 0) return
    setOpenState((s) => {
      if (!s) return s
      const next = ((s.index + dir) % cardsLen + cardsLen) % cardsLen
      return { index: next, rect: null }
    })
  }, [cardsLen])

  const handleJump = useCallback((index: number): void => {
    if (index < 0 || index >= cardsLen) return
    setOpenState({ index, rect: null })
  }, [cardsLen])

  if (state.kind === 'loading') {
    return <div className={styles.center}>読み込み中…</div>
  }
  if (state.kind === 'error') {
    return <ErrorView info={state.info} />
  }

  if (!relayed) return <div className={styles.center}>読み込み中…</div>

  const frame = relayed.frameSize
  const cards = relayed.cards
  const openCard = openState ? cards[openState.index] ?? null : null

  return (
    <div className={styles.page} style={{ padding: `${PAGE_PADDING_Y}px ${PAGE_PADDING_X}px` }}>
      <div className={styles.frameHost} style={{ width: frame.width, height: frame.height }}>
        <ShareFrame
          cards={cards}
          width={frame.width}
          height={frame.height}
          editable={false}
          onCardOpen={(i, rect): void => setOpenState({ index: i, rect })}
        />
      </div>
      <Link href="/board" className={styles.cornerLink}>
        AllMarks を試す ↗
      </Link>
      <Lightbox
        item={openCard}
        originRect={openState?.rect ?? null}
        onClose={handleClose}
        nav={openCard && openState ? {
          currentIndex: openState.index,
          total: cards.length,
          onNav: handleNav,
          onJump: handleJump,
        } : undefined}
      />
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
