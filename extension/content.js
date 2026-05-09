// MV3 content_scripts don't support ES module imports — keep pillStateView inline.
// Source of truth for tests: extension/lib/pill-state-machine.js (must stay in sync).
function pillStateView(state) {
  if (state === 'saving') return { label: 'Saving', icon: 'ring',  autoHideMs: null }
  if (state === 'saved')  return { label: 'Saved',  icon: 'check', autoHideMs: 1700 }
  if (state === 'error')  return { label: 'Failed', icon: 'bang',  autoHideMs: 2400 }
  return null
}

const MIN_SAVING_MS = 500

// Marker for the bookmarklet IIFE: when present, the bookmarklet skips its
// popup/toast path and routes through the extension instead (silent save).
if (document.documentElement) {
  document.documentElement.dataset.booklageExtension = '1'
}

let lastMouse = { x: window.innerWidth - 220, y: window.innerHeight - 60 }
window.addEventListener('mousemove', (e) => {
  lastMouse = { x: e.clientX, y: e.clientY }
  if (pill && pill.classList.contains('is-visible')) positionPill()
}, { passive: true })

let pill = null
let hideTimer = null
let savingShownAt = 0
let pendingFinalize = null

function ensurePill() {
  if (pill) return pill
  pill = document.createElement('div')
  pill.className = 'booklage-pill'
  pill.innerHTML =
    '<span class="booklage-pill__icon" data-role="icon"></span>' +
    '<span class="booklage-pill__brand">Booklage</span>' +
    '<span class="booklage-pill__sep">' + String.fromCharCode(183) + '</span>' +
    '<span class="booklage-pill__state" data-role="state">Saving</span>'
  document.documentElement.appendChild(pill)
  return pill
}

function positionPill() {
  const p = ensurePill()
  const x = Math.min(window.innerWidth - 220, Math.max(8, lastMouse.x + 12))
  const y = Math.min(window.innerHeight - 56, Math.max(8, lastMouse.y - 52))
  p.style.transform = 'translate(' + x + 'px, ' + y + 'px)'
}

const ICONS = {
  ring: '<span class="ring"></span>',
  check: '<svg viewBox="0 0 24 24" class="check"><path d="M5 12 L10 17 L19 7"/></svg>',
  bang: '<span class="bang">!</span>',
}

function applyState(state) {
  const view = pillStateView(state)
  if (!view) return
  const p = ensurePill()
  positionPill()
  const stateEl = p.querySelector('[data-role="state"]')
  const iconEl = p.querySelector('[data-role="icon"]')
  if (stateEl) stateEl.textContent = view.label
  if (iconEl) iconEl.innerHTML = ICONS[view.icon] || ''
  // Force CSS animation to restart even if same state re-applied.
  p.dataset.state = ''
  // eslint-disable-next-line no-unused-expressions
  p.offsetWidth
  p.dataset.state = state
  p.classList.add('is-visible')
  clearTimeout(hideTimer)
  if (view.autoHideMs !== null) {
    hideTimer = setTimeout(() => p.classList.remove('is-visible'), view.autoHideMs)
  }
}

function setState(state) {
  if (state === 'saving') {
    savingShownAt = performance.now()
    if (pendingFinalize) {
      clearTimeout(pendingFinalize)
      pendingFinalize = null
    }
    applyState(state)
    return
  }
  // saved / error: ensure ring (saving) was visible long enough to be perceived.
  const elapsed = performance.now() - savingShownAt
  const remaining = MIN_SAVING_MS - elapsed
  if (savingShownAt > 0 && remaining > 0) {
    if (pendingFinalize) clearTimeout(pendingFinalize)
    pendingFinalize = setTimeout(() => {
      pendingFinalize = null
      applyState(state)
    }, remaining)
  } else {
    applyState(state)
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== 'booklage:cursor-pill') return
  setState(msg.state)
})

// === Bookmarklet hand-off ===
// The bookmarklet IIFE detects the marker (data-booklage-extension) and
// posts here instead of opening its popup. We forward to background which
// runs the regular dispatchSave flow against this tab. Same nonce arriving
// twice within a short window is ignored (defensive against duplicates).
const seenBookmarkletNonces = new Map()
window.addEventListener('message', (event) => {
  if (event.source !== window) return
  const msg = event.data
  if (!msg || msg.type !== 'booklage:save-via-extension') return
  const nonce = typeof msg.nonce === 'string' ? msg.nonce : null
  if (nonce) {
    const now = Date.now()
    // GC entries older than 5s before the dedupe check.
    for (const [k, t] of seenBookmarkletNonces) {
      if (now - t > 5000) seenBookmarkletNonces.delete(k)
    }
    if (seenBookmarkletNonces.has(nonce)) return
    seenBookmarkletNonces.set(nonce, now)
  }
  chrome.runtime.sendMessage({
    type: 'booklage:dispatch-bookmarklet',
    ogp: msg.ogp || null,
  }).catch(() => {})
})

// === PiP state reporter (booklage tab only) ===
// Booklage's React app toggles <html data-booklage-pip="active"> when the
// PiP window is open. We watch that attribute and notify the background SW
// so it can suppress the cursor pill while PiP is providing visual feedback.
if (location.hostname === 'booklage.pages.dev') {
  const reportPip = () => {
    const active = document.documentElement.dataset.booklagePip === 'active'
    chrome.runtime.sendMessage({ type: 'booklage:pip-state', active }).catch(() => {})
  }
  reportPip()
  new MutationObserver(reportPip).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-booklage-pip'],
  })
}
