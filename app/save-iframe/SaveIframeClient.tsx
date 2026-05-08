'use client'

import { useEffect, useRef, type ReactElement } from 'react'
import { initDB, addBookmark } from '@/lib/storage/indexeddb'
import { detectUrlType } from '@/lib/utils/url'
import { postBookmarkSaved } from '@/lib/board/channel'
import { parseSaveMessage, type SaveMessageResult } from '@/lib/utils/save-message'

const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^chrome-extension:\/\//,
]

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGIN_PATTERNS.some((p) => p.test(origin))) return true
  // Test/dev hatch: explicit window-attached allowlist (set by E2E or local dev).
  const w = globalThis as { __BOOKLAGE_ALLOWED_ORIGINS__?: string[] }
  if (Array.isArray(w.__BOOKLAGE_ALLOWED_ORIGINS__) && w.__BOOKLAGE_ALLOWED_ORIGINS__.includes(origin)) return true
  return false
}

export function SaveIframeClient(): ReactElement {
  const handledNonces = useRef<Set<string>>(new Set())

  useEffect(() => {
    const handler = async (ev: MessageEvent): Promise<void> => {
      if (!isAllowedOrigin(ev.origin)) return
      const parsed = parseSaveMessage(ev.data)
      if (!parsed.ok) return
      const { payload } = parsed.value

      if (handledNonces.current.has(payload.nonce)) return
      handledNonces.current.add(payload.nonce)

      const reply = (msg: SaveMessageResult): void => {
        ev.source?.postMessage(msg, { targetOrigin: ev.origin })
      }

      try {
        const db = await initDB()
        const bm = await addBookmark(db, {
          url: payload.url,
          title: payload.title || payload.url,
          description: payload.description,
          thumbnail: payload.image,
          favicon: payload.favicon,
          siteName: payload.siteName,
          type: detectUrlType(payload.url),
          tags: [],
        })
        postBookmarkSaved({ bookmarkId: bm.id })
        reply({ type: 'booklage:save:result', nonce: payload.nonce, ok: true, bookmarkId: bm.id })
      } catch (err) {
        reply({
          type: 'booklage:save:result',
          nonce: payload.nonce,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  return <div data-testid="save-iframe-mounted" style={{ display: 'none' }} />
}
