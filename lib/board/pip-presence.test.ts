import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  broadcastPipOpen,
  broadcastPipClosed,
  subscribePipPresence,
  queryPipPresence,
} from './pip-presence'

describe('pip-presence', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('broadcastPipOpen sends pip:open on the booklage channel', () => {
    const received: unknown[] = []
    const ch = new BroadcastChannel('booklage')
    ch.addEventListener('message', (ev) => received.push(ev.data))
    broadcastPipOpen()
    expect(received.some((m: any) => m?.type === 'pip:open')).toBe(true)
    ch.close()
  })

  it('subscribePipPresence reports open=true on pip:open and false on pip:closed', () => {
    const states: boolean[] = []
    const unsub = subscribePipPresence((open) => states.push(open))
    broadcastPipOpen()
    broadcastPipClosed()
    expect(states).toEqual([true, false])
    unsub()
  })

  it('queryPipPresence resolves true if a subscriber answers within timeout', async () => {
    const unsub = subscribePipPresence(() => {}, () => true)
    const promise = queryPipPresence(80)
    await vi.advanceTimersByTimeAsync(50)
    await expect(promise).resolves.toBe(true)
    unsub()
  })

  it('queryPipPresence resolves false when no subscriber answers within timeout', async () => {
    const promise = queryPipPresence(80)
    await vi.advanceTimersByTimeAsync(100)
    await expect(promise).resolves.toBe(false)
  })
})
