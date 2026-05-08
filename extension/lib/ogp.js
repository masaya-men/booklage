// extension/lib/ogp.js
// INJECTED via chrome.scripting on the target tab.
// Mirrors lib/utils/bookmarklet.ts's extractOgpFromDocument exactly.
// NOTE: keep in sync with the inline copy inside extension/lib/dispatch.js
// (chrome.scripting.executeScript({func}) serializes the function source,
// so it cannot reach module-scoped helpers — the inline copy is required).
export function extractOgp() {
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
}
