const CHANNEL_NAME = 'booklage'

export type PipPresenceMessage =
  | { type: 'pip:open' }
  | { type: 'pip:closed' }
  | { type: 'pip:query'; nonce: string }
  | { type: 'pip:presence'; open: boolean; nonce?: string }

function isPipMessage(data: unknown): data is PipPresenceMessage {
  if (!data || typeof data !== 'object') return false
  const t = (data as { type?: unknown }).type
  return t === 'pip:open' || t === 'pip:closed' || t === 'pip:query' || t === 'pip:presence'
}

function postOnce(msg: PipPresenceMessage): void {
  if (typeof BroadcastChannel === 'undefined') return
  try {
    const ch = new BroadcastChannel(CHANNEL_NAME)
    ch.postMessage(msg)
    ch.close()
  } catch { /* ignore */ }
}

export function broadcastPipOpen(): void { postOnce({ type: 'pip:open' }) }
export function broadcastPipClosed(): void { postOnce({ type: 'pip:closed' }) }

export function subscribePipPresence(
  handler: (open: boolean) => void,
  selfStateGetter?: () => boolean,
): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {}
  const ch = new BroadcastChannel(CHANNEL_NAME)
  const listener = (ev: MessageEvent): void => {
    const data = ev.data
    if (!isPipMessage(data)) return
    if (data.type === 'pip:open') handler(true)
    else if (data.type === 'pip:closed') handler(false)
    else if (data.type === 'pip:presence') handler(data.open)
    else if (data.type === 'pip:query' && selfStateGetter) {
      const open = selfStateGetter()
      const reply = new BroadcastChannel(CHANNEL_NAME)
      reply.postMessage({ type: 'pip:presence', open, nonce: data.nonce } satisfies PipPresenceMessage)
      reply.close()
    }
  }
  ch.addEventListener('message', listener)
  return (): void => {
    ch.removeEventListener('message', listener)
    ch.close()
  }
}

export function queryPipPresence(timeoutMs: number = 80): Promise<boolean> {
  if (typeof BroadcastChannel === 'undefined') return Promise.resolve(false)
  return new Promise<boolean>((resolve) => {
    const nonce = `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    let resolved = false
    const ch = new BroadcastChannel(CHANNEL_NAME)
    const finish = (open: boolean): void => {
      if (resolved) return
      resolved = true
      ch.removeEventListener('message', listener)
      ch.close()
      resolve(open)
    }
    const listener = (ev: MessageEvent): void => {
      const data = ev.data
      if (!isPipMessage(data)) return
      if (data.type === 'pip:presence' && data.nonce === nonce) finish(data.open)
    }
    ch.addEventListener('message', listener)
    ch.postMessage({ type: 'pip:query', nonce } satisfies PipPresenceMessage)
    setTimeout(() => finish(false), timeoutMs)
  })
}
