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

    // Copy parent stylesheets — necessary because CSS Modules emit
    // hashed class names that the PiP document doesn't see otherwise.
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const cssText = Array.from(sheet.cssRules).map((rule) => rule.cssText).join('\n')
        const style = win.document.createElement('style')
        style.textContent = cssText
        win.document.head.appendChild(style)
      } catch {
        if (sheet.href) {
          const link = win.document.createElement('link')
          link.rel = 'stylesheet'
          link.href = sheet.href
          win.document.head.appendChild(link)
        }
      }
    }

    win.document.body.style.background = '#000'
    win.document.body.style.margin = '0'
    win.document.body.style.padding = '0'
    win.document.body.style.overflow = 'hidden'
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
