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
      requestWindow(opts: {
        width: number
        height: number
        // Chrome 130+: when true, the browser opens the PiP window at its
        // default placement (bottom-right of work area) instead of the
        // last user-resized/moved position cached for this origin. Without
        // this, every reopen lands wherever the user dragged it last.
        preferInitialWindowPlacement?: boolean
      }): Promise<Window>
      window: Window | null
    }
  }
}

// Inner content size requested from the browser. Chrome's Document PiP
// silently ignores resizeTo() on the returned window, so the inner here
// is what actually ships visually. Chrome enforces a minimum around
// 240×240; anything smaller will be clamped back up or rejected.
// 256 sits between Spotify Miniplayer's square floor (~300) and Chrome's
// absolute floor (240), giving a noticeably more compact footprint than
// the bookmarklet popup while staying safely above the rejection edge.
const PIP_OUTER = 256

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
    // Ask Chrome for a square OUTER window at the default placement. The
    // `preferInitialWindowPlacement: true` flag (Chrome 130+) is the only
    // way to override Chrome's cached "last user position" — moveTo() is
    // a no-op on PiP windows by spec. Without this flag, every reopen
    // lands wherever the user dragged the window previously.
    const win = await api.requestWindow({
      width: PIP_OUTER,
      height: PIP_OUTER,
      preferInitialWindowPlacement: true,
    })

    // Force the OUTER window to a perfect square. Chrome counts the title
    // bar inside the height it gives requestWindow, so on first open the
    // window comes out as PIP_OUTER × (PIP_OUTER + chrome) — visually
    // taller than wide. resizeTo on a PiP window operates on outer
    // dimensions, which is exactly what we want.
    try {
      win.resizeTo(PIP_OUTER, PIP_OUTER)
    } catch {
      // resizeTo can throw on some platforms; fall back to Chrome's
      // chosen size (slightly tall but functional).
    }
    // Surface the actual final outer dimensions so we can verify the
    // resize landed (Chrome may clamp below ~240).
    if (typeof console !== 'undefined') {
      console.warn(
        `[Booklage PiP v80] outer ${win.outerWidth}×${win.outerHeight}, inner ${win.innerWidth}×${win.innerHeight}`,
      )
    }

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
        `[Booklage PiP v80] injected ${totalRules} CSS rules across ${document.styleSheets.length} parent sheets`,
      )
    }

    // Fill whatever inner area Chrome ends up giving us (after resizeTo, the
    // inner is roughly PIP_OUTER × (PIP_OUTER - title_bar_height) — slightly
    // landscape). Companion content centers via grid, with a black letterbox
    // for any residual aspect mismatch when the user resizes mid-session.
    win.document.documentElement.style.cssText = 'margin:0;padding:0;background:#000;width:100%;height:100%;overflow:hidden;'
    win.document.body.style.cssText = 'margin:0;padding:0;background:#000;width:100%;height:100%;overflow:hidden;display:grid;place-items:center;'
    // Chrome's Document PiP intentionally always shows the origin in the
    // title bar (anti-spoofing), so document.title doesn't actually surface.
    // Setting it anyway in case Chrome relaxes this in future versions.
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
