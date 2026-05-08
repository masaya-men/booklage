import { describe, it, expect } from 'vitest'
import {
  broadcastPipOpen,
  broadcastPipClosed,
  subscribePipPresence,
  queryPipPresence,
} from './pip-presence'

// Native BroadcastChannel delivers messages asynchronously via the libuv event
// loop, so these tests use real timers and brief `await` waits to allow
// in-realm subscribers to see the messages. The waits are tiny (a few ms) so
// the whole suite stays well under 200ms.
const flush = (ms: number = 20): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

describe('pip-presence', () => {
  it('broadcastPipOpen sends pip:open on the booklage channel', async () => {
    const received: unknown[] = []
    const ch = new BroadcastChannel('booklage')
    ch.addEventListener('message', (ev) => received.push(ev.data))
    broadcastPipOpen()
    await flush()
    expect(received.some((m) => (m as { type?: string } | null)?.type === 'pip:open')).toBe(true)
    ch.close()
  })

  it('subscribePipPresence reports open=true on pip:open and false on pip:closed', async () => {
    const states: boolean[] = []
    const unsub = subscribePipPresence((open) => states.push(open))
    broadcastPipOpen()
    await flush()
    broadcastPipClosed()
    await flush()
    expect(states).toEqual([true, false])
    unsub()
  })

  it('queryPipPresence resolves true if a subscriber answers within timeout', async () => {
    const unsub = subscribePipPresence(() => {}, () => true)
    await expect(queryPipPresence(80)).resolves.toBe(true)
    unsub()
  })

  it('queryPipPresence resolves false when no subscriber answers within timeout', async () => {
    await expect(queryPipPresence(40)).resolves.toBe(false)
  })
})
