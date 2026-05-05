// components/share/ShareActionSheet.tsx
'use client'

import { useCallback, useState, type ReactElement } from 'react'
import { buildXIntent } from '@/lib/share/x-intent'
import styles from './ShareActionSheet.module.css'

type Props = {
  readonly pngDataUrl: string
  readonly shareUrl: string
  readonly onClose: () => void
}

export function ShareActionSheet({ pngDataUrl, shareUrl, onClose }: Props): ReactElement {
  const [copied, setCopied] = useState<boolean>(false)

  const onDownload = useCallback((): void => {
    const a = document.createElement('a')
    a.href = pngDataUrl
    a.download = `booklage-${Date.now()}.png`
    a.click()
  }, [pngDataUrl])

  const onCopy = useCallback(async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      window.prompt('Copy this URL', shareUrl)
    }
  }, [shareUrl])

  const onPostX = useCallback((): void => {
    window.open(buildXIntent({ shareUrl }), '_blank', 'noopener,noreferrer')
  }, [shareUrl])

  return (
    <div
      className={styles.backdrop}
      onClick={(e): void => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className={styles.sheet} role="dialog" aria-label="Share actions">
        <h3 className={styles.title}>シェア方法を選ぶ</h3>
        <div className={styles.preview}>
          <img src={pngDataUrl} alt="Preview" />
        </div>
        <div className={styles.buttons}>
          <button type="button" className={styles.actionBtn} onClick={onDownload}>
            <span className={styles.icon}>📥</span>
            <span>画像をダウンロード</span>
          </button>
          <button type="button" className={styles.actionBtn} onClick={onCopy}>
            <span className={styles.icon}>🔗</span>
            <span>{copied ? 'コピーしました' : 'URL をコピー'}</span>
          </button>
          <button type="button" className={styles.actionBtn} onClick={onPostX}>
            <span className={styles.icon}>𝕏</span>
            <span>X で投稿</span>
          </button>
        </div>
        <button type="button" className={styles.closeBtn} onClick={onClose}>閉じる</button>
      </div>
    </div>
  )
}
