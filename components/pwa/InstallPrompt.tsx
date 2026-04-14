'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import styles from './InstallPrompt.module.css'

/**
 * beforeinstallprompt event type.
 * Not in standard lib.d.ts — Chrome/Edge only.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt(): Promise<void>
}

/**
 * PWA install prompt banner.
 *
 * - Catches `beforeinstallprompt` event (Chrome/Edge only).
 * - Shows a pill-shaped banner with "Add to Home Screen" button.
 * - Hides on install, dismiss, or if already running as PWA.
 */
export function InstallPrompt(): React.ReactElement | null {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    // Already installed as PWA — don't show
    if (window.matchMedia('(display-mode: standalone)').matches) return

    function handleBeforeInstallPrompt(e: Event): void {
      e.preventDefault()
      const event = e as BeforeInstallPromptEvent
      promptRef.current = event
      setDeferredPrompt(event)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  const handleInstall = useCallback(async (): Promise<void> => {
    const prompt = promptRef.current
    if (!prompt) return

    await prompt.prompt()
    const choice = await prompt.userChoice

    if (choice.outcome === 'accepted') {
      setDeferredPrompt(null)
      promptRef.current = null
    }
  }, [])

  const handleDismiss = useCallback((): void => {
    setDismissed(true)
    setDeferredPrompt(null)
    promptRef.current = null
  }, [])

  if (!deferredPrompt || dismissed) return null

  return (
    <div className={styles.banner}>
      <span>Booklage をホーム画面に追加</span>
      <button className={styles.installButton} onClick={handleInstall} type="button">
        追加
      </button>
      <button className={styles.dismissButton} onClick={handleDismiss} type="button" aria-label="閉じる">
        ✕
      </button>
    </div>
  )
}
