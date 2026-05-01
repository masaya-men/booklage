/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { postBookmarkSaved, subscribeBookmarkSaved } from '@/lib/board/channel'

describe('BroadcastChannel helper', () => {
  it('subscriber receives postBookmarkSaved event', async () => {
    const handler = vi.fn()
    const unsub = subscribeBookmarkSaved(handler)
    postBookmarkSaved({ bookmarkId: 'b1' })
    // BroadcastChannel delivers async on the next microtask
    await new Promise((r) => setTimeout(r, 0))
    expect(handler).toHaveBeenCalledWith({ bookmarkId: 'b1' })
    unsub()
  })

  it('unsubscribe stops the handler from firing', async () => {
    const handler = vi.fn()
    const unsub = subscribeBookmarkSaved(handler)
    unsub()
    postBookmarkSaved({ bookmarkId: 'b2' })
    await new Promise((r) => setTimeout(r, 0))
    expect(handler).not.toHaveBeenCalled()
  })
})
