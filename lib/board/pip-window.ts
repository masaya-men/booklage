'use client'

import { useCallback, useEffect, useState } from 'react'

export interface PipWindowApi {
  readonly window: Window | null
  readonly isSupported: boolean
  readonly isOpen: boolean
  open: () => Promise<void>
  close: () => void
}

declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow(opts: { width: number; height: number }): Promise<Window>
      window: Window | null
    }
  }
}

const PIP_WIDTH = 320
const PIP_HEIGHT = 320

export function usePipWindow(): PipWindowApi {
  const [pipWindow, setPipWindow] = useState<Window | null>(null)
  // SSR-safe support detection: hydration starts with isSupported=false to
  // match the prerendered HTML, then promotes to true on the client after
  // mount. Without this, statically exported pages render <button disabled>
  // and React 19's strict hydration keeps the disabled state.
  const [isSupported, setIsSupported] = useState(false)
  useEffect(() => {
    setIsSupported(typeof window !== 'undefined' && 'documentPictureInPicture' in window)
  }, [])

  const open = useCallback(async (): Promise<void> => {
    if (!isSupported) return
    if (pipWindow && !pipWindow.closed) return
    const api = window.documentPictureInPicture
    if (!api) return
    const win = await api.requestWindow({ width: PIP_WIDTH, height: PIP_HEIGHT })

    // Copy parent stylesheets into the PiP window. Two parallel strategies:
    // (1) Clone every existing <link rel="stylesheet"> tag — this is the
    //     primary path on Next.js prod builds where CSS lives in external
    //     bundles. Same-origin so PiP can fetch them without CORS.
    // (2) Inline-extract cssRules into <style> tags as a fallback for any
    //     style sheet that doesn't have an href (e.g. dev-mode HMR style
    //     blocks). Wrapped in try/catch because cross-origin sheets throw.
    const linkTags = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    for (const node of linkTags) {
      const link = node as HTMLLinkElement
      if (!link.href) continue
      const cloned = win.document.createElement('link')
      cloned.rel = 'stylesheet'
      cloned.href = link.href
      if (link.crossOrigin) cloned.crossOrigin = link.crossOrigin
      win.document.head.appendChild(cloned)
    }
    const styleTags = Array.from(document.querySelectorAll('style'))
    for (const node of styleTags) {
      const cloned = win.document.createElement('style')
      cloned.textContent = node.textContent ?? ''
      win.document.head.appendChild(cloned)
    }
    for (const sheet of Array.from(document.styleSheets)) {
      if (sheet.href) continue // already covered by link clones above
      try {
        const cssText = Array.from(sheet.cssRules).map((rule) => rule.cssText).join('\n')
        if (!cssText) continue
        const style = win.document.createElement('style')
        style.textContent = cssText
        win.document.head.appendChild(style)
      } catch {
        // CORS-blocked, no-op (covered by link clones for same-origin)
      }
    }

    // Enforce 320×320 viewport via html/body so layout never gets stretched
    // by Chrome's user-resized PiP window. The popup is still resizable but
    // our 320×320 content sits centered with a black letterbox.
    win.document.documentElement.style.cssText = 'margin:0;padding:0;background:#000;width:100%;height:100%;overflow:hidden;'
    win.document.body.style.cssText = 'margin:0;padding:0;background:#000;width:100%;height:100%;overflow:hidden;display:grid;place-items:center;'
    win.document.title = 'Booklage'

    win.addEventListener('pagehide', () => setPipWindow(null), { once: true })
    setPipWindow(win)
  }, [isSupported, pipWindow])

  const close = useCallback((): void => {
    if (pipWindow && !pipWindow.closed) pipWindow.close()
    setPipWindow(null)
  }, [pipWindow])

  useEffect(() => {
    return () => {
      if (pipWindow && !pipWindow.closed) pipWindow.close()
    }
  }, [pipWindow])

  return {
    window: pipWindow,
    isSupported,
    isOpen: !!pipWindow && !pipWindow.closed,
    open,
    close,
  }
}
