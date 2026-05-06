'use client'

import { useCallback, useEffect, useReducer, useState } from 'react'
import type { ShareMode } from '@/lib/share/composer-layout'

export type PinnedSides = {
  readonly h: boolean
  readonly s: boolean
  readonly b: boolean
}

export type ShareFullscreenAPI = {
  readonly mode: ShareMode
  readonly pinned: PinnedSides
  readonly canUseFullscreen: boolean
  readonly helpVisible: boolean
  readonly toggleMode: () => void
  readonly togglePin: (side: 'h' | 's' | 'b') => void
  readonly exitPreview: () => void
  readonly toggleHelp: () => void
  readonly closeHelp: () => void
  readonly flashSide: 'h' | 's' | 'b' | null
}

type State = {
  readonly mode: ShareMode
  readonly pinned: PinnedSides
  readonly helpVisible: boolean
  readonly flashSide: 'h' | 's' | 'b' | null
  readonly flashId: number
}

type Action =
  | { readonly type: 'toggle-mode' }
  | { readonly type: 'toggle-pin'; readonly side: 'h' | 's' | 'b' }
  | { readonly type: 'exit-preview' }
  | { readonly type: 'toggle-help' }
  | { readonly type: 'close-help' }
  | { readonly type: 'clear-flash'; readonly id: number }

const INIT: State = {
  mode: 'layout',
  pinned: { h: false, s: false, b: false },
  helpVisible: false,
  flashSide: null,
  flashId: 0,
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'toggle-mode':
      return { ...s, mode: s.mode === 'layout' ? 'preview' : 'layout', pinned: INIT.pinned, helpVisible: false }
    case 'toggle-pin': {
      if (s.mode !== 'preview') return s
      const next = { ...s.pinned, [a.side]: !s.pinned[a.side] }
      return { ...s, pinned: next, flashSide: a.side, flashId: s.flashId + 1 }
    }
    case 'exit-preview':
      return { ...s, mode: 'layout', pinned: INIT.pinned, helpVisible: false }
    case 'toggle-help':
      return { ...s, helpVisible: !s.helpVisible }
    case 'close-help':
      return { ...s, helpVisible: false }
    case 'clear-flash':
      return s.flashId === a.id ? { ...s, flashSide: null } : s
    default:
      return s
  }
}

export function useShareFullscreen(opts: {
  readonly open: boolean
  readonly onCloseModal: () => void
}): ShareFullscreenAPI {
  const { open, onCloseModal } = opts
  const [state, dispatch] = useReducer(reducer, INIT)
  const [canUseFullscreen, setCanUse] = useState<boolean>(false)

  // Touch detection: evaluate once on mount.
  useEffect((): void => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia('(hover: hover) and (pointer: fine)')
    setCanUse(mql.matches)
  }, [])

  const toggleMode = useCallback((): void => {
    if (!canUseFullscreen) return
    dispatch({ type: 'toggle-mode' })
  }, [canUseFullscreen])

  const togglePin = useCallback((side: 'h' | 's' | 'b'): void => {
    if (!canUseFullscreen) return
    dispatch({ type: 'toggle-pin', side })
  }, [canUseFullscreen])

  const exitPreview = useCallback((): void => {
    dispatch({ type: 'exit-preview' })
  }, [])

  const toggleHelp = useCallback((): void => {
    dispatch({ type: 'toggle-help' })
  }, [])

  const closeHelp = useCallback((): void => {
    dispatch({ type: 'close-help' })
  }, [])

  // Flash auto-clear: 440ms after each pin toggle, clear flashSide.
  useEffect((): undefined | (() => void) => {
    if (state.flashSide == null) return undefined
    const id = state.flashId
    const timer = setTimeout(() => dispatch({ type: 'clear-flash', id }), 440)
    return (): void => clearTimeout(timer)
  }, [state.flashSide, state.flashId])

  // Keyboard listener: only mount when modal open + non-touch.
  useEffect((): undefined | (() => void) => {
    if (!open || !canUseFullscreen) return undefined

    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const k = e.key.toLowerCase()
      if (k === 'f') { e.preventDefault(); dispatch({ type: 'toggle-mode' }); return }
      if (k === '?') { e.preventDefault(); dispatch({ type: 'toggle-help' }); return }
      if (k === 'escape') {
        e.preventDefault()
        if (state.helpVisible) { dispatch({ type: 'close-help' }); return }
        if (state.mode === 'preview') { dispatch({ type: 'exit-preview' }); return }
        onCloseModal()
        return
      }
      if (state.mode !== 'preview') return
      if (k === 'h' || k === 's' || k === 'b') {
        e.preventDefault()
        dispatch({ type: 'toggle-pin', side: k })
      }
    }

    document.addEventListener('keydown', onKey)
    return (): void => document.removeEventListener('keydown', onKey)
  }, [open, onCloseModal, canUseFullscreen, state.mode, state.helpVisible])

  return {
    mode: canUseFullscreen ? state.mode : 'layout',
    pinned: state.pinned,
    canUseFullscreen,
    helpVisible: state.helpVisible,
    toggleMode,
    togglePin,
    exitPreview,
    toggleHelp,
    closeHelp,
    flashSide: state.flashSide,
  }
}
