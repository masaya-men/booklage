const OFFSCREEN_PATH = 'offscreen.html'

async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })
  if (existing.length > 0) return
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ['IFRAME_SCRIPTING'],
    justification: 'Bridge to booklage origin for IDB write',
  })
}

function makeNonce(prefix) {
  return prefix + Date.now() + Math.random().toString(36).slice(2, 7)
}

async function extractOgpFromTab(tabId, overrideUrl) {
  // Save-link path: we have the URL but no DOM context — synthesize a minimal payload.
  if (overrideUrl) {
    let host = overrideUrl
    try { host = new URL(overrideUrl).hostname } catch { /* keep raw */ }
    return { url: overrideUrl, title: overrideUrl, image: '', description: '', siteName: host, favicon: '' }
  }
  // Inline copy of extractOgp() — chrome.scripting.executeScript({func}) serializes the
  // function source, so the function body must be self-contained (no imports). We keep
  // a parallel ./ogp.js for unit testability via Group E.1.
  // NOTE: keep this body in sync with extension/lib/ogp.js (source of truth for tests).
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const m = (s) => { const e = document.querySelector(s); return e ? e.getAttribute('content') || '' : '' }
      const k = (s) => { const e = document.querySelector(s); return e ? e.getAttribute('href') || '' : '' }
      const url = location.href
      const title = m('meta[property="og:title"]') || document.title || url
      const image = m('meta[property="og:image"]') || m('meta[name="twitter:image"]') || ''
      const description = (m('meta[property="og:description"]') || m('meta[name="description"]') || '').slice(0, 200)
      const siteName = m('meta[property="og:site_name"]') || location.hostname
      let favicon = k('link[rel="icon"]') || k('link[rel="shortcut icon"]') || '/favicon.ico'
      if (favicon && !/^https?:/.test(favicon)) {
        try { favicon = new URL(favicon, url).href } catch { favicon = '' }
      }
      return { url, title, image, description, siteName, favicon }
    },
  })
  return result
}

async function postToOffscreen(envelope, nonce) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { target: 'offscreen', type: 'forward-to-iframe', envelope, nonce },
      (response) => resolve(response),
    )
  })
}

export async function dispatchSave({ trigger, tabId, linkUrl }) {
  await ensureOffscreen()
  const ogp = await extractOgpFromTab(tabId, linkUrl)
  const nonce = makeNonce('e')
  const envelope = {
    type: 'booklage:save',
    payload: { ...ogp, nonce },
  }
  // Tell the content script to show the cursor pill (saving state).
  // Content scripts can't run on chrome:// pages — failing to deliver is OK,
  // we'll fall back to OS notifications for those edge cases (only on final result).
  chrome.tabs.sendMessage(tabId, { type: 'booklage:cursor-pill', state: 'saving' }).catch(() => {})

  const result = await postToOffscreen(envelope, nonce)
  if (result?.ok) {
    chrome.tabs.sendMessage(tabId, { type: 'booklage:cursor-pill', state: 'saved' }).catch(() => {
      chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon-48.png', title: 'Booklage', message: 'Saved' })
    })
  } else {
    chrome.tabs.sendMessage(tabId, { type: 'booklage:cursor-pill', state: 'error' }).catch(() => {
      chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon-48.png', title: 'Booklage', message: 'Failed to save' })
    })
  }
}
