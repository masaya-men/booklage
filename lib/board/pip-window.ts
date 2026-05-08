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
    // Inline-extract cssRules from EVERY accessible stylesheet (same-origin
    // including /_next/static/css/* in Next.js prod) and inject as <style>
    // tags. This is synchronous — by the time PiP body renders, all rules
    // are already parsed. Avoids the async <link> fetch race that left the
    // PiP unstyled while Chrome rendered our React Portal output.
    let totalRules = 0
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const rules = Array.from(sheet.cssRules)
        if (rules.length === 0) continue
        const cssText = rules.map((rule) => rule.cssText).join('\n')
        const style = win.document.createElement('style')
        style.setAttribute('data-booklage-pip-css', sheet.href ?? 'inline')
        style.textContent = cssText
        win.document.head.appendChild(style)
        totalRules += rules.length
      } catch {
        // CORS-blocked sheet — fall back to <link> clone if it has an href.
        if (sheet.href) {
          const link = win.document.createElement('link')
          link.rel = 'stylesheet'
          link.href = sheet.href
          win.document.head.appendChild(link)
        }
      }
    }
    // Also clone all parent <style> blocks (e.g. critical CSS / dev HMR).
    const styleTags = Array.from(document.querySelectorAll('style'))
    for (const node of styleTags) {
      const cloned = win.document.createElement('style')
      cloned.setAttribute('data-booklage-pip-css', 'parent-style')
      cloned.textContent = node.textContent ?? ''
      win.document.head.appendChild(cloned)
    }
    // Surface a debug breadcrumb so we can verify CSS injection in DevTools.
    // (Use globalThis.console rather than win.console — TS doesn't expose
    // console on the Window interface returned by requestWindow.)
    if (typeof console !== 'undefined') {
      // Use console.warn so it bypasses default-level filters that hide info.
      console.warn(
        `[Booklage PiP v75] injected ${totalRules} CSS rules across ${document.styleSheets.length} parent sheets`,
      )
    }

    // Enforce 320×320 viewport via html/body so layout never gets stretched
    // by Chrome's user-resized PiP window. The popup is still resizable but
    // our 320×320 content sits centered with a black letterbox.
    win.document.documentElement.style.cssText = 'margin:0;padding:0;background:#000;width:100%;height:100%;overflow:hidden;'
    win.document.body.style.cssText = 'margin:0;padding:0;background:#000;width:100%;height:100%;overflow:hidden;display:grid;place-items:center;'
    // v75 canary — if the PiP title contains this string, the latest code is
    // running. Easier to verify than a console message which can be filtered.
    win.document.title = 'Booklage [v75]'

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
