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

// Synchronous in-process fan-out for BroadcastChannel('booklage').
//
// The real Node/jsdom BroadcastChannel delivers messages via the libuv event
// loop, so under vi.useFakeTimers() — and even under real timers, with a few
// ms of latency — same-process subscribers would otherwise miss messages
// during a tight critical section. This module installs a one-time patch on
// the BroadcastChannel constructor that tracks listeners attached to any
// `'booklage'` channel and invokes them synchronously when our `postOnce`
// runs, in addition to letting the native BC delivery reach cross-realm
// subscribers (PiP window, save-iframe).
//
// The patch only intercepts our own channel name; other BroadcastChannel
// users in the same runtime are unaffected.
type BCListener = (ev: { data: unknown }) => void
const channelListeners: WeakMap<BroadcastChannel, Set<BCListener>> = new WeakMap()
const liveChannels: Set<BroadcastChannel> = new Set()

function installSyncFanout(): void {
  if (typeof BroadcastChannel === 'undefined') return
  const proto = BroadcastChannel.prototype as BroadcastChannel & { __booklageSyncPatched?: true }
  if (proto.__booklageSyncPatched) return
  proto.__booklageSyncPatched = true

  const NativeBC = BroadcastChannel as unknown as new (name: string) => BroadcastChannel
  const origAdd = proto.addEventListener
  const origRemove = proto.removeEventListener

  // Wrap addEventListener / removeEventListener so we can shadow-track every
  // 'message' listener on a 'booklage' channel without breaking native delivery.
  proto.addEventListener = function (
    this: BroadcastChannel,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (listener) origAdd.call(this, type, listener, options)
    if (type === 'message' && listener && liveChannels.has(this)) {
      const set = channelListeners.get(this) ?? new Set<BCListener>()
      const fn: BCListener = typeof listener === 'function'
        ? (ev) => (listener as (ev: unknown) => void)(ev)
        : (ev) => listener.handleEvent(ev as unknown as Event)
      // Store under a key that survives removeEventListener via reference
      // equality. Use the raw listener reference as the key.
      set.add(Object.assign(fn, { __orig: listener }))
      channelListeners.set(this, set)
    }
  }

  proto.removeEventListener = function (
    this: BroadcastChannel,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void {
    if (listener) origRemove.call(this, type, listener, options)
    if (type === 'message' && listener && channelListeners.has(this)) {
      const set = channelListeners.get(this)
      if (set) {
        for (const fn of set) {
          if ((fn as BCListener & { __orig?: unknown }).__orig === listener) {
            set.delete(fn)
            break
          }
        }
      }
    }
  }

  const PatchedBC = function (this: BroadcastChannel, name: string): BroadcastChannel {
    const inst = new NativeBC(name) as BroadcastChannel & { close: () => void }
    if (name === CHANNEL_NAME) {
      liveChannels.add(inst)
      const origClose = inst.close.bind(inst)
      inst.close = (): void => {
        liveChannels.delete(inst)
        channelListeners.delete(inst)
        origClose()
      }
    }
    return inst
  } as unknown as typeof BroadcastChannel
  PatchedBC.prototype = proto
  ;(globalThis as { BroadcastChannel: typeof BroadcastChannel }).BroadcastChannel = PatchedBC
}

installSyncFanout()

function syncDispatch(msg: PipPresenceMessage, sender: BroadcastChannel | null): void {
  for (const ch of Array.from(liveChannels)) {
    if (ch === sender) continue
    const set = channelListeners.get(ch)
    if (!set) continue
    for (const fn of Array.from(set)) {
      try { fn({ data: msg }) } catch { /* ignore listener throws */ }
    }
  }
}

function postOnce(msg: PipPresenceMessage): void {
  if (typeof BroadcastChannel === 'undefined') return
  let sender: BroadcastChannel | null = null
  try {
    sender = new BroadcastChannel(CHANNEL_NAME)
    sender.postMessage(msg)
  } catch { /* ignore */ }
  // Synchronous in-realm fan-out so subscribers see the message immediately;
  // the native postMessage above still delivers to cross-realm subscribers.
  syncDispatch(msg, sender)
  try { sender?.close() } catch { /* ignore */ }
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
      const reply: PipPresenceMessage = { type: 'pip:presence', open, nonce: data.nonce }
      let replyCh: BroadcastChannel | null = null
      try {
        replyCh = new BroadcastChannel(CHANNEL_NAME)
        replyCh.postMessage(reply)
      } catch { /* ignore */ }
      syncDispatch(reply, replyCh)
      try { replyCh?.close() } catch { /* ignore */ }
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
    const query: PipPresenceMessage = { type: 'pip:query', nonce }
    try { ch.postMessage(query) } catch { /* ignore */ }
    syncDispatch(query, ch)
    setTimeout(() => finish(false), timeoutMs)
  })
}
