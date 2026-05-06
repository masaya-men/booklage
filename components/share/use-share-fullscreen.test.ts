import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useShareFullscreen } from './use-share-fullscreen'

function mockMatchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

describe('useShareFullscreen', () => {
  const noop = (): void => {}

  beforeEach(() => {
    mockMatchMedia(true)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts in layout mode with no pins', () => {
    const { result } = renderHook(() => useShareFullscreen({ open: true, onCloseModal: noop }))
    expect(result.current.mode).toBe('layout')
    expect(result.current.pinned).toEqual({ h: false, s: false, b: false })
    expect(result.current.canUseFullscreen).toBe(true)
  })

  it('toggleMode flips between layout and preview, resetting pins', () => {
    const { result } = renderHook(() => useShareFullscreen({ open: true, onCloseModal: noop }))
    act(() => { result.current.toggleMode() })
    expect(result.current.mode).toBe('preview')
    act(() => { result.current.togglePin('h') })
    expect(result.current.pinned.h).toBe(true)
    act(() => { result.current.toggleMode() })
    expect(result.current.mode).toBe('layout')
    expect(result.current.pinned).toEqual({ h: false, s: false, b: false })
  })

  it('togglePin only works in preview mode', () => {
    const { result } = renderHook(() => useShareFullscreen({ open: true, onCloseModal: noop }))
    act(() => { result.current.togglePin('h') }) // no-op in layout
    expect(result.current.pinned.h).toBe(false)
    act(() => { result.current.toggleMode() })
    act(() => { result.current.togglePin('h') })
    expect(result.current.pinned.h).toBe(true)
  })

  it('exitPreview returns to layout and resets pins', () => {
    const { result } = renderHook(() => useShareFullscreen({ open: true, onCloseModal: noop }))
    act(() => { result.current.toggleMode() })
    act(() => { result.current.togglePin('s') })
    act(() => { result.current.exitPreview() })
    expect(result.current.mode).toBe('layout')
    expect(result.current.pinned.s).toBe(false)
  })

  it('canUseFullscreen is false when (hover: hover) and (pointer: fine) does not match', () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => useShareFullscreen({ open: true, onCloseModal: noop }))
    expect(result.current.canUseFullscreen).toBe(false)
    act(() => { result.current.toggleMode() })
    expect(result.current.mode).toBe('layout') // touch fallback: toggleMode is no-op
  })
})
