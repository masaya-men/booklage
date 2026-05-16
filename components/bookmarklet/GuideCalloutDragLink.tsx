'use client'

import { useEffect, useRef, useState, type ReactElement } from 'react'
import { generateBookmarkletUri } from '@/lib/utils/bookmarklet'

export function GuideCalloutDragLink(): ReactElement | null {
  const linkRef = useRef<HTMLAnchorElement>(null)
  const [appUrl, setAppUrl] = useState<string>('')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAppUrl(window.location.origin)
    }
  }, [])

  useEffect(() => {
    if (appUrl && linkRef.current) {
      linkRef.current.setAttribute('href', generateBookmarkletUri(appUrl))
    }
  }, [appUrl])

  if (!appUrl) return null

  return (
    <a
      ref={linkRef}
      className="bookmarklet-drag"
      draggable="true"
      onClick={(e): void => e.preventDefault()}
      title="ブックマークバーにドラッグして設置"
    >
      📌 AllMarks に保存
    </a>
  )
}
