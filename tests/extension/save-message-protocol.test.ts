import { describe, it, expect, vi } from 'vitest'
import { createOffscreenRouter } from '../../extension/lib/offscreen-router.js'

describe('createOffscreenRouter', () => {
  it('routes a save:result back to the registered port', () => {
    const router = createOffscreenRouter()
    const sendResponse = vi.fn()
    router.register('n1', { postMessage: sendResponse })
    expect(router.has('n1')).toBe(true)
    const ok = router.resolve('n1', { type: 'booklage:save:result', nonce: 'n1', ok: true, bookmarkId: 'b1' })
    expect(ok).toBe(true)
    expect(sendResponse).toHaveBeenCalledOnce()
    expect(sendResponse).toHaveBeenCalledWith({ type: 'booklage:save:result', nonce: 'n1', ok: true, bookmarkId: 'b1' })
    expect(router.has('n1')).toBe(false)
  })

  it('routes a probe:result back to the registered port', () => {
    const router = createOffscreenRouter()
    const sendResponse = vi.fn()
    router.register('p1', { postMessage: sendResponse })
    router.resolve('p1', { type: 'booklage:probe:result', nonce: 'p1', pipActive: true })
    expect(sendResponse).toHaveBeenCalledWith({ type: 'booklage:probe:result', nonce: 'p1', pipActive: true })
  })

  it('does not cross-route between nonces', () => {
    const router = createOffscreenRouter()
    const a = vi.fn(), b = vi.fn()
    router.register('n1', { postMessage: a })
    router.register('n2', { postMessage: b })
    router.resolve('n1', { nonce: 'n1', ok: true })
    expect(a).toHaveBeenCalledOnce()
    expect(b).not.toHaveBeenCalled()
    router.resolve('n2', { nonce: 'n2', ok: true })
    expect(b).toHaveBeenCalledOnce()
  })

  it('returns false on resolve when nonce not registered', () => {
    const router = createOffscreenRouter()
    const ok = router.resolve('ghost', { ok: true })
    expect(ok).toBe(false)
  })

  it('timeout removes the nonce and posts a timeout envelope', () => {
    const router = createOffscreenRouter()
    const sendResponse = vi.fn()
    router.register('n1', { postMessage: sendResponse })
    const ok = router.timeout('n1')
    expect(ok).toBe(true)
    expect(sendResponse).toHaveBeenCalledWith({ type: 'booklage:save:result', nonce: 'n1', ok: false, error: 'timeout' })
    expect(router.has('n1')).toBe(false)
  })

  it('timeout after resolve is a no-op', () => {
    const router = createOffscreenRouter()
    const sendResponse = vi.fn()
    router.register('n1', { postMessage: sendResponse })
    router.resolve('n1', { ok: true })
    sendResponse.mockClear()
    const ok = router.timeout('n1')
    expect(ok).toBe(false)
    expect(sendResponse).not.toHaveBeenCalled()
  })

  it('resolve after timeout is a no-op', () => {
    const router = createOffscreenRouter()
    const sendResponse = vi.fn()
    router.register('n1', { postMessage: sendResponse })
    router.timeout('n1')
    sendResponse.mockClear()
    const ok = router.resolve('n1', { ok: true })
    expect(ok).toBe(false)
    expect(sendResponse).not.toHaveBeenCalled()
  })
})
