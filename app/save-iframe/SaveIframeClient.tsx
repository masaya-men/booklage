'use client'

import { useEffect, useRef, type ReactElement } from 'react'
import { useSearchParams } from 'next/navigation'
import { initDB, addBookmark } from '@/lib/storage/indexeddb'
import { detectUrlType } from '@/lib/utils/url'
import { postBookmarkSaved } from '@/lib/board/channel'
import {
  parseSaveMessage,
  parseProbeMessage,
  type SaveMessageResult,
} from '@/lib/utils/save-message'
import { subscribePipPresence, queryPipPresence } from '@/lib/board/pip-presence'

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
  const searchParams = useSearchParams()
  const isBookmarkletFlow = searchParams.get('bookmarklet') === '1'
  const handledNonces = useRef<Set<string>>(new Set())
  const pipActiveRef = useRef<boolean>(false)
  const seenPresenceRef = useRef<boolean>(false)

  // Storage Access API — the bookmarklet flow runs this iframe in a 3rd-party
  // context (embedded in arbitrary user-visited pages). Chrome's storage
  // partitioning (Chrome 115+) keys BroadcastChannel and IndexedDB by
  // top-level-site, which would isolate this iframe from the booklage main
  // tab + PiP companion. requestStorageAccess({all: true}) (Chrome 124+, the
  // non-cookie storage extension) bridges this gap by granting unpartitioned
  // access. Chrome auto-grants without a prompt when the user has visited
  // booklage as a first-party recently. If denied or unsupported, the probe
  // simply times out on the bookmarklet side and it falls back to the popup.
  useEffect(() => {
    if (!isBookmarkletFlow) return
    const requestAccess = async (): Promise<void> => {
      const doc = document as Document & {
        requestStorageAccess?: (types?: { all?: boolean }) => Promise<void>
      }
      if (!doc.requestStorageAccess) return
      try {
        await doc.requestStorageAccess({ all: true })
      } catch {
        // Try the no-args variant as a last resort (cookies only, won't help
        // for IDB/BC, but worth attempting if {all: true} isn't recognised).
        try { await doc.requestStorageAccess() } catch { /* ignore */ }
      }
    }
    void requestAccess()
  }, [isBookmarkletFlow])

  // Subscribe to PiP presence broadcasts so the iframe can answer probes
  // synchronously on subsequent calls.
  useEffect(() => {
    const unsub = subscribePipPresence((open) => {
      pipActiveRef.current = open
      seenPresenceRef.current = true
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    /**
     * Origin policy:
     *   - Extension flow (no `?bookmarklet=1`): strict — only chrome-extension://
     *     origins (plus the test-allowlist hatch) may post messages here.
     *   - Bookmarklet flow (`?bookmarklet=1`): any origin is accepted.
     *
     * Security trade-off for the bookmarklet flow:
     *   The bookmarklet runs on arbitrary user-visited pages and creates a
     *   hidden iframe pointing at /save-iframe?bookmarklet=1, then posts
     *   `booklage:probe` / `booklage:save` to it. We cannot pin a single origin.
     *   Risk: any site that iframes /save-iframe?bookmarklet=1 could write
     *   junk bookmarks to the visitor's IndexedDB. There is no data
     *   exfiltration (we only accept inbound saves; we don't read DB content
     *   back to the parent). The blast radius is "bookmarks the user can
     *   delete", which mirrors how all bookmarklets work — clicking the
     *   bookmarklet grants the host page implicit permission. v0 accepts this.
     */
    const originAllowed = (origin: string): boolean =>
      isBookmarkletFlow ? true : isAllowedOrigin(origin)

    const handler = async (ev: MessageEvent): Promise<void> => {
      if (!originAllowed(ev.origin)) return

      // Probe handling: answer with the current pipActive state. On the very
      // first probe (no presence message ever observed), lazy-query once via
      // the broadcast channel so we don't return a false negative.
      const probeParsed = parseProbeMessage(ev.data)
      if (probeParsed.ok) {
        let active = pipActiveRef.current
        if (!seenPresenceRef.current) {
          active = await queryPipPresence(80)
          pipActiveRef.current = active
          seenPresenceRef.current = true
        }
        ev.source?.postMessage(
          { type: 'booklage:probe:result', nonce: probeParsed.value.payload.nonce, pipActive: active },
          { targetOrigin: ev.origin },
        )
        return
      }

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
  }, [isBookmarkletFlow])

  return <div data-testid="save-iframe-mounted" style={{ display: 'none' }} />
}
