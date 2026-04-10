'use client'

import { type RefObject } from 'react'
import domtoimage from 'dom-to-image-more'
import styles from './ExportButton.module.css'

type ExportButtonProps = {
  /** Reference to the canvas element to capture */
  canvasRef: RefObject<HTMLDivElement | null>
}

/** Toolbar with PNG export and X (Twitter) share buttons */
export function ExportButton({ canvasRef }: ExportButtonProps): React.ReactElement {
  async function handleExport(): Promise<void> {
    if (!canvasRef.current) return
    const dataUrl = await domtoimage.toPng(canvasRef.current, { scale: 2 })
    const link = document.createElement('a')
    link.download = `booklage-${Date.now()}.png`
    link.href = dataUrl
    link.click()
  }

  function handleShareX(): void {
    const text = encodeURIComponent(`ブックマークでコラージュ作ったら最高になった\u2728 #Booklage`)
    const url = encodeURIComponent('https://booklage.com')
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank')
  }

  return (
    <div className={styles.toolbar}>
      <button className={styles.button} onClick={handleExport}>
        画像として保存
      </button>
      <button className={styles.button} onClick={handleShareX}>
        Xでシェア
      </button>
    </div>
  )
}
