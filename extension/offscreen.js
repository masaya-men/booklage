const iframe = document.getElementById('save')
const BOOKLAGE_ORIGIN = 'https://booklage.pages.dev'

const pendingByNonce = new Map()

window.addEventListener('message', (ev) => {
  if (ev.origin !== BOOKLAGE_ORIGIN) return
  const data = ev.data
  if (!data || typeof data !== 'object') return
  if (data.type === 'booklage:save:result' || data.type === 'booklage:probe:result') {
    const port = pendingByNonce.get(data.nonce)
    if (port) {
      pendingByNonce.delete(data.nonce)
      port.postMessage(data)
    }
  }
})

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen') return false
  if (msg.type === 'forward-to-iframe') {
    pendingByNonce.set(msg.nonce, { postMessage: sendResponse })
    iframe.contentWindow.postMessage(msg.envelope, BOOKLAGE_ORIGIN)
    setTimeout(() => {
      if (pendingByNonce.has(msg.nonce)) {
        pendingByNonce.delete(msg.nonce)
        sendResponse({ type: 'booklage:save:result', nonce: msg.nonce, ok: false, error: 'timeout' })
      }
    }, 4000)
    return true // async
  }
  return false
})
