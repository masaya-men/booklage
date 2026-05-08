// Pure routing helper for the offscreen <-> SW bridge.
// Manages a pendingByNonce map and routes responses to the right port.

export function createOffscreenRouter() {
  const pendingByNonce = new Map()

  return {
    /**
     * Register a pending response port keyed by nonce. The port has a
     * single-shot postMessage(data) that is consumed when the iframe
     * answers OR when the timeout fires.
     */
    register(nonce, port) {
      pendingByNonce.set(nonce, port)
    },
    /**
     * Resolve a nonce with the iframe's response data. Returns true if a
     * pending port was found (and posted to), false if the nonce was
     * already consumed (e.g. by timeout).
     */
    resolve(nonce, data) {
      const port = pendingByNonce.get(nonce)
      if (!port) return false
      pendingByNonce.delete(nonce)
      port.postMessage(data)
      return true
    },
    /** True if the nonce is still pending. */
    has(nonce) {
      return pendingByNonce.has(nonce)
    },
    /**
     * Force-timeout a nonce: removes it from the map and posts a timeout
     * envelope to its port. No-op if already resolved.
     */
    timeout(nonce) {
      const port = pendingByNonce.get(nonce)
      if (!port) return false
      pendingByNonce.delete(nonce)
      port.postMessage({ type: 'booklage:save:result', nonce, ok: false, error: 'timeout' })
      return true
    },
  }
}
