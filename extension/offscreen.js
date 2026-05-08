import { createOffscreenRouter } from './lib/offscreen-router.js'

const iframe = document.getElementById('save')
const BOOKLAGE_ORIGIN = 'https://booklage.pages.dev'
const router = createOffscreenRouter()

window.addEventListener('message', (ev) => {
  if (ev.origin !== BOOKLAGE_ORIGIN) return
  const data = ev.data
  if (!data || typeof data !== 'object') return
  if (data.type === 'booklage:save:result' || data.type === 'booklage:probe:result') {
    router.resolve(data.nonce, data)
  }
})

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen') return false
  if (msg.type === 'forward-to-iframe') {
    router.register(msg.nonce, { postMessage: sendResponse })
    iframe.contentWindow.postMessage(msg.envelope, BOOKLAGE_ORIGIN)
    setTimeout(() => router.timeout(msg.nonce), 4000)
    return true // async
  }
  return false
})
