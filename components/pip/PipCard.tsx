'use client'

import { useState, type ReactElement } from 'react'
import styles from './PipCard.module.css'

export interface PipCardProps {
  readonly id: string
  readonly thumbnail: string
  readonly favicon: string
  readonly title: string
}

export function PipCard({ id, thumbnail, favicon, title }: PipCardProps): ReactElement {
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgErrored, setImgErrored] = useState(false)

  const showThumbnail = thumbnail !== '' && !imgErrored
  const showFavicon = !showThumbnail && favicon !== ''
  const showGeneric = !showThumbnail && !showFavicon

  return (
    <div className={styles.card} data-testid={`pip-card-${id}`} data-card-id={id} aria-label={title}>
      {showThumbnail && (
        <>
          {!imgLoaded && (
            <div className={styles.thumbPlaceholder} aria-hidden="true">
              {favicon !== '' && (
                <img className={styles.placeholderFavicon} src={favicon} alt="" aria-hidden="true" />
              )}
            </div>
          )}
          <img
            className={`${styles.thumbnail} ${imgLoaded ? styles.thumbnailRevealed : ''}`}
            src={thumbnail}
            alt=""
            data-role="thumbnail"
            aria-hidden="true"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgErrored(true)}
          />
        </>
      )}
      {showFavicon && (
        <div className={styles.faviconFallback}>
          <img src={favicon} alt="" data-role="favicon-fallback" aria-hidden="true" />
        </div>
      )}
      {showGeneric && (
        <div className={styles.genericPlaceholder} data-role="generic-placeholder" aria-hidden="true" />
      )}
    </div>
  )
}
