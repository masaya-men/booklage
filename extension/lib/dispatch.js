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

async function extractOgpFromTab(tabId, overrideUrl, ogpFromBookmarklet) {
  // Bookmarklet path: the IIFE already extracted OGP from the live document
  // (with cookies, post-render). Trust it and skip executeScript entirely —
  // this avoids a redundant DOM walk and works on pages where the extension
  // host_permission was somehow not granted.
  if (ogpFromBookmarklet && ogpFromBookmarklet.url) return ogpFromBookmarklet
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
      const r = (h, b) => {
        if (!h) return ''
        if (/^https?:\/\//i.test(h)) return h
        if (h.startsWith('//')) return `https:${h}`
        try { return new URL(h, b).href } catch { return '' }
      }
      const url = location.href
      const title = m('meta[property="og:title"]') || document.title || url
      const image = r(m('meta[property="og:image"]') || m('meta[name="twitter:image"]') || '', url)
      const description = (m('meta[property="og:description"]') || m('meta[name="description"]') || '').slice(0, 200)
      const siteName = m('meta[property="og:site_name"]') || location.hostname
      const favicon = r(k('link[rel="icon"]') || k('link[rel="shortcut icon"]') || '/favicon.ico', url)
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

export async function dispatchSave({ trigger, tabId, linkUrl, ogpFromBookmarklet, isPipActive }) {
  await ensureOffscreen()
  const ogp = await extractOgpFromTab(tabId, linkUrl, ogpFromBookmarklet)
  const nonce = makeNonce('e')
  const envelope = {
    type: 'booklage:save',
    payload: { ...ogp, nonce },
  }
  // Cursor pill on the source tab. While PiP is open on a Booklage tab,
  // the new-card slide-in animation is sufficient feedback — suppress
  // saving/saved pills to avoid double UI. Errors still surface a pill
  // because PiP can't report failures.
  const skipSuccessPill = !!isPipActive
  if (!skipSuccessPill) {
    chrome.tabs.sendMessage(tabId, { type: 'booklage:cursor-pill', state: 'saving' }).catch(() => {})
  }

  const result = await postToOffscreen(envelope, nonce)
  const finalState = result?.ok ? 'saved' : 'error'
  if (finalState === 'error' || !skipSuccessPill) {
    chrome.tabs.sendMessage(tabId, { type: 'booklage:cursor-pill', state: finalState }).catch(() => {})
  }
}
